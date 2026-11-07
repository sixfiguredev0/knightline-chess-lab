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
    fs.mkdtempSync(path.join(os.tmpdir(), "knightline-local-")),
    {
      headless: true,
      channel: 'chromium',
      executablePath: process.env.CHROMIUM_PATH,
      args: [
        `--disable-extensions-except=${extensionRoot}`,
        `--load-extension=${extensionRoot}`,
      ],
    },
  );
  const checks = [];
  const pass = (message) => {
    checks.push(message);
    console.log("PASS " + message);
  };
  try {
    let worker =
      context.serviceWorkers()[0] ||
      (await context.waitForEvent("serviceworker"));
    const extensionId = new URL(worker.url()).host;
    await worker.evaluate(() =>
      chrome.storage.local.set({
        settingsVersion: 2,
        cloudFallback: false,
        searchDepth: 0,
        enabled: false,
      }),
    );
    await context.setOffline(true);
    const result = await worker.evaluate(() =>
      analyzeFen(
        "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
        1800,
        undefined,
        { timeMs: 500 },
      ),
    );
    assert.equal(result.source, "local");
    assert.ok(result.candidates.length >= 3);
    assert.ok(result.depth > 0);
    assert.ok(result.capabilities.UCI_Elo.min);
    pass(
      "real bundled WASM returns three lines and actual strength capabilities offline",
    );
    const e4 = await worker.evaluate(() =>
      analyzeFen(
        "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1",
        1800,
        undefined,
        { timeMs: 250 },
      ),
    );
    assert.equal(e4.source, "local");
    assert.equal(e4.fen.split(" ")[3], "-");
    pass("opening e4 regression is canonicalized and analyzed offline");
    const preempt = await worker.evaluate(async () => {
      const old = analyzeFen(
        "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
        1800,
        undefined,
        { id: "obsolete", timeMs: 3000 },
      ).then(
        () => ({ unexpected: true }),
        (error) => ({ kind: error.kind }),
      );
      await new Promise((resolve) => setTimeout(resolve, 100));
      const latest = await analyzeFen(
        "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2",
        1800,
        undefined,
        { id: "latest", timeMs: 200 },
      );
      return { old: await old, latest };
    });
    assert.equal(preempt.old.kind, "cancelled");
    assert.equal(preempt.latest.id, "latest");
    pass(
      "new position stops obsolete search and returns only the latest request",
    );
    const cdp = await context.browser().newBrowserCDPSession();
    let command = 0;
    async function remoteEval(targetId, expression) {
      const attached = await cdp.send("Target.attachToTarget", {
        targetId,
        flatten: false,
      });
      try {
        return await new Promise((resolve, reject) => {
          const id = ++command;
          const timeout = setTimeout(() => {
            cdp.off("Target.receivedMessageFromTarget", listen);
            reject(new Error("Remote evaluation timed out"));
          }, 5000);
          function listen(event) {
            if (event.sessionId !== attached.sessionId) return;
            const message = JSON.parse(event.message);
            if (message.id !== id) return;
            clearTimeout(timeout);
            cdp.off("Target.receivedMessageFromTarget", listen);
            if (message.error || message.result?.exceptionDetails)
              reject(new Error(JSON.stringify(message)));
            else resolve(message.result?.result?.value);
          }
          cdp.on("Target.receivedMessageFromTarget", listen);
          cdp
            .send("Target.sendMessageToTarget", {
              sessionId: attached.sessionId,
              message: JSON.stringify({
                id,
                method: "Runtime.evaluate",
                params: { expression, returnByValue: true, awaitPromise: true },
              }),
            })
            .catch(reject);
        });
      } finally {
        await cdp.send("Target.detachFromTarget", {
          sessionId: attached.sessionId,
        });
      }
    }
    const targets = await cdp.send("Target.getTargets");
    const offscreen = targets.targetInfos.filter(
      (target) =>
        target.url === `chrome-extension://${extensionId}/offscreen.html`,
    );
    assert.equal(offscreen.length, 1);
    await remoteEval(
      offscreen[0].targetId,
      "host.worker.onerror({message:'Controlled Worker failure'});true",
    );
    const recovered = await worker.evaluate(() =>
      analyzeFen(
        "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
        1800,
        undefined,
        { timeMs: 210 },
      ),
    );
    assert.equal(recovered.source, "local");
    pass(
      "induced Worker failure releases and recreates the actual WASM Worker",
    );
    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId}/popup.html`);
    const pageCDP = await context.newCDPSession(popup);
    const versions = [];
    pageCDP.on("ServiceWorker.workerVersionUpdated", (event) =>
      versions.push(...event.versions),
    );
    await pageCDP.send("ServiceWorker.enable");
    await popup.waitForTimeout(100);
    const version = versions.find(
      (version) =>
        version.scriptURL ===
          `chrome-extension://${extensionId}/background.js` &&
        version.runningStatus === "running",
    );
    assert.ok(version, "service-worker version available");
    await pageCDP.send("ServiceWorker.stopWorker", {
      versionId: version.versionId,
    });
    const restarted = await popup.evaluate(async () => {
      await chrome.runtime.sendMessage({ type: "GET_ENGINE_STATUS" });
      return chrome.runtime.sendMessage({
        type: "ANALYZE_FEN",
        id: "after-restart",
        fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
        timeMs: 230,
      });
    });
    assert.ok(restarted.ok, JSON.stringify(restarted));
    assert.equal(restarted.data.id, "after-restart");
    const contexts = await popup.evaluate(() =>
      chrome.runtime.getContexts({ contextTypes: ["OFFSCREEN_DOCUMENT"] }),
    );
    assert.equal(contexts.length, 1);
    pass(
      "service-worker restart reuses one offscreen host and resumes local analysis",
    );
    const idle = await remoteEval(
      offscreen[0].targetId,
      "({active:!!host.active,pending:!!host.pending,worker:!!host.worker})",
    );
    assert.equal(idle.active, false);
    assert.equal(idle.pending, false);
    assert.equal(idle.worker, true);
    pass("finished searches leave no active or pending jobs");
    console.log("Checking actual 60-second idle release…");
    await popup.waitForTimeout(61000);
    const released = await remoteEval(
      offscreen[0].targetId,
      "({worker:!!host.worker,active:!!host.active})",
    );
    assert.equal(released.worker, false);
    assert.equal(released.active, false);
    pass("actual idle timeout terminates the WASM Worker after 60 seconds");
    const resumed = await popup.evaluate(() =>
      chrome.runtime.sendMessage({
        type: "ANALYZE_FEN",
        id: "after-idle",
        fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
        timeMs: 241,
      }),
    );
    assert.ok(resumed.ok);
    assert.equal(resumed.data.source, "local");
    pass(
      "analysis recreates the Worker after idle release with networking still disabled",
    );
    fs.mkdirSync(path.join(root, "artifacts"), { recursive: true });
    fs.writeFileSync(
      path.join(root, "artifacts", "local-engine.json"),
      JSON.stringify(
        {
          passed: true,
          packaged: extensionRoot !== root,
          checks,
          networking: "disabled",
        },
        null,
        2,
      ),
    );
  } finally {
    await context.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
