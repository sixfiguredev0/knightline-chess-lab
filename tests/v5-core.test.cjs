const test = require("node:test"),
  assert = require("node:assert/strict"),
  vm = require("node:vm"),
  fs = require("node:fs"),
  path = require("node:path");
const root = path.resolve(__dirname, "..");
function load(files, extra = {}) {
  const c = vm.createContext({ console, setTimeout, clearTimeout, ...extra });
  for (const file of files)
    vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), c, {
      filename: file,
    });
  return c;
}
const files = [
  "lib/chess.js",
  "appSettings.js",
  "contracts.js",
  "moveSelectionPolicy.js",
  "boardPosition.js",
  "uciProtocol.js",
  "autoMoveController.js",
];
test("legacy preferences migrate without enabling opt-in features", () => {
  const { AppSettings } = load(files);
  const settings = AppSettings.normalize({
    enabled: true,
    elo: 1600,
    minDelay: 700,
    maxDelay: 1200,
  });
  assert.equal(settings.enabled, true);
  assert.equal(settings.searchDepth, 12);
  assert.equal(settings.autoplay, false);
  assert.equal(settings.cloudFallback, false);
  assert.equal(settings.settingsVersion, 2);
});
test("UCI scores are normalized to White for Black analysis and mates stay typed", () => {
  const { UCIProtocol } = load(files);
  const cp = UCIProtocol.info(
    "info depth 12 multipv 2 score cp 55 nodes 100 pv e7e5 g1f3",
    "b",
  );
  assert.equal(cp.rank, 2);
  assert.equal(cp.candidate.eval, -0.55);
  assert.equal(cp.candidate.evaluation.type, "cp");
  assert.equal(cp.candidate.score, -55);
  const mate = UCIProtocol.info("info depth 8 score mate -3 pv e7e5", "b");
  assert.equal(mate.candidate.mate, 3);
  assert.equal(mate.candidate.evaluation.type, "mate");
});
test("UCI engine capabilities are parsed instead of inventing strength ranges", () => {
  const { UCIProtocol } = load(files);
  const option = UCIProtocol.option(
    "option name UCI_Elo type spin default 1320 min 1320 max 3190",
  );
  assert.equal(option.min, 1320);
  assert.equal(option.max, 3190);
  assert.equal(UCIProtocol.info("info string arbitrary text"), null);
});
test("history replay restores exact turn, castling rights, and active history cursor", () => {
  const { BoardPosition } = load(files);
  const replay = BoardPosition.replay(["e4", "e5", "Nf3", "Nc6", "Bb5", "a6"]);
  const tracker = new BoardPosition();
  const pieces = {};
  replay.board().forEach((rank, row) =>
    rank.forEach((p, col) => {
      if (p) pieces["abcdefgh"[col] + (8 - row)] = p.color + p.type;
    }),
  );
  const resolved = tracker.resolve(pieces, {
    moves: ["e4", "e5", "Nf3", "Nc6", "Bb5", "a6"],
  });
  assert.equal(resolved.turn(), "w");
  assert.equal(resolved.fen().split(" ")[2], "KQkq");
  assert.equal(resolved.knightline.confidence, "complete");
  assert.equal(resolved.history().length, 6);
});
test("position validation rejects duplicate kings, back-rank pawns and an idle king in check", () => {
  const { BoardPosition } = load(files);
  assert.equal(BoardPosition.create("4k3/8/8/8/8/8/4K3/4K3 w - - 0 1"), null);
  assert.equal(BoardPosition.create("4k2P/8/8/8/8/8/8/4K3 w - - 0 1"), null);
  assert.equal(BoardPosition.create("4k3/8/8/8/8/8/4R3/K7 w - - 0 1"), null);
});
test("variation opportunities advance once per game and position, never on retries or settings changes", async () => {
  const c = load(files),
    fen = new c.Chess().fen();
  const engine = {
      analyze: async () => ({ move: "e2e4", candidates: [{ move: "e2e4" }] }),
    },
    controller = new c.AutoMoveController(engine, new c.BestMovePolicy());
  controller.configure({
    imperfectMoves: true,
    minWeakInterval: 2,
    maxWeakInterval: 2,
  });
  await controller.startAnalysis(fen, { gameId: "g1", positionKey: "p1" });
  assert.equal(controller.moveCount, 1);
  controller.configure({ ...controller.settings, searchTimeMs: 2000 });
  await controller.startAnalysis(fen, { gameId: "g1", positionKey: "p1" });
  assert.equal(controller.moveCount, 1);
  assert.equal(
    (await controller.startAnalysis(fen, { gameId: "g1", positionKey: "p2" }))
      .imperfect,
    true,
  );
  controller.beginGame("g2");
  assert.equal(controller.moveCount, 0);
});
test("fixed and randomized delay budgets are deterministic and bounded", () => {
  const { KnightlineContracts: K } = load(files);
  assert.equal(K.timing({ timingMode: "fixed", fixedDelay: 777 }), 777);
  for (const random of [() => 0, () => 0.2, () => 0.5, () => 0.999]) {
    const delay = K.timing(
      { timingMode: "random", minDelay: 300, maxDelay: 4000 },
      random,
    );
    assert.ok(delay >= 300 && delay <= 4000);
  }
  assert.equal(
    K.budget({ automaticBudget: true }, "live", { category: "bullet" }),
    250,
  );
  assert.equal(K.budget({ automaticBudget: true }, "study", {}), 2000);
});

