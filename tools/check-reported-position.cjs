const fs = require("node:fs"),
  path = require("node:path"),
  os = require("node:os"),
  assert = require("node:assert/strict");
const { chromium } = require(
  process.env.PLAYWRIGHT_MODULE || "playwright-core",
);
const root = path.resolve(__dirname, ".."),
  extensionRoot = path.resolve(process.env.KNIGHTLINE_EXTENSION_DIR || root);
const fen = "8/pp6/2n3k1/2Bp3p/1P5K/5P2/P7/8 b - - 0 1";
(async () => {
  const context = await chromium.launchPersistentContext(
    fs.mkdtempSync(path.join(os.tmpdir(), "knightline-reported-")),
    {
      headless: true,
      executablePath: process.env.CHROMIUM_PATH,
      args: [
        `--disable-extensions-except=${extensionRoot}`,
        `--load-extension=${extensionRoot}`,
      ],
    },
  );
  try {
    const worker =
      context.serviceWorkers()[0] ||
      (await context.waitForEvent("serviceworker"));
    await worker.evaluate(() =>
      chrome.storage.local.set({
        settingsVersion: 2,
        enabled: false,
        cloudFallback: false,
        searchDepth: 0,
      }),
    );
    await context.setOffline(true);
    const result = await worker.evaluate(async (fen) => {
      const position = BoardPosition.create(fen);
      if (!position) throw new Error("Position rejected");
      const result = await analyzeFen(fen, 1800, undefined, { timeMs: 500 });
      return {
        version: chrome.runtime.getManifest().version,
        valid: true,
        legal: Boolean(BoardPosition.legalMove(fen, result)),
        source: result.source,
        fen: result.fen,
        depth: result.depth,
        move: result.from + result.to + (result.promotion || ""),
        evaluation: result.evaluation,
      };
    }, fen);
    assert.equal(result.valid, true);
    assert.equal(result.legal, true);
    assert.equal(result.source, "local");
    fs.writeFileSync(
      path.join(root, "artifacts", "reported-position.json"),
      JSON.stringify({ ...result, networking: "disabled" }, null, 2),
    );
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await context.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
