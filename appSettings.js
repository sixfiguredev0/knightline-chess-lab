class AppSettings {
  static defaults = Object.freeze({ enabled: false, elo: 1800, showArrow: true, showPanel: true, turnOverride: 'auto', autoplay: false, minDelay: 300, maxDelay: 4000, imperfectMoves: false, minWeakInterval: 8, maxWeakInterval: 20 });
  static settings = {...this.defaults};
  static normalize(input = {}) {
    const result = {...this.defaults};
    for (const key of ['enabled', 'showArrow', 'showPanel', 'autoplay', 'imperfectMoves']) {
      if (typeof input[key] === 'boolean') result[key] = input[key];
    }
    const bound = (key, min, max) => {
      const value = Number(input[key] ?? result[key]);
      result[key] = Number.isFinite(value) ? Math.max(min, Math.min(max, Math.round(value))) : result[key];
    };
    bound('elo', 800, 2400); bound('minDelay', 100, 10000); bound('maxDelay', 100, 10000);
    bound('minWeakInterval', 1, 50); bound('maxWeakInterval', 1, 100);
    result.maxDelay = Math.max(result.minDelay, result.maxDelay);
    result.maxWeakInterval = Math.max(result.minWeakInterval, result.maxWeakInterval);
    if (['auto', 'w', 'b'].includes(input.turnOverride)) result.turnOverride = input.turnOverride;
    return result;
  }
  static depthFor(elo) {
    const rating = this.normalize({elo}).elo;
    return rating <= 1000 ? 8 : rating <= 1200 ? 9 : rating <= 1400 ? 10 : rating <= 1600 ? 12 : rating <= 1800 ? 14 : rating <= 2000 ? 16 : 18;
  }
  static setSettings(settings = {}) { this.settings = this.normalize({...this.settings, ...settings}); }
  static getSettings() { return {...this.settings}; }
  static async load() { this.setSettings(await chrome.storage.local.get(this.defaults)); return this.getSettings(); }
  static async save(changes = {}) { this.setSettings(changes); await chrome.storage.local.set(this.getSettings()); }
}
globalThis.AppSettings = AppSettings;
