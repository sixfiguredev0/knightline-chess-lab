(() => {
  const state = {settings: {...AppSettings.defaults}, board: null, orientation: 'white', page: '', tracker: new BoardPosition(), candidateKey: '', stableAt: 0, analyzedFen: null, currentFen: null, request: 0, result: null, display: null, status: {mode: 'Waiting', site: BoardReader.site(), result: 'Board analysis is off.'}, timer: null, busy: false, dragging: false, observer: null, resizeObserver: null, bindings: null, arrowKey: '', retryAt: 0, execution: 0, collapsed: false};
  const {engineController, autoMoveController: controller} = globalThis.ChessHelperApp;
  const adapter = new BoardAdapter(); controller.attachBoardAdapter(adapter);
  const node = id => document.getElementById(id);
  function status(mode, result) {
    const next = {mode, result, site: BoardReader.site()};
    if (JSON.stringify(next) === JSON.stringify(state.status)) return;
    state.status = next;
    chrome.runtime.sendMessage({type: 'POPUP_STATUS', ...next}).catch(() => {});
  }
  chrome.runtime.onMessage.addListener((message, sender, reply) => {
    if (message?.type === 'GET_BOARD_STATUS') reply(state.status);
  });
  function clearVisuals() {
    node('chesshelper-arrow-overlay')?.remove(); state.arrowKey = ''; state.display = null;
  }
  function invalidate() {
    state.request++; state.execution++; state.busy = false; state.analyzedFen = null;
    state.result = null; controller.invalidateAnalysis(); clearVisuals();
  }
  function schedule(delay = 120) {
    if (!state.settings.enabled || state.timer != null) return;
    state.timer = setTimeout(() => { state.timer = null; scan(); }, delay);
  }
  function readPosition() {
    const board = BoardReader.board(); if (!board) return null;
    const parsed = BoardReader.read(board); if (!parsed) return null;
    const hint = BoardReader.hint(board, parsed.pieces, parsed.orientation);
    hint.override = state.settings.turnOverride === 'auto' ? null : state.settings.turnOverride;
    const game = state.tracker.resolve(parsed.pieces, hint);
    return game ? {...parsed, game, fen: game.fen(), turn: game.turn()} : null;
  }
  function myTurn(position) {
    if (BoardReader.isStudy()) return true;
    if (BoardReader.isPuzzle()) return true;
    return position.turn === (position.orientation === 'black' ? 'b' : 'w');
  }
  function svgElement(tag, attributes, parent) {
    const element = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, String(value));
    parent?.appendChild(element); return element;
  }
  function drawArrow(move = state.display, imperfect = Boolean(move?.imperfect)) {
    if (!state.settings.enabled || !state.settings.showArrow || !move || !state.board?.isConnected || state.dragging || state.currentFen !== move.positionFen) { node('chesshelper-arrow-overlay')?.remove(); state.arrowKey = ''; return; }
    const rect = state.board.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const orientation = BoardReader.orientation(state.board);
    const key = `${move.from}${move.to}|${imperfect}|${orientation}|${rect.left}|${rect.top}|${rect.width}|${rect.height}`;
    if (key === state.arrowKey && node('chesshelper-arrow-overlay')) return;
    const old = node('chesshelper-arrow-overlay');
    const a = BoardReader.point(move.from, rect, orientation), b = BoardReader.point(move.to, rect, orientation);
    if (!a || !b) return;
    const sq = rect.width / 8, sy = rect.height / 8;
    const svg = svgElement('svg', {id: 'chesshelper-arrow-overlay', viewBox: `0 0 ${innerWidth} ${innerHeight}`, 'aria-hidden': 'true'});
    svg.classList.toggle('chp-reposition', Boolean(old));
    const color = imperfect ? '#ffa500' : '#00dcff';
    for (const [point, destination] of [[a, false], [b, true]]) {
      svgElement('rect', {x: point.x - sq / 2 + 2, y: point.y - sy / 2 + 2, width: sq - 4, height: sy - 4, rx: 4, fill: color, 'fill-opacity': destination ? '.3' : '.16', stroke: color, 'stroke-opacity': '.55', 'stroke-width': 1.5, class: destination ? 'chp-destination' : 'chp-source'}, svg);
    }
    const length = Math.hypot(b.x - a.x, b.y - a.y), nx = (b.x - a.x) / length, ny = (b.y - a.y) / length;
    const width = Math.max(3, Math.min(8, sq / 8));
    svgElement('line', {x1: a.x + nx * sq * .3, y1: a.y + ny * sq * .3, x2: b.x - nx * sq * .35, y2: b.y - ny * sq * .35, stroke: imperfect ? '#ffa500' : '#ffffff', 'stroke-opacity': '.93', 'stroke-width': width, 'stroke-linecap': 'round', 'stroke-dasharray': `${width},${width * 2}`, class: 'chp-path'}, svg);
    old?.remove(); document.documentElement.appendChild(svg); state.arrowKey = key;
  }
  function panel() {
    let element = node('chesshelper-live-panel');
    if (element) return element;
    element = document.createElement('aside'); element.id = 'chesshelper-live-panel'; element.setAttribute('aria-label', 'Chess analysis coach');
    element.innerHTML = `<div class="chp-head" id="chp-drag"><div class="chp-brand"><span class="chp-mark" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128"><rect x="2" y="2" width="124" height="124" rx="29" fill="#202a1a" stroke="#50673c" stroke-width="3"/><path d="M38 91c2-16 12-28 26-39l-13 3-9 10-16-9 10-20 18-11 5-13 12 15c18 7 28 24 28 44v20H38Z" fill="#c1ef84"/><path d="M69 30c13 10 19 25 17 44" fill="none" stroke="#202a1a" stroke-width="5" stroke-linecap="round"/><circle cx="54" cy="37" r="3" fill="#202a1a"/><path d="m31 54 10 5" stroke="#202a1a" stroke-width="3" stroke-linecap="round"/><rect x="32" y="96" width="70" height="13" rx="5" fill="#c1ef84"/></svg></span><div><strong class="chp-title">knightline<span> / lab</span></strong><div class="chp-sub">CHESS LAB · BUILT BY YASEN</div></div></div><button type="button" id="chp-collapse" aria-label="Collapse coach panel" aria-expanded="true">−</button></div><div id="chp-body"><div class="chp-status"><i></i><span id="chp-status-text">Connected</span><span class="chp-badge" id="chp-badge">STOCKFISH</span></div><div class="chp-main"><div><div class="chp-label" id="chp-move-label">SUGGESTED MOVE</div><div class="chp-move" id="chp-move">Waiting</div></div><div class="chp-score"><strong id="chp-score">—</strong><span>WHITE'S VIEW</span></div></div><div class="chp-eval-track"><div id="chp-eval-fill"></div></div><p class="chp-eval" id="chp-eval">Connect a board to begin.</p><div class="chp-line-box"><div class="chp-label">THE NEXT FEW MOVES</div><div class="chp-line" id="chp-line">The engine line will appear here.</div></div><div id="chp-candidates" class="chp-candidates" hidden></div><div class="chp-error" id="chp-error" hidden></div><button type="button" class="chp-retry" id="chp-retry" hidden>Try analysis again ↗</button><div class="chp-foot"><span id="chp-site">Chess board</span><span id="chp-depth">Waiting for position</span></div></div>`;
    document.documentElement.appendChild(element);
    node('chp-collapse').addEventListener('click', () => {
      state.collapsed = !state.collapsed; node('chp-body').hidden = state.collapsed;
      node('chp-collapse').textContent = state.collapsed ? '+' : '−';
      node('chp-collapse').setAttribute('aria-expanded', String(!state.collapsed));
      node('chp-collapse').setAttribute('aria-label', state.collapsed ? 'Expand coach panel' : 'Collapse coach panel');
    });
    node('chp-retry').addEventListener('click', () => { invalidate(); state.retryAt = 0; schedule(0); });
    let drag = null;
    node('chp-drag').addEventListener('pointerdown', event => {
      if (event.button !== 0 || event.target.closest('button')) return;
      const rect = element.getBoundingClientRect(); drag = {x: event.clientX - rect.left, y: event.clientY - rect.top};
      node('chp-drag').setPointerCapture(event.pointerId);
    });
    node('chp-drag').addEventListener('pointermove', event => {
      if (!drag) return;
      element.style.left = `${Math.max(8, Math.min(innerWidth - element.offsetWidth - 8, event.clientX - drag.x))}px`;
      element.style.top = `${Math.max(8, Math.min(innerHeight - element.offsetHeight - 8, event.clientY - drag.y))}px`; element.style.right = 'auto';
    });
    const stop = () => { drag = null; };
    node('chp-drag').addEventListener('pointerup', stop); node('chp-drag').addEventListener('pointercancel', stop);
    return element;
  }
  function renderStage(stage, message) {
    const element = panel(); element.hidden = !state.settings.showPanel; element.dataset.stage = stage;
    node('chp-site').textContent = BoardReader.site();
    node('chp-status-text').textContent = stage === 'loading' ? 'Looking ahead' : stage === 'error' ? 'Connection interrupted' : 'Standing by';
    node('chp-move').textContent = stage === 'loading' ? 'Thinking' : stage === 'error' ? 'Try again' : 'Your move';
    node('chp-move-label').textContent = stage === 'loading' ? 'READING THE POSITION' : 'BOARD ANALYSIS';
    node('chp-eval').textContent = stage === 'error' ? 'No move was shown for this position.' : message;
    node('chp-score').textContent = '—'; node('chp-eval-fill').style.width = '50%';
    node('chp-line').textContent = stage === 'loading' ? 'Finding a line worth exploring…' : 'A fresh position brings a fresh perspective.';
    node('chp-depth').textContent = stage === 'loading' ? 'Stockfish · cloud engine' : 'Ready for a position';
    node('chp-badge').textContent = 'STOCKFISH';
    node('chp-candidates').hidden = true; node('chp-error').hidden = stage !== 'error';
    node('chp-error').textContent = stage === 'error' ? message : '';
    node('chp-retry').hidden = stage !== 'error';
  }
  function evaluation(data) {
    if (data.mate != null && Number.isFinite(Number(data.mate))) {
      const mate = Number(data.mate);
      return {label: `${mate < 0 ? '−' : ''}M${Math.abs(mate)}`, percent: mate < 0 ? 2 : 98, detail: `${mate < 0 ? 'Black' : 'White'} has a forced mate in ${Math.abs(mate)}.`};
    }
    const value = Number(data.eval ?? (data.centipawns != null ? Number(data.centipawns) / 100 : data.score != null ? Number(data.score) / 100 : NaN));
    if (!Number.isFinite(value)) return {label: '—', percent: 50, detail: 'No evaluation returned.'};
    return {label: `${value > 0 ? '+' : ''}${value.toFixed(2)}`, percent: Math.max(4, Math.min(96, 50 + 45 * Math.tanh(value / 4))), detail: Math.abs(value) < .3 ? 'A roughly balanced position.' : `${value > 0 ? 'White' : 'Black'} ${Math.abs(value) < 1 ? 'has a small edge' : Math.abs(value) < 3 ? 'has the advantage' : 'has a strong advantage'}.`};
  }
  function renderResult(data, fen) {
    const element = panel(); element.hidden = !state.settings.showPanel; element.dataset.stage = data.imperfect ? 'variation' : 'ready';
    const ev = evaluation(data), legal = BoardPosition.legalMove(fen, data);
    node('chp-status-text').textContent = data.imperfect ? 'Practice variation' : 'A line to explore';
    node('chp-badge').textContent = data.imperfect ? 'SHALLOW SEARCH' : 'STOCKFISH';
    node('chp-move-label').textContent = data.imperfect ? 'PRACTICE MOVE' : 'SUGGESTED MOVE';
    node('chp-move').textContent = legal?.san || data.san || `${data.from} → ${data.to}`;
    node('chp-score').textContent = ev.label; node('chp-eval-fill').style.width = `${ev.percent}%`;
    const names = {p: 'Pawn', n: 'Knight', b: 'Bishop', r: 'Rook', q: 'Queen', k: 'King'};
    node('chp-eval').textContent = `${names[legal?.piece] || 'Move'} ${data.from} → ${data.to}${legal?.captured ? ` · captures ${names[legal.captured].toLowerCase()}` : ''}. ${ev.detail}`;
    const continuation = Array.isArray(data.continuationArr) ? data.continuationArr : [];
    let line = BoardPosition.line(fen, continuation);
    if (!line.length && legal) {
      const game = BoardPosition.create(fen); game.move({from: data.from, to: data.to, promotion: data.promotion || 'q'});
      line = [legal.san, ...BoardPosition.line(game.fen(), continuation)];
    }
    const container = node('chp-line'); container.replaceChildren();
    if (!line.length) container.textContent = 'No continuation returned for this position.';
    for (const [index, move] of line.entries()) {
      const token = document.createElement('span'); token.className = index === 0 ? 'chp-line-first' : ''; token.textContent = move; container.appendChild(token);
    }
    const alternatives = [], seen = new Set([`${data.from}${data.to}${data.promotion || ''}`]);
    for (const candidate of data.candidates || []) {
      const normalized = normalizeCandidate(candidate); if (!normalized) continue;
      const key = `${normalized.from}${normalized.to}${normalized.promotion || ''}`;
      const move = BoardPosition.legalMove(fen, normalized);
      if (!move || seen.has(key)) continue;
      seen.add(key); alternatives.push({move, candidate: normalized});
      if (alternatives.length === 2) break;
    }
    const list = node('chp-candidates'); list.replaceChildren(); list.hidden = !alternatives.length;
    for (const {move, candidate} of alternatives) {
      const row = document.createElement('div'), title = document.createElement('span'), score = document.createElement('span');
      title.textContent = `Also consider ${move.san}`; score.textContent = evaluation(candidate).label; row.append(title, score); list.appendChild(row);
    }
    node('chp-site').textContent = BoardReader.site();
    node('chp-depth').textContent = data.depth ? `Depth ${data.depth} · ${data.imperfect ? 'practice' : 'engine line'}` : 'Depth not reported';
    node('chp-error').hidden = true; node('chp-retry').hidden = true;
  }
  function attachBoard(board) {
    if (state.board === board) return;
    state.bindings?.abort(); state.observer?.disconnect(); state.resizeObserver?.disconnect();
    invalidate(); state.board = board; state.tracker = new BoardPosition(); state.candidateKey = ''; state.dragging = false;
    const bindings = new AbortController(); state.bindings = bindings;
    const begin = event => {
      if (!event.isTrusted || event.button !== 0) return;
      state.dragging = true; invalidate(); renderStage('waiting', 'Move in progress. Release to continue.');
    };
    const end = () => {
      if (!state.dragging) return;
      state.dragging = false; state.candidateKey = ''; schedule(180);
    };
    board.addEventListener('pointerdown', begin, {capture: true, passive: true, signal: bindings.signal});
    window.addEventListener('pointerup', end, {capture: true, passive: true, signal: bindings.signal});
    window.addEventListener('pointercancel', end, {capture: true, passive: true, signal: bindings.signal});
    state.observer = new MutationObserver(() => schedule(100));
    state.observer.observe(board, {subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'style', 'data-turn', 'data-fen']});
    state.resizeObserver = new ResizeObserver(redraw); state.resizeObserver.observe(board);
  }
  async function analyze(position) {
    state.busy = true; state.analyzedFen = position.fen;
    const id = ++state.request;
    controller.configure(state.settings); renderStage('loading', `${position.turn === 'w' ? 'White' : 'Black'} to move. Exploring the position.`); status('Analyzing', 'Finding your next move…');
    try {
      const selection = await controller.startAnalysis(position.fen, {allowImperfect: BoardReader.canAutomate()});
      if (id !== state.request || !selection) return;
      const current = readPosition();
      if (!current || current.fen !== position.fen || state.dragging) { invalidate(); schedule(120); return; }
      const move = normalizeCandidate(selection.move);
      if (!move || !BoardPosition.legalMove(position.fen, move)) throw new Error('The engine move does not match this board. Try turn detection in Settings.');
      const data = {...selection.analysis, ...move, imperfect: selection.imperfect, positionFen: position.fen};
      state.result = data; state.display = data; drawArrow(); renderResult(data, position.fen);
      status('Analysis', `${data.imperfect ? 'Practice variation' : 'Suggested'}: ${BoardPosition.legalMove(position.fen, move).san}`);
      if (state.settings.autoplay && BoardReader.canAutomate()) queueMove(move, position.fen);
    } catch (error) {
      if (id !== state.request) return;
      clearVisuals(); state.retryAt = Date.now() + 5000; renderStage('error', error.message || 'Engine unavailable. Please retry.'); status('Error', error.message || 'Engine unavailable.');
    } finally { if (id === state.request) state.busy = false; }
  }
  function scan() {
    if (!state.settings.enabled) return;
    const page = `${location.origin}${location.pathname}`;
    if (state.page !== page) { state.page = page; invalidate(); state.tracker = new BoardPosition(); state.candidateKey = ''; controller.resetWeakSchedule(); }
    const board = BoardReader.board();
    if (!board) {
      invalidate(); state.currentFen = null; renderStage('waiting', 'Open a Chess.com or Lichess board to begin.'); status('Waiting', 'No supported board detected'); return;
    }
    attachBoard(board);
    if (state.dragging) return;
    const position = readPosition();
    if (!position) { invalidate(); state.candidateKey = ''; renderStage('waiting', 'Waiting for the pieces to settle.'); status('Waiting', 'Board is moving or incomplete'); return; }
    state.orientation = position.orientation;
    const key = position.fen;
    if (key !== state.candidateKey) {
      invalidate(); state.candidateKey = key; state.stableAt = performance.now(); state.currentFen = key; state.retryAt = 0;
      renderStage('waiting', 'Reading the new position…'); schedule(170); return;
    }
    if (performance.now() - state.stableAt < 150) { schedule(170); return; }
    state.tracker.commit(position.game); state.currentFen = key;
    if (position.game.game_over()) {
      clearVisuals(); renderStage('waiting', position.game.in_checkmate() ? 'Checkmate. A good moment to review the game.' : 'This position is drawn. Explore another line.'); status('Waiting', 'Position complete'); return;
    }
    if (!myTurn(position)) {
      invalidate(); renderStage('waiting', `${position.turn === 'w' ? 'White' : 'Black'} to move. Waiting for your turn.`); status('Waiting', 'Opponent to move'); return;
    }
    if (key !== state.analyzedFen && !state.busy && Date.now() >= state.retryAt) analyze(position);
    else if (state.display) drawArrow();
  }
  function queueMove(move, fen) {
    const epoch = ++state.execution;
    const {minDelay, maxDelay} = state.settings;
    const delay = minDelay + Math.floor(Math.random() * (maxDelay - minDelay + 1));
    setTimeout(async () => {
      if (epoch !== state.execution || !state.settings.enabled || !state.settings.autoplay || state.dragging || !BoardReader.canAutomate()) return;
      const position = readPosition(); if (!position || position.fen !== fen || !myTurn(position)) return;
      status('Executing', `${move.from} → ${move.to}`);
      const accepted = await adapter.requestMoveExecution(move, fen);
      if (epoch !== state.execution) return;
      if (!accepted) { renderStage('error', 'The board did not accept this move. Play it manually.'); status('Error', 'Board rejected practice autoplay'); }
      else { invalidate(); schedule(180); }
    }, delay);
  }
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  function clickSquare(square) {
    const rect = state.board.getBoundingClientRect(), point = BoardReader.point(square, rect, BoardReader.orientation(state.board));
    const target = point && document.elementFromPoint(point.x, point.y);
    if (!target || !(target === state.board || state.board.contains(target))) return false;
    for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']) {
      const EventType = type.startsWith('pointer') ? PointerEvent : MouseEvent;
      target.dispatchEvent(new EventType(type, {bubbles: true, cancelable: true, clientX: point.x, clientY: point.y, button: 0, buttons: type.endsWith('down') ? 1 : 0, pointerId: 1, pointerType: 'mouse', view: window}));
    }
    return true;
  }
  async function executeMove(move, fen) {
    const epoch = state.execution;
    const allowed = () => epoch === state.execution && state.settings.enabled && state.settings.autoplay && !state.dragging && BoardReader.canAutomate();
    const position = readPosition();
    if (!allowed() || position?.fen !== fen || !BoardPosition.legalMove(fen, move) || move.promotion) return false;
    if (!clickSquare(move.from)) return false;
    await wait(90);
    if (!allowed() || readPosition()?.fen !== fen || !clickSquare(move.to)) return false;
    await wait(450);
    const next = readPosition();
    const game = BoardPosition.create(fen); const played = game.move({from: move.from, to: move.to});
    return Boolean(played && next && (next.game.fen().split(' ')[0] === game.fen().split(' ')[0] || next.pieces[move.to]?.[0] === position.turn && !next.pieces[move.from]));
  }
  let redrawPending = false;
  function redraw() {
    if (redrawPending) return; redrawPending = true;
    requestAnimationFrame(() => {
      redrawPending = false; drawArrow();
      const element = node('chesshelper-live-panel');
      if (element?.style.left && getComputedStyle(element).position === 'fixed') {
        const rect = element.getBoundingClientRect();
        element.style.left = `${Math.max(8, Math.min(innerWidth - rect.width - 8, rect.left))}px`;
        element.style.top = `${Math.max(8, Math.min(innerHeight - rect.height - 8, rect.top))}px`;
      }
    });
  }
  adapter.setReadPositionHandler(readPosition); adapter.setExecutionHandler(executeMove);
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    const patch = {};
    for (const key of Object.keys(AppSettings.defaults)) if (changes[key]) patch[key] = changes[key].newValue;
    if (!Object.keys(patch).length) return;
    const previous = state.settings; state.settings = AppSettings.normalize({...state.settings, ...patch});
    controller.configure(state.settings);
    const presentationOnly = Object.keys(patch).every(key => ['showArrow', 'showPanel'].includes(key));
    if (presentationOnly) {
      if (node('chesshelper-live-panel')) node('chesshelper-live-panel').hidden = !state.settings.showPanel;
      drawArrow(); return;
    }
    invalidate(); state.candidateKey = ''; state.retryAt = 0;
    if (previous.imperfectMoves !== state.settings.imperfectMoves || previous.minWeakInterval !== state.settings.minWeakInterval || previous.maxWeakInterval !== state.settings.maxWeakInterval) controller.resetWeakSchedule();
    if (!state.settings.enabled) { node('chesshelper-live-panel')?.remove(); state.observer?.disconnect(); state.resizeObserver?.disconnect(); state.bindings?.abort(); state.board = null; status('Waiting', 'Board analysis is off.'); }
    else schedule(0);
  });
  addEventListener('resize', redraw, {passive: true}); addEventListener('scroll', redraw, {passive: true, capture: true});
  addEventListener('pagehide', () => { invalidate(); state.observer?.disconnect(); state.resizeObserver?.disconnect(); state.bindings?.abort(); state.board = null; });
  addEventListener('pageshow', () => schedule(0));
  setInterval(() => schedule(0), 800);
  (async () => {
    state.settings = AppSettings.normalize(await chrome.storage.local.get(AppSettings.defaults)); controller.configure(state.settings); schedule(0);
  })().catch(() => status('Error', 'Reload the extension to reconnect.'));
})();
