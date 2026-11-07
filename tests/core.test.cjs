const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
function load(files, extra = {}) {
  const context = vm.createContext({console, setTimeout, clearTimeout, ...extra});
  for (const file of files) vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, {filename: file});
  return context;
}
const files = ['lib/chess.js', 'appSettings.js', 'moveSelectionPolicy.js', 'boardPosition.js'];
function pieces(game) {
  const map = {};
  game.board().forEach((rank, row) => rank.forEach((piece, col) => { if (piece) map['abcdefgh'[col] + (8 - row)] = piece.color + piece.type; }));
  return map;
}
test('all extension scripts load in manifest order, without a temporal-dead-zone error', async () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
  const chrome = {storage: {local: {get: async value => value}, onChanged: {addListener() {}}}};
  const scripts = manifest.content_scripts[0].js.filter(file => file !== 'content.js');
  const context = load(scripts, {chrome}); await new Promise(resolve => setImmediate(resolve));
  assert.equal(typeof context.BoundedRegretPolicy, 'function');
  assert.equal(typeof context.ChessHelperApp.autoMoveController.startAnalysis, 'function');
});
test('settings reject corrupt types, clamp numbers, and order intervals', () => {
  const {AppSettings} = load(files);
  const settings = AppSettings.normalize({enabled: 'false', elo: Infinity, minDelay: 8000, maxDelay: 100, minWeakInterval: 90, maxWeakInterval: -3, turnOverride: 'purple'});
  assert.equal(settings.enabled, false); assert.equal(settings.elo, 1800);
  assert.equal(settings.minDelay, 8000); assert.equal(settings.maxDelay, 8000);
  assert.equal(settings.minWeakInterval, 50); assert.equal(settings.maxWeakInterval, 50); assert.equal(settings.turnOverride, 'auto');
});
test('candidate normalization understands UCI promotion and score units', () => {
  const {normalizeCandidate} = load(files);
  assert.equal(normalizeCandidate({move: 'b7b8n', eval: .6}).promotion, 'n');
  assert.equal(normalizeCandidate({move: 'b7b8n', eval: .6}).score, 60);
  assert.equal(normalizeCandidate({move: 'Nf3'}), null);
  assert.equal(normalizeCandidate({from: 'e2', to: 'e2'}), null);
});
test('bounded regret respects Black perspective', () => {
  const {BoundedRegretPolicy} = load(files);
  const policy = new BoundedRegretPolicy([{move: 'e7e5', eval: -2, turn: 'b'}, {move: 'c7c5', eval: -1.8, turn: 'b'}, {move: 'g8f6', eval: 4, turn: 'b'}], {maxCentipawnLoss: 30});
  assert.equal(policy.select().from, 'c7');
});
test('position history preserves castling rights and double-pawn en passant', () => {
  const {Chess, BoardPosition} = load(files); const tracker = new BoardPosition(), game = new Chess();
  tracker.commit(tracker.resolve(pieces(game), {turn: 'w'}));
  assert.equal(tracker.game.fen().split(' ')[2], 'KQkq');
  game.move('e4'); const next = tracker.resolve(pieces(game), {});
  assert.equal(next.turn(), 'b'); assert.equal(next.fen().split(' ')[3], 'e3');
  tracker.commit(next); game.move('e5'); assert.equal(tracker.resolve(pieces(game), {}).fen(), game.fen());
});
test('unknown midgame placement does not invent castling rights', () => {
  const {Chess, BoardPosition} = load(files); const game = new Chess(); game.move('e4');
  assert.equal(new BoardPosition().resolve(pieces(game), {turn: 'b'}).fen().split(' ')[2], '-');
});
test('legal validation rejects pinned moves and permits castling, en passant, and promotion', () => {
  const {BoardPosition} = load(files);
  assert.equal(BoardPosition.legalMove('4r1k1/8/8/8/8/8/4R3/4K3 w - - 0 1', {move: 'e2d2'}), null);
  assert.equal(BoardPosition.legalMove('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1', {move: 'e1g1'}).san, 'O-O');
  assert.equal(BoardPosition.legalMove('4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1', {move: 'e5d6'}).san, 'exd6');
  assert.equal(BoardPosition.legalMove('4k3/P7/8/8/8/8/8/4K3 w - - 0 1', {move: 'a7a8n'}).san, 'a8=N');
});
test('explicit turn override works without changing the pieces', () => {
  const {Chess, BoardPosition} = load(files); const game = new Chess(), tracker = new BoardPosition(); tracker.commit(game);
  assert.equal(tracker.resolve(pieces(game), {override: 'b'}).turn(), 'b');
});
test('engine continuations become legal readable SAN and stop at invalid moves', () => {
  const {Chess, BoardPosition} = load(files);
  assert.equal(Array.from(BoardPosition.line(new Chess().fen(), ['e2e4', 'e7e5', 'g1f3', 'a8a1'])).join(' '), 'e4 e5 Nf3');
});
test('shallow practice follows the selected interval, only in supported contexts', async () => {
  const calls = [];
  const context = load([...files, 'autoMoveController.js']);
  const engine = {analyze: async (fen, elo, options) => { calls.push(options.depth); return {move: 'e2e4', candidates: [{move: 'e2e4'}]}; }};
  const controller = new context.AutoMoveController(engine, new context.BestMovePolicy());
  controller.configure({imperfectMoves: true, minWeakInterval: 2, maxWeakInterval: 2});
  assert.equal((await controller.startAnalysis('position1', {allowImperfect: true})).imperfect, false);
  assert.equal((await controller.startAnalysis('position2', {allowImperfect: true})).imperfect, true);
  assert.equal((await controller.startAnalysis('position3', {allowImperfect: false})).imperfect, false);
  assert.deepEqual(calls, [undefined, 2, undefined]);
});
test('failed and cancelled analysis does not advance practice scheduling or lock the controller', async () => {
  const context = load([...files, 'autoMoveController.js']); let finish;
  const engine = {analyze: () => new Promise(resolve => { finish = resolve; }), cancel() {}};
  const controller = new context.AutoMoveController(engine, new context.BestMovePolicy()); controller.configure({imperfectMoves: true, minWeakInterval: 2, maxWeakInterval: 2});
  const pending = controller.startAnalysis('old', {allowImperfect: true}); controller.invalidateAnalysis(); finish({move: 'e2e4'});
  assert.equal(await pending, null); assert.equal(controller.moveCount, 0); assert.equal(controller.busy, false);
  engine.analyze = async () => { throw new Error('offline'); };
  await assert.rejects(controller.startAnalysis('new', {allowImperfect: true}), /offline/);
  assert.equal(controller.moveCount, 0); assert.equal(controller.getState(), 'IDLE');
});
