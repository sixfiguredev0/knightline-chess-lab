const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  vm = require("node:vm"),
  path = require("node:path");
const root = path.resolve(__dirname, ".."),
  fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
function broker({ fallback = false, failLocal = false } = {}) {
  let handler,
    fetches = 0,
    creates = 0,
    requests = [],
    localCalls = 0;
  const context = vm.createContext({
    console,
    setTimeout,
    clearTimeout,
    crypto: { randomUUID: () => String(Math.random()) },
    AbortController,
    fetch: async (url, options) => {
      fetches++;
      return {
        ok: true,
        json: async () => ({ move: "e2e4", eval: 0.2, depth: 12 }),
      };
    },
    chrome: {
      offscreen: {
        createDocument: async () => {
          creates++;
        },
      },
      storage: {
        local: {
          get: async () => ({ settingsVersion: 2, cloudFallback: fallback }),
        },
      },
      runtime: {
        id: "test-extension",
        getManifest: () => ({ version: "5.0.0" }),
        getContexts: async () => [],
        onMessage: {
          addListener: (fn) => {
            handler = fn;
          },
        },
        sendMessage: async (message) => {
          if (message.type === "ENGINE_ANALYZE") {
            localCalls++;
            requests.push(message.request);
            return failLocal
              ? {
                  ok: false,
                  error: { kind: "engine", message: "worker crash" },
                }
              : {
                  ok: true,
                  data: {
                    move: "e2e4",
                    from: "e2",
                    to: "e4",
                    candidates: [{ move: "e2e4" }],
                    source: "local",
                    fen: message.request.fen,
                    complete: true,
                  },
                };
          }
          return { ok: true };
        },
      },
      tabs: {
        query: async () => [{ id: 7 }],
        sendMessage: async () => ({ site: "Lichess", mode: "Analysis" }),
      },
    },
  });
  context.importScripts = (...files) =>
    files.forEach((file) =>
      vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), context, {
        filename: file,
      }),
    );
  vm.runInContext(
    fs.readFileSync(path.join(root, "background.js"), "utf8"),
    context,
  );
  return {
    setFallback(value) {
      fallback = value;
    },
    analyze: (position = fen, depth) =>
      vm.runInContext(
        `analyzeFen(${JSON.stringify(position)},1800,${depth},{timeMs:250})`,
        context,
      ),
    message: (message) =>
      new Promise((resolve) => handler(message, {}, resolve)),
    stats: () => ({ fetches, creates, requests, localCalls }),
  };
}

test("disabling fallback does not reuse a cached cloud result", async () => {
  const b = broker({ fallback: true, failLocal: true });
  assert.equal((await b.analyze()).source, "cloud");
  b.setFallback(false);
  await assert.rejects(b.analyze(), /worker crash/);
  assert.equal(b.stats().fetches, 1);
});
test("default broker is local-only and canonicalizes the exact e4 regression", async () => {
  const b = broker();
  const result = await b.analyze(
    "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1",
  );
  assert.equal(result.source, "local");
  assert.equal(b.stats().fetches, 0);
  assert.equal(b.stats().requests[0].fen.split(" ")[3], "-");
});
test("local failures are retried once without silently transmitting the position", async () => {
  const b = broker({ failLocal: true });
  await assert.rejects(b.analyze(), /worker crash/);
  assert.equal(b.stats().localCalls, 2);
  assert.equal(b.stats().fetches, 0);
});
test("cloud transmission requires the stored opt-in setting", async () => {
  const b = broker({ failLocal: true, fallback: true });
  const result = await b.analyze();
  assert.equal(result.source, "cloud");
  assert.equal(b.stats().fetches, 1);
});
test("invalid positions are rejected before starting engines or making network calls", async () => {
  const b = broker();
  await assert.rejects(b.analyze("no board"), /legal standard-chess/);
  assert.equal(b.stats().creates, 0);
  assert.equal(b.stats().fetches, 0);
});
test("cache key keeps depth-2 practice separate from the normal search", async () => {
  const b = broker();
  await b.analyze();
  await b.analyze();
  assert.equal(b.stats().localCalls, 1);
  await b.analyze(fen, 2);
  assert.equal(b.stats().localCalls, 2);
  assert.equal(b.stats().requests[1].depth, 2);
});
test("active-tab status includes the actual installed version", async () => {
  const result = await broker().message({ type: "GET_RUNTIME_STATUS" });
  assert.equal(result.version, "5.0.0");
  assert.equal(result.status.site, "Lichess");
});
