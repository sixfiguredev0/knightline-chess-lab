importScripts('lib/chess.js', 'appSettings.js', 'moveSelectionPolicy.js', 'boardPosition.js');
const API_URL = 'https://chess-api.com/v1';
const cache = new Map();
const inFlight = new Map();
function eloToDepth(elo) { return AppSettings.depthFor(elo); }
async function analyzeFen(fen, elo, override) {
  const position = BoardPosition.create(fen);
  if (!position) throw new Error('Invalid board position.');
  fen = position.fen();
  const depth = override === 2 ? 2 : eloToDepth(elo);
  const key = `${depth}|${fen}`;
  const cached = cache.get(key);
  if (cached && Date.now() - cached.time < 120000) return cached.data;
  if (inFlight.has(key)) return inFlight.get(key);
  const promise = (async () => {
    const abort = new AbortController();
    const timeout = setTimeout(() => abort.abort(), 15000);
    try {
      const response = await fetch(API_URL, {method: 'POST', credentials: 'omit', redirect: 'error', referrerPolicy: 'no-referrer', headers: {'Content-Type': 'application/json'}, signal: abort.signal, body: JSON.stringify({fen, depth, maxThinkingTime: Math.min(100, Math.max(50, 50 + (depth - 8) * 6)), variants: 5})});
      if (!response.ok) throw new Error(response.status === 429 ? 'Engine is busy. Try again shortly.' : `Engine returned HTTP ${response.status}.`);
      const raw = await response.json();
      if (raw?.type === 'error') throw new Error(raw.text || raw.error || 'Engine error.');
      const rows = Array.isArray(raw) ? raw : Array.isArray(raw?.candidates) ? raw.candidates : Array.isArray(raw?.variants) ? raw.variants : [raw];
      const candidates = rows.map(normalizeCandidate).filter(Boolean);
      if (!candidates.length) {
        const best = normalizeCandidate(raw);
        if (best) candidates.push(best);
      }
      if (!candidates.length) throw new Error('No move returned. The position may be finished.');
      const data = {...(!Array.isArray(raw) ? raw : {}), ...candidates[0], candidates, requestedDepth: depth, targetElo: elo};
      cache.set(key, {time: Date.now(), data});
      if (cache.size > 80) cache.delete(cache.keys().next().value);
      return data;
    } catch (error) {
      if (error.name === 'AbortError') throw new Error('Engine timed out. Check your connection and retry.');
      throw error;
    } finally { clearTimeout(timeout); }
  })();
  inFlight.set(key, promise);
  try { return await promise; } finally { inFlight.delete(key); }
}
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'GET_RUNTIME_STATUS') {
    (async () => {
      const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
      let status = null;
      if (tab?.id != null) {
        try { status = await chrome.tabs.sendMessage(tab.id, {type: 'GET_BOARD_STATUS'}); } catch {}
      }
      sendResponse({ok: true, version: chrome.runtime.getManifest().version, status});
    })().catch(() => sendResponse({ok: true, version: chrome.runtime.getManifest().version}));
    return true;
  }
  if (message?.type !== 'ANALYZE_FEN') return;
  (async () => {
    const fen = String(message.fen || '').trim();
    if (!/^[prnbqkPRNBQK1-8/]+ [wb] (?:-|K?Q?k?q?) (?:-|[a-h][36]) \d+ [1-9]\d*$/.test(fen)) throw new Error('Invalid board position.');
    const elo = AppSettings.normalize({elo: message.elo}).elo;
    const data = await analyzeFen(fen, elo, message.depth);
    sendResponse({ok: true, data});
  })().catch(error => sendResponse({ok: false, error: error?.message || 'Engine request failed.'}));
  return true;
});
