/* Versioned settings; no new opt-in feature is enabled during migration. */
class AppSettings {
  static defaults = Object.freeze({
    settingsVersion: 2,
    enabled: false,
    elo: 1800,
    showArrow: true,
    showPanel: true,
    turnOverride: "auto",
    autoplay: false,
    minDelay: 300,
    maxDelay: 4000,
    imperfectMoves: false,
    minWeakInterval: 8,
    maxWeakInterval: 20,
    cloudFallback: false,
    searchTimeMs: 1000,
    automaticBudget: true,
    searchDepth: 0,
    strengthMode: "full",
    strengthElo: 1800,
    skillLevel: 10,
    variationPolicy: "shallow",
    maxCentipawnLoss: 50,
    timingMode: "random",
    fixedDelay: 1000,
    inputMode: "click",
    showAlternatives: false,
    selectedBoardId: "auto",
    panelCollapsed: false,
    panelPosition: null,
  });
  static settings = { ...this.defaults };
  static normalize(input = {}) {
    const out = { ...this.defaults };
    for (const key of Object.keys(out))
      if (typeof out[key] === "boolean" && typeof input[key] === "boolean")
        out[key] = input[key];
    const number = (key, min, max) => {
      const value = Number(input[key] ?? out[key]);
      out[key] = Number.isFinite(value)
        ? Math.max(min, Math.min(max, Math.round(value)))
        : out[key];
    };
    for (const [key, min, max] of [
      ["elo", 800, 2400],
      ["minDelay", 100, 10000],
      ["maxDelay", 100, 10000],
      ["minWeakInterval", 1, 50],
      ["maxWeakInterval", 1, 100],
      ["searchTimeMs", 100, 10000],
      ["searchDepth", 0, 40],
      ["strengthElo", 800, 4000],
      ["skillLevel", 0, 20],
      ["maxCentipawnLoss", 0, 1000],
      ["fixedDelay", 100, 10000],
    ])
      number(key, min, max);
    out.maxDelay = Math.max(out.minDelay, out.maxDelay);
    out.maxWeakInterval = Math.max(out.minWeakInterval, out.maxWeakInterval);
    for (const [key, values] of Object.entries({
      turnOverride: ["auto", "w", "b"],
      strengthMode: ["full", "elo", "skill"],
      variationPolicy: ["shallow", "bounded"],
      timingMode: ["random", "fixed"],
      inputMode: ["click", "drag"],
    }))
      if (values.includes(input[key])) out[key] = input[key];
    if (
      typeof input.selectedBoardId === "string" &&
      /^(auto|board-\d+)$/.test(input.selectedBoardId)
    )
      out.selectedBoardId = input.selectedBoardId;
    if (
      input.panelPosition &&
      Number.isFinite(input.panelPosition.x) &&
      Number.isFinite(input.panelPosition.y)
    )
      out.panelPosition = {
        x: Math.max(0, input.panelPosition.x),
        y: Math.max(0, input.panelPosition.y),
      };
    if (!input.settingsVersion && input.elo != null)
      out.searchDepth = this.depthFor(out.elo);
    return out;
  }
  static depthFor(elo) {
    const value = Number(elo) || 1800;
    return value <= 1000
      ? 8
      : value <= 1200
        ? 9
        : value <= 1400
          ? 10
          : value <= 1600
            ? 12
            : value <= 1800
              ? 14
              : value <= 2000
                ? 16
                : 18;
  }
  static setSettings(patch = {}) {
    this.settings = this.normalize({ ...this.settings, ...patch });
  }
  static getSettings() {
    return { ...this.settings };
  }
  static async load() {
    this.settings = this.normalize(await chrome.storage.local.get(null));
    return this.getSettings();
  }
  static async save(patch = {}) {
    this.setSettings(patch);
    await chrome.storage.local.set(this.settings);
  }
}
globalThis.AppSettings = AppSettings;
