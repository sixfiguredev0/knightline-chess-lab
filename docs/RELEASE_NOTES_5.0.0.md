# Knightline 5.0.0

Knightline's largest update so far: bundled local Stockfish, restored gameplay controls, more reliable move handling, and a refreshed charcoal-and-green interface. No account, API key, subscription, or hosted platform is required.

## Analysis on your device

- Stockfish.js 19.0.1 lite WASM is included in the download and runs inside an extension-owned Worker.
- One thread, a 32 MB hash, and three candidate lines. Automatic budgets adapt to the board; manual time/depth and supported playing-strength controls are separate.
- Obsolete searches stop when the position changes. Worker failures, service-worker restarts, and idle release/restart are handled.
- Cloud fallback starts off. A local engine failure does not silently upload a position.

## Better gameplay and board handling

- Autoplay and orange practice variations follow explicit settings across supported contexts, including live routes. Read-only boards explain why input is unavailable.
- Main-board adapters ignore miniatures and offer a picker when selection is ambiguous. Legal history replay preserves known position state.
- Click/drag input, fixed or randomized delays, all promotion choices, castling, and en passant are supported. Move acceptance is checked against the observed legal transition.
- Manual input, board changes, navigation, disablement, and game end cancel queued work. Interrupted drags release at the source.

## A clearer interface

The popup now has Overview, Controls and Diagnostics. The movable, collapsible coach panel uses isolated styles and remembers its layout. Guidance includes promotion indicators, castling rook paths, optional alternative paths, an evaluation badge, readable continuations, smooth transitions, keyboard controls, and reduced-motion support.

## Verification and known gaps

The implementation was checked with 41 unit/server tests, 42 controlled move checks, 13 classroom UI checks, 24 installed-extension integration checks, and eight real engine lifecycle checks. Public analysis pages accepted click/drag input on both sites; Lichess TV was analysed locally. All four promotion choices passed on the actual Chess.com analysis board. The exact reported 4.8.2 Lichess position was analysed offline successfully.

**The affected existing Chrome installation, complete signed-in games on both sites, Edge, and actual Lichess special-move workflows remain unverified.** These are documented gaps, not passing tests. See the [verification ledger](https://github.com/sixfiguredev0/knightline-chess-lab/blob/v5.0.0/docs/ACCEPTANCE.md).

## Install or update

1. Download **Knightline-Chess-Lab-v5.0.0.zip** below and extract it.
2. Open `chrome://extensions` or `edge://extensions`, enable Developer mode, and choose **Load unpacked**.
3. Select the extracted folder containing `manifest.json`. Disable older Knightline copies, refresh your chess tab, and enable Board analysis.

New installations start with autoplay, variations, and cloud fallback off. Existing explicit preferences are preserved when updating the same extension installation. Loading a different folder can create a separate instance.

The download includes **GPLv3 terms, attribution notices, corresponding Stockfish source, the exact NNUE network, and a per-file digest manifest**. `SHA256SUMS.txt` accompanies the ZIP. Earlier MIT and Hippocratic grants remain valid for their respective versions. Redacted secret scans cover the source, Git history, and packaged files.
