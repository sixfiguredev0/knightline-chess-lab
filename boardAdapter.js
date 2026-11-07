class BoardAdapter {
  constructor() {
    this.readPositionHandler = null;
    this.executionHandler = null;
    this.verifyHandler = null;
  }

  setReadPositionHandler(handler) {
    this.readPositionHandler = handler;
  }

  setExecutionHandler(handler) {
    this.executionHandler = handler;
  }

  setVerifyHandler(handler) {
    this.verifyHandler = handler;
  }

  updateBoard() {
    return this.readPositionHandler ? this.readPositionHandler() : null;
  }

  analyzeBoard() {
    const position = this.updateBoard();
    if (!position || !globalThis.ChessHelperApp?.autoMoveController) {
      return null;
    }
    return globalThis.ChessHelperApp.autoMoveController.startAnalysis(
      position.fen,
      { allowImperfect: position.allowImperfect },
    );
  }

  selectMove(move) {
    return this.executeMove(move);
  }

  async requestMoveExecution(move, expectedFen) {
    this.lastExecutionResult = null;
    const result = this.executionHandler
      ? await this.executionHandler(move, expectedFen)
      : {
          accepted: false,
          kind: "input",
          reason: "No board input handler is attached.",
        };
    this.lastExecutionResult = result;
    return result;
  }

  executeMove(move) {
    return this.requestMoveExecution(move, null);
  }

  verifyMoveResult(move) {
    if (this.verifyHandler) return this.verifyHandler(move);
    const result = this.lastExecutionResult,
      current = this.updateBoard();
    return Boolean(
      result?.accepted && current && current.fen === result.observedFen,
    );
  }
}

globalThis.BoardAdapter = BoardAdapter;
