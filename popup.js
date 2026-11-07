const $ = (id) => document.getElementById(id);
let current = { ...AppSettings.defaults },
  pendingWrites = Promise.resolve(),
  writeId = 0,
  report = null,
  capabilities = {};
const tabs = ["analysis", "settings", "diagnostics"];
function apply(settings) {
  current = AppSettings.normalize(settings);
  for (const key of Object.keys(AppSettings.defaults)) {
    const input = $(key);
    if (!input) continue;
    if (input.type === "checkbox") input.checked = current[key];
    else input.value = String(current[key]);
    if (input.type === "range") {
      input.style.setProperty(
        "--progress",
        `${(100 * (Number(input.value) - Number(input.min))) / (Number(input.max) - Number(input.min))}%`,
      );
      const output = $(key + "Value");
      if (output)
        output.textContent =
          String(current[key]) + (/Delay|TimeMs/.test(key) ? " ms" : "");
    }
  }
  $("searchTimeMs").disabled = current.automaticBudget;
  $("skillControls").hidden = current.strengthMode !== "skill";
  $("eloControls").hidden = current.strengthMode !== "elo";
  $("regretControls").hidden = current.variationPolicy !== "bounded";
  $("fixedDelayControls").hidden = current.timingMode !== "fixed";
  $("randomDelayControls").hidden = current.timingMode === "fixed";
  for (const [container, enabled] of [
    ["weakControls", current.imperfectMoves],
    ["delayControls", current.autoplay],
  ]) {
    $(container).classList.toggle("disabled", !enabled);
    $(container)
      .querySelectorAll("input,select")
      .forEach((input) => {
        input.disabled = !enabled;
      });
  }
  const elo = capabilities.UCI_Elo;
  $("strengthElo").disabled = !elo;
  if (elo) {
    $("strengthElo").min = elo.min;
    $("strengthElo").max = elo.max;
    $("strengthCapabilities").textContent =
      `Supported range: ${elo.min}–${elo.max}. An engine estimate, not a guaranteed player rating.`;
  }
  $("statusDot").classList.toggle("on", current.enabled);
  if (!current.enabled) {
    $("statusDot").classList.remove("error");
    $("modeLabel").textContent = "Ready when you are.";
    $("lastResult").textContent = "Turn on board analysis to begin.";
  }
}
function save(patch) {
  apply({ ...current, ...patch });
  const snapshot = { ...current },
    id = ++writeId;
  $("saveStatus").textContent = "Saving…";
  pendingWrites = pendingWrites
    .catch(() => {})
    .then(() => chrome.storage.local.set(snapshot))
    .then(() => {
      if (id === writeId)
        $("saveStatus").textContent = "Settings saved locally";
    })
    .catch(() => {
      $("saveStatus").textContent = "Could not save. Try again.";
    });
}
for (const key of Object.keys(AppSettings.defaults)) {
  const input = $(key);
  if (!input) continue;
  input.addEventListener(
    ["range", "number"].includes(input.type) ? "input" : "change",
    async () => {
      if (key === "selectedBoardId") {
        await chrome.runtime.sendMessage({
          type: "SELECT_BOARD",
          id: input.value,
        });
        await refreshDiagnostics();
        return;
      }
      const value =
          input.type === "checkbox"
            ? input.checked
            : ["range", "number"].includes(input.type) || key === "searchDepth"
              ? Number(input.value)
              : input.value,
        patch = { [key]: value };
      if (key === "minDelay")
        patch.maxDelay = Math.max(value, current.maxDelay);
      if (key === "maxDelay")
        patch.minDelay = Math.min(value, current.minDelay);
      if (key === "minWeakInterval")
        patch.maxWeakInterval = Math.max(value, current.maxWeakInterval);
      if (key === "maxWeakInterval")
        patch.minWeakInterval = Math.min(value, current.minWeakInterval);
      save(patch);
    },
  );
}
function selectTab(name, focus = false) {
  for (const view of tabs) {
    const active = name === view;
    $(`tab-${view}`).classList.toggle("active", active);
    $(`tab-${view}`).setAttribute("aria-selected", String(active));
    $(`tab-${view}`).tabIndex = active ? 0 : -1;
    $(`view-${view}`).hidden = !active;
  }
  if (focus) $(`tab-${name}`).focus();
  if (name === "diagnostics") refreshDiagnostics();
}
for (const name of tabs) {
  $(`tab-${name}`).onclick = () => selectTab(name);
  $(`tab-${name}`).addEventListener("keydown", (event) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const index = tabs.indexOf(name),
      target =
        event.key === "Home"
          ? 0
          : event.key === "End"
            ? 2
            : (index + (event.key === "ArrowRight" ? 1 : 2)) % 3;
    selectTab(tabs[target], true);
  });
}
function showStatus(status) {
  if (!status) return;
  $("siteLabel").textContent = status.site || "Open a chess board";
  $("engineLabel").textContent =
    status.engine === "demo"
      ? "SIMULATED"
      : status.engine === "cloud"
        ? "CLOUD"
        : "ON DEVICE";
  if (status.engine === "demo")
    $("engineDescription").textContent =
      "Simulated engine for the classroom preview.";
  if (!current.enabled) return;
  const labels = {
    Analyzing: "Looking ahead.",
    Analysis: "Your next move.",
    Waiting: "Taking a moment.",
    Error: "Needs attention.",
    Executing: "Playing the line.",
  };
  $("modeLabel").textContent = labels[status.mode] || "Ready when you are.";
  $("lastResult").textContent = status.result || "Connect a board to begin.";
  $("statusDot").classList.toggle("error", status.mode === "Error");
}
async function refreshDiagnostics() {
  try {
    const response = await chrome.runtime.sendMessage({
      type: "GET_DIAGNOSTICS",
    });
    report = response?.status || null;
    $("diagnosticReport").textContent = report
      ? JSON.stringify(report, null, 2)
      : "No connected board. Refresh the chess tab after loading this extension.";
    const select = $("selectedBoardId");
    select.replaceChildren();
    const auto = document.createElement("option");
    auto.value = "auto";
    auto.textContent = "Automatic · main board";
    select.appendChild(auto);
    for (const board of report?.selection?.boards || []) {
      const option = document.createElement("option");
      option.value = board.id;
      option.textContent = board.label;
      select.appendChild(option);
    }
    select.value = report?.selection?.requested || "auto";
    $("boardSummary").textContent = report?.boardId
      ? `${report.boardId} · ${report.context} · ${report.confidence || "reading"}${report.turn ? " · " + (report.turn === "w" ? "White" : "Black") + " to move" : ""}`
      : report?.selection?.reason === "ambiguous"
        ? "Multiple boards found. Select the board you want."
        : "No active board selected.";
  } catch (error) {
    $("diagnosticReport").textContent =
      "Could not reach this tab. Refresh the chess page.";
  }
}
$("refreshDiagnostics").onclick = refreshDiagnostics;
$("refreshBoard").onclick = async () => {
  await chrome.runtime.sendMessage({ type: "REFRESH_BOARD" });
  await refreshDiagnostics();
};
$("copyDiagnostics").onclick = async () => {
  try {
    await navigator.clipboard.writeText(JSON.stringify(report || {}, null, 2));
    $("diagnosticAction").textContent = "Report copied.";
  } catch {
    $("diagnosticAction").textContent =
      "Copy unavailable. Select the report text to copy it manually.";
  }
};
$("resetEngine").onclick = async () => {
  const response = await chrome.runtime.sendMessage({
    type: "RESET_LOCAL_ENGINE",
  });
  $("diagnosticAction").textContent = response?.ok
    ? "Engine reset. Refresh analysis on the board."
    : "Engine reset failed.";
};
chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === "POPUP_STATUS") showStatus(message);
});
(async () => {
  try {
    apply(await chrome.storage.local.get(null));
    const status = await chrome.runtime.sendMessage({
      type: "GET_RUNTIME_STATUS",
    });
    if (status?.version) $("version").textContent = `v${status.version}`;
    showStatus(status?.status);
    await refreshDiagnostics();
    const engine = await chrome.runtime.sendMessage({
      type: "GET_ENGINE_STATUS",
    });
    capabilities = engine?.capabilities || {};
    apply(current);
  } catch {
    $("saveStatus").textContent = "Reload the extension to reconnect";
  }
})();
chrome.storage.onChanged.addListener((changes, area) => {
  if (
    area !== "local" ||
    (writeId && $("saveStatus").textContent === "Saving…")
  )
    return;
  const patch = {};
  for (const key of Object.keys(AppSettings.defaults))
    if (changes[key]) patch[key] = changes[key].newValue;
  apply({ ...current, ...patch });
});
async function correctFen(fen) {
  try {
    const response = await chrome.runtime.sendMessage({
      type: "SET_MANUAL_FEN",
      fen,
    });
    const result = response?.status || response;
    $("manualFenStatus").textContent = result?.ok
      ? "Position metadata updated for this tab."
      : result?.error || "Open the board tab and try again.";
  } catch {
    $("manualFenStatus").textContent = "Could not reach the selected board.";
  }
}
$("applyManualFen").onclick = () => correctFen($("manualFen").value);
$("clearManualFen").onclick = () => {
  $("manualFen").value = "";
  correctFen("");
};
