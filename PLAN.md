# Native phone phase — plan and acceptance

## Objective

Remove Flutter and use an unchanged PocketJS native engine/view directly.
Retain `pjm create`, `pjm run`, `pjm clean`. Let the phone report its usable
window and density so the compiler and runtime agree on a full safe-area
viewport. Learn host/tool/application separation from mini-program ecosystems.

## Acceptance

- [x] Flutter/Dart/NativeScript are absent from runtime dependencies and CI setup.
- [x] `run` automatically compiles and launches a plain UIKit container.
- [x] Native PocketJS pixels and UIKit touch drive the TSX counter.
- [x] Portrait content fills measured safe-area bounds, not a 480×272 tile.
- [x] Rotation negotiates a new viewport/density and rebuilds matching artifacts.
- [x] Rotation/source reload state reset is explicitly documented.
- [x] Source saves, visible compile/runtime failures and recovery work.
- [x] Command/compiler tests pass, including invalid geometry and stale builds.
- [x] Final native acceptance, session shutdown and public launch are verified.
- [x] Upstream tracked files remain unchanged; final published CI passes.

## Evidence and scope

The first native XCTest acceptance passed on iPhone 17 Pro / iOS 26.4 simulator
`69A9330F-92B1-4192-B44E-035E41272064`: actual taps changed engine pixels,
portrait/landscape dimensions matched the view, saved source reloaded, compile
and guest errors appeared, and valid source recovered. Command checks passed
43 assertions after adding negotiated viewport/density validation.

Final native XCTest also passed with screenshots retained in its result bundle.
The public native launcher reported a 402×778 safe viewport at density 3 on this
phone. Ctrl+C closed the application/server and removed project/device session
locks. A second project was rejected with a nonzero exit code while the first
kept ownership. Regression coverage also checks that host startup failure can
never exit successfully. Portrait and landscape screenshots were exported.

Published implementation `7f37b74662963ed03b54f1d4f11d402c0b3c23f6` passed
[CI run 37008898815](https://github.com/eq-devs/pocketjs-mini/actions/runs/37008898815):
Linux and macOS command checks plus native iPhone 16 Pro / iOS 18.5 acceptance.
The downloaded XCTest result confirms one test passed, zero failed or skipped.
That test requires both orientations to cover >85% of the screen, actual taps
to change guest pixels, and successful source/error recovery. Upstream tracked
files remain unchanged. This documentation-only evidence update changes no code.
Physical iPhones, Android, tablet surfaces above the touch-coordinate range,
production packaging, state-preserving rotation and desktop native windows are
not claimed. Flutter desktop support from 0.2 was intentionally removed.

The UIKit view's width/height initializer and custom host-identity initializer
already exist upstream. Mini defines its own contract registry outside the
upstream tree and delegates plan validation/build/package encoding to upstream.
No upstream source changes are needed for this negotiated rebuild approach.

The previous Flutter phase is recorded in Git history (release 0.2 and CI run
37001507994); its evidence is not used to claim native-container acceptance.

Visual review caught a clipped landscape screenshot that the initial dimension
assertions missed. The host now uses a `UIWindowScene`-owned window. Stronger
XCTest acceptance passed: global phone screenshots have >85% fixture content
coverage in both orientations, and a real landscape tap changes guest pixels.
Fresh portrait/landscape screenshots replace the earlier evidence exports.

The first cloud run exposed a UI-test synchronization error: querying a hidden
surface during rotation caused XCTest to fail before its wait could complete.
Pixel receipt reads now treat a temporarily absent surface as not ready, while
all frame/input/coverage assertions remain required. No assertion failure is
retried or suppressed by the launcher.
