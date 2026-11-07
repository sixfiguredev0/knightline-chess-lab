class EngineController {
  constructor() {
    this.candidates = [];
    this.requestId = 0;
    this.currentId = null;
    this.onProgress = null;
    chrome.runtime.onMessage.addListener((message) => {
      if (
        message?.type === "ANALYSIS_PROGRESS" &&
        message.id === this.currentId
      )
        this.onProgress?.(message.data);
    });
  }
  getCandidates() {
    return [...this.candidates];
  }
  updateCandidates(candidates = []) {
    this.candidates = Array.isArray(candidates) ? [...candidates] : [];
  }
  async analyze(fen, elo = 1800, options = {}) {
    if (!fen)
      throw new KnightlineError(
        "position",
        "Cannot analyze an empty position.",
      );
    const serial = ++this.requestId;
    const id = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${serial}`;
    this.currentId = id;
    const response = await chrome.runtime.sendMessage({
      type: "ANALYZE_FEN",
      id,
      fen,
      elo,
      ...options,
    });
    if (serial !== this.requestId) return null;
    if (!response?.ok)
      throw new KnightlineError(
        response?.error?.kind || "engine",
        response?.error?.message ||
          response?.error ||
          "Local engine request failed.",
      );
    this.updateCandidates(response.data?.candidates || [response.data]);
    return response.data;
  }
  cancel() {
    this.requestId++;
    if (this.currentId)
      chrome.runtime
        .sendMessage({ type: "CANCEL_ANALYSIS", id: this.currentId })
        .catch(() => {});
    this.currentId = null;
  }
}
globalThis.EngineController = EngineController;
