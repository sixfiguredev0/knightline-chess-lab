class MoveExecutor {
  constructor(readSnapshot) {
    this.readSnapshot = readSnapshot;
    this.running = false;
  }
  static async wait(ms, signal) {
    if (signal?.aborted)
      throw new KnightlineError("cancelled", "Move cancelled.");
    await new Promise((resolve, reject) => {
      const timer = setTimeout(done, ms);
      function done() {
        signal?.removeEventListener("abort", abort);
        resolve();
      }
      function abort() {
        clearTimeout(timer);
        signal?.removeEventListener("abort", abort);
        reject(new KnightlineError("cancelled", "Move cancelled."));
      }
      signal?.addEventListener("abort", abort, { once: true });
    });
  }
  point(square, snapshot) {
    return BoardReader.point(
      square,
      snapshot.board.getBoundingClientRect(),
      BoardReader.orientation(snapshot.board),
    );
  }
  target(point, board) {
    const target = document.elementFromPoint(point.x, point.y);
    if (!target || !(target === board || board.contains(target)))
      throw new KnightlineError(
        "input",
        "The destination is covered or outside the visible board. Move the panel or scroll the board into view.",
      );
    return target;
  }
  event(target, type, point, buttons) {
    if (type === "mousedown" && target instanceof Element) {
      const board = target.closest("cg-board");
      if (board) {
        const request = new CustomEvent("knightline:board-input", {
          cancelable: true,
          detail: JSON.stringify({ version: 1, type, x: point.x, y: point.y }),
        });
        if (!board.dispatchEvent(request)) {
          this.inputTransport = "main-world-adapter";
          return;
        }
      }
    }
    const Ctor = type.startsWith("pointer") ? PointerEvent : MouseEvent;
    target.dispatchEvent(
      new Ctor(type, {
        bubbles: true,
        cancelable: true,
        clientX: point.x,
        clientY: point.y,
        button: 0,
        buttons,
        pointerId: 1,
        pointerType: "mouse",
        isPrimary: true,
        view: window,
      }),
    );
  }
  click(square, snapshot) {
    const point = this.point(square, snapshot),
      target = this.target(point, snapshot.board);
    for (const type of [
      "pointerdown",
      "mousedown",
      "pointerup",
      "mouseup",
      "click",
    ])
      this.event(target, type, point, type.endsWith("down") ? 1 : 0);
  }
  async drag(move, snapshot, signal) {
    const a = this.point(move.from, snapshot),
      b = this.point(move.to, snapshot),
      origin = this.target(a, snapshot.board);
    this.event(origin, "pointerdown", a, 1);
    this.event(origin, "mousedown", a, 1);
    let completed = false;
    try {
      for (let i = 1; i <= 5; i++) {
        await MoveExecutor.wait(18, signal);
        if (
          !snapshot.board.isConnected ||
          BoardReader.orientation(snapshot.board) !== snapshot.orientation
        )
          throw new KnightlineError(
            "cancelled",
            "Board geometry changed during the drag.",
          );
        const p = {
          x: a.x + ((b.x - a.x) * i) / 5,
          y: a.y + ((b.y - a.y) * i) / 5,
        };
        this.event(document, "pointermove", p, 1);
        this.event(document, "mousemove", p, 1);
      }
      completed = true;
    } finally {
      // An aborted drag must release at its source, never its destination.
      const point =
        completed && !signal?.aborted
          ? b
          : snapshot.board.isConnected
            ? this.point(move.from, snapshot)
            : a;
      if (!completed || signal?.aborted) {
        this.event(document, "pointermove", point, 1);
        this.event(document, "mousemove", point, 1);
      }
      const target = snapshot.board.isConnected
        ? document.elementFromPoint(point.x, point.y) || snapshot.board
        : document;
      this.event(target, "pointerup", point, 0);
      this.event(target, "mouseup", point, 0);
    }
  }
  async promotion(piece, signal) {
    const names = { q: "queen", r: "rook", b: "bishop", n: "knight" },
      name = names[piece];
    for (let i = 0; i < 40; i++) {
      await MoveExecutor.wait(50, signal);
      const containers = [
        ...document.querySelectorAll(
          '#promotion-choice,.promotion-window,.promotion-dialog,[data-cy="promotion-dialog"],[role="dialog"][class*="promotion"]',
        ),
      ].filter((el) => el.getBoundingClientRect().width > 0);
      for (const container of containers) {
        const candidate = container.querySelector(
          `[data-piece="${piece}"],[data-piece="${name}"],[data-cy="${name}"],.${name},.promotion-piece.w${piece},.promotion-piece.b${piece},[aria-label*="${name}" i]`,
        );
        if (!candidate) continue;
        const target =
            candidate.closest('button,square,[role="button"]') || candidate,
          rect = target.getBoundingClientRect();
        if (!rect.width || !rect.height) continue;
        const point = {
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2,
        };
        for (const type of [
          "pointerdown",
          "mousedown",
          "pointerup",
          "mouseup",
          "click",
        ])
          this.event(target, type, point, type.endsWith("down") ? 1 : 0);
        return true;
      }
    }
    return false;
  }
  async execute(
    candidate,
    expected,
    settings,
    { signal, onPhase = () => {} } = {},
  ) {
    const fail = (kind, message) => ({
      accepted: false,
      kind,
      reason: message,
      attemptedMove: candidate,
      positionKey: expected.positionKey,
    });
    if (this.running) return fail("input", "A move is already in progress.");
    if (expected.readOnly)
      return fail(
        "read-only",
        "This is a read-only board. Suggestions remain available.",
      );
    if (expected.finished)
      return fail(
        "finished",
        "This game has ended. Open analysis to explore further.",
      );
    const move = normalizeCandidate(candidate),
      game = BoardPosition.create(expected.fen);
    if (!move || !game || !BoardPosition.legalMove(expected.fen, move))
      return fail(
        "position",
        "The selected move is not legal in this position.",
      );
    game.move({
      from: move.from,
      to: move.to,
      promotion: move.promotion || "q",
    });
    const placement = game.fen().split(" ")[0];
    const guard = () => {
      if (signal?.aborted)
        throw new KnightlineError("cancelled", "Move cancelled.");
      const current = this.readSnapshot();
      if (
        !current ||
        current.finished ||
        current.board !== expected.board ||
        current.gameId !== expected.gameId ||
        current.positionKey !== expected.positionKey ||
        current.fen !== expected.fen ||
        current.orientation !== expected.orientation
      )
        throw new KnightlineError(
          "cancelled",
          "The board changed or the game ended before the move was submitted.",
        );
    };
    this.running = true;
    try {
      guard();
      onPhase("input");
      if (settings.inputMode === "drag")
        await this.drag(move, expected, signal);
      else {
        this.click(move.from, expected);
        await MoveExecutor.wait(90, signal);
        guard();
        this.click(move.to, expected);
      }
      if (
        move.promotion &&
        this.readSnapshot()?.game.fen().split(" ")[0] !== placement
      ) {
        onPhase("promotion");
        await this.promotion(move.promotion, signal);
      }
      onPhase("verification");
      for (let i = 0; i < 50; i++) {
        await MoveExecutor.wait(50, signal);
        const current = this.readSnapshot();
        if (!current) continue;
        if (
          current.board !== expected.board ||
          current.gameId !== expected.gameId
        )
          throw new KnightlineError(
            "cancelled",
            "The game changed during move verification.",
          );
        const observed = current.game.fen().split(" ")[0];
        if (observed === placement)
          return {
            accepted: true,
            attemptedMove: move,
            expectedFen: game.fen(),
            observedFen: current.fen,
            positionKey: expected.positionKey,
          };
        // A fast reply can arrive before the next scan; require an exact legal continuation.
        for (const reply of game.moves({ verbose: true })) {
          const next = BoardPosition.clone(game);
          next.move(reply);
          if (next.fen().split(" ")[0] === observed)
            return {
              accepted: true,
              attemptedMove: move,
              expectedFen: game.fen(),
              observedFen: current.fen,
              subsequentReply: reply.san,
              positionKey: expected.positionKey,
            };
        }
      }
      return fail(
        "rejected",
        "The board did not accept the exact move. Play it manually; no automatic retry was sent.",
      );
    } catch (error) {
      return fail(error.kind || "input", error.message);
    } finally {
      this.running = false;
    }
  }
}
globalThis.MoveExecutor = MoveExecutor;
