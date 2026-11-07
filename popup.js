const $ = id => document.getElementById(id);
let current = {...AppSettings.defaults};
let pendingWrites = Promise.resolve();
let writeId = 0;
function apply(settings) {
  current = AppSettings.normalize(settings);
  for (const key of Object.keys(AppSettings.defaults)) {
    const input = $(key);
    if (!input) continue;
    if (input.type === 'checkbox') input.checked = current[key];
    else input.value = String(current[key]);
    if (input.type === 'range') input.style.setProperty('--progress', `${100 * (Number(input.value) - Number(input.min)) / (Number(input.max) - Number(input.min))}%`);
  }
  const depth = AppSettings.depthFor(current.elo);
  $('eloValue').textContent = `Depth ${depth}`;
  $('strengthLabel').textContent = depth <= 10 ? 'Quick look' : depth <= 14 ? 'Thoughtful' : 'Deep focus';
  $('elo').setAttribute('aria-valuetext', `Search depth ${depth}`);
  $('minDelayLabel').textContent = `${current.minDelay} ms`;
  $('maxDelayLabel').textContent = `${current.maxDelay} ms`;
  $('minDelayValue').textContent = `${current.minDelay}–${current.maxDelay} ms`;
  $('minWeakValue').textContent = String(current.minWeakInterval);
  $('maxWeakValue').textContent = String(current.maxWeakInterval);
  for (const [container, enabled] of [['weakControls', current.imperfectMoves], ['delayControls', current.autoplay]]) {
    $(container).classList.toggle('disabled', !enabled);
    $(container).querySelectorAll('input').forEach(input => { input.disabled = !enabled; });
  }
  $('statusDot').classList.toggle('on', current.enabled);
  if (!current.enabled) $('statusDot').classList.remove('error');
  if (!current.enabled) { $('modeLabel').textContent = 'Ready when you are.'; $('lastResult').textContent = 'Turn on board analysis to begin.'; }
}
function save(patch) {
  apply({...current, ...patch});
  const snapshot = {...current};
  const id = ++writeId;
  $('saveStatus').textContent = 'Saving…';
  // Write immediately. A popup may close before a debounce timer fires.
  pendingWrites = pendingWrites.catch(() => {}).then(() => chrome.storage.local.set(snapshot)).then(() => {
    if (id === writeId) $('saveStatus').textContent = 'Settings saved locally';
  }).catch(() => { $('saveStatus').textContent = 'Could not save. Try again.'; });
}
for (const key of Object.keys(AppSettings.defaults)) {
  const input = $(key);
  if (!input) continue;
  input.addEventListener(input.type === 'range' ? 'input' : 'change', () => {
    const value = input.type === 'checkbox' ? input.checked : input.type === 'range' ? Number(input.value) : input.value;
    const patch = {[key]: value};
    if (key === 'minDelay') patch.maxDelay = Math.max(value, current.maxDelay);
    if (key === 'maxDelay') patch.minDelay = Math.min(value, current.minDelay);
    if (key === 'minWeakInterval') patch.maxWeakInterval = Math.max(value, current.maxWeakInterval);
    if (key === 'maxWeakInterval') patch.minWeakInterval = Math.min(value, current.minWeakInterval);
    save(patch);
  });
}
function selectTab(name, focus = false) {
  for (const view of ['analysis', 'settings']) {
    const active = name === view;
    $(`tab-${view}`).classList.toggle('active', active);
    $(`tab-${view}`).setAttribute('aria-selected', String(active));
    $(`tab-${view}`).tabIndex = active ? 0 : -1;
    $(`view-${view}`).hidden = !active;
  }
  if (focus) $(`tab-${name}`).focus();
}
for (const name of ['analysis', 'settings']) {
  $(`tab-${name}`).addEventListener('click', () => selectTab(name));
  $(`tab-${name}`).addEventListener('keydown', event => {
    if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
      event.preventDefault(); selectTab(event.key === 'Home' ? 'analysis' : event.key === 'End' ? 'settings' : name === 'analysis' ? 'settings' : 'analysis', true);
    }
  });
}
function showStatus(status) {
  if (!status) return;
  $('siteLabel').textContent = status.site || 'Open a chess board';
  if (!current.enabled) return;
  const labels = {Analyzing: 'Looking ahead.', Analysis: 'Your next move.', Waiting: 'Taking a moment.', Error: 'Let’s reconnect.', Executing: 'Playing the line.'};
  $('modeLabel').textContent = labels[status.mode] || 'Ready when you are.';
  $('lastResult').textContent = status.result || 'Connect a board to start exploring.';
  $('statusDot').classList.toggle('error', status.mode === 'Error');
}
chrome.runtime.onMessage.addListener(message => { if (message?.type === 'POPUP_STATUS') showStatus(message); });
(async () => {
  try {
    apply(await chrome.storage.local.get(AppSettings.defaults));
    const status = await chrome.runtime.sendMessage({type: 'GET_RUNTIME_STATUS'});
    if (status?.version) $('version').textContent = `v${status.version}`;
    showStatus(status?.status);
  } catch { $('saveStatus').textContent = 'Reload the extension to reconnect'; }
})();
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || writeId && $('saveStatus').textContent === 'Saving…') return;
  const patch = {};
  for (const key of Object.keys(AppSettings.defaults)) if (changes[key]) patch[key] = changes[key].newValue;
  apply({...current, ...patch});
});
