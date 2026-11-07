# Knightline: a short class demonstration

## A two-minute walkthrough

1. Open the offline demo with `npm run demo`, then visit `http://127.0.0.1:4317/analysis`.
2. Point out the three surfaces: the board, the coach panel, and the popup. The demo is labelled as simulated.
3. Explain the suggested move in SAN, the evaluation from White's perspective, and the continuation. The translucent squares show the move's origin and destination without blocking clicks.
4. Flip the board. The move still connects the same logical squares.
5. Select **Orange practice move**. Explain that a depth-2 request simulates weaker search and can still choose a good move.
6. Collapse the coach panel, restore it, and toggle the arrows in the popup.
7. Select **Test connection error**, then reset the position. Show that unavailable analysis gets an explicit state instead of a stale suggestion.
8. For a real-engine demonstration, load the extension on a public analysis board and enable Board analysis. This step needs internet access.

## How it works

The board reader converts visible pieces into logical squares. The position tracker combines them with available FEN metadata and known move history. A stable position is sent through extension messaging to the service worker. The worker caches requests and calls the remote engine. The returned move is validated against the exact current position before rendering. If the board changes, request identifiers discard the outdated result.

Settings and the analysis scheduler are separate from board rendering. The board adapter isolates site interaction from engine selection. A small rules library handles legal chess; the remote service provides move search. The extension itself does not implement Stockfish.

## Useful points for questions

- The original startup issue was a class being referenced before its declaration had initialized.
- Cancelling a request means its response is ignored; an already-started remote request may still finish.
- Chess.com encodes logical squares in classes. A flipped board changes screen coordinates, not those class meanings.
- The same position can have different castling/en-passant rights. Piece placement alone is insufficient to reconstruct a complete game state.
- Evaluation is from White's perspective. Negative scores favour Black, regardless of which side is being studied.
- A depth setting is not a reliable Elo rating. The interface reports the provider's reached depth.
- Browser-generated clicks can be rejected by a site. That is why autoplay is restricted to practice and checks for an actual position change.

## Source and verification

The application separates settings, engine access, selection policies, controller state, the board adapter, position tracking, and presentation. Tests are in `tests/`; browser verification scripts are in `tools/`; reports and previews are in `artifacts/`.

Visual behaviour was informed by the supplied extension. The chess rules library retains its upstream license. Knightline's popup, runtime coordination, overlay implementation, and offline demo are maintained in this project.
