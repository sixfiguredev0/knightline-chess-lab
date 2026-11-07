# Security

Knightline's public source and release packages are reviewed for accidental disclosure before publication. This is a scoped review, not a guarantee that every possible vulnerability or secret has been detected.

## Current controls

- Engine requests use one fixed HTTPS endpoint and a body containing only FEN and search options.
- Cookies and referrers are explicitly omitted; redirects are rejected.
- The extension CSP permits local scripts and the configured engine connection. It does not permit remote script execution.
- Provider text and candidate information are rendered as text. The panel's HTML template contains only trusted constants.
- Publication and runtime packaging use explicit file lists. Private folders, environment files, keys, local reports, and browser profiles are excluded.
- The loopback demo serves an explicit asset list, rejects unexpected Host/Origin headers, and does not expose the checkout as a general file server.

## Review scope

The prepublication review covered the staged source, installable ZIP, outbound request construction, manifest permissions/CSP, demo file serving, and locally fetched Git history. Gitleaks was run with redacted output. Additional checks inspect tracked files for personal filesystem paths and forbidden artifacts.

An earlier local demo server could expose surrounding project files by URL. It was replaced with an asset allowlist and regression tests before this publication.

Git metadata and old public copies are separate from the contents of a release ZIP. Changing a licence or removing an address from a branch does not erase previously downloaded or cached copies.

## Report a problem

Use the repository's **Security → Advisories → Report a vulnerability** option when available. If private reporting is unavailable, open a minimal issue asking for a private contact method. Do not include credentials, exploit payloads, private logs, or personal information in a public issue.

The project does not collect secrets or provide an account system. Upstream engine logging and the host sites' behaviour are outside this repository's control. See [PRIVACY.md](PRIVACY.md) for the data flow.
