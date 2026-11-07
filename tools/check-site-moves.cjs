/* Actual public promotion controls, separate from deterministic fixture tests. */
const fs = require("node:fs"),
  path = require("node:path"),
  os = require("node:os"),
  assert = require("node:assert/strict");
const { chromium } = require(
  process.env.PLAYWRIGHT_MODULE || "playwright-core",
);
const root = path.resolve(__dirname, ".."),
  extensionRoot = path.resolve(process.env.KNIGHTLINE_EXTENSION_DIR || root);
(async () => {
  const context = await chromium.launchPersistentContext(
    fs.mkdtempSync(path.join(os.tmpdir(), "knightline-special-")),
    {
      headless: true,
      channel: 'chromium',
      executablePath: process.env.CHROMIUM_PATH,
      viewport: { width: 1500, height: 1100 },
      args: [
        `--disable-extensions-except=${extensionRoot}`,
        `--load-extension=${extensionRoot}`,
      ],
    },
  );
  const results = [];
  try {
    const worker =
      context.serviceWorkers()[0] ||
      (await context.waitForEvent("serviceworker"));
    await worker.evaluate(() =>
      chrome.storage.local.set({
        settingsVersion: 2,
        enabled: true,
        autoplay: false,
        cloudFallback: false,
        automaticBudget: false,
        searchTimeMs: 150,
      }),
    );
    for (const site of process.env.KNIGHTLINE_SITE
      ? [process.env.KNIGHTLINE_SITE]
      : ["lichess", "chesscom"])
      for (const promotion of ["n", "r", "b", "q"]) {
        const fen = "4k3/P7/8/8/8/8/8/4K3 w - - 0 1",
          url =
            site === "lichess"
              ? "https://lichess.org/analysis/standard/" +
                fen.replaceAll(" ", "_")
              : "https://www.chess.com/analysis?fen=" + encodeURIComponent(fen),
          page = await context.newPage();
        try {
          const response = await page.goto(url, {
            waitUntil: "domcontentloaded",
            timeout: 25000,
          });
          if (response.status() !== 200) {
            results.push({
              site,
              accepted: false,
              notExecuted: true,
              reason:
                "Custom-position page unavailable: HTTP " + response.status(),
            });
            console.log(
              "NOT EXECUTED " +
                site +
                ": custom-position page returned HTTP " +
                response.status(),
            );
            break;
          }
          if (site === "chesscom")
            for (const name of ["Ok", "Reject All"])
              try {
                const button = page
                  .getByRole("button", { name, exact: true })
                  .first();
                await button.waitFor({ state: "visible", timeout: 4000 });
                await button.click();
              } catch {
                /* Optional first-visit overlay absent. */
              }
          await page.waitForSelector(
            "cg-board piece,wc-chess-board .piece,chess-board .piece",
            { timeout: 12000 },
          );
          await page.locator("#chesshelper-live-panel").waitFor();
          await page.waitForTimeout(1000);
          const cdp = await context.newCDPSession(page),
            worlds = [];
          cdp.on("Runtime.executionContextCreated", ({ context }) =>
            worlds.push(context),
          );
          await cdp.send("Runtime.enable");
          let world;
          for (const candidate of worlds) {
            try {
              const probe = await cdp.send("Runtime.evaluate", {
                contextId: candidate.id,
                expression: "typeof KnightlineDiagnostics",
                returnByValue: true,
              });
              if (probe.result.value === "object") {
                world = candidate.id;
                break;
              }
            } catch {}
          }
          assert.ok(world, "Extension isolated world");
          const snapshot = await cdp.send("Runtime.evaluate", {
            contextId: world,
            expression: "JSON.stringify(KnightlineDiagnostics.snapshot())",
            returnByValue: true,
          });
          const d = JSON.parse(snapshot.result.value);
          assert.equal(d.reconstructedFen?.split(" ")[0], fen.split(" ")[0]);
          const input = await cdp.send("Runtime.evaluate", {
            contextId: world,
            expression: `ChessHelperApp.autoMoveController.boardAdapter.executeMove({uci:'a7a8${promotion}'})`,
            awaitPromise: true,
            returnByValue: true,
          });
          const result = input.result.value;
          assert.equal(result?.accepted, true, result?.reason);
          results.push({
            site,
            promotion,
            accepted: true,
            expectedFen: result.expectedFen,
            observedFen: result.observedFen,
          });
          console.log("PASS " + site + " promotion " + promotion);
        } catch (error) {
          results.push({
            site,
            promotion,
            accepted: false,
            error: error.message.split("\n")[0],
          });
          console.log(
            "FAILED " +
              site +
              " " +
              promotion +
              ": " +
              error.message.split("\n")[0],
          );
        } finally {
          await page.close();
        }
      }
    fs.writeFileSync(
      path.join(root, "artifacts", "site-promotions.json"),
      JSON.stringify(
        {
          packaged: extensionRoot !== root,
          scope:
            "Actual public analysis boards in fresh profiles, not account games",
          results,
        },
        null,
        2,
      ),
    );
    if (results.some((row) => !row.accepted)) process.exitCode = 1;
  } finally {
    await context.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
