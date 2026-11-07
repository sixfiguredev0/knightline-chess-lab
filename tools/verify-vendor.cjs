const fs = require("node:fs"),
  path = require("node:path"),
  crypto = require("node:crypto");
const root = path.resolve(__dirname, "..");
function verify() {
  const provenance = JSON.parse(
    fs.readFileSync(
      path.join(root, "vendor/stockfish/provenance.json"),
      "utf8",
    ),
  );
  for (const [file, expected] of Object.entries(provenance.files)) {
    const actual = crypto
      .createHash("sha256")
      .update(fs.readFileSync(path.join(root, file)))
      .digest("hex");
    if (actual !== expected)
      throw new Error("Bundled engine/source digest mismatch: " + file);
  }
  console.log(
    "Verified " +
      Object.keys(provenance.files).length +
      " pinned engine, source, network and licence digests.",
  );
}
if (require.main === module) verify();
module.exports = { verify };
