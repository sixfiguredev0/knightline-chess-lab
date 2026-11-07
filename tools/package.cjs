const fs = require("node:fs"),
  path = require("node:path"),
  crypto = require("node:crypto");
require("./verify-vendor.cjs").verify();
require("./build-assets.cjs");
const root = path.resolve(__dirname, "..");
const manifest = JSON.parse(
  fs.readFileSync(path.join(root, "manifest.json"), "utf8"),
);
const version = manifest.version_name || manifest.version;
if (!/^[\w.-]+$/.test(version)) throw new Error("Invalid package version");
const files = new Set([
  "manifest.json",
  "popup.html",
  "popup.css",
  "popup.js",
  "icon.svg",
  "lib/LICENSE-chess.js",
  "LICENSE",
  "NOTICE",
  "README.md",
  "PRIVACY.md",
  "SECURITY.md",
  "docs/ACCEPTANCE.md",
  "docs/ARCHITECTURE.md",
  "docs/images/readme-banner.svg",
  "docs/images/classroom-demo.png",
  "docs/images/popup-overview.png",
  "docs/images/coach-panel.png",
  "tools/read-only-diagnostics.js",
  "docs/licenses/MIT-legacy.txt",
  "docs/licenses/Hippocratic-legacy.txt",
  "sources/README.md",
  "sources/stockfish.js-v19.0.1.tar.gz",
  "sources/nn-61e7af4bb97d.nnue",
  "vendor/stockfish/stockfish-19-lite-single.js",
  "vendor/stockfish/stockfish-19-lite-single.wasm",
  "vendor/stockfish/COPYING",
  "vendor/stockfish/AUTHORS",
  "vendor/stockfish/provenance.json",
  "offscreen.html",
  "offscreen.js",
  "localEngineHost.js",
  "uciProtocol.js",
  "panel.css",
  "tools/build-assets.cjs",
]);
for (const script of manifest.content_scripts)
  for (const file of [...(script.js || []), ...(script.css || [])])
    files.add(file);
files.add(manifest.background.service_worker);
for (const file of Object.values(manifest.icons)) files.add(file);
const releaseRoot = path.resolve(root, "release"),
  output = path.resolve(releaseRoot, `knightline-v${version}`);
if (!output.startsWith(releaseRoot + path.sep))
  throw new Error("Generated output escaped release directory");
if (fs.existsSync(output)) {
  if (!fs.existsSync(path.join(output, "PACKAGE-MANIFEST.json")))
    throw new Error("Refusing to overwrite an unrecognized directory");
  fs.rmSync(output, { recursive: true });
}
fs.mkdirSync(output, { recursive: true });
fs.writeFileSync(
  path.join(output, "INSTALL.md"),
  `# Knightline · Chess Lab ${version}\n\nLocal development candidate. Release acceptance is pending; see docs/ACCEPTANCE.md. Nothing has been published.\n\nExtract this folder, open chrome://extensions or edge://extensions, enable Developer mode, and choose Load unpacked. Select this folder, refresh the chess tab, and enable Board analysis. Disable other Knightline copies while testing to avoid competing overlays. A new installation starts with autoplay and cloud fallback off.\n\nOpen Diagnostics in the popup and Copy JSON to inspect the actual pipeline. The report omits page URLs and account details.\n\nGPLv3 terms and attribution: LICENSE and NOTICE. Corresponding engine source and network: sources/. Privacy: PRIVACY.md.\n`,
);
for (const file of files) {
  const target = path.resolve(output, file);
  if (!target.startsWith(output + path.sep))
    throw new Error("Package path escaped output");
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(path.join(root, file), target);
}
files.add("INSTALL.md");
const sha256 = (data) => crypto.createHash("sha256").update(data).digest("hex");
fs.writeFileSync(
  path.join(output, "PACKAGE-MANIFEST.json"),
  JSON.stringify(
    {
      version,
      releaseApproved: false,
      files: Object.fromEntries(
        [...files]
          .sort()
          .map((file) => [
            file,
            sha256(fs.readFileSync(path.join(output, file))),
          ]),
      ),
    },
    null,
    2,
  ) + "\n",
);
files.add("PACKAGE-MANIFEST.json");
function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++)
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
const local = [],
  central = [];
let offset = 0;
for (const file of [...files].sort()) {
  const name = Buffer.from(file.replace(/\\/g, "/")),
    data = fs.readFileSync(path.join(output, file)),
    crc = crc32(data);
  const head = Buffer.alloc(30);
  head.writeUInt32LE(0x04034b50, 0);
  head.writeUInt16LE(20, 4);
  head.writeUInt16LE(0x800, 6);
  head.writeUInt16LE(33, 12);
  head.writeUInt32LE(crc, 14);
  head.writeUInt32LE(data.length, 18);
  head.writeUInt32LE(data.length, 22);
  head.writeUInt16LE(name.length, 26);
  local.push(head, name, data);
  const entry = Buffer.alloc(46);
  entry.writeUInt32LE(0x02014b50, 0);
  entry.writeUInt16LE(20, 4);
  entry.writeUInt16LE(20, 6);
  entry.writeUInt16LE(0x800, 8);
  entry.writeUInt16LE(33, 14);
  entry.writeUInt32LE(crc, 16);
  entry.writeUInt32LE(data.length, 20);
  entry.writeUInt32LE(data.length, 24);
  entry.writeUInt16LE(name.length, 28);
  entry.writeUInt32LE(offset, 42);
  central.push(entry, name);
  offset += head.length + name.length + data.length;
}
const directory = Buffer.concat(central),
  end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0);
end.writeUInt16LE(files.size, 8);
end.writeUInt16LE(files.size, 10);
end.writeUInt32LE(directory.length, 12);
end.writeUInt32LE(offset, 16);
const archive = path.join(releaseRoot, `Knightline-Chess-Lab-v${version}.zip`);
fs.writeFileSync(archive, Buffer.concat([...local, directory, end]));
fs.writeFileSync(
  path.join(releaseRoot, "SHA256SUMS.txt"),
  sha256(fs.readFileSync(archive)) + "  " + path.basename(archive) + "\n",
);
console.log(
  `Packaged ${files.size} runtime and source files.\nFolder: ${output}\nZIP: ${archive}`,
);
