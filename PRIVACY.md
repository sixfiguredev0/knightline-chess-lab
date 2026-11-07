# Privacy

## Local by default

Knightline's bundled Stockfish Worker analyses positions inside an extension-owned offscreen document. Local mode makes no external analysis requests, including after a local engine failure. No account, analytics service, API key, or subscription is implemented.

The board adapters read pieces, orientation, selected chess move history, FEN metadata, clock/turn hints, and board capability markers on supported Chess.com and Lichess pages. Route detection identifies board context; the page URL is not copied into diagnostic reports or submitted to an analysis provider. The extension does not read cookies, authentication tokens, chat, or account details.

## Optional cloud fallback

Cloud fallback starts disabled and requires an explicit setting. If enabled and local analysis fails, the service worker can POST to the fixed endpoint `https://chess-api.com/v1`. Its JSON body contains only `fen`, `depth`, `maxThinkingTime`, and `variants`.

Cookies and referrers are omitted and redirects are rejected. The provider receives the chess position and ordinary connection metadata such as the public IP address. A position can be distinctive. This project does not control the provider's logging or retention.

## Storage and diagnostics

Preferences, panel location, and collapse state use `chrome.storage.local`. Existing explicit settings migrate; migration does not enable new opt-in features. Manual FEN corrections and board selection are per-tab runtime state. The service worker keeps a bounded, two-minute in-memory result cache. Engine memory is discarded after 60 seconds idle.

Diagnostics contain version, board geometry/identity, orientation, colour/turn, chess positions, local search status, bounded pipeline traces, and move acceptance. They do not collect usernames, account fields, or page URLs. Strings are additionally scrubbed for URLs, local filesystem paths, and email-like data before copying. Diagnostic reports still contain the chess position; review them before sharing. Nothing uploads these reports automatically.

## Permissions and input

`storage` stores settings. `offscreen` hosts the local Worker. Site host patterns cover boards and single-page navigation. The Chess-API host is available only for the opt-in fallback; possessing the host permission does not enable a request. No history, cookie, account-management, debugger, or broad all-sites permission is requested.

A small Lichess MAIN-world adapter delivers only explicit board mousedown requests to Chessground. It has no extension APIs or network access. Normal browser event trust is unchanged. See SECURITY.md for its boundary.

## Demo and packages

The labelled classroom demo uses a simulated engine and origin-local localStorage. Its server binds only to `127.0.0.1` and serves an explicit file list. Demo scripts are absent from installable packages. Package allowlists exclude browser profiles, private folders, local reports, environment files, and the reference extension. Documentation screenshots use the offline demo, not a signed-in account.
