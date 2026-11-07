const test = require("node:test"),
  assert = require("node:assert/strict"),
  vm = require("node:vm"),
  fs = require("node:fs"),
  path = require("node:path");
const context = vm.createContext({});
vm.runInContext(
  fs.readFileSync(path.join(__dirname, "../boardReader.js"), "utf8"),
  context,
);
const { BoardReader } = context;
test("square geometry and flipped orientation map to logical squares", () => {
  const rect = { left: 100, top: 100, width: 512, height: 512 };
  assert.equal(BoardReader.square(rect, 132, 580, "white"), "a1");
  assert.equal(BoardReader.square(rect, 132, 580, "black"), "h8");
  assert.equal(BoardReader.point("a1", rect, "black").x, 580);
  assert.equal(BoardReader.point("a1", rect, "black").y, 132);
  assert.equal(BoardReader.square(rect, 99, 100, "white"), null);
  assert.equal(BoardReader.point("z9", rect, "white"), null);
});
test("Chess.com logical class does not reverse when the board flips", () => {
  assert.equal(
    BoardReader.elementSquare(
      { className: "piece wp square-52" },
      null,
      "black",
    ),
    "e2",
  );
});
