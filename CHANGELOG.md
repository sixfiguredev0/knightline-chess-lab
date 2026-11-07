# Changelog

## 5.0.0

Knightline 5.0 replaces default remote analysis with a bundled local Stockfish engine, restores explicit gameplay controls across supported contexts, and refreshes the board companion and popup.

- Bundled Stockfish.js 19.0.1 lite WASM, one Worker and thread, a 32 MB hash, three candidate lines, adaptive search budgets, actual UCI strength controls, cancellation, recovery, and idle release.
- Main-board selection and an explicit picker, legal move-history reconstruction, separated orientation/player identity, manual metadata correction, and stale-result protection.
- Autoplay and scheduled orange variations across input-capable contexts, fixed or randomized timing, click/drag input, promotion choices, castling, en passant, and observed move acceptance.
- Charcoal/green popup with Overview, Controls and Diagnostics; isolated coach styles, special-move guidance, optional alternative paths, evaluation badges, persistent layout, keyboard controls, and reduced motion.
- Cloud fallback requires explicit opt-in. Local errors no longer silently transmit a position. Diagnostic copying omits account fields and page URLs.
- GPLv3 distribution with the corresponding engine source, exact network, upstream notices, per-file digests and ZIP checksums. Earlier licence grants remain valid.

The reported 4.8.2 Lichess position passes actual offline analysis. The affected user's installed live workflow, complete signed-in games, Edge, and actual Lichess special-move workflows remain unverified. See [the verification ledger](docs/ACCEPTANCE.md) and [release notes](docs/RELEASE_NOTES_5.0.0.md).

## Earlier releases

Versioned 4.8.1 and 4.8.2 releases remain available in [GitHub Releases](https://github.com/sixfiguredev0/knightline-chess-lab/releases).
