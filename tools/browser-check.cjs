const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path");
const { createServer } = require("./demo-server.cjs");
const { chromium } = require(
  process.env.PLAYWRIGHT_MODULE || "playwright-core",
);
const root = path.resolve(__dirname, "..");
(async () => {
  const server = await createServer(0);
  let browser;
  const errors = [],
    checks = [];
  const pass = (message) => {
    checks.push(message);
    console.log("PASS " + message);
  };
  try {
    browser = await chromium.launch({
      headless: true,
      executablePath: process.env.CHROMIUM_PATH,
    });
    const page = await browser.newPage({
      viewport: { width: 1440, height: 1100 },
    });
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/analysis`);
    const ready = () =>
      page.locator('#chesshelper-live-panel[data-stage="ready"]').waitFor();
    await ready();
    assert.equal(await page.locator("#chp-move").innerText(), "d4");
    assert.equal(await page.locator("#chp-score").innerText(), "+0.42");
    assert.equal(
      await page.locator("#chesshelper-arrow-overlay rect.chp-source").count(),
      1,
    );
    assert.equal(
      await page
        .locator("#chesshelper-arrow-overlay line")
        .first()
        .getAttribute("stroke-dasharray"),
      "8,16",
    );
    pass(
      "simulated classroom suggestion renders legal notation, evaluation and dashed guidance",
    );
    const popup = page.frameLocator("iframe");
    await popup.locator("#enabled").waitFor();
    assert.equal(
      await popup
        .locator(".logo img")
        .evaluate((image) => image.complete && image.naturalWidth > 0),
      true,
    );
    pass("popup artwork loads");
    await popup.locator("#tab-analysis").focus();
    await popup.locator("#tab-analysis").press("ArrowRight");
    assert.equal(
      await popup.locator("#tab-settings").getAttribute("aria-selected"),
      "true",
    );
    await popup.locator("#automaticBudget").uncheck();
    assert.equal(await popup.locator("#searchTimeMs").isEnabled(), true);
    await popup.locator("#strengthMode").selectOption("skill");
    assert.equal(await popup.locator("#skillLevel").isVisible(), true);
    pass("keyboard tabs and separate search and strength controls work");
    await popup.locator("#autoplay").check();
    await popup.locator("#minDelay").fill("6000");
    assert.equal(await popup.locator("#maxDelay").inputValue(), "6000");
    await popup.locator("#autoplay").uncheck();
    pass("delay range stays ordered and autoplay remains an explicit setting");
    await popup.locator("#tab-analysis").click();
    const before = await page
      .locator("#chesshelper-arrow-overlay line")
      .first()
      .getAttribute("x1");
    await page.locator("#demo-flip").click();
    await page.waitForFunction(
      (x) =>
        document
          .querySelector("#chesshelper-arrow-overlay line")
          ?.getAttribute("x1") !== x,
      before,
    );
    pass("guidance follows a flipped board");
    await page.locator("#demo-variation").click();
    await page
      .locator('#chesshelper-live-panel[data-stage="variation"]')
      .waitFor();
    assert.equal(
      await page
        .locator("#chesshelper-arrow-overlay line")
        .first()
        .getAttribute("stroke"),
      "#ffa500",
    );
    assert.match(await page.locator("#chp-depth").innerText(), /Depth 2/);
    pass("scheduled shallow variation uses orange and reports depth two");
    await popup.locator("#showArrow").uncheck();
    await page
      .locator("#chesshelper-arrow-overlay")
      .waitFor({ state: "detached" });
    await page.evaluate(() => dispatchEvent(new Event("scroll")));
    assert.equal(await page.locator("#chesshelper-arrow-overlay").count(), 0);
    await popup.locator("#showArrow").check();
    await page.locator("#chesshelper-arrow-overlay").waitFor();
    pass("visibility setting survives redraw");
    await page.locator("#chp-collapse").click();
    assert.equal(await page.locator("#chp-body").isHidden(), true);
    await page.locator("#chp-collapse").click();
    pass("panel collapse works inside isolated styles");
    await page.locator("#demo-error").click();
    await page.locator('#chesshelper-live-panel[data-stage="error"]').waitFor();
    assert.equal(await page.locator("#chp-retry").isVisible(), true);
    await page.evaluate(() => {
      globalThis.demoFail = false;
    });
    await page.locator("#chp-retry").click();
    await page
      .locator('#chesshelper-live-panel[data-stage="variation"]')
      .waitFor();
    pass("error state offers a working retry");
    await page.locator("#demo-reset").click();
    await ready();
    fs.mkdirSync(path.join(root, "artifacts"), { recursive: true });
    await page.screenshot({
      path: path.join(root, "artifacts", "classroom-demo.png"),
      fullPage: true,
      animations: "disabled",
    });
    await page
      .locator("#chesshelper-live-panel")
      .screenshot({ path: path.join(root, "artifacts", "coach-panel.png") });
    const popupPage = await browser.newPage({
      viewport: { width: 420, height: 1200 },
    });
    await popupPage.goto(
      `http://127.0.0.1:${server.address().port}/popup.html`,
    );
    await popupPage.waitForTimeout(200);
    await popupPage.locator(".app").screenshot({
      path: path.join(root, "artifacts", "popup-overview.png"),
      animations: "disabled",
    });
    await popupPage.locator("#tab-settings").click();
    await popupPage.locator(".app").screenshot({
      path: path.join(root, "artifacts", "popup-settings.png"),
      animations: "disabled",
    });
    await popupPage.close();
    await page.evaluate(() => {
      globalThis.demoDelay = 900;
    });
    await popup.locator("#tab-settings").click();
    await popup.locator("#searchDepth").selectOption("16");
    await page
      .locator('#chesshelper-live-panel[data-stage="loading"]')
      .waitFor();
    await page.evaluate(() => {
      demoGame.move("d4");
      renderDemoBoard();
    });
    await ready();
    assert.notEqual(await page.locator("#chp-move").innerText(), "d4");
    pass("late response cannot replace a newer position");
    await page.evaluate(() =>
      chrome.storage.local.set({
        autoplay: true,
        timingMode: "fixed",
        fixedDelay: 1600,
      }),
    );
    await ready();
    const ply = await page.evaluate(() => demoGame.history().length);
    await page.evaluate(() => chrome.storage.local.set({ autoplay: false }));
    await page.waitForTimeout(1800);
    assert.equal(await page.evaluate(() => demoGame.history().length), ply);
    pass("disabling autoplay cancels an already queued move");
    await popup.locator("#enabled").uncheck();
    await page
      .locator("#chesshelper-live-panel")
      .waitFor({ state: "detached" });
    assert.equal(await page.locator("#chesshelper-arrow-overlay").count(), 0);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await popup.locator("#enabled").check();
    await ready();
    assert.equal(
      await page
        .locator("#chp-move")
        .evaluate((el) => getComputedStyle(el).animationName),
      "none",
    );
    pass(
      "disablement clears UI and reduced motion is respected after re-enable",
    );
    assert.deepEqual(errors, []);
    pass("no classroom or popup page errors");
    for (const name of [
      "classroom-demo.png",
      "popup-overview.png",
      "coach-panel.png",
    ])
      fs.copyFileSync(
        path.join(root, "artifacts", name),
        path.join(root, "docs", "images", name),
      );
    fs.writeFileSync(
      path.join(root, "artifacts", "browser-check.json"),
      JSON.stringify(
        {
          passed: true,
          scope:
            "Simulated classroom UI, not installed-engine or live-game acceptance",
          checks,
        },
        null,
        2,
      ),
    );
    console.log(checks.length + " browser checks passed.");
  } finally {
    await browser?.close();
    await new Promise((resolve) => server.close(resolve));
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
