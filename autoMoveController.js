class AutoMoveController {
  constructor(engine, best, imperfect = null) {
    this.engineController = engine;
    this.bestMovePolicy = best;
    this.imperfectMovePolicy = imperfect || best;
    this.moveSelectionPolicy = best;
    this.settings = {};
    this.state = "IDLE";
    this.currentFen = null;
    this.analysisId = 0;
    this.busy = false;
    this.moveCount = 0;
    this.nextWeakAt = null;
    this.lastWasWeak = false;
    this.seen = new Map();
    this.gameId = null;
  }
  attachBoardAdapter(adapter) {
    this.boardAdapter = adapter;
  }
  setState(state) {
    this.state = state;
  }
  getState() {
    return this.state;
  }
  configure(settings = {}) {
    const changed =
      this.settings.minWeakInterval !== settings.minWeakInterval ||
      this.settings.maxWeakInterval !== settings.maxWeakInterval;
    this.settings = { ...settings };
    if (changed && this.nextWeakAt != null) {
      const min = Math.max(1, Number(settings.minWeakInterval) || 8),
        max = Math.max(min, Number(settings.maxWeakInterval) || 20);
      this.nextWeakAt =
        this.moveCount + min + Math.floor(Math.random() * (max - min + 1));
    }
  }
  invalidateAnalysis() {
    this.analysisId++;
    this.engineController.cancel?.();
    this.busy = false;
    this.currentFen = null;
    this.state = "IDLE";
  }
  resetWeakSchedule() {
    const min = Math.max(1, Number(this.settings.minWeakInterval) || 8),
      max = Math.max(min, Number(this.settings.maxWeakInterval) || 20);
    this.nextWeakAt = min + Math.floor(Math.random() * (max - min + 1));
    this.moveCount = 0;
  }
  beginGame(gameId) {
    if (gameId === this.gameId) return;
    this.gameId = gameId;
    this.seen.clear();
    this.resetWeakSchedule();
  }
  shouldUseImperfect(allowed) {
    if (!allowed || !this.settings.imperfectMoves) return false;
    if (this.nextWeakAt == null) this.resetWeakSchedule();
    return this.moveCount + 1 >= this.nextWeakAt;
  }
  async startAnalysis(fen, options = {}) {
    if (!fen || this.busy) return null;
    const request = ++this.analysisId;
    this.currentFen = fen;
    this.busy = true;
    this.state = "ANALYZING";
    if (options.gameId) this.beginGame(options.gameId);
    const opportunity = `${options.gameId || "manual"}|${options.positionKey || fen}`,
      fresh = !this.seen.has(opportunity);
    const useWeak = fresh
        ? this.shouldUseImperfect(options.allowImperfect !== false)
        : Boolean(
            this.seen.get(opportunity) &&
              this.settings.imperfectMoves &&
              options.allowImperfect !== false,
          ),
      bounded = useWeak && this.settings.variationPolicy === "bounded";
    try {
      const result = await this.engineController.analyze(
        fen,
        Number(this.settings.elo) || 1800,
        { ...options, depth: useWeak && !bounded ? 2 : undefined },
      );
      if (request !== this.analysisId || !result) return null;
      const candidates = result.candidates || [result];
      this.bestMovePolicy.setCandidates(candidates);
      this.imperfectMovePolicy.setCandidates(candidates);
      let move = this.bestMovePolicy.select();
      if (bounded)
        move = new BoundedRegretPolicy(candidates, {
          maxCentipawnLoss: this.settings.maxCentipawnLoss ?? 50,
        }).select();
      if (!move || !BoardPosition.legalMove(fen, move))
        throw new KnightlineError(
          "position",
          "The engine result did not contain a legal move for this board.",
        );
      if (fresh) {
        this.seen.set(opportunity, useWeak);
        if (this.seen.size > 1000)
          this.seen.delete(this.seen.keys().next().value);
        if (this.settings.imperfectMoves) {
          if (useWeak) this.resetWeakSchedule();
          else this.moveCount++;
        }
      }
      this.lastWasWeak = useWeak;
      return {
        analysis: result,
        move,
        imperfect: useWeak,
        variationPolicy: bounded ? "bounded" : "shallow",
      };
    } finally {
      if (request === this.analysisId) {
        this.busy = false;
        this.state = "IDLE";
      }
    }
  }
  selectMove() {
    return this.moveSelectionPolicy.select();
  }
  waitForTurn() {
    this.state = "WAITING FOR TURN";
  }
  executeMove(move) {
    this.state = "EXECUTING";
    return move && this.boardAdapter
      ? this.boardAdapter.requestMoveExecution(move, this.currentFen)
      : false;
  }
  verifyMove(move) {
    this.state = "IDLE";
    return this.boardAdapter?.verifyMoveResult(move) || false;
  }
  reset() {
    this.invalidateAnalysis();
    this.lastWasWeak = false;
  }
}
globalThis.AutoMoveController = AutoMoveController;
