# Changelog

## Unreleased

- Add physical iPhone detection, device Rust builds, automatic Xcode development
  signing, installation and attached launch through `pjm run`.
- Add explicit signing Team ID and private LAN transport, local-network consent
  text and per-device session ownership. Simulator transport remains loopback.
- USB controls deployment; code reload requires a shared private network.

## 0.3.0

- Remove Flutter, Dart and the generated Flutter host. Use upstream PocketJS
  native UIKit rendering/input directly.
- Negotiate the phone safe-area viewport and matching raster density; rebuild
  on rotation rather than stretch a fixed 480×272 canvas.
- Add actual UIKit XCTest coverage for taps, pixels, portrait/landscape bounds,
  source reload and compile/runtime error recovery.
- Use display-link frame boundaries for input and guest ticks.
- Scope interactive development to macOS + iPhone simulators; former Flutter
  desktop previews are removed. Rotation/reload currently reset guest state.


## 0.2.0 — 2026-10-02

- Remove public `build`; `run` compiles and launches an interactive Flutter host.
- Execute guests in native QuickJS using the unmodified PocketJS Apple C ABI.
- Display native framebuffers and forward pointer down/move/up/cancellation.
- Add an interactive TSX counter template, source/asset watching, serialized
  rebuilds, fresh-realm reload, visible failures and recovery.
- Add macOS/Linux host support and iPhone simulator development.
- Add native and Flutter interaction/reload/error-recovery acceptance tests.
- Validate Linux/macOS desktop and iPhone simulator paths in GitHub Actions.

## 0.1.0 — 2026-10-02

- Add Bash 3.2-compatible `pjm create`, `run`, `build`, and `clean`.
- Add a tiny Solid hello template and example.
- Compile and package through pinned official PocketJS APIs.
- Boot packaged guests with PocketJS's WASM host and assert visible output.
- Add Linux/macOS GitHub Actions validation and failure-path checks.
