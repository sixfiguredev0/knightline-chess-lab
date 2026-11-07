const test = require("node:test"),
  assert = require("node:assert/strict"),
  vm = require("node:vm"),
  fs = require("node:fs"),
  path = require("node:path");
const root = path.resolve(__dirname, "..");
test("engine idle timer terminates its Worker at 60 seconds", async () => {
  let delay,
    callback,
    terminated = 0;
  const context = vm.createContext({
    setTimeout: (fn, ms) => {
      callback = fn;
      delay = ms;
      return 1;
    },
    clearTimeout() {},
    chrome: { runtime: {} },
  });
  for (const file of ["contracts.js", "localEngineHost.js"])
    vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), context);
  const host = new context.LocalEngineHost();
  host.worker = { terminate: () => terminated++ };
  await host.pump();
  assert.equal(delay, 60000);
  callback();
  assert.equal(terminated, 1);
  assert.equal(host.worker, null);
});
test("a Worker failure rejects the active job and releases Worker state", () => {
  let rejected,
    terminated = 0;
  const context = vm.createContext({
    setTimeout: () => 1,
    clearTimeout() {},
    chrome: { runtime: {} },
  });
  for (const file of ["contracts.js", "localEngineHost.js"])
    vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), context);
  const host = new context.LocalEngineHost();
  host.worker = { terminate: () => terminated++ };
  host.active = {
    request: { id: "old" },
    reject: (error) => {
      rejected = error;
    },
  };
  host.fail(new context.KnightlineError("engine", "worker crash"));
  assert.equal(rejected.kind, "engine");
  assert.equal(host.active, null);
  assert.equal(host.worker, null);
  assert.equal(terminated, 1);
});
test("bestmove keeps its typed score when a partial next-depth MultiPV iteration replaces its rank", () => {
  const context = vm.createContext({
    setTimeout: () => 1,
    clearTimeout() {},
    chrome: { runtime: { sendMessage: async () => {} } },
  });
  for (const file of [
    "contracts.js",
    "moveSelectionPolicy.js",
    "uciProtocol.js",
    "localEngineHost.js",
  ])
    vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), context);
  const host = new context.LocalEngineHost();
  let result;
  host.active = {
    request: {
      id: "r",
      fen: "8/pp6/2n3k1/2Bp3p/1P5K/5P2/P7/8 b - - 0 1",
      multiPV: 3,
    },
    lines: new Map(),
    byMove: new Map(),
    resolve: (value) => {
      result = value;
    },
    reject: (error) => {
      throw error;
    },
    lastProgress: Date.now(),
  };
  host.line("info depth 14 multipv 1 score cp 37 pv b7b5 c5d6");
  host.line("info depth 15 multipv 1 score cp 20 pv c6e5 c5d6");
  host.line("bestmove b7b5");
  assert.equal(result.from + result.to, "b7b5");
  assert.equal(result.depth, 14);
  assert.equal(result.evaluation.type, "cp");
  assert.equal(result.evaluation.value, -37);
  assert.equal(result.candidates.length, 2);
});
