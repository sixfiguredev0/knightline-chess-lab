# Privacy

Knightline is enabled by the user and runs on Chess.com and Lichess pages matched by its manifest. Its board reader extracts piece placement, turn hints, orientation, and available FEN metadata. Analysis is available on live games, puzzles, bots, and study boards.

## What leaves the browser

The service worker POSTs to one fixed endpoint, `https://chess-api.com/v1`. The JSON body contains:

| Field | Meaning |
| --- | --- |
| `fen` | Piece placement and chess position state |
| `depth` | Requested search depth |
| `maxThinkingTime` | Requested search-time budget |
| `variants` | Requested candidate count |

Requests explicitly omit cookies and referrers and reject redirects. The request body does not include usernames, page URLs, cookies, account tokens, credentials, or unrelated page content. The provider receives the position and ordinary connection metadata such as the public IP address. A position can itself be distinctive, so remote analysis should not be described as anonymous or fully offline. This project does not control the provider's logging or retention.

## What stays local

Preferences are stored in `chrome.storage.local`. The service worker keeps a bounded in-memory result cache with a two-minute freshness period. No project analytics or account system is implemented. The extension does not request browser history, cookie, or account-management permissions.

The broad Chess.com and Lichess host patterns are used because boards appear across several routes and single-page navigation can change the route without reloading the extension. Remote connections from extension pages are constrained by the manifest CSP.

## Offline demonstration

The demo uses sample moves and a simulated engine. Its settings live in the browser's localStorage for the local demo origin. It binds only to `127.0.0.1` and serves an explicit set of assets. It does not serve the Git database, environment files, backups, or arbitrary project files. The demo shim is not part of the installed extension.

## Publication

Source publishing and ZIP packaging use allowlists. Local paths, raw browser reports, browser profiles, backups, reference-extension files, and environment/credential files are excluded. Screenshots are captured from the labelled offline demo rather than a signed-in account.
