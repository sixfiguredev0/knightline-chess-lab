# Security

Version 5.0 is local-first. Completed checks and remaining compatibility verification are documented in docs/ACCEPTANCE.md. Secret scanning and publication checks are scoped checks, not a guarantee that every possible disclosure or vulnerability has been detected.

## Runtime boundaries

- The local engine is an extension-owned Worker inside a single offscreen document. Engine JS/WASM, corresponding source, and network are pinned by SHA-256 digests.
- Extension CSP permits local scripts, local WASM compilation, and the fixed optional Chess-API endpoint. Remote scripts and string evaluation are not permitted.
- Local failure is retried once. Cloud transmission requires the stored explicit opt-in. Cloud requests omit credentials/referrers and reject redirects.
- Returned moves must be legal for the current position. Board, game, position, and request identities guard progress/final responses and queued execution.
- Input is confirmed against the expected legal board transition. Covered squares, missing promotion controls, read-only boards, cancellation, and rejected input return explicit results.
- Provider text is rendered as text. Panel HTML is a constant template within a ShadowRoot. No credentials or account system exist in the project.

## Lichess input compatibility

The document-start MAIN-world script wraps only cg-board mousedown listeners. Only a specifically requested, bounded board event is delivered to that Chessground listener with its compatibility view of `isTrusted`. It does not change `Event.prototype`, normal user events, ordinary untrusted events, other listeners, or global trust checks. Listener removal is mapped to its original listener and capture mode.

Requests are restricted to a connected cg-board, finite on-board coordinates, a small versioned JSON payload, and an unobstructed board target. The adapter has no network access or extension API capability. It is an input compatibility mechanism, not an authentication boundary: scripts already running on the chess page can dispatch DOM events. It never authorizes privileged extension operations.

## Publication controls

The package builder uses an explicit runtime/source allowlist, rejects paths outside its generated directory, and writes per-file digests and a ZIP checksum. Corresponding engine source and notices travel with the runtime. Browser profiles, raw local reports, reference files, secrets, and test tools are excluded.

`tools/publication-check.cjs` inspects tracked paths and text without printing matching secret values. Gitleaks is additionally run with redacted output before a candidate is handed over. Existing attribution notices remain intentionally present. Changes to Git history cannot erase old clones or cached copies.

The classroom server uses an asset allowlist, loopback binding, Host/Origin checks, and no general directory serving. Its regression tests cover the file-access boundary.

## Reporting

Use private GitHub security reporting when available. Otherwise open a minimal issue requesting a private contact method. Do not post credentials, private logs, or personal details in a public issue. The project does not control host-site behaviour or the optional cloud provider's retention.
