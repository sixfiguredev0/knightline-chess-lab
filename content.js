(() => {
  const state = {
    selectedBoardId: "auto",
    manualFen: null,
    settings: { ...AppSettings.defaults },
    board: null,
    tracker: new BoardPosition(),
    gameId: "game-1",
    epoch: 1,
    playerColor: null,
    route: "",
    candidateKey: "",
    stableAt: 0,
    positionKey: null,
    snapshot: null,
    busy: false,
    request: 0,
    analyzedKey: null,
    result: null,
    display: null,
    timer: null,
    dragging: false,
    executing: false,
    executionAbort: null,
    observer: null,
    resizeObserver: null,
    bindings: null,
    arrowKey: "",
    retryAt: 0,
    attempts: 0,
    status: {
      mode: "Waiting",
      site: BoardReader.site(),
      result: "Board analysis is off.",
    },
    trace: [],
    diagnostic: {},
  };
  const { engineController, autoMoveController: controller } =
    globalThis.ChessHelperApp;
  const adapter = new BoardAdapter();
  controller.attachBoardAdapter(adapter);
  let uiRoot = null,
    host = null;
  const node = (id) => uiRoot?.getElementById(id);
  function trace(stage, detail = {}) {
    state.diagnostic = { ...state.diagnostic, ...detail, stage };
    state.trace.push({ time: new Date().toISOString(), stage, ...detail });
    if (state.trace.length > 20) state.trace.shift();
  }
  function diagnostic() {
    return KnightlineContracts.privateReport({
      schema: 2,
      version: chrome.runtime.getManifest().version,
      versionName: chrome.runtime.getManifest().version_name || "",
      site: BoardReader.site(),
      context: BoardReader.context(),
      selection: BoardReader.lastSelection
        ? { ...BoardReader.lastSelection, requested: state.selectedBoardId }
        : null,
      pieceCount: Object.keys(state.snapshot?.pieces || {}).length,
      boardId: state.snapshot?.boardId || null,
      gameId: state.gameId,
      positionKey: state.positionKey,
      orientation: state.snapshot?.orientation || null,
      playerColor: state.playerColor,
      turn: state.snapshot?.turn || null,
      positionSource: state.snapshot?.source || null,
      confidence: state.snapshot?.confidence || null,
      sourceFen: state.diagnostic.sourceFen || null,
      reconstructedFen:
        state.snapshot?.fen || state.diagnostic.reconstructedFen || null,
      submittedFen: state.diagnostic.submittedFen || null,
      engine: state.diagnostic.engine || null,
      response: state.diagnostic.response || null,
      error: state.diagnostic.error || null,
      execution:
        state.diagnostic.execution?.positionKey === state.positionKey
          ? state.diagnostic.execution
          : null,
      settings: {
        enabled: state.settings.enabled,
        cloudFallback: state.settings.cloudFallback,
        searchDepth: state.settings.searchDepth,
        automaticBudget: state.settings.automaticBudget,
        autoplay: state.settings.autoplay,
        imperfectMoves: state.settings.imperfectMoves,
        turnOverride: state.settings.turnOverride,
      },
      trace: state.trace,
    });
  }
  globalThis.KnightlineDiagnostics = { snapshot: diagnostic };
  function status(mode, result) {
    const next = {
      mode,
      result,
      site: BoardReader.site(),
      engine: state.result?.source || "local",
      context: BoardReader.context(),
    };
    if (JSON.stringify(next) === JSON.stringify(state.status)) return;
    state.status = next;
    chrome.runtime
      .sendMessage({ type: "POPUP_STATUS", ...next })
      .catch(() => {});
  }
  chrome.runtime.onMessage.addListener((message, sender, reply) => {
    if (message?.type === "GET_BOARD_STATUS") reply(state.status);
    if (message?.type === "GET_DIAGNOSTICS") {
      try {
        readSnapshot();
      } catch {}
      reply(diagnostic());
    }
    if (message?.type === "REFRESH_BOARD") {
      invalidate();
      state.candidateKey = "";
      state.attempts = 0;
      state.retryAt = 0;
      schedule(0);
      reply({ ok: true });
    }
    if (message?.type === "SET_MANUAL_FEN") {
      const fen = String(message.fen || "").trim();
      const game = fen ? BoardPosition.create(fen) : null;
      const current = state.board && BoardReader.read(state.board);
      if (
        fen &&
        (!game ||
          !current ||
          game.fen().split(" ")[0] !== BoardPosition.placement(current.pieces))
      ) {
        reply({
          ok: false,
          error:
            "Enter a legal complete FEN whose pieces match the selected board.",
        });
        return;
      }
      state.manualFen = game?.fen() || null;
      invalidate();
      state.candidateKey = "";
      state.attempts = 0;
      schedule(0);
      reply({ ok: true });
    }
    if (message?.type === "SELECT_BOARD") {
      state.selectedBoardId = /^(auto|board-\d+)$/.test(message.id)
        ? message.id
        : "auto";
      invalidate();
      state.candidateKey = "";
      schedule(0);
      reply({ ok: true });
    }
  });
  function clearVisuals() {
    document.getElementById("chesshelper-arrow-overlay")?.remove();
    state.arrowKey = "";
    state.display = null;
  }
  function invalidate() {
    state.request++;
    state.busy = false;
    state.analyzedKey = null;
    state.result = null;
    state.executionAbort?.abort();
    state.executionAbort = null;
    controller.invalidateAnalysis();
    clearVisuals();
  }
  function schedule(delay = 100) {
    if (!state.settings.enabled || state.timer != null) return;
    state.timer = setTimeout(() => {
      state.timer = null;
      scan();
    }, delay);
  }
  function readSnapshot() {
    const board = state.board;
    if (!board?.isConnected) return null;
    const raw = BoardReader.read(board);
    if (!raw) return null;
    const hint = BoardReader.hint(board, raw.pieces, raw.orientation);
    if (
      state.manualFen &&
      state.manualFen.split(" ")[0] !== BoardPosition.placement(raw.pieces)
    )
      state.manualFen = null;
    if (state.manualFen) {
      hint.fen = state.manualFen;
      hint.fenSource = "manual-fen";
    }
    hint.override =
      state.settings.turnOverride === "auto"
        ? null
        : state.settings.turnOverride;
    const game = state.tracker.resolve(raw.pieces, hint);
    state.diagnostic.sourceFen = hint.fen || null;
    if (!game) {
      state.diagnostic.error = {
        kind: "position",
        message:
          state.tracker.lastResolution?.reason ||
          "The pieces and side to move do not form a legal position.",
      };
      return null;
    }
    const metadata = game.knightline || {};
    return {
      ...raw,
      game,
      fen: game.fen(),
      turn: game.turn(),
      gameId: state.gameId,
      positionKey: KnightlineContracts.key(
        raw.boardId,
        state.gameId,
        game.fen(),
      ),
      playerColor: state.playerColor,
      readOnly: BoardReader.readOnly(board),
      finished: BoardReader.finished(board),
      clock: BoardReader.clock(),
      source: metadata.source,
      confidence: metadata.confidence,
      turnSource: metadata.turnSource,
    };
  }
  const executor = new MoveExecutor(readSnapshot);
  adapter.setReadPositionHandler(readSnapshot);
  adapter.setExecutionHandler((move, expectedFen) => {
    if (!state.snapshot || (expectedFen && state.snapshot.fen !== expectedFen))
      return {
        accepted: false,
        kind: "cancelled",
        reason: "The requested position no longer matches this board.",
      };
    return executor.execute(move, state.snapshot, state.settings);
  });
  function myTurn(snapshot) {
    return (
      ["study", "puzzle", "spectator"].includes(snapshot.context) ||
      snapshot.turn === snapshot.playerColor
    );
  }
  function svgElement(tag, attrs, parent) {
    const element = document.createElementNS("http://www.w3.org/2000/svg", tag);
    for (const [key, value] of Object.entries(attrs))
      element.setAttribute(key, String(value));
    parent?.appendChild(element);
    return element;
  }
  function drawArrow(move = state.display) {
    if (
      !state.settings.enabled ||
      !move ||
      !state.board?.isConnected ||
      state.dragging ||
      state.positionKey !== move.positionKey
    ) {
      document.getElementById("chesshelper-arrow-overlay")?.remove();
      state.arrowKey = "";
      return;
    }
    const rect = state.board.getBoundingClientRect(),
      orientation = BoardReader.orientation(state.board);
    if (!rect.width) return;
    const key = JSON.stringify([
      move.from,
      move.to,
      move.promotion,
      move.imperfect,
      move.eval,
      move.mate,
      move.depth,
      orientation,
      rect.left,
      rect.top,
      rect.width,
      rect.height,
      state.settings.showArrow,
      state.settings.showAlternatives,
    ]);
    if (
      key === state.arrowKey &&
      document.getElementById("chesshelper-arrow-overlay")
    )
      return;
    if (!state.settings.showArrow) {
      document.getElementById("chesshelper-arrow-overlay")?.remove();
      state.arrowKey = "";
      return;
    }
    const old = document.getElementById("chesshelper-arrow-overlay"),
      svg = svgElement("svg", {
        id: "chesshelper-arrow-overlay",
        viewBox: `0 0 ${innerWidth} ${innerHeight}`,
        "aria-hidden": "true",
      });
    svg.classList.toggle("chp-reposition", Boolean(old));
    const sq = rect.width / 8,
      sy = rect.height / 8,
      color = move.imperfect ? "#ffa500" : "#00dcff";
    function path(from, to, stroke, widthFactor = 1) {
      const a = BoardReader.point(from, rect, orientation),
        b = BoardReader.point(to, rect, orientation);
      if (!a || !b) return;
      const length = Math.hypot(b.x - a.x, b.y - a.y),
        nx = (b.x - a.x) / length,
        ny = (b.y - a.y) / length,
        width = Math.max(3, Math.min(8, sq / 8)) * widthFactor;
      return svgElement(
        "line",
        {
          x1: a.x + nx * sq * 0.3,
          y1: a.y + ny * sq * 0.3,
          x2: b.x - nx * sq * 0.35,
          y2: b.y - ny * sq * 0.35,
          stroke,
          "stroke-width": width,
          "stroke-opacity": ".9",
          "stroke-linecap": "round",
          "stroke-dasharray": `${width},${width * 2}`,
          class: "chp-path",
        },
        svg,
      );
    }
    for (const [square, destination] of [
      [move.from, false],
      [move.to, true],
    ]) {
      const point = BoardReader.point(square, rect, orientation);
      svgElement(
        "rect",
        {
          x: point.x - sq / 2 + 2,
          y: point.y - sy / 2 + 2,
          width: sq - 4,
          height: sy - 4,
          rx: 4,
          fill: color,
          "fill-opacity": destination ? ".3" : ".16",
          stroke: color,
          "stroke-opacity": ".55",
          "stroke-width": 1.5,
          class: destination ? "chp-destination" : "chp-source",
        },
        svg,
      );
    }
    path(move.from, move.to, move.imperfect ? "#ffa500" : "#ffffff");
    const legal = BoardPosition.legalMove(move.positionFen, move);
    if (legal && /[kq]/.test(legal.flags)) {
      const rank = move.from[1],
        from = legal.flags.includes("k") ? "h" + rank : "a" + rank,
        to = legal.flags.includes("k") ? "f" + rank : "d" + rank;
      path(from, to, "#83bfff", 0.6)?.setAttribute(
        "data-castling-rook",
        "true",
      );
    }
    if (move.promotion) {
      const b = BoardReader.point(move.to, rect, orientation);
      const marker = svgElement(
        "text",
        {
          x: b.x + sq * 0.27,
          y: b.y - sy * 0.15,
          fill: "#f6ffe8",
          stroke: "#15200e",
          "stroke-width": 3,
          "paint-order": "stroke",
          "font-family": "Segoe UI, sans-serif",
          "font-size": Math.max(16, sq * 0.3),
          "font-weight": 700,
          "data-promotion": move.promotion,
        },
        svg,
      );
      marker.textContent = move.promotion.toUpperCase();
    }
    if (state.settings.showAlternatives) {
      let count = 0;
      for (const candidate of move.candidates || []) {
        if (candidate.from === move.from && candidate.to === move.to) continue;
        if (!BoardPosition.legalMove(move.positionFen, candidate)) continue;
        path(candidate.from, candidate.to, "#83bfff", 0.45)?.setAttribute(
          "data-alternative",
          "true",
        );
        if (++count === 2) break;
      }
    }
    const ev = evaluation(move);
    svgElement(
      "rect",
      {
        x: rect.right - 84,
        y: rect.top + 8,
        width: 76,
        height: 28,
        rx: 7,
        fill: "#11180f",
        "fill-opacity": ".94",
      },
      svg,
    );
    const badge = svgElement(
      "text",
      {
        x: rect.right - 46,
        y: rect.top + 27,
        fill: "#d7efbf",
        "text-anchor": "middle",
        "font-family": "Segoe UI, sans-serif",
        "font-size": 14,
      },
      svg,
    );
    badge.textContent = ev.label;
    old?.remove();
    document.documentElement.appendChild(svg);
    state.arrowKey = key;
  }
  function panel() {
    if (host?.isConnected) return host;
    host = document.createElement("aside");
    host.id = "chesshelper-live-panel";
    host.setAttribute("data-knightline-ui", "");
    host.setAttribute("aria-label", "Knightline board companion");
    uiRoot = host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = globalThis.KnightlinePanelCSS || "";
    uiRoot.appendChild(style);
    const body = document.createElement("div");
    body.innerHTML = `<div class="chp-head" id="chp-drag" tabindex="0" aria-label="Move coach panel with arrow keys"><div class="chp-brand"><span class="chp-mark" aria-hidden="true">♞</span><div><strong class="chp-title">knightline<span> / lab</span></strong><div class="chp-sub">5.0 · LOCAL FIRST</div></div></div><button type="button" id="chp-collapse" aria-label="Collapse coach panel">−</button></div><div id="chp-body"><div class="chp-status"><i></i><span id="chp-status-text">Standing by</span><span class="chp-badge" id="chp-badge">LOCAL</span></div><div class="chp-main"><div><div class="chp-label" id="chp-move-label">SUGGESTED MOVE</div><div class="chp-move" id="chp-move">Waiting</div></div><div class="chp-score"><strong id="chp-score">—</strong><span>WHITE'S VIEW</span></div></div><div class="chp-eval-track"><div id="chp-eval-fill"></div></div><p class="chp-eval" id="chp-eval"></p><div class="chp-line-box"><div class="chp-label">THE NEXT FEW MOVES</div><div class="chp-line" id="chp-line"></div></div><div id="chp-candidates" class="chp-candidates" hidden></div><p id="chp-confidence" class="chp-confidence"></p><div class="chp-error" id="chp-error" hidden></div><button type="button" class="chp-retry" id="chp-retry" hidden>Analyze again ↗</button><div class="chp-tools"><button type="button" id="chp-refresh">Refresh</button><button type="button" id="chp-copy-fen">Copy FEN</button><button type="button" id="chp-diagnostics">Diagnostics</button></div><pre class="chp-diagnostics" id="chp-diagnostic-view" hidden></pre><div class="chp-foot"><span id="chp-site"></span><span id="chp-depth"></span></div></div>`;
    uiRoot.appendChild(body);
    document.documentElement.appendChild(host);
    const updateCollapse = () => {
      node("chp-body").hidden = state.settings.panelCollapsed;
      node("chp-collapse").textContent = state.settings.panelCollapsed
        ? "+"
        : "−";
      node("chp-collapse").setAttribute(
        "aria-expanded",
        String(!state.settings.panelCollapsed),
      );
    };
    updateCollapse();
    if (state.settings.panelPosition) {
      host.style.left = state.settings.panelPosition.x + "px";
      host.style.top = state.settings.panelPosition.y + "px";
      host.style.right = "auto";
    }
    node("chp-collapse").onclick = () => {
      state.settings.panelCollapsed = !state.settings.panelCollapsed;
      updateCollapse();
      chrome.storage.local.set({
        panelCollapsed: state.settings.panelCollapsed,
      });
    };
    const refresh = () => {
      invalidate();
      state.candidateKey = "";
      state.retryAt = 0;
      state.attempts = 0;
      schedule(0);
    };
    node("chp-retry").onclick = refresh;
    node("chp-refresh").onclick = refresh;
    node("chp-copy-fen").onclick = async () => {
      try {
        if (state.snapshot)
          await navigator.clipboard.writeText(state.snapshot.fen);
        node("chp-copy-fen").textContent = "Copied";
      } catch {
        node("chp-copy-fen").textContent = "Copy unavailable";
      }
    };
    node("chp-diagnostics").onclick = () => {
      const view = node("chp-diagnostic-view");
      view.hidden = !view.hidden;
      view.textContent = JSON.stringify(diagnostic(), null, 2);
    };
    node("chp-drag").addEventListener("keydown", (event) => {
      if (
        !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(
          event.key,
        ) ||
        event.target !== node("chp-drag")
      )
        return;
      event.preventDefault();
      const rect = host.getBoundingClientRect(),
        step = event.shiftKey ? 40 : 10;
      host.style.left =
        Math.max(
          8,
          Math.min(
            innerWidth - host.offsetWidth - 8,
            rect.left +
              (event.key === "ArrowLeft"
                ? -step
                : event.key === "ArrowRight"
                  ? step
                  : 0),
          ),
        ) + "px";
      host.style.top =
        Math.max(
          8,
          Math.min(
            innerHeight - host.offsetHeight - 8,
            rect.top +
              (event.key === "ArrowUp"
                ? -step
                : event.key === "ArrowDown"
                  ? step
                  : 0),
          ),
        ) + "px";
      host.style.right = "auto";
      chrome.storage.local.set({
        panelPosition: {
          x: parseFloat(host.style.left),
          y: parseFloat(host.style.top),
        },
      });
    });
    let drag = null;
    node("chp-drag").addEventListener("pointerdown", (event) => {
      if (event.button !== 0 || event.target.closest("button")) return;
      const rect = host.getBoundingClientRect();
      drag = { x: event.clientX - rect.left, y: event.clientY - rect.top };
      node("chp-drag").setPointerCapture(event.pointerId);
    });
    node("chp-drag").addEventListener("pointermove", (event) => {
      if (!drag) return;
      host.style.left =
        Math.max(
          8,
          Math.min(innerWidth - host.offsetWidth - 8, event.clientX - drag.x),
        ) + "px";
      host.style.top =
        Math.max(
          8,
          Math.min(innerHeight - host.offsetHeight - 8, event.clientY - drag.y),
        ) + "px";
      host.style.right = "auto";
    });
    const stop = () => {
      if (!drag) return;
      drag = null;
      const rect = host.getBoundingClientRect();
      chrome.storage.local.set({
        panelPosition: { x: rect.left, y: rect.top },
      });
    };
    node("chp-drag").addEventListener("pointerup", stop);
    node("chp-drag").addEventListener("pointercancel", stop);
    return host;
  }
  function renderStage(stage, message, kind = null) {
    const element = panel();
    element.hidden = !state.settings.showPanel;
    element.dataset.stage = stage;
    node("chp-site").textContent =
      BoardReader.site() + " · " + BoardReader.context();
    node("chp-status-text").textContent =
      stage === "loading"
        ? "Analyzing locally"
        : stage === "error"
          ? {
              position: "Board needs attention",
              network: "Cloud unavailable",
              engine: "Local engine unavailable",
              input: "Move input blocked",
              rejected: "Move not accepted",
              "read-only": "Read-only board",
            }[kind] || "Attention needed"
          : "Standing by";
    node("chp-move").textContent =
      stage === "loading"
        ? "Thinking"
        : stage === "error"
          ? "Try again"
          : "Your move";
    node("chp-move-label").textContent =
      stage === "loading" ? "READING THE POSITION" : "BOARD ANALYSIS";
    node("chp-eval").textContent =
      stage === "error" ? "No move was submitted." : message;
    node("chp-score").textContent = "—";
    node("chp-eval-fill").style.width = "50%";
    node("chp-line").textContent =
      stage === "loading"
        ? "Finding a line worth exploring…"
        : "A fresh position brings a fresh perspective.";
    node("chp-depth").textContent = "Stockfish 19 · local";
    node("chp-badge").textContent = "LOCAL";
    node("chp-candidates").hidden = true;
    node("chp-error").hidden = stage !== "error";
    node("chp-error").textContent = stage === "error" ? message : "";
    node("chp-retry").hidden = stage !== "error";
    node("chp-confidence").textContent =
      state.snapshot?.confidence === "conservative"
        ? "Partial history: unknown castling rights are omitted."
        : "";
  }
  function evaluation(data) {
    if (data.mate != null && Number.isFinite(Number(data.mate))) {
      const mate = Number(data.mate);
      return {
        label: `${mate < 0 ? "−" : ""}M${Math.abs(mate)}`,
        percent: mate < 0 ? 2 : 98,
        detail: `${mate < 0 ? "Black" : "White"} has a forced mate in ${Math.abs(mate)}.`,
      };
    }
    const value = Number(
      data.eval ??
        (data.evaluation?.type === "cp" ? data.evaluation.value / 100 : NaN),
    );
    if (!Number.isFinite(value))
      return {
        label: "—",
        percent: 50,
        detail: "No score reported for this move.",
      };
    return {
      label: `${value > 0 ? "+" : ""}${value.toFixed(2)}`,
      percent: Math.max(4, Math.min(96, 50 + 45 * Math.tanh(value / 4))),
      detail:
        Math.abs(value) < 0.3
          ? "A roughly balanced position."
          : `${value > 0 ? "White" : "Black"} ${Math.abs(value) < 1 ? "has a small edge" : Math.abs(value) < 3 ? "has the advantage" : "has a strong advantage"}.`,
    };
  }
  function renderResult(data, snapshot, partial = false) {
    const element = panel();
    element.hidden = !state.settings.showPanel;
    element.dataset.stage = partial
      ? "loading"
      : data.imperfect
        ? "variation"
        : "ready";
    const ev = evaluation(data),
      legal = BoardPosition.legalMove(snapshot.fen, data);
    node("chp-status-text").textContent = partial
      ? "Analyzing locally"
      : data.imperfect
        ? "Practice variation"
        : "A line to explore";
    node("chp-badge").textContent =
      data.source === "demo"
        ? "DEMO"
        : data.source === "cloud"
          ? "CLOUD"
          : data.imperfect
            ? "PRACTICE"
            : "LOCAL";
    node("chp-move-label").textContent = partial
      ? "SEARCH IN PROGRESS"
      : data.imperfect
        ? "PRACTICE MOVE"
        : "SUGGESTED MOVE";
    node("chp-move").textContent =
      legal?.san || data.san || `${data.from} → ${data.to}`;
    node("chp-score").textContent = ev.label;
    node("chp-eval-fill").style.width = ev.percent + "%";
    const names = {
      p: "Pawn",
      n: "Knight",
      b: "Bishop",
      r: "Rook",
      q: "Queen",
      k: "King",
    };
    node("chp-eval").textContent =
      `${names[legal?.piece] || "Move"} ${data.from} → ${data.to}${legal?.captured ? " · captures " + names[legal.captured].toLowerCase() : ""}${data.promotion ? " · promotes to " + names[data.promotion].toLowerCase() : ""}. ${ev.detail}`;
    let line = BoardPosition.line(snapshot.fen, data.continuationArr || []);
    if (!line.length && legal) line = [legal.san];
    const container = node("chp-line");
    container.replaceChildren();
    for (const [index, move] of line.entries()) {
      const token = document.createElement("span");
      token.className = index === 0 ? "chp-line-first" : "";
      token.textContent = move;
      container.appendChild(token);
    }
    if (!line.length) container.textContent = "No continuation returned.";
    const list = node("chp-candidates");
    list.replaceChildren();
    let count = 0;
    for (const candidate of data.candidates || []) {
      if (candidate.from === data.from && candidate.to === data.to) continue;
      const move = BoardPosition.legalMove(snapshot.fen, candidate);
      if (!move) continue;
      const row = document.createElement("div"),
        title = document.createElement("span"),
        score = document.createElement("span");
      title.textContent = "Also consider " + move.san;
      score.textContent = evaluation(candidate).label;
      row.append(title, score);
      list.appendChild(row);
      if (++count === 2) break;
    }
    list.hidden = !count;
    node("chp-site").textContent =
      BoardReader.site() + " · " + snapshot.context;
    node("chp-depth").textContent =
      `${data.depth ? "Depth " + data.depth : partial ? "Searching" : "Depth not reported"} · ${data.source || "local"}`;
    node("chp-error").hidden = true;
    node("chp-retry").hidden = true;
    node("chp-confidence").textContent =
      snapshot.confidence === "conservative"
        ? "Partial history: unknown castling rights are omitted."
        : snapshot.confidence === "partial-counters"
          ? "Repeated position: move counters use its latest occurrence."
          : "";
  }
  function attachBoard(board) {
    if (state.board === board) return;
    state.bindings?.abort();
    state.observer?.disconnect();
    state.resizeObserver?.disconnect();
    invalidate();
    state.board = board;
    state.tracker = new BoardPosition();
    state.manualFen = null;
    state.candidateKey = "";
    state.dragging = false;
    state.playerColor =
      board.getAttribute("data-player-color") ||
      (BoardReader.orientation(board) === "black" ? "b" : "w");
    state.gameId = `game-${++state.epoch}`;
    controller.beginGame(state.gameId);
    const bindings = new AbortController();
    state.bindings = bindings;
    const begin = (event) => {
      if (!event.isTrusted || event.button !== 0) return;
      state.dragging = true;
      invalidate();
      renderStage("waiting", "Move in progress. Release to continue.");
    };
    const end = () => {
      if (!state.dragging) return;
      state.dragging = false;
      state.candidateKey = "";
      schedule(200);
    };
    board.addEventListener("pointerdown", begin, {
      capture: true,
      passive: true,
      signal: bindings.signal,
    });
    window.addEventListener("pointerup", end, {
      capture: true,
      passive: true,
      signal: bindings.signal,
    });
    window.addEventListener("pointercancel", end, {
      capture: true,
      passive: true,
      signal: bindings.signal,
    });
    state.observer = new MutationObserver(() => schedule(100));
    state.observer.observe(board, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["class", "style", "data-turn", "data-fen"],
    });
    state.resizeObserver = new ResizeObserver(redraw);
    state.resizeObserver.observe(board);
  }
  engineController.onProgress = (data) => {
    if (
      !state.busy ||
      !state.snapshot ||
      data.positionKey !== state.positionKey ||
      state.dragging ||
      !data.from ||
      !BoardPosition.legalMove(state.snapshot.fen, data)
    )
      return;
    state.display = {
      ...data,
      positionFen: state.snapshot.fen,
      positionKey: state.positionKey,
    };
    renderResult(state.display, state.snapshot, true);
    drawArrow();
  };
  async function analyze(snapshot) {
    state.busy = true;
    state.analyzedKey = snapshot.positionKey;
    state.attempts++;
    const id = ++state.request;
    controller.configure(state.settings);
    renderStage(
      "loading",
      `${snapshot.turn === "w" ? "White" : "Black"} to move. Exploring the position.`,
    );
    status("Analyzing", "Stockfish is running on this device.");
    trace("request", {
      reconstructedFen: snapshot.fen,
      submittedFen: snapshot.fen,
      response: null,
      error: null,
    });
    try {
      const selection = await controller.startAnalysis(snapshot.fen, {
        allowImperfect: true,
        gameId: snapshot.gameId,
        positionKey: snapshot.positionKey,
        timeMs: KnightlineContracts.budget(
          state.settings,
          snapshot.context,
          snapshot.clock,
        ),
      });
      if (id !== state.request || !selection) return;
      const current = readSnapshot();
      if (
        !current ||
        current.positionKey !== snapshot.positionKey ||
        current.fen !== snapshot.fen ||
        current.board !== snapshot.board ||
        current.gameId !== snapshot.gameId ||
        state.dragging
      ) {
        invalidate();
        schedule(100);
        return;
      }
      const move = normalizeCandidate(selection.move);
      if (!move || !BoardPosition.legalMove(snapshot.fen, move))
        throw new KnightlineError(
          "position",
          "The returned move does not match the selected board.",
        );
      const data = {
        ...selection.analysis,
        ...move,
        imperfect: selection.imperfect,
        positionFen: snapshot.fen,
        positionKey: snapshot.positionKey,
      };
      state.result = data;
      state.display = data;
      drawArrow();
      renderResult(data, snapshot);
      trace("result", {
        engine: data.engine,
        response: {
          id: data.id,
          positionKey: snapshot.positionKey,
          source: data.source,
          depth: data.depth,
          move: move.from + move.to + (move.promotion || ""),
          evaluation: move.evaluation || null,
          complete: data.complete,
        },
        submittedFen: data.fen || snapshot.fen,
      });
      status(
        "Analysis",
        `${data.imperfect ? "Practice variation" : "Suggested"}: ${BoardPosition.legalMove(snapshot.fen, move).san}`,
      );
      if (state.settings.autoplay) queueMove(move, snapshot);
    } catch (error) {
      if (id !== state.request || error.kind === "cancelled") return;
      clearVisuals();
      state.analyzedKey = null;
      state.retryAt = Date.now() + 3000;
      trace("error", { error: KnightlineContracts.error(error) });
      renderStage("error", error.message, error.kind);
      status("Error", error.message);
    } finally {
      if (id === state.request) state.busy = false;
    }
  }
  function scan() {
    if (!state.settings.enabled || state.executing) return;
    if (document.hidden) {
      if (state.busy) invalidate();
      return;
    }
    const route = location.pathname;
    if (state.route !== route) {
      state.route = route;
      invalidate();
      state.manualFen = null;
      state.tracker = new BoardPosition();
      state.candidateKey = "";
      state.gameId = `game-${++state.epoch}`;
      controller.beginGame(state.gameId);
    }
    const board = BoardReader.select(state.selectedBoardId);
    if (!board) {
      invalidate();
      state.snapshot = null;
      const reason = BoardReader.lastSelection?.reason;
      renderStage(
        "waiting",
        reason === "ambiguous"
          ? "Multiple boards are visible. Choose the main board in Overview."
          : reason === "selected-board-missing"
            ? "The selected board is gone. Choose another board or Automatic."
            : "Open a supported board to begin.",
      );
      status(
        "Waiting",
        reason === "ambiguous"
          ? "Choose a board"
          : "No supported board detected",
      );
      return;
    }
    attachBoard(board);
    if (state.dragging) return;
    const snapshot = readSnapshot();
    if (!snapshot) {
      invalidate();
      renderStage(
        "waiting",
        state.tracker.lastResolution?.reason ||
          "Waiting for a legal, settled position. Check turn detection if this persists.",
      );
      trace("board-unresolved", { error: state.diagnostic.error });
      return;
    }
    const initial = new Chess().fen().split(" ")[0];
    if (
      state.snapshot &&
      state.snapshot.gameId === snapshot.gameId &&
      snapshot.game.fen().split(" ")[0] === initial &&
      state.snapshot.game.fen().split(" ")[0] !== initial &&
      snapshot.context !== "study"
    ) {
      invalidate();
      state.tracker = new BoardPosition();
      state.gameId = `game-${++state.epoch}`;
      controller.beginGame(state.gameId);
      state.snapshot = null;
      state.candidateKey = "";
      schedule(170);
      return;
    }
    state.snapshot = snapshot;
    state.positionKey = snapshot.positionKey;
    state.diagnostic.reconstructedFen = snapshot.fen;
    if (snapshot.positionKey !== state.candidateKey) {
      invalidate();
      state.positionKey = snapshot.positionKey;
      state.candidateKey = snapshot.positionKey;
      state.stableAt = performance.now();
      state.attempts = 0;
      state.retryAt = 0;
      renderStage("waiting", "Reading the new position…");
      schedule(180);
      return;
    }
    if (performance.now() - state.stableAt < 150) {
      schedule(170);
      return;
    }
    state.tracker.commit(snapshot.game);
    if (snapshot.finished || snapshot.game.game_over()) {
      invalidate();
      renderStage(
        "waiting",
        snapshot.game.in_checkmate()
          ? "Checkmate. Review the final position."
          : snapshot.finished
            ? "Game finished. Open analysis to explore further."
            : "This position is drawn. Explore another line.",
      );
      status("Waiting", "Position complete");
      return;
    }
    if (!myTurn(snapshot)) {
      invalidate();
      renderStage(
        "waiting",
        `${snapshot.turn === "w" ? "White" : "Black"} to move. Waiting for your turn.`,
      );
      status("Waiting", "Opponent to move");
      return;
    }
    if (
      snapshot.positionKey !== state.analyzedKey &&
      !state.busy &&
      state.attempts < 2 &&
      Date.now() >= state.retryAt
    )
      analyze(snapshot);
    else if (state.display) drawArrow();
  }
  function queueMove(move, snapshot) {
    state.executionAbort?.abort();
    const abort = new AbortController();
    state.executionAbort = abort;
    const settings = { ...state.settings };
    (async () => {
      try {
        await MoveExecutor.wait(
          KnightlineContracts.timing(settings),
          abort.signal,
        );
        if (
          !state.settings.enabled ||
          !state.settings.autoplay ||
          document.hidden ||
          state.dragging
        )
          return;
        const current = readSnapshot();
        if (
          !current ||
          current.positionKey !== snapshot.positionKey ||
          current.fen !== snapshot.fen ||
          current.orientation !== snapshot.orientation ||
          current.board !== snapshot.board ||
          current.finished ||
          current.gameId !== snapshot.gameId
        )
          return;
        state.executing = true;
        status("Executing", `${move.from} → ${move.to}`);
        const result = await executor.execute(move, snapshot, settings, {
          signal: abort.signal,
          onPhase: (phase) => trace("execution-" + phase),
        });
        trace("execution-result", { execution: result });
        if (result.accepted) {
          invalidate();
          state.candidateKey = "";
          schedule(170);
        } else if (result.kind !== "cancelled") {
          renderStage("error", result.reason, result.kind);
          status("Error", result.reason);
        }
      } catch (error) {
        if (error.kind !== "cancelled")
          trace("execution-error", { error: KnightlineContracts.error(error) });
      } finally {
        state.executing = false;
      }
    })();
  }
  let redrawPending = false;
  function redraw() {
    if (redrawPending) return;
    redrawPending = true;
    requestAnimationFrame(() => {
      redrawPending = false;
      drawArrow();
      if (host?.style.left && getComputedStyle(host).position === "fixed") {
        const rect = host.getBoundingClientRect();
        host.style.left =
          Math.max(8, Math.min(innerWidth - rect.width - 8, rect.left)) + "px";
        host.style.top =
          Math.max(8, Math.min(innerHeight - rect.height - 8, rect.top)) + "px";
      }
    });
  }
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    const patch = {};
    for (const key of Object.keys(AppSettings.defaults))
      if (changes[key]) patch[key] = changes[key].newValue;
    if (!Object.keys(patch).length) return;
    state.settings = AppSettings.normalize({ ...state.settings, ...patch });
    controller.configure(state.settings);
    if (
      Object.keys(patch).every((key) =>
        [
          "showArrow",
          "showPanel",
          "showAlternatives",
          "panelCollapsed",
          "panelPosition",
        ].includes(key),
      )
    ) {
      if (host) host.hidden = !state.settings.showPanel;
      drawArrow();
      return;
    }
    invalidate();
    state.candidateKey = "";
    state.retryAt = 0;
    state.attempts = 0;
    if (!state.settings.enabled) {
      host?.remove();
      host = null;
      uiRoot = null;
      state.observer?.disconnect();
      state.resizeObserver?.disconnect();
      state.bindings?.abort();
      state.board = null;
      status("Waiting", "Board analysis is off.");
    } else schedule(0);
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      invalidate();
    } else {
      state.attempts = 0;
      state.analyzedKey = null;
      schedule(0);
    }
  });
  addEventListener("resize", redraw, { passive: true });
  addEventListener("scroll", redraw, { passive: true, capture: true });
  addEventListener("pagehide", () => {
    invalidate();
    state.observer?.disconnect();
    state.resizeObserver?.disconnect();
    state.bindings?.abort();
    state.board = null;
  });
  addEventListener("pageshow", () => schedule(0));
  setInterval(() => schedule(0), 800);
  (async () => {
    state.settings = AppSettings.normalize(
      await chrome.storage.local.get(null),
    );
    controller.configure(state.settings);
    trace("initialized");
    schedule(0);
  })().catch((error) => status("Error", error.message));
})();
