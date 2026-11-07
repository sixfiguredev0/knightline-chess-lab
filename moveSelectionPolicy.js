function normalizeCandidate(candidate) {
  if (!candidate || typeof candidate !== "object") return null;
  const uci = [candidate.uci, candidate.lan, candidate.move].find(
    (value) =>
      typeof value === "string" && /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(value),
  );
  const from = candidate.from || uci?.slice(0, 2);
  const to = candidate.to || uci?.slice(2, 4);
  if (!/^[a-h][1-8]$/.test(from) || !/^[a-h][1-8]$/.test(to) || from === to)
    return null;
  const score = Number(
    candidate.centipawns ??
      candidate.score ??
      (candidate.eval != null ? Number(candidate.eval) * 100 : 0),
  );
  return {
    ...candidate,
    from,
    to,
    promotion: candidate.promotion || uci?.[4],
    scoreKnown:
      candidate.scoreKnown ??
      (candidate.centipawns != null ||
        candidate.score != null ||
        candidate.eval != null ||
        candidate.evaluation != null),
    score: Number.isFinite(score) ? score : 0,
  };
}
class BestMovePolicy {
  constructor(candidates = []) {
    this.setCandidates(candidates);
  }
  setCandidates(candidates = []) {
    this.candidates = candidates.map(normalizeCandidate).filter(Boolean);
  }
  select() {
    return this.candidates[0] ?? null;
  }
}
class ImperfectMovePolicy extends BestMovePolicy {
  select() {
    if (this.candidates.length < 2) return super.select();
    const pool = this.candidates.slice(1, 4);
    return pool[Math.floor(Math.random() * pool.length)];
  }
}
class BoundedRegretPolicy extends BestMovePolicy {
  constructor(candidates = [], options = {}) {
    super(candidates);
    this.setMaxCentipawnLoss(options.maxCentipawnLoss ?? 50);
  }
  setMaxCentipawnLoss(value) {
    this.maxCentipawnLoss = Math.max(0, Number(value) || 0);
  }
  select() {
    if (!this.candidates.length) return null;
    if (
      !this.candidates[0].scoreKnown ||
      this.candidates[0].evaluation?.type === "mate" ||
      this.candidates[0].mate != null
    )
      return this.candidates[0];
    const perspective = this.candidates[0].turn === "b" ? -1 : 1;
    const ranked = this.candidates
      .filter(
        (candidate) =>
          candidate.scoreKnown &&
          candidate.mate == null &&
          candidate.evaluation?.type !== "mate",
      )
      .sort((a, b) => perspective * (b.score - a.score));
    const pool = ranked
      .slice(1)
      .filter(
        (candidate) =>
          perspective * (ranked[0].score - candidate.score) <=
          this.maxCentipawnLoss,
      );
    return pool.length
      ? pool[Math.floor(Math.random() * pool.length)]
      : ranked[0];
  }
}
globalThis.normalizeCandidate = normalizeCandidate;
globalThis.BestMovePolicy = BestMovePolicy;
globalThis.ImperfectMovePolicy = ImperfectMovePolicy;
globalThis.BoundedRegretPolicy = BoundedRegretPolicy;
