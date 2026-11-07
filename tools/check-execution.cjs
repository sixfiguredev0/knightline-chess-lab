const fs = require("node:fs"),
  path = require("node:path"),
  os = require("node:os"),
  assert = require("node:assert/strict");
const { chromium } = require(
  process.env.PLAYWRIGHT_MODULE || "playwright-core",
);
const { siteBoard } = require("../tests/fixtures/site-board.cjs");
const root = path.resolve(__dirname, "..");
const modules = [
  "appSettings.js",
  "contracts.js",
  "moveSelectionPolicy.js",
  "boardPosition.js",
  "boardReader.js",
  "moveExecutor.js",
];
(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROMIUM_PATH,
  });
  let checks = 0;
  try {
    for (const site of ["lichess", "chesscom"]) {
      const page = await browser.newPage({
        viewport: { width: 1440, height: 1000 },
      });
      await page.setContent(siteBoard({ site, mini: false }));
      for (const file of modules)
        await page.addScriptTag({ path: path.join(root, file) });
      await page.evaluate(() => {
        globalThis.fixtureSnapshot = () => {
          if (fixturePending) return null;
          const board = document.getElementById("fixture-board"),
            raw = BoardReader.read(board);
          if (!raw) return null;
          const game = BoardPosition.create(fixtureGame.fen());
          return {
            ...raw,
            game,
            fen: game.fen(),
            gameId: "controlled-game",
            positionKey: game.fen(),
            readOnly: false,
          };
        };
        globalThis.fixtureExecutor = new MoveExecutor(fixtureSnapshot);
      });
      for (const mode of ["click", "drag"]) {
        await page.evaluate(() => {
          fixtureReset();
        });
        for (const move of ["f2f3", "e7e5", "g2g4", "d8h4"]) {
          const result = await page.evaluate(
            async ({ move, mode }) =>
              fixtureExecutor.execute({ uci: move }, fixtureSnapshot(), {
                inputMode: mode,
              }),
            { move, mode },
          );
          assert.equal(
            result.accepted,
            true,
            `${site} ${mode} ${move}: ${result.reason}`,
          );
          checks++;
        }
        assert.equal(
          await page.evaluate(() => fixtureGame.in_checkmate()),
          true,
        );
        checks++;
        console.log(
          `PASS ${site}: complete controlled game by ${mode}, both colours verified`,
        );
        await page.evaluate(() => fixtureFlip());
      }
      for (const move of ["e1g1", "e1c1", "e8g8", "e8c8"]) {
        const black = move[1] === "8";
        await page.evaluate(
          (fen) => fixtureSetFen(fen),
          `r3k2r/8/8/8/8/8/8/R3K2R ${black ? "b" : "w"} KQkq - 0 1`,
        );
        const result = await page.evaluate(
          (move) =>
            fixtureExecutor.execute({ uci: move }, fixtureSnapshot(), {
              inputMode: "click",
            }),
          move,
        );
        assert.equal(
          result.accepted,
          true,
          `${site} castle ${move}: ${result.reason}`,
        );
        checks++;
      }
      await page.evaluate(() =>
        fixtureSetFen("4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1"),
      );
      assert.equal(
        (
          await page.evaluate(() =>
            fixtureExecutor.execute({ uci: "e5d6" }, fixtureSnapshot(), {
              inputMode: "click",
            }),
          )
        ).accepted,
        true,
      );
      checks++;
      for (const piece of ["q", "r", "b", "n"]) {
        await page.evaluate(() =>
          fixtureSetFen("4k3/P7/8/8/8/8/8/4K3 w - - 0 1"),
        );
        const result = await page.evaluate(
          (piece) =>
            fixtureExecutor.execute(
              { uci: "a7a8" + piece },
              fixtureSnapshot(),
              { inputMode: "click" },
            ),
          piece,
        );
        assert.equal(
          result.accepted,
          true,
          `${site} promotion ${piece}: ${result.reason}`,
        );
        assert.equal(
          await page.evaluate(() => fixtureGame.get("a8").type),
          piece,
        );
        checks++;
      }
      const interrupted = await page.evaluate(async () => {
        fixtureReset();
        const abort = new AbortController();
        setTimeout(() => abort.abort(), 40);
        const result = await fixtureExecutor.execute(
          { uci: "e2e4" },
          fixtureSnapshot(),
          { inputMode: "drag" },
          { signal: abort.signal },
        );
        return { result, plies: fixtureGame.history().length };
      });
      assert.equal(interrupted.result.kind, "cancelled");
      assert.equal(interrupted.plies, 0);
      checks++;
      const readOnly = await page.evaluate(async () => {
        fixtureReset();
        const snapshot = fixtureSnapshot();
        snapshot.readOnly = true;
        const before = fixtureInputEvents;
        const result = await fixtureExecutor.execute(
          { uci: "e2e4" },
          snapshot,
          { inputMode: "click" },
        );
        return { result, events: fixtureInputEvents - before };
      });
      assert.equal(readOnly.result.kind, "read-only");
      assert.equal(readOnly.events, 0);
      checks++;
      await page.close();
      console.log(
        `PASS ${site}: castles, en passant, all promotion pieces and read-only rejection`,
      );
    }
    fs.mkdirSync(path.join(root, "artifacts"), { recursive: true });
    fs.writeFileSync(
      path.join(root, "artifacts", "execution-check.json"),
      JSON.stringify(
        {
          passed: true,
          checks,
          scope: "Controlled DOM fixtures, not live site games",
        },
        null,
        2,
      ),
    );
    console.log(`${checks} controlled execution checks passed.`);
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
