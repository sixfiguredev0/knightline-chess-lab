/* Main-board adapters. No remote site code or account data is used. */
class BoardReader {
  static ids = new WeakMap();
  static nextId = 1;
  static lastSelection = null;
  static site() {
    return location.hostname.includes("lichess") ? "Lichess" : "Chess.com";
  }
  static isStudy() {
    return /\/(analysis|study)(?:\/|$)/i.test(location.pathname);
  }
  static isPuzzle() {
    return /\/(puzzles?|training|storm|streak|racer|practice)(?:\/|$)/i.test(
      location.pathname,
    );
  }
  static isBot() {
    return /\/(?:play\/computer|game\/computer)(?:\/|$)/i.test(
      location.pathname,
    );
  }
  static context() {
    if (this.isStudy()) return "study";
    if (this.isPuzzle()) return "puzzle";
    if (this.isBot()) return "bot";
    if (
      /^\/(tv|watch|games\/view)(?:\/|$)/i.test(location.pathname) ||
      document.querySelector(".round.tv-single,.round.tv-multi")
    )
      return "spectator";
    if (/\/(daily|correspondence)(?:\/|$)/i.test(location.pathname))
      return "daily";
    return "live";
  }
  static canAutomate() {
    return this.context() !== "spectator";
  }
  static id(board) {
    if (!this.ids.has(board)) this.ids.set(board, `board-${this.nextId++}`);
    return this.ids.get(board);
  }
  static candidates() {
    const selectors =
      this.site() === "Lichess"
        ? "cg-board"
        : "wc-chess-board, chess-board, .board, .chessboard";
    const out = [];
    for (const board of document.querySelectorAll(selectors)) {
      if (
        board.closest(
          "[data-knightline-ui],.mini-game,.mini-board,.mini__board,.mini-wrap,a.mini-game,[data-mini-board],.mini-board-container",
        )
      )
        continue;
      if (board.parentElement?.closest("wc-chess-board,chess-board")) continue;
      const rect = board.getBoundingClientRect(),
        style = getComputedStyle(board);
      if (
        rect.width < 100 ||
        rect.height < 100 ||
        rect.width / rect.height < 0.85 ||
        rect.width / rect.height > 1.15 ||
        style.display === "none" ||
        style.visibility === "hidden" ||
        Number(style.opacity) === 0 ||
        !board.getClientRects().length ||
        !board.querySelector("piece,.piece")
      )
        continue;
      const main = Boolean(
        board.closest(
          ".main-board,.round__app__board,.analyse__board,.puzzle__board,.board-layout-main,.board-layout-chessboard",
        ) || /board-(analysis|single|play|game)/.test(board.id),
      );
      out.push({
        board,
        id: this.id(board),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        main,
        area: rect.width * rect.height,
        label: `${main ? "Main board" : "Board"} · ${Math.round(rect.width)} px`,
      });
    }
    return out.sort(
      (a, b) => Number(b.main) - Number(a.main) || b.area - a.area,
    );
  }
  static select(selectedId = "auto") {
    const choices = this.candidates();
    let chosen = null,
      reason = "no-board";
    if (selectedId !== "auto") {
      chosen = choices.find((item) => item.id === selectedId) || null;
      reason = chosen ? "manual" : "selected-board-missing";
    } else if (choices.length === 1) {
      chosen = choices[0];
      reason = "only-board";
    } else if (choices.length) {
      const mains = choices.filter((item) => item.main);
      if (mains.length === 1) {
        chosen = mains[0];
        reason = "main-container";
      } else if (choices[0].area > choices[1].area * 1.5) {
        chosen = choices[0];
        reason = "dominant-board";
      } else reason = "ambiguous";
    }
    this.lastSelection = {
      chosen: chosen?.id || null,
      reason,
      boards: choices.map(({ id, width, height, main, label }) => ({
        id,
        width,
        height,
        main,
        label,
      })),
    };
    return chosen?.board || null;
  }
  static board(selectedId = "auto") {
    return this.select(selectedId);
  }
  static orientation(board) {
    for (
      let element = board, depth = 0;
      element && depth < 10;
      element = element.parentElement, depth++
    ) {
      const classes =
        typeof element.className === "string" ? element.className : "";
      if (/(^|\s)(orientation-black|flipped|is-black)(\s|$)/i.test(classes))
        return "black";
      if (/(^|\s)(orientation-white|is-white)(\s|$)/i.test(classes))
        return "white";
    }
    return "white";
  }
  static square(rect, x, y, orientation) {
    const col = Math.floor(((x - rect.left) / rect.width) * 8),
      row = Math.floor(((y - rect.top) / rect.height) * 8);
    if (col < 0 || col > 7 || row < 0 || row > 7) return null;
    return (
      "abcdefgh"[orientation === "black" ? 7 - col : col] +
      (orientation === "black" ? row + 1 : 8 - row)
    );
  }
  static point(square, rect, orientation) {
    if (!/^[a-h][1-8]$/.test(square)) return null;
    const file = "abcdefgh".indexOf(square[0]),
      rank = Number(square[1]) - 1;
    return {
      x:
        rect.left +
        (((orientation === "black" ? 7 - file : file) + 0.5) * rect.width) / 8,
      y:
        rect.top +
        (((orientation === "black" ? rank : 7 - rank) + 0.5) * rect.height) / 8,
    };
  }
  static elementSquare(element, board, orientation) {
    const encoded = String(element.className).match(
      /\bsquare-([1-8])([1-8])\b/,
    );
    if (encoded) return "abcdefgh"[Number(encoded[1]) - 1] + encoded[2];
    const rect = element.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    return this.square(
      board.getBoundingClientRect(),
      rect.left + rect.width / 2,
      rect.top + rect.height / 2,
      orientation,
    );
  }
  static read(board) {
    const orientation = this.orientation(board),
      pieces = {},
      roles = {
        pawn: "p",
        knight: "n",
        bishop: "b",
        rook: "r",
        queen: "q",
        king: "k",
      };
    let animating = false;
    for (const element of board.querySelectorAll("piece,.piece")) {
      const classes = String(element.className).toLowerCase();
      if (/\b(ghost|fading)\b/.test(classes)) continue;
      if (/\b(anim|dragging)\b/.test(classes)) animating = true;
      const compact = classes.match(/\b([wb][pnbrqk])\b/),
        color = /\bwhite\b/.test(classes)
          ? "w"
          : /\bblack\b/.test(classes)
            ? "b"
            : "",
        role = Object.keys(roles).find((name) =>
          new RegExp(`\\b${name}\\b`).test(classes),
        );
      const piece =
          compact?.[1] || (color && role ? color + roles[role] : null),
        square = this.elementSquare(element, board, orientation);
      if (!piece || !square) continue;
      if (pieces[square]) return null;
      pieces[square] = piece;
    }
    if (
      Object.values(pieces).filter((p) => p === "wk").length !== 1 ||
      Object.values(pieces).filter((p) => p === "bk").length !== 1 ||
      animating
    )
      return null;
    return {
      board,
      boardId: this.id(board),
      orientation,
      pieces,
      context: this.context(),
    };
  }
  static history(board) {
    const selectors =
      this.site() === "Lichess"
        ? [
            ".analyse__moves move",
            ".round__app move",
            ".rmoves move",
            "rm6 move",
          ]
        : [
            ".move-list-row .node",
            ".main-line .node",
            ".move-list .node",
            ".move-text-component",
          ];
    const root =
      board?.closest(
        ".round__app,.analyse,.puzzle,.board-layout-main,.board-layout",
      ) || document;
    let nodes = [];
    for (const selector of selectors) {
      const found = [...root.querySelectorAll(selector)];
      if (found.length > nodes.length) nodes = found;
    }
    // Current Lichess uses generated custom tag names for round moves. Group
    // adjacent SAN leaves within the selected round, then validate by replay.
    if (!nodes.length && this.site() === "Lichess") {
      const groups = new Map();
      for (const element of root.querySelectorAll("*")) {
        if (
          element.children.length ||
          element.closest(
            "cg-board,a,button,.ruser,.chat,.material,[data-knightline-ui]",
          )
        )
          continue;
        if (
          !/^(?:O-O(?:-O)?|[KQRBN]?[a-h]?[1-8]?x?[a-h][1-8](?:=[QRBN])?)[+#]?$/.test(
            element.textContent.trim(),
          )
        )
          continue;
        const parent = element.parentElement;
        if (!groups.has(parent)) groups.set(parent, []);
        groups.get(parent).push(element);
      }
      const longest = [...groups.values()].sort(
        (a, b) => b.length - a.length,
      )[0];
      if (longest?.length >= 1) nodes = longest;
    }
    const selected = nodes.findIndex(
      (node) =>
        node.matches(".active,.selected,.highlighted") ||
        node.getAttribute("aria-current") === "true",
    );
    if (selected >= 0) nodes = nodes.slice(0, selected + 1);
    const map = {
      "♙": "",
      "♟": "",
      "♘": "N",
      "♞": "N",
      "♗": "B",
      "♝": "B",
      "♖": "R",
      "♜": "R",
      "♕": "Q",
      "♛": "Q",
      "♔": "K",
      "♚": "K",
    };
    return nodes
      .map((node) =>
        (node.getAttribute("data-san") || node.textContent || "")
          .trim()
          .replace(/[♙♟♘♞♗♝♖♜♕♛♔♚]/g, (c) => map[c])
          .replace(/^\d+\.(?:\.\.)?\s*/, "")
          .replace(/0/g, "O")
          .replace(/[!?]/g, "")
          .trim(),
      )
      .filter((san) =>
        /^(?:O-O(?:-O)?|[KQRBN]?[a-h]?[1-8]?x?[a-h][1-8](?:=[QRBN])?)[+#]?$/.test(
          san,
        ),
      );
  }
  static clock() {
    const text = [
      ...document.querySelectorAll(
        ".game__meta .setup,.round__meta .setup,.time-selector-button,.time-selector-next-component",
      ),
    ]
      .map((e) => e.textContent)
      .join(" ");
    const match =
      text.match(/(\d+)\s*[+|]\s*(\d+)/) || text.match(/(\d+)\s*min/i);
    let category = /bullet/i.test(text)
      ? "bullet"
      : /blitz/i.test(text)
        ? "blitz"
        : /classical/i.test(text)
          ? "classical"
          : /rapid/i.test(text)
            ? "rapid"
            : null;
    if (match) {
      const estimate = Number(match[1]) * 60 + Number(match[2] || 0) * 40;
      category =
        estimate < 180
          ? "bullet"
          : estimate < 600
            ? "blitz"
            : estimate < 1800
              ? "rapid"
              : "classical";
    }
    return { category: category || "unknown" };
  }
  static hint(board, pieces, orientation) {
    const asTurn = (value) =>
      value === "w" || value === "white"
        ? "w"
        : value === "b" || value === "black"
          ? "b"
          : null;
    let fen = board.getAttribute("data-fen") || board.dataset?.fen,
      fenSource = fen ? "board-attribute" : null;
    if (!fen)
      for (const input of document.querySelectorAll(
        'input.copyable,input[name="fen"],input[aria-label*="FEN" i]',
      ))
        if (BoardPosition.create(input.value)) {
          fen = input.value;
          fenSource = "visible-fen";
          break;
        }
    if (!fen) {
      const query = new URLSearchParams(location.search).get("fen");
      let path = null;
      try {
        path =
          this.site() === "Lichess"
            ? decodeURIComponent(
                location.pathname.replace(/^\/analysis\//, ""),
              ).replace(/_/g, " ")
            : null;
      } catch {}
      fen = BoardPosition.create(query)
        ? query
        : BoardPosition.create(path)
          ? path
          : null;
      if (fen) fenSource = "position-url";
    }
    let turn = asTurn(
        board.getAttribute("data-turn") ||
          board.getAttribute("data-turn-color"),
      ),
      turnSource = turn ? "board-attribute" : null;
    const root =
      board.closest(".round__app,.analyse,.puzzle,.board-layout-main") ||
      document;
    if (!turn)
      for (const el of root.querySelectorAll(
        '[data-color-to-move],[aria-label*="to move" i]',
      )) {
        const text = `${el.getAttribute("data-color-to-move") || ""} ${el.getAttribute("aria-label") || ""}`;
        turn =
          asTurn(text.trim()) ||
          (/black\s+to\s+move/i.test(text)
            ? "b"
            : /white\s+to\s+move/i.test(text)
              ? "w"
              : null);
        if (turn) {
          turnSource = "explicit-label";
          break;
        }
      }
    if (!turn) {
      for (const clock of root.querySelectorAll(
        ".rclock.running,.clock-player-turn",
      )) {
        const classes =
          clock.className + " " + (clock.parentElement?.className || "");
        turn = /\b(?:rclock-)?white\b/.test(classes)
          ? "w"
          : /\b(?:rclock-)?black\b/.test(classes)
            ? "b"
            : null;
        if (turn) {
          turnSource = "active-clock";
          break;
        }
      }
    }
    if (!turn)
      for (const el of board.querySelectorAll(
        "square.last-move,square.lastmove,.last-move,.move-highlight",
      )) {
        const sq = this.elementSquare(el, board, orientation);
        if (pieces[sq]) {
          turn = pieces[sq][0] === "w" ? "b" : "w";
          turnSource = "last-move";
        }
      }
    const moves = this.history(board);
    if (!turn && moves.length) {
      turn = moves.length % 2 ? "b" : "w";
      turnSource = "move-history";
    }
    if (!turn && this.isPuzzle()) {
      turn = orientation === "black" ? "b" : "w";
      turnSource = "puzzle-orientation";
    }
    return {
      fen,
      fenSource,
      explicitTurn: [
        "board-attribute",
        "explicit-label",
        "active-clock",
      ].includes(turnSource)
        ? turn
        : null,
      turn,
      turnSource,
      moves,
    };
  }
  static readOnly(board) {
    return (
      this.context() === "spectator" ||
      Boolean(board.closest('[data-readonly="true"],[aria-readonly="true"]'))
    );
  }
  static finished(board) {
    if (["study", "puzzle"].includes(this.context())) return false;
    const root =
      board.closest(".round__app,.board-layout-main,.board-layout") ||
      board.parentElement;
    return [
      ...root.querySelectorAll(
        '.result,.game-result,[data-cy="game-result"],[data-game-over="true"]',
      ),
    ].some(
      (element) =>
        element.getAttribute("data-game-over") === "true" ||
        /^(?:1\s*[-–]\s*0|0\s*[-–]\s*1|½\s*[-–]\s*½|1\/2\s*[-–]\s*1\/2)$/.test(
          element.textContent.trim(),
        ),
    );
  }
}
globalThis.BoardReader = BoardReader;
