# Changelog

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
