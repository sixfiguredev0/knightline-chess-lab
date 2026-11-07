# 5.0 acceptance ledger

**Status: unpublished development candidate. Release approval is not granted.**

Branch: `codex/knightline-5.0`, isolated from the published `main`. The older release is untouched. A passing fixture suite does not close the reported live-game blocker.

## Evidence categories

| Evidence | What it establishes | What it does not establish |
| --- | --- | --- |
| Unit tests | Settings migration, UCI scores/capabilities, legal metadata, replay, cancellation policies, cloud opt-in and host lifecycle | Real-site DOM or input compatibility |
| Controlled execution browser tests | Exact resulting legal moves with both site-shaped boards, both colours, click/drag games, castling, en passant, all promotion choices, read-only rejection | Real-account games |
| Actual extension integration | Real MV3 scripts and bundled WASM on controlled markup, board selection, history, rematches, queues, contexts, UI and offline operation | The user's installed failure or every host workflow |
| Engine lifecycle browser tests | Real WASM offline, preemption, induced Worker failure and recovery, service-worker restart, one offscreen host | Every possible browser crash condition |
| Public-site smoke checks | Fresh-profile analysis and accepted moves on actual Chess.com/Lichess analysis pages; public Lichess TV reconstruction/analysis | Signed-in games, daily/puzzle/bot progression, all special moves on actual sites |
| Classroom browser tests | Popup and coach behaviour, keyboard controls, visuals, reduced motion, error/retry | Real engine reliability; this demo is explicitly simulated |

Local JSON reports and screenshots live under ignored `artifacts/`. Reports include their scope. Results must be rerun after relevant code changes. `tools/live-smoke.cjs` depends on public network availability and current site markup.

## Reported failure

The affected installation's read-only report confirms version **4.8.2**, Black orientation, a detected Black turn, no complete source FEN, and the controller in `ANALYZING`. Its exact reconstructed position has been validated by the local rules library and evaluated by the new real WASM engine with networking disabled. The returned move is legal and carries a typed score. This is now a regression test.

The report contains no old engine response, so the precise cause of the earlier remote-service rejection is still unconfirmed. It would be inaccurate to call the reported position invalid, to attribute this specific case to en-passant normalization, or to claim the affected installed 5.0 live board has already passed. No further Chess.com board diagnostics were requested after the user reported it working.

Direct access to the existing Chrome session was unavailable under the computer-use access boundary. Inspection of that profile was stopped. No account/profile files were read as an alternative. The user supplied the read-only report instead.

## Local verification results

- 41 unit and loopback-server checks passed, including the exact reported position and partial-MultiPV score retention.
- 42 controlled move checks passed: short games by click/drag, both colours, castling, en passant, all promotion choices, interrupted drags, and read-only rejection.
- 13 classroom/popup UI checks passed. This suite uses the explicitly simulated demo.
- 24 actual-extension integration checks passed against the development checkout and the ZIP-extracted candidate.
- 8 actual engine lifecycle checks passed offline on development and extracted-package installations, including a real 60-second idle release and restart.
- Fresh public Chess.com and Lichess analysis boards accepted click input in development and drag input from the ZIP-extracted candidate. Lichess TV produced complete legal move-history reconstruction and local analysis. No external analysis request was made.
- All four promotion choices passed on the actual public Chess.com analysis board. Lichess custom-FEN URLs returned an external verification challenge, so its real-site special-move check remains unverified. No access challenge was bypassed.
- Redacted Gitleaks scans found no secrets in the staged source or extracted package. Publication scanning excludes only known public CI/Emscripten virtual-home defaults from its personal-path rule. Pinned engine/source/network/licence hashes and extracted ZIP file hashes were verified.

## Release blockers still requiring user-controlled verification

- Install the candidate on the affected Chrome setup and successfully repeat the previously failing live-board analysis. The old report is captured and its exact position works locally; the affected installed 5.0 pipeline still needs confirmation.
- Complete controlled user-owned games on Chess.com and Lichess as both colours, with rematch and page refresh. Validate actual resulting moves, including special moves and underpromotions. Do not test against an uninvolved opponent.
- Verify signed-in live, daily, puzzle/training, bot, study and spectator workflows, game-end markers, history browsing, reconnects and manual interruption on both sites. Route capability is implemented; this is not a claim that every workflow has passed.
- Verify desktop Edge and the affected Chrome version/profile, plus flipped/resized boards, actual site animations, rapid moves, multiple genuine boards and promotion dialogs.
- Complete the affected user's final installed-package check. Automated extracted-package checks do not replace that confirmation.
- Review the candidate's source, compatibility evidence, checksums and secret/publication scan results, then obtain explicit release approval.

No merge, tag, push, release publication, or replacement of the existing release is authorized before these gates close and the user approves the tested candidate.

## Reproduce the local checks

```sh
npm test
npm run verify:vendor
npm run test:execution
npm run test:browser
npm run test:engine
npm run test:extension
npm run test:live
npm run package
```

Set `KNIGHTLINE_EXTENSION_DIR` to the generated unpacked package when rerunning `test:engine` and `test:extension`. A per-file `PACKAGE-MANIFEST.json` and ZIP `SHA256SUMS.txt` accompany the candidate. These are local build artifacts, not a published release.



