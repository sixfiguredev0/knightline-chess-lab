/* Contracts shared by content, service worker, and local-engine host. */
class KnightlineError extends Error {
  constructor(kind, message) {
    super(message);
    this.name = "KnightlineError";
    this.kind = kind;
  }
}
const KnightlineContracts = {
  privateReport(value) {
    if (typeof value === "string")
      return value
        .replace(
          /(?:https?|chrome-extension|file):\/\/[^\s"<>]+/gi,
          "[URL omitted]",
        )
        .replace(/[A-Z]:[\\/][^\s"<>]+/gi, "[path omitted]")
        .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, "[email omitted]");
    if (Array.isArray(value))
      return value.map((item) => this.privateReport(item));
    if (value && typeof value === "object")
      return Object.fromEntries(
        Object.entries(value).map(([key, item]) => [
          key,
          this.privateReport(item),
        ]),
      );
    return value;
  },
  error(error, fallback = "engine") {
    return {
      kind: error?.kind || fallback,
      message: error?.message || String(error),
    };
  },
  key(...values) {
    let hash = 2166136261;
    for (const char of values.join("|")) {
      hash ^= char.charCodeAt(0);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16);
  },
  score(value, perspective = "w") {
    const sign = perspective === "b" ? -1 : 1;
    return {
      type: value?.type === "mate" ? "mate" : "cp",
      value: sign * Number(value?.value || 0),
      perspective: "white",
    };
  },
  timing(settings, random = Math.random) {
    if (settings.timingMode === "fixed") return settings.fixedDelay;
    const lo = settings.minDelay,
      hi = settings.maxDelay;
    const z =
      Math.sqrt(-2 * Math.log(Math.max(Number.EPSILON, random()))) *
      Math.cos(2 * Math.PI * random());
    return Math.round(
      Math.max(lo, Math.min(hi, (lo + hi) / 2 + (z * (hi - lo)) / 6)),
    );
  },
  budget(settings, context, clock) {
    if (!settings.automaticBudget) return settings.searchTimeMs;
    if (context === "study") return 2000;
    if (clock?.category === "bullet") return 250;
    if (clock?.category === "blitz") return 500;
    if (clock?.category === "classical") return 2000;
    return 1000;
  },
};
globalThis.KnightlineError = KnightlineError;
globalThis.KnightlineContracts = KnightlineContracts;
