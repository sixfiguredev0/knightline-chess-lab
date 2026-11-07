# Corresponding engine source

The distribution includes the unmodified Stockfish.js **19.0.1** lite single-threaded JavaScript/WASM engine, its tagged source archive, the exact NNUE network, upstream copyright notices, and GPLv3 terms. No hosted engine download is needed at runtime.

| File | Purpose |
| --- | --- |
| `stockfish.js-v19.0.1.tar.gz` | Tagged C++ engine, Emscripten glue, Makefile, build script, upstream notices |
| `nn-61e7af4bb97d.nnue` | Exact lite network used by this engine |
| `../vendor/stockfish/provenance.json` | SHA-256 digests for the shipped binaries and corresponding inputs |

Upstream source: https://github.com/nmrugg/stockfish.js/tree/v19.0.1

Network origin: https://tests.stockfishchess.org/api/nn/nn-61e7af4bb97d.nnue

## Rebuild

Install Node.js, Make, and Emscripten **6.0.9**, as specified by the included upstream README and `build.js`. In an empty build directory:

```sh
tar -xzf stockfish.js-v19.0.1.tar.gz
cp nn-61e7af4bb97d.nnue stockfish.js-19.0.1/src/
cd stockfish.js-19.0.1
node build.js --lite --single-threaded --no-split
```

The build outputs to `src/`; keep the matching `.js` and `.wasm` together. Upstream's README, `build.js --help`, and `src/Makefile` document toolchain and build options. This project ships the upstream prebuilt artifacts; it has not established byte-for-byte reproducible builds.

The extension's non-vendor runtime is supplied as editable JavaScript, HTML, and CSS. `tools/build-assets.cjs` regenerates `panelStyles.js` from `panel.css`. The installable ZIP includes that build script and CSS source. No signing key or private service is required to build or run this version.
