/* Pure legal position reconstruction. Uncertain metadata is explicit. */
class BoardPosition {
  constructor() {
    this.game = null;
    this.lastResolution = null;
  }
  static placement(pieces) {
    return Array.from({ length: 8 }, (_, row) => {
      let rank = "",
        empty = 0;
      for (const file of "abcdefgh") {
        const p = pieces[file + (8 - row)];
        if (!p) {
          empty++;
          continue;
        }
        if (empty) {
          rank += empty;
          empty = 0;
        }
        rank += p[0] === "w" ? p[1].toUpperCase() : p[1];
      }
      return rank + (empty || "");
    }).join("/");
  }
  static create(fen) {
    if (typeof fen !== "string" || fen.length > 200) return null;
    const fields = fen.trim().split(/\s+/),
      placement = fields[0] || "";
    if (
      (placement.match(/K/g) || []).length !== 1 ||
      (placement.match(/k/g) || []).length !== 1
    )
      return null;
    if (
      (placement.match(/P/g) || []).length > 8 ||
      (placement.match(/p/g) || []).length > 8 ||
      /[pP]/.test(
        (placement.split("/")[0] || "") + (placement.split("/")[7] || ""),
      )
    )
      return null;
    if (
      (placement.match(/[PRNBQK]/g) || []).length > 16 ||
      (placement.match(/[prnbqk]/g) || []).length > 16
    )
      return null;
    const game = new Chess();
    if (!game.load(fen)) return null;
    const rights = fields[2] || "-";
    for (const [flag, king, rook, color] of [
      ["K", "e1", "h1", "w"],
      ["Q", "e1", "a1", "w"],
      ["k", "e8", "h8", "b"],
      ["q", "e8", "a8", "b"],
    ])
      if (
        rights.includes(flag) &&
        (game.get(king)?.type !== "k" ||
          game.get(king)?.color !== color ||
          game.get(rook)?.type !== "r" ||
          game.get(rook)?.color !== color)
      )
        return null;
    if (fields[3] && fields[3] !== "-") {
      const ep = fields[3],
        rank = game.turn() === "w" ? "6" : "3",
        victim = ep[0] + (game.turn() === "w" ? "5" : "4"),
        origin = ep[0] + (game.turn() === "w" ? "7" : "2");
      if (
        ep[1] !== rank ||
        game.get(ep) ||
        game.get(origin) ||
        game.get(victim)?.type !== "p" ||
        game.get(victim)?.color === game.turn()
      )
        return null;
    }
    // Reject positions in which the side that just moved left its king in check.
    const idle = new Chess();
    const idleFields = game.fen().split(" ");
    idleFields[1] = game.turn() === "w" ? "b" : "w";
    idleFields[3] = "-";
    if (!idle.load(idleFields.join(" ")) || idle.in_check()) return null;
    const canonical = game.fen().split(" ");
    if (
      canonical[3] !== "-" &&
      !game.moves({ verbose: true }).some((move) => move.flags.includes("e"))
    ) {
      canonical[3] = "-";
      game.load(canonical.join(" "));
    }
    return game;
  }
  static clone(game) {
    const copy = new Chess();
    if (game.history().length && copy.load_pgn(game.pgn())) return copy;
    return this.create(game.fen());
  }
  static replay(moves = [], initialFen = null) {
    const game = initialFen ? this.create(initialFen) : new Chess();
    if (!game) return null;
    for (const san of moves) {
      let move;
      try {
        move = game.move(san, { sloppy: true });
      } catch {
        return null;
      }
      if (!move) return null;
    }
    return game;
  }
  resolve(pieces, hint = {}) {
    const placement = BoardPosition.placement(pieces);
    const finish = (game, source, confidence) => {
      if (!game) return null;
      if (hint.override && hint.override !== game.turn()) {
        const fields = game.fen().split(" ");
        fields[1] = hint.override;
        fields[3] = "-";
        game = BoardPosition.create(fields.join(" "));
        source = "manual-turn";
        confidence = "manual";
      }
      if (!game) return null;
      game.knightline = {
        source,
        confidence,
        turnSource: hint.override ? "manual" : hint.turnSource || source,
      };
      this.lastResolution = game.knightline;
      return game;
    };
    const supplied = BoardPosition.create(hint.fen);
    if (supplied && supplied.fen().split(" ")[0] === placement)
      return finish(supplied, "complete-fen", "complete");
    if (hint.moves?.length) {
      const replay = hint.initialFen
          ? BoardPosition.create(hint.initialFen)
          : new Chess(),
        matches = [];
      if (replay) {
        if (replay.fen().split(" ")[0] === placement)
          matches.push(BoardPosition.clone(replay));
        for (const san of hint.moves) {
          let moved;
          try {
            moved = replay.move(san, { sloppy: true });
          } catch {
            break;
          }
          if (!moved) break;
          if (replay.fen().split(" ")[0] === placement)
            matches.push(BoardPosition.clone(replay));
        }
      }
      if (matches.length === 1)
        return finish(matches[0], "move-history", "complete");
      if (matches.length > 1) {
        const metadata = new Set(
          matches.map((game) => game.fen().split(" ").slice(0, 4).join(" ")),
        );
        if (metadata.size === 1)
          return finish(matches.at(-1), "move-history", "partial-counters");
      }
    }
    if (this.game) {
      if (this.game.fen().split(" ")[0] === placement)
        return finish(
          BoardPosition.clone(this.game),
          "observed-history",
          this.game.knightline?.confidence || "observed",
        );
      for (const move of this.game.moves({ verbose: true })) {
        const next = BoardPosition.clone(this.game);
        next.move(move);
        if (next.fen().split(" ")[0] === placement) {
          const canonical = BoardPosition.create(next.fen());
          if (!canonical) return null;
          const withHistory = BoardPosition.clone(next);
          if (canonical.fen() !== withHistory.fen())
            return finish(
              canonical,
              "legal-transition",
              this.game.knightline?.confidence || "observed",
            );
          return finish(
            withHistory,
            "legal-transition",
            this.game.knightline?.confidence || "observed",
          );
        }
      }
    }
    const initial = new Chess().fen().split(" ")[0],
      turn = hint.override || hint.explicitTurn || hint.turn;
    if (placement === initial)
      return finish(
        BoardPosition.create(`${placement} ${hint.override || "w"} KQkq - 0 1`),
        "initial-position",
        "complete",
      );
    if (!turn) {
      this.lastResolution = {
        source: "piece-placement",
        confidence: "unknown",
        reason: "Turn is unknown. Choose whose move it is in Controls.",
      };
      return null;
    }
    return finish(
      BoardPosition.create(`${placement} ${turn} - - 0 1`),
      "piece-placement",
      "conservative",
    );
  }
  commit(game) {
    this.game = game ? BoardPosition.clone(game) : null;
    if (this.game) this.game.knightline = game.knightline;
  }
  static legalMove(fen, candidate) {
    const move = normalizeCandidate(candidate),
      game = this.create(fen);
    if (!game || !move) return null;
    return game.move({
      from: move.from,
      to: move.to,
      promotion: move.promotion || "q",
    });
  }
  static line(fen, moves = []) {
    const game = this.create(fen);
    if (!game) return [];
    const line = [];
    for (const item of moves.slice(0, 12)) {
      const candidate = normalizeCandidate({ move: item });
      let move;
      try {
        move = candidate
          ? game.move({
              from: candidate.from,
              to: candidate.to,
              promotion: candidate.promotion || "q",
            })
          : typeof item === "string"
            ? game.move(item)
            : null;
      } catch {
        break;
      }
      if (!move) break;
      line.push(move.san);
    }
    return line;
  }
}
globalThis.BoardPosition = BoardPosition;
