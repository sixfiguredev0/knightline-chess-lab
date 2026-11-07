/* Publication check: inspect the staged Git tree without printing matching values. */
const fs = require("node:fs"),
  path = require("node:path"),
  cp = require("node:child_process");
const root = path.resolve(process.argv[2] || path.join(__dirname, ".."));
const files = cp
  .execFileSync("git", ["ls-files", "--cached", "-z"], {
    cwd: root,
    encoding: "utf8",
  })
  .split("\0")
  .filter(Boolean);
const denied =
  /(^|\/)(?:\.git|\.env(?:\..*)?|\.publish|\.audit-tools|\.backup[^/]*|node_modules|artifacts|release|test-results|playwright-report)(\/|$)|EXTENSION TO COPY|\.(?:pem|key|p12|pfx|log|zip|crx)$/i;
const findings = [];
for (const file of files) {
  if (denied.test(file))
    findings.push({ file, rule: "private-or-generated-file" });
  if (
    !/\.(?:js|cjs|json|md|html|css|svg|txt|yml|yaml)$/.test(file) &&
    !["LICENSE", "NOTICE", ".gitignore"].includes(file)
  )
    continue;
  const text = fs.readFileSync(path.join(root, file), "utf8");
  const patterns = [
    ["personal-windows-path", /[A-Z]:[\\/]Users[\\/][^\\/\s]+/i],
    // CI's runner and Emscripten's virtual web_user are public runtime defaults.
    ["personal-unix-path", /\/(?:Users|home)\/(?!runner\b|web_user\b)[^/\s]+/],
    ["private-key", /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
    [
      "github-token",
      /\b(?:gh[pousr]_[A-Za-z0-9]{25,}|github_pat_[A-Za-z0-9_]{30,})\b/,
    ],
  ];
  for (const [rule, regex] of patterns)
    if (regex.test(text)) findings.push({ file, rule });
}
if (findings.length) {
  console.error(JSON.stringify({ passed: false, findings }, null, 2));
  process.exitCode = 1;
} else
  console.log(
    `Publication check passed for ${files.length} tracked files. No personal paths or forbidden artifacts found.`,
  );
