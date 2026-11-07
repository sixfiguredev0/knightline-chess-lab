const fs = require("node:fs"),
  path = require("node:path");
const root = path.resolve(__dirname, "..");
const css = fs
  .readFileSync(path.join(root, "panel.css"), "utf8")
  .replace(/#chesshelper-live-panel(\[[^\]]+\])/g, ":host($1)")
  .replaceAll("#chesshelper-live-panel", ":host");
fs.writeFileSync(
  path.join(root, "panelStyles.js"),
  "globalThis.KnightlinePanelCSS = " + JSON.stringify(css) + ";\n",
);
