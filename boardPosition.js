/* Position history and legal validation. No browser or network dependencies. */
class BoardPosition {
  constructor() { this.game = null; }
  static placement(pieces) {
    return Array.from({length: 8}, (_, row) => {
      let rank = '', empty = 0;
      for (const file of 'abcdefgh') {
        const piece = pieces[file + (8 - row)];
        if (!piece) { empty++; continue; }
        if (empty) { rank += empty; empty = 0; }
        rank += piece[0] === 'w' ? piece[1].toUpperCase() : piece[1];
      }
      return rank + (empty || '');
    }).join('/');
  }
  static create(fen) {
    const game = new Chess();
    if (typeof fen !== 'string' || !game.load(fen)) return null;
    const pieces = game.board().flat().filter(Boolean);
    if (pieces.filter(p => p.type === 'k' && p.color === 'w').length !== 1 || pieces.filter(p => p.type === 'k' && p.color === 'b').length !== 1) return null;
    return game;
  }
  resolve(pieces, hint = {}) {
    const placement = BoardPosition.placement(pieces);
    const supplied = BoardPosition.create(hint.fen);
    if (supplied && supplied.fen().split(' ')[0] === placement) {
      if (hint.override) {
        const fields = supplied.fen().split(' '); fields[1] = hint.override; fields[3] = '-';
        return BoardPosition.create(fields.join(' '));
      }
      return supplied;
    }
    if (this.game) {
      if (this.game.fen().split(' ')[0] === placement) {
        if (!hint.override && (!hint.explicitTurn || hint.explicitTurn === this.game.turn())) return BoardPosition.create(this.game.fen());
        const fields = this.game.fen().split(' '); fields[1] = hint.override || hint.explicitTurn; fields[3] = '-';
        return BoardPosition.create(fields.join(' '));
      }
      for (const move of this.game.moves({verbose: true})) {
        const next = BoardPosition.create(this.game.fen()); next.move(move);
        if (next.fen().split(' ')[0] === placement) {
          if (hint.override && hint.override !== next.turn()) {
            const fields = next.fen().split(' '); fields[1] = hint.override; fields[3] = '-';
            return BoardPosition.create(fields.join(' '));
          }
          return next;
        }
      }
    }
    const initial = new Chess().fen().split(' ')[0];
    // Only a known initial position or a trusted complete FEN establishes rights.
    const rights = placement === initial ? 'KQkq' : '-';
    return BoardPosition.create(`${placement} ${hint.override || hint.explicitTurn || hint.turn || 'w'} ${rights} - 0 1`);
  }
  commit(game) { this.game = game ? BoardPosition.create(game.fen()) : null; }
  static legalMove(fen, candidate) {
    const move = normalizeCandidate(candidate);
    const game = BoardPosition.create(fen);
    if (!game || !move) return null;
    return game.move({from: move.from, to: move.to, promotion: move.promotion || 'q'});
  }
  static line(fen, moves = []) {
    const game = BoardPosition.create(fen);
    if (!game) return [];
    const line = [];
    for (const item of moves.slice(0, 8)) {
      const candidate = normalizeCandidate({move: item});
      const move = candidate ? game.move({from: candidate.from, to: candidate.to, promotion: candidate.promotion || 'q'}) : typeof item === 'string' ? game.move(item) : null;
      if (!move) break;
      line.push(move.san);
    }
    return line;
  }
}
globalThis.BoardPosition = BoardPosition;
