const fs = require("node:fs"),
  path = require("node:path"),
  os = require("node:os"),
  assert = require("node:assert/strict");
const { chromium } = require(
  process.env.PLAYWRIGHT_MODULE || "playwright-core",
);
const { siteBoard } = require("../tests/fixtures/site-board.cjs");
const root = path.resolve(__dirname, ".."),
  extensionRoot = path.resolve(process.env.KNIGHTLINE_EXTENSION_DIR || root);
fs.mkdirSync(path.join(root, "artifacts"), { recursive: true });
(async () => {
  const context = await chromium.launchPersistentContext(
    fs.mkdtempSync(path.join(os.tmpdir(), "knightline-v5-")),
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
  const errors = [],
    checks = [];
  let externalEngineRequests = 0;
  const pass = (message) => {
    checks.push(message);
    console.log("PASS " + message);
  };
  try {
    let worker =
      context.serviceWorkers()[0] ||
      (await context.waitForEvent("serviceworker"));
    const extensionId = new URL(worker.url()).host;
    await context.route("https://chess-api.com/**", (route) => {
      externalEngineRequests++;
      route.abort();
    });
    await worker.evaluate(() =>
      chrome.storage.local.set({
        settingsVersion: 2,
        enabled: true,
        automaticBudget: false,
        searchTimeMs: 150,
        searchDepth: 0,
        autoplay: false,
        cloudFallback: false,
        showArrow: true,
        showPanel: true,
        selectedBoardId: "auto",
      }),
    );
    const fixture = async (url, options) => {
      const page = await context.newPage();
      page.on("pageerror", (error) => errors.push(error.message));
      await page.route(url, (route) =>
        route.fulfill({ contentType: "text/html", body: siteBoard(options) }),
      );
      await page.goto(url);
      return page;
    };
    const tabId = async (page) =>
      worker.evaluate(
        async (url) => (await chrome.tabs.query({ url }))[0].id,
        page.url(),
      );
    const diagnostics = async (page) =>
      worker.evaluate(
        async (id) => chrome.tabs.sendMessage(id, { type: "GET_DIAGNOSTICS" }),
        await tabId(page),
      );
    const ready = async (page) => {
      const expected = await page.evaluate(() =>
        fixtureGame.fen().split(" ").slice(0, 2).join(" "),
      );
      for (let attempt = 0; attempt < 150; attempt++) {
        const d = await diagnostics(page);
        if (
          d.reconstructedFen?.startsWith(expected) &&
          d.response?.complete &&
          d.response.positionKey === d.positionKey
        )
          return;
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      throw new Error(
        "No final analysis for " +
          expected +
          "; " +
          JSON.stringify(await diagnostics(page)),
      );
    };
    const main = await fixture("https://www.chess.com/analysis", {
      site: "chesscom",
    });
    await ready(main);
    let d = await diagnostics(main);
    assert.equal(d.pieceCount, 32);
    assert.equal(d.selection.boards.length, 1);
    assert.equal(d.confidence, "complete");
    assert.equal(d.response.source, "local");
    pass(
      "real MV3 content selects the main board, ignores a miniature, and analyzes locally",
    );
    await context.setOffline(true);
    await main.evaluate(() => fixtureMove("e4"));
    await ready(main);
    d = await diagnostics(main);
    assert.equal(d.turn, "b");
    assert.equal(d.submittedFen.split(" ")[3], "-");
    pass(
      "local analysis survives the actual opening transition with networking disabled",
    );
    const before = await main
      .locator("#chesshelper-arrow-overlay line")
      .first()
      .getAttribute("x1");
    await main.evaluate(() => fixtureFlip());
    await main.waitForFunction(
      (x) =>
        document
          .querySelector("#chesshelper-arrow-overlay line")
          ?.getAttribute("x1") !== x,
      before,
    );
    d = await diagnostics(main);
    assert.equal(d.playerColor, "w");
    assert.equal(d.orientation, "black");
    pass("flipping changes geometry without changing player identity");
    const black = await fixture("https://lichess.org/AbCd1234/black", {
      site: "lichess",
      orientation: "black",
      includeFen: false,
    });
    await black.waitForFunction(() =>
      document
        .getElementById("chesshelper-live-panel")
        ?.shadowRoot.getElementById("chp-eval")
        .textContent.includes("White to move"),
    );
    await black.evaluate(() => fixtureMove("e4"));
    await ready(black);
    d = await diagnostics(black);
    assert.equal(d.turn, "b");
    assert.equal(d.orientation, "black");
    assert.equal(d.sourceFen, null);
    assert.equal(d.confidence, "complete");
    assert.equal(d.submittedFen.split(" ")[3], "-");
    pass(
      "Black-oriented live round reconstructs e4 from history and receives a real engine move",
    );
    const ambiguous = await fixture("https://lichess.org/analysis", {
      site: "lichess",
      second: true,
    });
    await ambiguous.waitForFunction(() =>
      document
        .getElementById("chesshelper-live-panel")
        ?.shadowRoot.getElementById("chp-eval")
        .textContent.includes("Multiple boards"),
    );
    d = await diagnostics(ambiguous);
    assert.equal(d.selection.reason, "ambiguous");
    assert.equal(d.selection.boards.length, 2);
    const id = await tabId(ambiguous);
    await worker.evaluate(
      async (id) =>
        chrome.tabs.sendMessage(id, { type: "SELECT_BOARD", id: "board-2" }),
      id,
    );
    await ready(ambiguous);
    d = await diagnostics(ambiguous);
    assert.equal(d.boardId, "board-2");
    pass("ambiguous real boards require an explicit per-tab selection");
    await ambiguous.close();
    await black.bringToFront();
    await worker.evaluate(() =>
      chrome.storage.local.set({
        imperfectMoves: true,
        minWeakInterval: 1,
        maxWeakInterval: 1,
      }),
    );
    await black.evaluate(() => fixtureMove("e5"));
    await black.evaluate(() => fixtureMove("Nf3"));
    await black.waitForFunction(
      () =>
        document.getElementById("chesshelper-live-panel")?.dataset.stage ===
        "variation",
    );
    d = await diagnostics(black);
    assert.equal(d.response.depth, 2);
    assert.equal(
      await black
        .locator("#chesshelper-arrow-overlay line")
        .first()
        .getAttribute("stroke"),
      "#ffa500",
    );
    pass("live context supports explicitly enabled depth-2 orange variations");
    await worker.evaluate(() =>
      chrome.storage.local.set({ imperfectMoves: false }),
    );
    await black.reload();
    await black.waitForFunction(() =>
      document
        .getElementById("chesshelper-live-panel")
        ?.shadowRoot.getElementById("chp-eval")
        .textContent.includes("White to move"),
    );
    await black.evaluate(() => fixtureMove("e4"));
    await ready(black);
    pass(
      "refresh reloads the installed content scripts and reconstructs the board again",
    );
    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId}/popup.html`);
    await popup.locator("#tab-diagnostics").click();
    await worker.evaluate(
      async (id) => chrome.tabs.update(id, { active: true }),
      await tabId(black),
    );
    await popup.evaluate(() => refreshDiagnostics());
    const report = await popup.locator("#diagnosticReport").innerText();
    assert.match(report, /reconstructedFen/);
    assert.doesNotMatch(report, /https:\/\/lichess|AbCd1234/);
    assert.match(await popup.locator("#version").innerText(), /5\.0\.0/);
    pass(
      "installed popup reports the actual version and a private diagnostic pipeline",
    );
    await black.bringToFront();
    await black.locator("#chp-collapse").click();
    assert.equal(await black.locator("#chp-body").isHidden(), true);
    assert.equal(
      await worker.evaluate(
        async () =>
          (await chrome.storage.local.get("panelCollapsed")).panelCollapsed,
      ),
      true,
    );
    await black.locator("#chp-collapse").click();
    pass("coach collapse state persists in extension storage");
    await worker.evaluate(() => chrome.storage.local.set({ showArrow: false }));
    await black
      .locator("#chesshelper-arrow-overlay")
      .waitFor({ state: "detached" });
    await black.evaluate(() => window.dispatchEvent(new Event("scroll")));
    assert.equal(await black.locator("#chesshelper-arrow-overlay").count(), 0);
    await worker.evaluate(() => chrome.storage.local.set({ showArrow: true }));
    await black.locator("#chesshelper-arrow-overlay").waitFor();
    pass(
      "presentation changes apply without another analysis and hidden arrows remain hidden",
    );
    await black.emulateMedia({ reducedMotion: "reduce" });
    const animation = await black
      .locator("#chp-move")
      .evaluate((el) => getComputedStyle(el).animationName);
    assert.equal(animation, "none");
    pass("shadow-isolated presentation respects reduced motion");
    await worker.evaluate(() =>
      chrome.storage.local.set({ autoplay: false, imperfectMoves: false }),
    );
    const live = await fixture("https://www.chess.com/game/live/controlled", {
      site: "chesscom",
    });
    await ready(live);
    const firstGame = (await diagnostics(live)).gameId;
    await worker.evaluate(() =>
      chrome.storage.local.set({
        autoplay: true,
        timingMode: "fixed",
        fixedDelay: 500,
      }),
    );
    await live.waitForFunction(() => fixtureGame.history().length === 1);
    await live.waitForFunction(() =>
      document
        .getElementById("chesshelper-live-panel")
        ?.shadowRoot.getElementById("chp-eval")
        .textContent.includes("Black to move"),
    );
    assert.ok(
      (await diagnostics(live)).trace.some((row) => row.execution?.accepted),
    );
    pass(
      "explicit live autoplay submits a verified move then waits for the opponent",
    );
    await live.evaluate(() => fixtureReset());
    await live.waitForFunction(() => fixtureGame.history().length === 1);
    assert.notEqual((await diagnostics(live)).gameId, firstGame);
    pass(
      "rematch starts a new game identity and clears the prior variation schedule",
    );
    await worker.evaluate(() => chrome.storage.local.set({ autoplay: false }));
    await live.reload();
    await ready(live);
    assert.equal(await live.evaluate(() => fixtureGame.history().length), 0);
    pass("refresh preserves autoplay disablement without submitting a move");
    await worker.evaluate(() =>
      chrome.storage.local.set({ autoplay: true, fixedDelay: 1800 }),
    );
    await ready(live);
    await worker.evaluate(() => chrome.storage.local.set({ autoplay: false }));
    await live.waitForTimeout(2000);
    assert.equal(await live.evaluate(() => fixtureGame.history().length), 0);
    pass("disabling autoplay cancels a queued live move");
    await worker.evaluate(() =>
      chrome.storage.local.set({ autoplay: true, fixedDelay: 1800 }),
    );
    await ready(live);
    await live.locator("#fixture-board .piece.square-52").click();
    await live.mouse.click(180 + 4.5 * 64, 100 + 4.5 * 64);
    await worker.evaluate(() => chrome.storage.local.set({ autoplay: false }));
    await live.waitForTimeout(2000);
    assert.equal(
      await live.evaluate(() => fixtureGame.history().join(" ")),
      "e4",
    );
    pass(
      "trusted manual input cancels the queued move and only the manual move remains",
    );
    await live.close();
    for (const [url, expectedContext] of [
      ["https://www.chess.com/play/computer", "bot"],
      ["https://www.chess.com/game/daily/controlled", "daily"],
      ["https://lichess.org/training", "puzzle"],
    ]) {
      const page = await fixture(url, {
        site: url.includes("lichess") ? "lichess" : "chesscom",
      });
      await ready(page);
      assert.equal((await diagnostics(page)).context, expectedContext);
      await worker.evaluate(() =>
        chrome.storage.local.set({ autoplay: true, fixedDelay: 200 }),
      );
      await page.waitForFunction(() => fixtureGame.history().length >= 1);
      for (let attempt = 0; attempt < 50; attempt++) {
        if (
          (await diagnostics(page)).trace.some((row) => row.execution?.accepted)
        )
          break;
        await page.waitForTimeout(30);
      }
      await worker.evaluate(() =>
        chrome.storage.local.set({ autoplay: false }),
      );
      assert.ok(
        (await diagnostics(page)).trace.some((row) => row.execution?.accepted),
      );
      pass(
        expectedContext +
          " route exposes working explicit autoplay in controlled integration",
      );
      await page.close();
    }
    const spectator = await fixture("https://lichess.org/tv", {
      site: "lichess",
    });
    await ready(spectator);
    await worker.evaluate(() =>
      chrome.storage.local.set({ autoplay: true, fixedDelay: 200 }),
    );
    await spectator.waitForFunction(
      () =>
        document.getElementById("chesshelper-live-panel")?.dataset.stage ===
        "error",
    );
    assert.equal((await diagnostics(spectator)).execution.kind, "read-only");
    assert.equal(await spectator.evaluate(() => fixtureInputEvents), 0);
    pass(
      "spectator route keeps analysis available and explicitly rejects input without clicks",
    );
    await worker.evaluate(() => chrome.storage.local.set({ autoplay: false }));
    await spectator.close();
    await main.bringToFront();
    await ready(main);
    await main
      .locator(".piece")
      .first()
      .evaluate((el) => el.classList.add("anim"));
    await main
      .locator("#chesshelper-arrow-overlay")
      .waitFor({ state: "detached" });
    await main
      .locator(".piece.anim")
      .evaluate((el) => el.classList.remove("anim"));
    await ready(main);
    pass(
      "in-flight piece animations suppress stale guidance and recover on settlement",
    );
    const mainId = await tabId(main);
    const invalid = await worker.evaluate(
      async (id) =>
        chrome.tabs.sendMessage(id, { type: "SET_MANUAL_FEN", fen: "invalid" }),
      mainId,
    );
    assert.equal(invalid.ok, false);
    const fen = (await diagnostics(main)).reconstructedFen;
    const corrected = await worker.evaluate(
      async ({ id, fen }) =>
        chrome.tabs.sendMessage(id, { type: "SET_MANUAL_FEN", fen }),
      { id: mainId, fen },
    );
    assert.equal(corrected.ok, true);
    await ready(main);
    pass(
      "manual complete-FEN correction rejects mismatched data and accepts a matching legal board",
    );
    assert.equal(externalEngineRequests, 0);
    pass("offline local mode makes zero requests to the cloud engine");
    assert.deepEqual(errors, []);
    pass("no page errors in controlled extension integration");
    fs.writeFileSync(
      path.join(root, "artifacts", "extension-check.json"),
      JSON.stringify(
        {
          passed: true,
          packaged: extensionRoot !== root,
          checks,
          externalEngineRequests,
          scope:
            "Actual extension and bundled WASM on controlled site-markup fixtures; not user-account games",
        },
        null,
        2,
      ),
    );
    console.log(checks.length + " extension checks passed.");
  } finally {
    await context.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