test("metadata validation rejects phantom castling and en-passant pawns", () => {
  const { BoardPosition } = load(files);
  assert.equal(BoardPosition.create("4k3/8/8/8/8/8/8/4K3 w K - 0 1"), null);
  assert.equal(BoardPosition.create("4k3/8/8/4P3/8/8/8/4K3 w - d6 0 1"), null);
});
test("copied diagnostics redact error URLs, paths and email-like data", () => {
  const { KnightlineContracts: K } = load(files);
  const report = K.privateReport({
    error: {
      message:
        "Failure https://example.test/private/path and person@example.test",
    },
    trace: ["D:/private/error"],
  });
  assert.equal(
    report.error.message,
    "Failure [URL omitted] and [email omitted]",
  );
  assert.equal(report.trace[0], "[path omitted]");
});
test("retries keep the scheduled orange choice without advancing its interval", async () => {
  const c = load(files),
    fen = new c.Chess().fen(),
    depths = [];
  const controller = new c.AutoMoveController(
    {
      analyze: async (fen, elo, options) => {
        depths.push(options.depth);
        return { move: "e2e4", candidates: [{ move: "e2e4" }] };
      },
    },
    new c.BestMovePolicy(),
  );
  controller.configure({
    imperfectMoves: true,
    minWeakInterval: 1,
    maxWeakInterval: 1,
  });
  const first = await controller.startAnalysis(fen, {
    gameId: "g",
    positionKey: "p",
  });
  const retry = await controller.startAnalysis(fen, {
    gameId: "g",
    positionKey: "p",
  });
  assert.equal(first.imperfect, true);
  assert.equal(retry.imperfect, true);
  assert.deepEqual(depths, [2, 2]);
  assert.equal(controller.moveCount, 0);
});
test("history reconstruction locates a browsed earlier ply even without a selected CSS class", () => {
  const { BoardPosition } = load(files),
    history = ["e4", "e5", "Nf3", "Nc6"];
  const browsed = BoardPosition.replay(history.slice(0, 2));
  const pieces = {};
  browsed.board().forEach((rank, row) =>
    rank.forEach((p, col) => {
      if (p) pieces["abcdefgh"[col] + (8 - row)] = p.color + p.type;
    }),
  );
  const resolved = new BoardPosition().resolve(pieces, { moves: history });
  assert.equal(resolved.fen(), browsed.fen());
  assert.equal(resolved.knightline.confidence, "complete");
});
test("bounded alternatives do not treat unknown scores or mate distances as centipawn loss", () => {
  const { BoundedRegretPolicy } = load(files);
  assert.equal(
    new BoundedRegretPolicy([{ move: "e2e4", eval: 0.5 }, { move: "d2d4" }], {
      maxCentipawnLoss: 100,
    }).select().from,
    "e2",
  );
  assert.equal(
    new BoundedRegretPolicy(
      [
        { move: "e2e4", mate: 2, score: 99998 },
        { move: "d2d4", mate: 5, score: 99995 },
      ],
      { maxCentipawnLoss: 100 },
    ).select().from,
    "e2",
  );
});
test("the exact user-reported 4.8.2 live Lichess position is legal", () => {
  const { BoardPosition } = load(files);
  const fen = "8/pp6/2n3k1/2Bp3p/1P5K/5P2/P7/8 b - - 0 1";
  const game = BoardPosition.create(fen);
  assert.ok(game);
  assert.equal(game.turn(), "b");
  assert.ok(game.moves().length);
});
