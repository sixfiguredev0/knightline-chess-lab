/* DOM adapters. Logical squares are independent of board orientation. */
class BoardReader {
  static site() { return location.hostname.includes('lichess') ? 'Lichess' : 'Chess.com'; }
  static isStudy() { return /\/(analysis|study)(?:\/|$)/i.test(location.pathname); }
  static isPuzzle() { return /\/(puzzles?|training|storm|streak|racer)(?:\/|$)/i.test(location.pathname); }
  static isBot() { return location.hostname.includes('chess.com') && /^\/play\/computer(?:\/|$)/i.test(location.pathname); }
  static canAutomate() { return this.isStudy() || this.isBot(); }
  static board() {
    const selectors = location.hostname.includes('lichess') ? 'cg-board' : 'wc-chess-board, chess-board, .board, .chessboard';
    return [...document.querySelectorAll(selectors)].find(board => board.getBoundingClientRect().width > 0 && board.querySelector('piece,.piece')) || null;
  }
  static orientation(board) {
    for (let element = board, depth = 0; element && depth < 6; element = element.parentElement, depth++) {
      const classes = typeof element.className === 'string' ? element.className : '';
      if (/(^|\s)(orientation-black|flipped|is-black)(\s|$)/i.test(classes)) return 'black';
      if (/(^|\s)(orientation-white|is-white)(\s|$)/i.test(classes)) return 'white';
    }
    return 'white';
  }
  static square(rect, x, y, orientation) {
    const col = Math.floor((x - rect.left) / rect.width * 8), row = Math.floor((y - rect.top) / rect.height * 8);
    if (col < 0 || col > 7 || row < 0 || row > 7) return null;
    return 'abcdefgh'[orientation === 'black' ? 7 - col : col] + (orientation === 'black' ? row + 1 : 8 - row);
  }
  static point(square, rect, orientation) {
    if (!/^[a-h][1-8]$/.test(square)) return null;
    const file = 'abcdefgh'.indexOf(square[0]), rank = Number(square[1]) - 1;
    return {x: rect.left + ((orientation === 'black' ? 7 - file : file) + .5) * rect.width / 8, y: rect.top + ((orientation === 'black' ? rank : 7 - rank) + .5) * rect.height / 8};
  }
  static elementSquare(element, board, orientation) {
    const encoded = String(element.className).match(/\bsquare-([1-8])([1-8])\b/);
    if (encoded) return 'abcdefgh'[Number(encoded[1]) - 1] + encoded[2];
    const rect = element.getBoundingClientRect();
    return this.square(board.getBoundingClientRect(), rect.left + rect.width / 2, rect.top + rect.height / 2, orientation);
  }
  static read(board) {
    const orientation = this.orientation(board), pieces = {};
    const roles = {pawn: 'p', knight: 'n', bishop: 'b', rook: 'r', queen: 'q', king: 'k'};
    for (const element of board.querySelectorAll('piece,.piece')) {
      const classes = String(element.className).toLowerCase();
      if (/\b(ghost|fading|dragging)\b/.test(classes)) continue;
      const compact = classes.match(/\b([wb][pnbrqk])\b/);
      const color = /\bwhite\b/.test(classes) ? 'w' : /\bblack\b/.test(classes) ? 'b' : '';
      const role = Object.keys(roles).find(name => new RegExp(`\\b${name}\\b`).test(classes));
      const piece = compact?.[1] || (color && role ? color + roles[role] : null);
      const square = this.elementSquare(element, board, orientation);
      if (!piece || !square) continue;
      if (pieces[square]) return null; // An animation has two pieces on one square.
      pieces[square] = piece;
    }
    if (Object.values(pieces).filter(piece => piece === 'wk').length !== 1 || Object.values(pieces).filter(piece => piece === 'bk').length !== 1) return null;
    return {board, orientation, pieces};
  }
  static hint(board, pieces, orientation) {
    const asTurn = value => value === 'w' || value === 'white' ? 'w' : value === 'b' || value === 'black' ? 'b' : null;
    let fen = board.getAttribute('data-fen') || board.dataset?.fen;
    try { fen ||= board.game?.getFEN?.() || board.game?.getFen?.(); } catch {}
    if (!fen) {
      for (const input of document.querySelectorAll('input.copyable, input[name="fen"], input[aria-label*="FEN" i]')) {
        if (BoardPosition.create(input.value)) { fen = input.value; break; }
      }
    }
    if (!fen) {
      const queryFen = new URLSearchParams(location.search).get('fen');
      const pathFen = location.hostname.includes('lichess') ? decodeURIComponent(location.pathname.replace(/^\/analysis\//, '')).replace(/_/g, ' ') : null;
      fen = BoardPosition.create(queryFen) ? queryFen : BoardPosition.create(pathFen) ? pathFen : null;
    }
    let explicitTurn = asTurn(board.getAttribute('data-turn') || board.getAttribute('data-turn-color'));
    for (const element of document.querySelectorAll('[data-color-to-move], [aria-label*="to move" i]')) {
      if (explicitTurn) break;
      const text = `${element.getAttribute('data-color-to-move') || ''} ${element.getAttribute('aria-label') || ''}`;
      explicitTurn = asTurn(text.trim()) || (/black\s+to\s+move/i.test(text) ? 'b' : /white\s+to\s+move/i.test(text) ? 'w' : null);
    }
    let turn = null;
    for (const element of board.querySelectorAll('square.last-move, square.lastmove, .last-move, .move-highlight, .highlight')) {
      const square = this.elementSquare(element, board, orientation);
      if (pieces[square]) turn = pieces[square][0] === 'w' ? 'b' : 'w';
    }
    // A board's selected history node is more reliable than total move count.
    const active = document.querySelector('[data-ply].active, [data-ply].selected');
    if (active && Number.isFinite(Number(active.dataset.ply))) turn = Number(active.dataset.ply) % 2 ? 'b' : 'w';
    return {fen, explicitTurn, turn: explicitTurn || turn || (this.isPuzzle() && orientation === 'black' ? 'b' : 'w')};
  }
}
globalThis.BoardReader = BoardReader;
