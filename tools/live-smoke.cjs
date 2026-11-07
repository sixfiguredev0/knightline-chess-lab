const fs = require("node:fs"),
  path = require("node:path"),
  os = require("node:os"),
  assert = require("node:assert/strict");
const { chromium } = require(
  process.env.PLAYWRIGHT_MODULE || "playwright-core",
);
const root = path.resolve(__dirname, ".."),
  extensionRoot = path.resolve(process.env.KNIGHTLINE_EXTENSION_DIR || root);
fs.mkdirSync(path.join(root, "artifacts"), { recursive: true });
(async () => {
  const context = await chromium.launchPersistentContext(
    fs.mkdtempSync(path.join(os.tmpdir(), "knightline-sites-")),
    {
      headless: true,
      channel: 'chromium',
      executablePath: process.env.CHROMIUM_PATH,
      viewport: { width: 1500, height: 1000 },
      args: [
        `--disable-extensions-except=${extensionRoot}`,
        `--load-extension=${extensionRoot}`,
      ],
    },
  );
  const report = {
    scope: "Fresh profiles and public pages, not the user installation",
    sites: [],
    externalAnalysisRequests: 0,
  };
  try {
    const worker =
      context.serviceWorkers()[0] ||
      (await context.waitForEvent("serviceworker"));
    await context.route("https://chess-api.com/**", (route) => {
      report.externalAnalysisRequests++;
      route.abort();
    });
    await worker.evaluate(() =>
      chrome.storage.local.set({
        settingsVersion: 2,
        enabled: true,
        cloudFallback: false,
        automaticBudget: false,
        searchTimeMs: 250,
        searchDepth: 0,
        autoplay: false,
        imperfectMoves: false,
      }),
    );
    for (const url of [
      "https://lichess.org/analysis",
      "https://www.chess.com/analysis",
      "https://lichess.org/tv",
    ]) {
      const page = await context.newPage();
      try {
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 25000 });
        if (url.includes("chess.com")) {
          for (const name of ["Ok", "Reject All"]) {
            const button = page
              .getByRole("button", { name, exact: true })
              .first();
            try {
              await button.waitFor({ state: "visible", timeout: 6000 });
              await button.click();
            } catch {
              /* Optional first-visit overlay absent. */
            }
          }
        }
        await page.waitForSelector(
          "cg-board piece,wc-chess-board .piece,chess-board .piece",
          { timeout: 18000 },
        );
        const id = await worker.evaluate(
          async (url) => (await chrome.tabs.query({ url }))[0].id,
          page.url(),
        );
        let d;
        for (let attempt = 0; attempt < 80; attempt++) {
          try {
            d = await worker.evaluate(
              async (id) =>
                chrome.tabs.sendMessage(id, { type: "GET_DIAGNOSTICS" }),
              id,
            );
          } catch {
            await page.waitForTimeout(250);
            continue;
          }
          if (d.response?.complete && d.response.positionKey === d.positionKey)
            break;
          await page.waitForTimeout(150);
        }
        assert.ok(
          d.response?.complete,
          "No final result: " + JSON.stringify(d),
        );
        assert.equal(d.response.source, "local");
        assert.ok(d.pieceCount <= 32);
        assert.ok(d.selection.chosen);
        assert.equal(d.error, null);
        if (!d.response.depth)
          console.log(
            "ENGINE TRACE: " +
              JSON.stringify(
                await worker.evaluate(() =>
                  chrome.runtime.sendMessage({ type: "GET_ENGINE_STATUS" }),
                ),
              ),
          );
        let input = null;
        if (d.context === "study") {
          await worker.evaluate((inputMode) =>
            chrome.storage.local.set({
              autoplay: true,
              timingMode: "fixed",
              fixedDelay: 150,
              inputMode,
            }),process.env.KNIGHTLINE_INPUT_MODE || "click"
          );
          let latest = d;
          for (let attempt = 0; attempt < 100; attempt++) {
            latest = await worker.evaluate(
              async (id) =>
                chrome.tabs.sendMessage(id, { type: "GET_DIAGNOSTICS" }),
              id,
            );
            const accepted = latest.trace.filter(
              (row) =>
                row.stage === "execution-result" && row.execution?.accepted,
            ).length;
            if (accepted >= 2 || latest.execution?.accepted === false) break;
            await page.waitForTimeout(120);
          }
          await worker.evaluate(() =>
            chrome.storage.local.set({ autoplay: false }),
          );
          input = {
            acceptedMoves: latest.trace.filter(
              (row) =>
                row.stage === "execution-result" && row.execution?.accepted,
            ).length,
            result:
              latest.execution ||
              latest.trace.findLast((row) => row.execution)?.execution ||
              null,
          };
          console.log(
            "REAL ANALYSIS INPUT " +
              d.site +
              ": " +
              input.acceptedMoves +
              " accepted; " +
              (input.result?.reason || "no rejection"),
          );
          assert.ok(
            input.acceptedMoves >= 2,
            "Real study-board input was not accepted twice: " +
              (input.result?.reason || "timeout"),
          );
        }
        const item = {
          input,
          site: d.site,
          context: d.context,
          selection: d.selection,
          pieceCount: d.pieceCount,
          orientation: d.orientation,
          turn: d.turn,
          source: d.positionSource,
          confidence: d.confidence,
          reconstructedFen: d.reconstructedFen,
          submittedFen: d.submittedFen,
          response: d.response,
        };
        report.sites.push({ passed: true, ...item });
        console.log(
          d.site +
            " " +
            d.context +
            ": " +
            d.pieceCount +
            " pieces, " +
            d.response.source +
            ", depth " +
            d.response.depth,
        );
        await page.screenshot({
          path: path.join(
            root,
            "artifacts",
            d.site.toLowerCase().replace(".", "") + "-" + d.context + ".png",
          ),
        });
      } catch (error) {
        report.sites.push({
          site: url.includes("lichess") ? "Lichess" : "Chess.com",
          passed: false,
          error: error.message.split("\n")[0],
        });
        console.log("INCOMPLETE " + url + ": " + error.message.split("\n")[0]);
      }
      await page.close();
    }
    assert.equal(report.externalAnalysisRequests, 0);
    fs.writeFileSync(
      path.join(root, "artifacts", "live-smoke.json"),
      JSON.stringify(report, null, 2),
    );
    if (report.sites.some((site) => !site.passed)) process.exitCode = 1;
  } finally {
    await context.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
