importScripts(
  "lib/chess.js",
  "appSettings.js",
  "contracts.js",
  "moveSelectionPolicy.js",
  "boardPosition.js",
);
const API_URL = "https://chess-api.com/v1";
const engineRequests = new Map(),
  cache = new Map();
let creatingOffscreen = null;
async function ensureOffscreen() {
  const contexts = await chrome.runtime.getContexts({
    contextTypes: ["OFFSCREEN_DOCUMENT"],
  });
  if (contexts.length) return;
  if (!creatingOffscreen)
    creatingOffscreen = chrome.offscreen
      .createDocument({
        url: "offscreen.html",
        reasons: ["WORKERS"],
        justification:
          "Run the bundled local chess engine without opening a tab.",
      })
      .finally(() => {
        creatingOffscreen = null;
      });
  await creatingOffscreen;
}
async function cloudAnalysis(fen, settings, depth) {
  const abort = new AbortController(),
    timer = setTimeout(() => abort.abort(), 15000);
  try {
    const response = await fetch(API_URL, {
      method: "POST",
      credentials: "omit",
      redirect: "error",
      referrerPolicy: "no-referrer",
      headers: { "Content-Type": "application/json" },
      signal: abort.signal,
      body: JSON.stringify({
        fen,
        depth: depth || settings.searchDepth || 14,
        maxThinkingTime: 100,
        variants: 3,
      }),
    });
    if (!response.ok)
      throw new KnightlineError(
        "network",
        `Cloud engine returned HTTP ${response.status}.`,
      );
    const raw = await response.json();
    if (raw?.type === "error")
      throw new KnightlineError(
        "position",
        raw.text || "Cloud engine rejected the position.",
      );
    const rows = Array.isArray(raw)
      ? raw
      : Array.isArray(raw.candidates)
        ? raw.candidates
        : Array.isArray(raw.variants)
          ? raw.variants
          : [raw];
    const candidates = rows.map(normalizeCandidate).filter(Boolean);
    if (!candidates.length)
      throw new KnightlineError("engine", "Cloud engine returned no move.");
    return {
      ...candidates[0],
      candidates,
      source: "cloud",
      engine: "Chess-API",
      complete: true,
      fen,
    };
  } catch (error) {
    if (error.name === "AbortError")
      throw new KnightlineError("network", "Cloud engine timed out.");
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
async function analyzeFen(fen, elo = 1800, depth, options = {}) {
  const position = BoardPosition.create(fen);
  if (!position)
    throw new KnightlineError(
      "position",
      "The reconstructed board is not a legal standard-chess position.",
    );
  fen = position.fen();
  const settings = AppSettings.normalize(await chrome.storage.local.get(null));
  const request = {
    id: options.id || crypto.randomUUID(),
    fen,
    positionKey: options.positionKey || KnightlineContracts.key(fen),
    gameId: options.gameId || "manual",
    timeMs: Math.max(
      100,
      Math.min(10000, options.timeMs || settings.searchTimeMs),
    ),
    multiPV: 3,
    depth: depth === 2 ? 2 : settings.searchDepth || 0,
    settings,
  };
  const key = JSON.stringify([
    fen,
    request.timeMs,
    request.depth,
    settings.strengthMode,
    settings.strengthElo,
    settings.skillLevel,
  ]);
  const cached = cache.get(key);
  if (
    cached &&
    Date.now() - cached.at < 120000 &&
    (cached.data.source === "local" || settings.cloudFallback)
  )
    return {
      ...cached.data,
      id: request.id,
      positionKey: request.positionKey,
      cacheHit: true,
    };
  let data;
  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        await ensureOffscreen();
        const result = await chrome.runtime.sendMessage({
          type: "ENGINE_ANALYZE",
          target: "offscreen",
          request,
        });
        if (!result?.ok)
          throw new KnightlineError(
            result?.error?.kind || "engine",
            result?.error?.message || "The local engine host did not respond.",
          );
        data = result.data;
        break;
      } catch (error) {
        if (
          attempt === 1 ||
          error.kind === "cancelled" ||
          error.kind === "position"
        )
          throw error;
      }
    }
  } catch (error) {
    if (
      !settings.cloudFallback ||
      ["position", "cancelled"].includes(error.kind)
    )
      throw error;
    data = {
      ...(await cloudAnalysis(fen, settings, request.depth)),
      localFailure: error.message,
      id: request.id,
      positionKey: request.positionKey,
    };
  }
  cache.set(key, { at: Date.now(), data });
  if (cache.size > 80) cache.delete(cache.keys().next().value);
  return data;
}
chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (message?.target === "offscreen") return;
  if (sender.id && sender.id !== chrome.runtime.id) return;
  if (message?.type === "ENGINE_PROGRESS") {
    const owner = engineRequests.get(message.id);
    if (owner?.tabId != null)
      chrome.tabs
        .sendMessage(owner.tabId, {
          type: "ANALYSIS_PROGRESS",
          id: message.id,
          data: message.data,
        })
        .catch(() => {});
    return;
  }
  if (message?.type === "CANCEL_ANALYSIS") {
    const owner = engineRequests.get(message.id);
    if (owner && owner.tabId === sender.tab?.id) {
      engineRequests.delete(message.id);
      chrome.runtime
        .sendMessage({
          type: "ENGINE_CANCEL",
          target: "offscreen",
          id: message.id,
        })
        .catch(() => {});
    }
    reply({ ok: true });
    return;
  }
  if (
    message?.type === "GET_RUNTIME_STATUS" ||
    message?.type === "GET_DIAGNOSTICS" ||
    message?.type === "REFRESH_BOARD" ||
    message?.type === "SELECT_BOARD" ||
    message?.type === "SET_MANUAL_FEN"
  ) {
    (async () => {
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      let status = null;
      if (tab?.id != null)
        try {
          status = await chrome.tabs.sendMessage(tab.id, {
            ...message,
            type:
              message.type === "GET_RUNTIME_STATUS"
                ? "GET_BOARD_STATUS"
                : message.type,
          });
        } catch {}
      reply({
        ok: true,
        version: chrome.runtime.getManifest().version,
        status,
      });
    })().catch((error) =>
      reply({ ok: false, error: KnightlineContracts.error(error) }),
    );
    return true;
  }
  if (message?.type === "RESET_LOCAL_ENGINE") {
    (async () => {
      await ensureOffscreen();
      cache.clear();
      await chrome.runtime.sendMessage({
        type: "ENGINE_RESET",
        target: "offscreen",
      });
      reply({ ok: true });
    })().catch((error) =>
      reply({ ok: false, error: KnightlineContracts.error(error) }),
    );
    return true;
  }
  if (message?.type === "GET_ENGINE_STATUS") {
    (async () => {
      const contexts = await chrome.runtime.getContexts({
        contextTypes: ["OFFSCREEN_DOCUMENT"],
      });
      reply(
        contexts.length
          ? await chrome.runtime.sendMessage({
              type: "ENGINE_HOST_STATUS",
              target: "offscreen",
            })
          : { ok: true, workerRunning: false, capabilities: {} },
      );
    })().catch(() => reply({ ok: false }));
    return true;
  }
  if (message?.type !== "ANALYZE_FEN") return;
  const id = String(message.id || crypto.randomUUID());
  engineRequests.set(id, { tabId: sender.tab?.id });
  analyzeFen(String(message.fen || ""), message.elo, message.depth, {
    id,
    positionKey: message.positionKey,
    gameId: message.gameId,
    timeMs: message.timeMs,
  })
    .then((data) => reply({ ok: true, data }))
    .catch((error) =>
      reply({ ok: false, error: KnightlineContracts.error(error) }),
    )
    .finally(() => engineRequests.delete(id));
  return true;
});
