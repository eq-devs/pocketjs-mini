# Native phone phase — plan and acceptance

## v0.0.1 release priority — user update (2026-10-09)

The user deprioritized DevTools for v0.0.1. Preserve the existing inspection,
recording, replay and highlighting implementation, but defer further DevTools
features and acceptance work until after this release. DevTools is not a
v0.0.1 release gate. The broader technical plan remains a later roadmap.

Prioritize the shared mobile engine, iOS/Android rendering and input, TSX SDK
and essential native APIs, package verification and container limits, a working
example, and build/run reliability. Audit these areas against existing evidence
before estimating v0.0.1 completion or declaring the release ready. Simulator
results do not establish physical-device performance or isolation acceptance.

The current requirement/evidence matrix is maintained in `RELEASE-0.0.1.md`.

Release audit execution: the full `tests/check.sh` gate completed successfully,
with evidence retained in `build/validation/v001-20261009/check.log`. Added
bounded navigation queries (32 fields, 128-character keys, 1024-character
values, 4-KiB encoded routes, valid Unicode) and a 256-listener ceiling.
Invalid push/replace/reset and launch queries preserve prior state; rejected
launches can recover with valid parameters. Focused SDK/native/installed SDK
checks pass 28 tests and strict SDK types pass after these changes. Native
device release readiness is still unproven; the audit records specific gaps.

Actual TSX routing milestone: added `examples/navigation`, a two-page Solid/SDK
application with shared counter and item query. Both platform contracts pass
type/metadata checking. The real development hosts compile and execute it:
UIKit button routing, item/counter retention, Home/resume and cold reset pass
one XCTest with zero failures/skips; Android passes the same flows plus system
Back, retained Home state, root exit and cold reset. Native screenshots and
trees were reviewed; this is stronger evidence than the earlier raw-color SDK
fixture, but does not establish signed TSX deployment or physical performance.

Evidence: `build/ios-validation/navigation-20261009` and
`build/android-validation/navigation-20261009-retry`. The first Android attempt
timed out before receipts; connection was verified and the retry passed. The
new runner checks completed boot before launch. A separate restricted-shell
compile was denied writing the upstream transform cache; authorized native
runners completed actual compilation. The iOS simulator core rebuilt with the
known nonfatal optional libLLVM strip warning. Owned app/server/launcher
sessions were cleaned, the read-only Android emulator shut down, and the
preexisting iOS simulator left running. Further DevTools work stays deferred.

Signed TSX milestone: both installed hosts now pass the real navigation
example with a test-only SDK storage observer. Android covers button/system
Back, query/counter retention, Home/resume, root exit and cold reset. UIKit
covers button routing, retained state, Home/resume, cold reset and ignored
untrusted development URL. The UIKit run revealed and fixed a production
storage reply bug: retained completions now include the SDK-required `ok`
boolean on success and error. Focused native container regression verifies
set/get success and protocol failure. Current screenshots were visually
reviewed; failed attempts are retained separately. Evidence is in
`build/android-validation/signed-navigation-20261009` and
`build/ios-validation/signed-navigation-20261009-storage-fix`. Temporary apps
and the owned emulator were cleaned. Physical release acceptance and remaining
services/distribution work stay open; DevTools stays deferred.

Media foundation milestone: added library/camera SDK request and JPEG resource
reply contracts plus bounded native normalization codecs. The Apple codec runs
against actual ImageIO on macOS; Android runs in a temporary native test APK on
the disposable emulator. Resize, EXIF orientation/GPS stripping, white alpha,
source limits and malformed input checks pass. The full gate passes with 72
core tests and new SDK/native admission checks; evidence is under
`build/validation/media-foundation-20261009` and
`build/android-validation/media-image-20261009-retry`. The initial Android
fixture rejected an undefined orientation on normalized pixels; its corrected
retry also verifies rotated pixel colors. SDK sources and codecs are included
in generated projects. This does not implement the host media service yet:
native UI/consent, bounded provider input, lifecycle/cancellation and isolated
resource adoption remain the next required work. DevTools stays deferred.

Android media service milestone: the signed host now dispatches selection to
per-app native consent and the system document chooser or camera, with bounded
provider reads and one normalization worker. HTTP and media share one isolated
resource pool; retiring the container owns pool cleanup. A native Android test
passes JPEG reads, shared quota, identity/generation isolation, cancellation,
late-callback rejection and oversized-provider rejection. The signed TSX host
also passes consent, denial, chooser cancellation and saved decisions after a cold reopen,
alongside navigation, background/resume and Back. Evidence:
`build/android-validation/media-service-20261009` and
`build/android-validation/media-picker-cancel-20261009-button-fix` and
`build/android-validation/media-picker-deny-20261009`.
The full gate passes, including 72 core tests, with log retained under
`build/validation/media-service-20261009`. Initial UI attempts are retained;
the consent test now uses native button IDs because Android uppercases labels.
Positive system image import/camera capture, iOS media dispatch and physical
performance remain open. DevTools stays deferred for v0.0.1.
The signed HTTP SDK resource/pixel fixture passes with the shared pool as well;
evidence: `build/android-validation/media-shared-http-20261009`. Current Android
Java source compilation and whitespace checks pass. Temporary apps and the
owned read-only emulator were cleaned after validation.

iOS media implementation milestone: the signed host now connects per-app native
consent, PHPicker and camera authorization to bounded input/normalization and
the same HTTP resource pool. One process-wide operation permit is retained
through outstanding provider/worker callbacks, including cancellation; app
backgrounding, retirement and the two-minute deadline suppress late completion.
Generated projects include PhotosUI/AVFoundation, service sources and the camera
usage description. Real simulator consent/chooser cancellation, saved approval
after cold reopen, navigation and lifecycle pass one XCTest without failures.
A separate owned synthetic NSItemProvider source passes real SDK JPEG metadata,
handle reads and release through the installed host. This substitutes only the
picker source; positive system image selection and camera hardware remain open.
Evidence: `build/ios-validation/media-picker-cancel-20261009-retry`,
`build/ios-validation/media-provider-20261009` and
`build/ios-validation/media-picker-deny-20261009`. The separate denial run also
passes real consent denial and its saved decision after cold reopen.
The first UI attempt passed the
initial picker but waited for a surface covered by the cold-reopen picker;
the corrected test dismisses the picker before checking that surface.
The full gate passes with 72 core tests; final iOS source checks and focused
SDK/export tests pass. Broader release/device/service work remains active and
DevTools stays deferred for v0.0.1.

Network service milestone: added bounded network snapshot/change-event SDK
contracts and real signed-host platform monitors. Both signed native navigation
runners pass their SDK/storage network snapshot proof; Android additionally
receives real offline/restored events from the disposable emulator. One latest
snapshot replaces prior changes; lifecycle stops monitors and inactive retained
guests receive their current state on activation. Evidence is retained under
`build/ios-validation/network-20261009-retry` and
`build/android-validation/network-transitions-20261009`. Physical transitions,
iOS transition acceptance, retained switching/stress and development parity
remain open. The owned emulator's settings were restored before shutdown.

Network validation gate: `tests/check.sh` passes with the pinned local upstream,
including 72 core tests and the new network/installed-SDK checks. Log:
`build/validation/network-20261009/check.log`. A restricted attempt tried a
GitHub clone and failed; its log is retained separately. Existing
`PJM_TEST_UPSTREAM` and authorized loopback/cache access resolve that test
setup issue. Native mobile runs separately compile and execute the hosts.

Android Back milestone: the SDK installs a synchronous page-stack hook and
restores the previous hook on disposal. Additive shared FFI operations return
handled/delegate/error, enforce owner/foreground state, and run callbacks and
Promise jobs under the existing 50-ms turn budget. Failed retained callbacks
are unscheduled without disrupting another retained guest. Both Android hosts
coalesce Back requests and dispatch on the GL owner; active contacts cancel
before routing and root Back finishes the Activity. Generated manifests use
legacy Back dispatch. Current development tape format lacks Back, so capture
is discarded if that action occurs; replay correctness is not weakened.

The full regression gate passes 72 core tests plus compiler/server/SDK/package
checks (`build/validation/back-20261009/check.log`). Focused SDK/export and
type checks, Java host compilation and production NDK development JNI source
checks pass. A signed installed app containing the actual SDK passes touch,
Home/resume, detail-to-root Back, root exit and fresh cold reopen on the owned
read-only ARM64 emulator. Evidence: `build/android-validation/back-20261009-retry`.
The first fixture failed initial pixel expectation after a launch-triggered
root reset; corrected detail paint and retained the first failed evidence.
Root screenshot was visually inspected; foreground/exit are separately checked
from UI hierarchies. The temporary app and emulator were cleaned up. Physical
device and complete rendered TSX routing acceptance remain open.

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

## Physical-device follow-up

`pjm run` now detects connected iPhones, builds a device-native engine and signs,
installs and launches the container. On the connected iPhone 12 / iOS 26.6,
development signing, installation and attached process launch succeeded.
Actual page display/input/reload on this phone still require confirmation:
the development server has not yet received its negotiated window metrics.
The app's local-network consent and shared LAN are required.

After these changes, command/transport validation passed 49 assertions and the
full native simulator XCTest passed again on iPhone 17 Pro / iOS 26.4.
No upstream tracked files changed. Earlier simulator evidence above does not
claim end-to-end physical-device acceptance.

## Dual-platform SDK goal — active

- [ ] Android native host: device detection, build/install/launch, real pixels and input.
- [ ] Android negotiated safe viewport, reload, visible failures/recovery and shutdown.
- [ ] Shared TSX/assets and explicit iOS/Android contracts.
- [ ] One-time SDK install, versioned dependencies/shared caches and clear diagnostics.
- [ ] Unified device selection and documented extension/public API boundaries.
- [ ] Clean-environment instructions, reusable example and both-platform CI.
- [ ] Final requirement-by-requirement audit, commits/push and green CI.

Inspection: pinned upstream has Java/JNI/GLES2 Android host and portable QuickJS-C
runtime, with a fixed Moto G Play contract. Its Rust core/C runtime can be reused
without modifying upstream, but dynamic density is a compile-time macro in the
portable runtime and requires a Mini-owned adaptation. Available local AVD is
arm64 Pixel_2 / API 37 with 16 KB pages; NDK 28.2 and build-tools 35 are installed.
No Android physical device is connected yet. USB reload can use adb reverse so
Android development does not require the iOS-style LAN route.

User confirmed the iPhone 12 page, taps and save/reload all work. The earlier
physical-device pending evidence above is superseded by that confirmation.
User edits to examples/hello/tsconfig.json are retained.

Android core feasibility verified: unchanged upstream ui-cabi compiles with
stable Rust for aarch64-linux-android, NDK 28.2 linker, locked dependencies,
without the nightly-only bare-platform feature. Archive generated in
/tmp/pjm-android-core. This proves compilation only, not guest execution.
Shared Android contract registration is added; current command checks still
pass 49 assertions. Next: Mini JNI/Java dynamic viewport/reload adapter and
APK build/installation, then actual emulator guest input/pixel acceptance.

## Attached technical-plan goal — active (2026-10-03)

The user requested the full `基于 PocketJS 的 TSX 小程序引擎技术方案.md`.
Its mobile engine, container, SDK, tooling and device acceptance requirements
remain the goal. The earlier three-command development host is a starting point.
The document's code samples are illustrative API designs; implementation must
match the pinned source. Chinese/IME, desktop/web hosts and same-layer native
controls remain excluded. Existing user changes are preserved.

Current evidence:

- Android arm64 APK builds with QuickJS revision from upstream's toolchain
  manifest, NDK 28.2.13676358 and Rust nightly-2026-07-02. Stable compilation
  alone disables GLES in the pinned C ABI; it does not prove a renderable host.
- `pjm run --device android -d emulator-5554` installed and ran on the existing
  arm64 API 37 emulator with 16 KiB pages. Inspected screenshots show native
  guest pixels, counter 0 -> 1 after injected input, saved-source title changes,
  compiler error display and restored source. Portrait negotiated 360x598 at
  density 3; landscape negotiated 640x318 at density 3. Both screenshots fill
  the safe surface. Rotation settings and the example source were restored.
- Ending the session removed `build/session.json`, removed its adb reverse rule
  and left no `dev.pjm.android` process. Cross-project signing uses one SDK key;
  an incompatible installed signature is never bypassed by uninstalling.
- SDK frame delivery, message/concurrency/queue limits, timeouts, cancellation,
  shutdown, frame timers and page stack behavior have five passing tests under
  Node 24 and Bun 1.3.11. These modules are not yet wired into both native hosts.
- Container Ed25519/hash verification and metadata/domain/permission gates have
  three passing tests under both runtimes. Native release loading does not yet
  use this verification module; no hardened distribution claim follows.
- Pinned portable Android QuickJS and UI C ABI each use singleton globals.
  iOS has handle-based instances. Multi-instance Android requires a refactor.
- The current iOS `PocketSurfaceView` composites a software framebuffer into
  `layer.contents`; it is not the production CAMetalLayer renderer in the plan.
- The 1,000-row virtual list and selection-form fixture compiles and launches;
  startup, frame rate, per-instance memory and physical-device acceptance are
  still unmeasured. A Pixel 8 Pro is connected but has not been used as evidence.

Automated Android acceptance passed on `emulator-5554`, with raw output under
ignored `build/android-validation/1791007457859/`. The runner requires actual
GPU framebuffer hashes, a guest-reported counter action after native input,
changed pixels for saved code, compiler/runtime errors and recovery to the
original pixel hash, a landscape frame, rejection of another project's session,
rotation restoration and removal of session/USB forwarding. Test-only GPU
readback is enabled by an internal launch flag; performance measurements must
run without it. The physical Pixel disconnected before its acceptance run, so
physical Android remains pending. The complete command/SDK/package suite passed
(12 tests, 53 Bun assertions in the command/device group), and strict TypeScript
checking passed for the new launcher, diagnostics, SDK, verifier and native runner.

Remaining full-scope gates:

- [ ] P0: pin/fork integration audit, verify all seven source assumptions,
  iOS/Android physical list/form runs and startup/frame/memory measurements.
- [ ] Shared stable FFI: independent QuickJS/core/texture instances, attach/detach,
  deterministic input/services, lifecycle, GPU resource ownership and teardown.
- [ ] Native hosts: exact density and dynamic viewport behavior, cancellation,
  background pause, memory warnings, native return navigation and presentation.
- [ ] SDK integration: request/storage/nav/app/device/ui/clipboard/media/location,
  frame timers, launch parameters, events and versioned errors/cancellation.
- [ ] Native service gates: declared capabilities, app approval, OS permission,
  exact domain checks including redirects, message/rate limits and large handles.
- [ ] Production container: signed downloads, ABI/target identity, isolated storage,
  current/previous package retention, cold-start updates, three-instance LRU,
  screenshots, heap limits, interruption and remote-code prohibition.
- [ ] Tooling: doctor/create/check/run/build/devtools/publish, signed releases,
  development/release separation, QR/WebSocket sessions, logging and hot restart.
- [ ] Debugging: component inspection/highlighting, tape recording, pause/step/seek,
  deterministic headless replay/CI and documented experimental reload boundaries.
- [ ] Acceptance: cross-platform key-frame comparison, physical smoke, malicious
  package tests, startup <=400 ms, 1,000-row >=55 fps/no frame >33 ms, memory
  <=40 MB, input <=2 frames and hot restart <=2 s measured on baseline devices.

This goal is not complete. Unit tests and emulator inspection do not establish
production integration, physical-device performance or sandbox isolation.

Continuation evidence:

- Public `check` and `build` now share the interactive compiler. Signed release
  builds require an Ed25519 key and cover container capability metadata; they
  refuse overwriting a release. Device window information is included in the
  actual packed guest code. Actual compiler/release tests cover tamper checks,
  missing keys, invalid declarations, invalid TSX and geometry.
- The shared compiler passed Android GPU/input/restart/error/rotation/cleanup
  acceptance again at `build/android-validation/1791008316811/`.
- The reference host-owned package store authenticates before staging, rechecks
  disk bytes on cold start, keeps current/previous plus a staged update, defers
  rollback to cold start and separates app data roots. Tests cover disk/publisher
  tampering, conflicting signed metadata, symlinks, traversal and concurrent
  mutation. This store is not yet wired into native release loading.
- The full command/SDK/package/store/build suite passes 16 tests. Store tests
  also pass in Node 24; strict TypeScript checking passes.
- Android native QuickJS policy now enforces a 24 MiB guest heap, 256 KiB
  stack, two-second startup execution deadline and 50 ms frame/Promise-job
  deadline. It wraps the pinned C adapter without patching upstream. Native
  acceptance passed with startup loops, frame loops, endless Promise chains,
  oversized allocations and a successful restored guest after each rejection,
  along with GPU pixels/input/reload/errors/rotation/cleanup. Evidence:
  `build/android-validation/1791009095536/`. Reported elapsed values include
  source compilation, transport and observation; they are not startup or input
  performance measurements. Total native memory, texture/resource caps, iOS
  enforcement and remote-code prohibition remain unverified.

SDK/native service continuation:

- Android's actual portable-runtime service operations now connect to a
  Mini-owned native mailbox. It has 32 records per direction, 4 KiB per record,
  whole-line FIFO delivery, standard UTF-8 JNI byte arrays and reset on guest
  boot. Queue boundary/FIFO/invalid-line/reset checks compile and run as C tests.
- The GL owner dispatches `device.info.v1` and returns `UNSUPPORTED` for unknown
  service versions and `PROTOCOL` for malformed request envelopes. These
  read-only calls need no OS permission. Sensitive/network/storage providers,
  explicit overflow errors, asynchronous generation checks and native release
  capability gates remain pending.
- The compiler installs the generated `@pocketjs/mini` dependency, preserves
  user tsconfig and refuses external dependency ownership/symlinked files.
  Actual compiler/release tests import and bundle it successfully.
- `connectMiniApp` binds SDK replies, frame timers and the page stack to the
  guest's frame driver. Its stable dispatcher survives SDK reconnection despite
  native frame-function caching. Request IDs continue across reconnections;
  stale replies cannot resolve another client's request. Unit tests run in Bun
  and Node; the SDK does not drain unrelated native mailboxes when unavailable.
- Android acceptance passed at `build/android-validation/1791010076136/`.
  Guest receipts prove native device information and version/protocol errors,
  then bundled SDK Promise delivery/errors, timers, navigation and reconnection
  (action value 31, two reports), plus normal GPU/input/reload/error/rotation/
  cleanup and malicious-loop/heap recovery. iOS Mini services remain pending.
- Full checks pass 18 TypeScript tests and native C mailbox checks. Strict
  TypeScript checks pass. This is progress toward the full goal, not completion
  of its service catalogue, multi-instance container or production security.

iOS service continuation:

- Mini now owns a version-pinned UIKit view adaptation with the original MIT
  notice and provenance. It configures only the `mini` namespace through the
  public C ABI before evaluation; the upstream checkout stays unchanged.
- iOS implements the same device/version/protocol envelopes as Android.
  Host dispatches are capped at 32, records at 4 KiB. Replies run after the Rust
  frame returns to avoid reentering a mutably borrowed handle, and a weak view
  identity check rejects replies for replaced guests. Native Rust mailbox/heap/
  execution limits remain pending; this is not a production security boundary.
- Actual UIKit testing exposed NSNumber serialization of a C comparison as
  JSON `1` instead of `true`; explicit boolean literals fix SDK reply decoding.
  SDK service tests now stand separately from layout tests, preserve receipts
  and capture failure screenshots with source call-site diagnostics.
- `build/ios-validation/services-ios18.xcresult` proves both tests pass on
  iPhone 16 / iOS 18.5 Simulator: GPU-independent native framebuffer pixels,
  actual taps, safe-area/layout coverage, portrait/landscape rebuilds,
  source edits, compile/runtime errors/recovery, native protocol validation,
  bundled SDK device info, frame timers/navigation/reconnection and restoration
  to the original pixel hash. The SDK receipt records value 31. Screenshots and
  receipt were exported under `build/ios-validation/ios18-attachments/`.
- `build/ios-validation/services-protocol.xcresult` proves service/SDK acceptance
  also passes on iPhone 17 Pro / iOS 26.4 Simulator. Its layout test repeatedly
  timed out at landscape rotation despite recorded orientation input. This
  remains open and is not superseded by the iOS 18.5 pass. Earlier failed bundles
  are retained as diagnostic evidence.
- Stable-toolchain builds now dispatch through `rustup run stable cargo`, which
  works even when PATH exposes a direct Cargo binary instead of a rustup proxy.
  All 18 command/SDK/package/store/build tests and native C mailbox checks pass;
  strict TypeScript checks pass. Physical performance, Swift/Metal, complete
  services, signed native loading and multi-instance isolation remain required.

Storage continuation:

- The host reference `AppStorage` maps opaque JSON keys inside the app data
  root supplied by the package store. Identity is a host constructor argument,
  never a guest-selected filesystem path. Atomic locked writes preserve the
  prior snapshot on failed quota checks. Limits are 256 keys, 128 UTF-8 bytes
  per key, 2 KiB per value and 1 MiB per storage file.
- Tests prove restart persistence, independent app values, prototype/traversal
  keys treated as ordinary data, value/key/count quotas, corrupt-file rejection,
  symlink/file/directory replacement rejection and lock contention. Both tests
  pass in Bun and Node; strict TypeScript checking passes.
- Native storage providers and verified native app identity are not yet wired
  to this reference layer. These tests do not establish phone storage isolation.

Committed metadata continuation:

- Check, development compilation and signed builds now use one package metadata
  validator. Changes to `container.json` trigger recompilation; invalid page,
  permission, domain or identity declarations fail before artifact publication.
- Development state exposes the metadata belonging to its committed revision.
  The package is written inside the revision directory and atomically renamed
  before committing revision, identity and viewport. A failed publication keeps
  the previous committed state available.
- All 20 command/SDK/package/store/storage/build tests passed. After the atomic
  publication change, the development acceptance test passed with 55 assertions,
  including invalid declarations, a blocked destination and recovery. Strict
  TypeScript checks of the changed compiler/build/runtime/development test pass.
- This is unsigned local development metadata. Binding native service providers
  to verified app identity and implementing signed native loading remain open.

Native storage continuation:

- Android and iOS implement versioned JSON get/set/remove services through the
  SDK frame pump, with host-bound committed app identity, opaque keys, bounded
  values/key counts/file size and atomic snapshot writes. Android uses
  `AtomicFile`; iOS uses atomic protected-file writes. Both reject symbolic-link
  storage paths. iOS captures the provider with its guest surface; Android clears
  the old provider before boot and exposes no service requests from a failed
  guest, preventing boot effects from using the previous identity.
- `build/android-validation/1791012871405/evidence.json` passes the complete
  emulator acceptance suite, including persisted Unicode/nested values across
  guest restarts, value and UTF-8 key quotas, removal, identity switching,
  ignored guest-selected identity arguments, and a failed boot's queued storage
  effect producing no write. GPU/input/restart/rotation and execution budgets
  also pass. The earlier startup failure is retained in
  `1791012472687` as diagnostic evidence of Android private-path alias handling.
- `build/ios-validation/storage-ios18.xcresult` records all three native tests
  passing on iPhone 16 / iOS 18.5 Simulator: layout/reload/error handling,
  SDK/protocol/reconnection, and storage persistence/quotas/removal/failed-boot
  effects. The simulator was restored to its original shutdown state. The
  separate iOS 26.4 rotation failure remains unresolved.
- Seven SDK/install tests, strict TypeScript checks, Android Java compilation
  and native C mailbox checks pass. Native storage corruption/symlink/count
  quota acceptance needs expansion beyond the existing desktop reference tests.
  iOS app identity switching also remains to be exercised. Cross-instance
  storage coordination, verified release identity and signed native loading
  remain required; these development providers do not prove production
  multi-instance isolation or physical-device performance.

Native storage coordination continuation:

- Both providers now lock a persistent per-app lock file around reads and
  read/modify/write operations. Contention returns `BUSY` instead of blocking
  the guest frame. Locks are released through file descriptor/channel cleanup;
  the lock inode is retained so concurrent callers cannot acquire different
  replacement lock files. This coordinates separate provider objects, beyond
  the former object-local synchronization.
- `bash tests/native-storage.sh emulator-5554` passes against the actual iOS
  Objective-C provider using macOS Foundation and the actual Android Java
  provider using Android's AtomicFile/JSON runtime in a read-only dex process.
  Both prove competing provider rejection, a different app remaining usable,
  release/retry, preservation of independent writes, the 256-key quota,
  corruption rejection without overwrite, and symbolic-link lock rejection.
  The macOS provider test is not an iOS UI/device acceptance substitute.
- The runner cleans up its emulator artifacts and is repeatable. macOS project
  checks now run the Foundation provider test automatically. The full 20
  TypeScript tests plus native C and Objective-C checks pass; Android Java and
  iOS Simulator syntax compilation also pass. Full app acceptance after this
  coordination change still needs running; prior native app bundles precede it.
- Storage coordination does not establish separate QuickJS/core/texture
  instances, a shared stable FFI or signed native loading. Those goal gates
  remain open.

Storage lock native app acceptance:

- `build/android-validation/1791013788973/evidence.json` passes the complete
  native Android app suite with the new provider locks: GPU/input, saved source,
  errors/recovery, service protocol, SDK reconnection, storage quotas and app
  identity isolation, failed-boot effects, execution budgets and rotation.
- `build/ios-validation/storage-locks-ios18.xcresult` records three tests passed,
  zero failed and zero skipped on iPhone 16 / iOS 18.5 Simulator. This verifies
  the updated provider inside the actual iOS app, alongside layout/reload,
  protocol/SDK reconnection and storage acceptance. The simulator was restored
  to its prior shutdown state. The older iOS 26.4 rotation failure stays open.
- Source inspection confirms the Android blockers to a shared independent FFI:
  pinned `engine/quickjs-c/pocket_runtime.c` owns static runtime/context/frame
  state, and `engine/ui-cabi/src/lib.rs` owns a static mutable `UI`. In contrast,
  `engine/ios/src/lib.rs` owns Guest, UiSurface, framebuffer and DamageTracker
  per PocketApple handle. That per-instance path is a candidate for the shared
  adapter; this inspection does not prove Android portability or resource limits.
- Pinned `framework/src/host.ts` declares touches, hits and touchSurfaces as the
  third/fourth/fifth frame arguments. The illustrative document's fifth-argument
  pointer-edge assumption must not be used as the stable ABI without checking
  the corresponding input and host encoders. `PocketSurfaceView` already skips
  presentation when region_count is zero and prior layer contents exist.

Shared engine composition continuation:

- `core-ffi` now composes independent pinned Rust Guest/UiSurface/framebuffer
  instances and exposes a C engine interface with owner-thread checks, bounded
  complete service records, per-instance errors and panic containment. It
  enforces guest heap/stack bounds plus boot/frame/Promise-job deadlines and
  discards effects from failed frames. Restarting even a failed boot requires
  a new instance. The build verifies the exact upstream source pin/cleanliness;
  Cargo.lock retains the upstream rquickjs 0.12.0 dependency set.
- Three Rust tests and the native C caller pass for separate realms/core IDs,
  mailboxes/framebuffers, teardown, queue limits, complete UTF-8 records, buffer
  retry, owner thread, looping scripts/jobs, oversized allocations and failed
  frame effects. Six SDK tests pass after preserving coded native BUSY/PROTOCOL
  exceptions through the transport boundary; strict TypeScript checks pass.
- A real compiled Android TSX fixture from acceptance revision 24 mounts in two
  independent engines and renders equal 1920x954 frames, hash 1983707358, in
  both release and debug host tests. The initial 256 KiB debug stack failed at
  mount; debug now has a bounded 1 MiB stack to cover unoptimized Rust callback
  overhead, while release retains 256 KiB. This is not a GPU/platform key-frame
  comparison or physical performance result.
- Local library builds succeed for aarch64 Android and iOS Simulator. Emulator
  execution of the new Android C caller was not attempted: automatic approval
  review could not complete staging because the account hit a usage limit. The
  rejected staging command created no emulator directory or files. Existing
  native acceptance still proves the older host paths, not this new engine.
- Both phone hosts must still adopt this interface; native surface ownership,
  detach/resize, cancellation details, incremental presentation, total resource
  caps, signed loading and the three-instance container remain required. This
  module is progress toward the shared stable FFI, not completion of that gate.

Shared input ABI continuation:

- Added owner-thread `mp_hit_test` and `mp_frame_input` with explicit latched
  hit targets and up to eight active contacts plus eight cancelled IDs. Native
  hosts can preserve their existing DOWN-order/quick-tap latch rather than
  re-resolving the hit after movement. Cancellations use the pinned bit-30
  terminal encoding. Invalid counts, structures, cancellation markers in
  active contacts and non-finite hit queries fail without stopping the guest.
- The native C caller verifies exact guest touch/hit arrays, cancellation ID
  255, full eight-plus-eight snapshots and recovery from invalid host input.
  Native host wiring and its gesture acceptance remain pending.

Shared-engine iOS host adoption:

- The Mini-only UIKit guest adapter and native build now use `core-ffi` and
  libmini_core_ffi.a instead of pocket-apple. Removed the unused external-guest
  bridge from this view. Per-instance execution/heap/service limits therefore
  apply to the newly linked iOS source path. Services drain after guest return.
- Touches now retain DOWN order and initial hit facts, use lifetime identifiers,
  preserve unsampled quick taps, and emit explicit cancellations on UIKit
  cancellation/backgrounding. Full-frame CALayer presentation is still the
  development renderer; Swift/Metal and incremental damage remain required.
- Release aarch64 iOS Simulator Rust build, Objective-C syntax checks and a
  direct link of main/controller/storage/view against the new static library
  succeed. No simulator execution has validated this replacement yet; earlier
  three-test iOS acceptance proves only the previous adapter.

- Fresh shared-engine acceptance `build/ios-validation/
  shared-core-ios18-1791015600.xcresult` reports Passed, three passed, zero
  failed/skipped on arm64 iPhone 16 / iOS 18.5 Simulator. It covers layout,
  tap-driven framebuffer changes, rotation, reload/error recovery, SDK service
  protocol/reconnect and persistent storage/quota/failed-boot isolation. The
  simulator was confirmed Shutdown after restoring its original state. These
  results do not prove explicit touch cancellation or physical performance.
- Full project checks pass using PJM_TEST_UPSTREAM with the existing pinned
  checkout. The initial check without that setting failed fetching GitHub due
  to sandbox DNS; the authorized local-fixture rerun passed all 20 tests plus
  native service/storage checks. Shared Rust/C tests pass separately.

Shared-engine Android adoption:

- Android now builds Mini core-ffi with stable Rust, bindgen and the pinned
  PocketJS dependencies. JNI calls the shared boot/frame/render/service API;
  GLES2 uploads the engine's BGRA software framebuffer and presents it with
  channel swizzling. The existing ordered contact latch converts to MpInput,
  retaining initial hit facts, quick taps and explicit cancellations. The
  Activity uses test.report.v1 for test receipts, with no legacy guest helper.
- Emulator acceptance `build/android-validation/1791045089023/evidence.json`
  passes GPU pixel/tap changes, source restart, compiler/runtime errors, SDK
  protocol/reconnect/timers/navigation, storage persistence/quotas/identity
  isolation, failed-boot effects, boot/frame/job deadlines, heap exhaustion
  and recovery, landscape viewport and cleanup. Initial replacement acceptance
  failed because its fixture called the removed private reporting helper; the
  fixture now sends the shared test service. The SDK storage error fixture
  reports -1 consistently on either platform.
- The previously stopped API 37 arm64 / 16 KiB-page emulator was started for
  this check and shut down afterward. Results prove emulator behavior, not
  physical Android performance. Native multi-instance/context-owner lifecycle
  wiring, damage rendering, resource caps and the container remain unfinished.

iOS Swift Metal presenter:

- Added `host/ios/MetalPresenter.swift`, a CAMetalLayer-backed Swift view with
  a textured-quad Metal pipeline, aspect fitting, three occupied texture slots
  and asynchronous GPU completion/error handling. The Objective-C engine/input
  adapter embeds it instead of creating a CGImage/CALayer contents copy.
- Test receipts now hash the actual GPU-rendered drawable via blit/readback,
  sampled on first submission and every 30 submissions. Production avoids
  readback buffers. The generated mixed Swift/Objective-C app links Metal.
- The first native build revealed an omitted Objective-C export for the Swift
  class; public export and generated-header syntax checks fixed it. Fresh
  `build/ios-validation/metal-ios18-2-1791045400.xcresult` reports Passed with
  three passed and no failed/skipped tests on arm64 iPhone 16 / iOS 18.5.
  The simulator was restored and confirmed Shutdown.
- This is full software-framebuffer upload/presentation. It does not fulfill
  direct DrawList GPU rendering, incremental damage, the complete Swift/Kotlin
  host requirement, native surface FFI ownership, global resource caps or
  physical performance acceptance. Those remain required.

Shared retained raster and damage uploads:

- core-ffi now uses the pinned DamageTracker and incremental BGRA rasterizer,
  with full repaint/invalidation fallback. Added mp_render_damage without
  changing the legacy MpFrame layout; MpDamage reports at most eight physical
  regions, including zero for unchanged pixels. C callers initialize size.
- A new Rust test compares retained versus fresh full-frame pixels through
  translation, colour changes and removal at densities one and three, proves
  partial damage occurs and proves repeat renders report no damage. Four Rust
  tests and the real C ABI runner pass, including full/empty damage and size
  rejection. The pinned upstream tree stays unchanged.
- Swift Metal tracks a pending bounding rectangle per GPU texture, accumulating
  damage while slots are occupied so dropped submissions cannot lose updates.
  Unchanged frames skip Metal submission; resize/foreground forces presentation.
  Acceptance hashes each submitted drawable; production does no readback.
  Android retains its GLES texture and uploads only changed regions, using a
  bounded packing buffer for GLES2's lack of row-stride uploads.
- Fresh iOS damage acceptance damage-metal-ios18-1791046000.xcresult passes
  three tests on iPhone 16 / iOS 18.5 Simulator. Android physical validation
  exposed rounded density producing a logical height above 1024 on Pixel 8 Pro
  (Android 16, 1008x2244 display); the host now raises density as needed and
  recomputes logical insets. The replacement boots, but its screenshot shows
  the lock screen, so physical touch acceptance awaits user unlock.

- Android emulator damage acceptance damage-emulator-1791046000/evidence.json
  passes all native checks, including taps/GPU changes, storage identity
  isolation, execution/heap failure recovery and rotation. The emulator was
  stopped afterward; iOS simulator restoration was confirmed Shutdown.
- Physical Pixel 8 Pro attempt damage-pixel8pro-2-1791046000 boots at logical
  336x692, density three, but timed out with zero touches/actions. Its portrait
  screenshot shows the lock screen. This is not physical functional acceptance
  or a performance pass. The host stopped and session forwarding cleaned up;
  user unlock remains requested for retry.

Shared lifecycle primitives:

- Added owner-thread mp_suspend/mp_resume. A suspended guest cannot advance
  frames or drain effects; bounded completions remain queued, realm state
  remains intact, and failure cannot be resumed. Repeated calls are idempotent
  for a healthy booted realm. Rust tests verify preserved frame count and queued
  reply delivery; C tests verify lifecycle calls and wrong-thread rejection.
- Host lifecycle adoption and physical/simulator background-resume acceptance
  for these primitives remain required. Phone unlock request remains pending.

Native lifecycle wiring:

- iOS background/foreground callbacks now suspend/resume the shared instance
  on the main owner thread, cancel resident contacts and invalidate Metal
  presentation on resume. A new native UI test taps to change guest state,
  backgrounds and reactivates the app, checks unchanged revision/state and
  verifies another tap works afterward.
- Android lifecycle calls run as GLSurfaceView owner-thread events. Frame
  requests begin only after the resume event completes, preventing a frame
  from reaching a suspended guest. A pending downloaded boot is discarded
  when paused, avoiding GL initialization after backgrounding. Java and NDK C
  syntax checks pass. Android device background/resume acceptance, context
  recreation/state retention and teardown ownership remain required.
- `build/ios-validation/lifecycle-ios18-1791047000.xcresult` reports Passed:
  four passed, zero failed/skipped on arm64 iPhone 16 / iOS 18.5 Simulator.
  Simulator restoration was confirmed Shutdown. This proves same-process
  iOS background/reactivation behavior, not recovery from a system-killed app.

Android lifecycle acceptance continuation:

- Surface callbacks no longer reset the revision when physical dimensions are
  unchanged. Context recreation on the same owner thread rebuilds GLES state
  while retaining the healthy guest; the texture's first upload remains full.
  A missing/failed guest still triggers cold boot. Owner-thread migration and
  orderly teardown before GL thread destruction remain separate requirements.
- Added Android acceptance that backgrounds via HOME, samples unchanged
  published frame counts over a one-second interval, brings the existing
  Activity forward, and checks the same revision, action value, pixel hash and
  advancing frame count. The harness still checks all prior native gates.

- Android lifecycle-emulator-1791047500/evidence.json reports passed, including
  its new same-guest resume check plus all prior rendering/service/storage/
  limits/rotation gates. The test emulator was shut down after validation.
  This does not prove forced EGL context loss, GL owner-thread migration,
  system-killed recovery or physical performance.

Android normal Activity teardown:

- Activity finish/configuration replacement now stops scheduling/network work
  and queues native shutdown before GLSurfaceView pauses. Shared guest destroy,
  GPU objects (when a context exists), packing/readback buffers and contact
  state release on the owner thread. Failed owner checks retain the handle
  instead of freeing a foreign-thread guest. Abrupt system kills remain OS
  resource reclamation, not this orderly shutdown path.
- Added a native acceptance step that finishes via BACK, launches a new
  Activity and requires fresh state/initial pixels with successful frames. This
  exercises a new render thread after old owner-thread teardown. NDK C and
  Java checks pass. Multi-Activity/per-instance JNI ownership remains pending.

- teardown-emulator-1791048000/evidence.json reports passed for finish/cold
  relaunch, background/state-preserving resume and all earlier native gates.
  The emulator was stopped afterward. This verifies orderly Activity finish
  on the emulator; unexpected thread loss, concurrent Activities, forced EGL
  loss and physical-device teardown/performance remain unverified.

Android per-Activity native ownership:

- Replaced singleton JNI engine, input, mailbox access and GPU state with a
  native Host owned by each Activity. Pointer updates and teardown serialize
  through the Activity monitor; guest work and destruction retain GL owner
  thread affinity. Initial contact hit testing now reads that Host's engine.
- host-isolation-emulator-1791048500/evidence.json reports passed: a second
  Activity starts with fresh counter/pixels, then closing it resumes the first
  Activity with its counter and pixels intact. Background resume, cold relaunch,
  services, storage, execution limits and rotation also pass. The owned emulator
  was stopped afterward. Java and strict NDK C compilation checks pass.
- This verifies two retained Activity hosts, not simultaneous foreground drawing,
  a three-instance LRU container, forced thread/context loss or hardware budgets.

Shared retained-instance policy:

- Added core-ffi/src/pool.rs with configurable 1..3 retained instances, LRU
  foreground switching, idempotent background/resume, explicit close and memory
  pressure eviction before notifying the foreground guest. Failed creation
  preserves the previous foreground and retained entries. Drop unloads all
  remaining entries once. Lifecycle callbacks are owner-thread adapter contracts.
- Two standalone Rust tests pass for eviction/event ordering, retained reuse,
  failed-load preservation, background memory pressure and cleanup. Native
  lifecycle/GPU cleanup adapters and C ABI integration remain required. Creation
  prepares the incoming guest before eviction; this retention bound does not
  establish a total memory bound during that transition.

Retained real-engine adapter:

- RetainedEngine now connects the policy to independent QuickJS/Ui instances:
  hide cancels tracked contacts before suspension, show resumes the same realm,
  unload reserves one bounded final frame then immediately drops the engine.
  Adapter lifecycle errors stop the guest and remain observable to callers.
- tests/core-ffi.sh passes ten Rust tests and the real C ABI runner. New tests
  prove retained counters across three guests, cold restart after LRU eviction,
  memory-pressure reclamation, frozen frames/queued effects, and one explicit
  cancellation for contact 255 before freeze. These are engine-level checks.
- Native presentation ownership, signed-package admission, guest lifecycle
  event delivery (including memory warning), and pool C ABI remain unfinished.

Bounded guest lifecycle delivery:

- Added optional __miniLifecycle guest hook and owner-thread mp_lifecycle C ABI
  for launch/show/hide/unload/memoryWarning. Calls use the frame execution and
  Promise-job budget; failed callbacks stop the affected guest. Invalid event
  values reject without stopping a healthy guest. RetainedEngine launches once,
  delivers hide before suspend/show after resume, and notifies memory warnings.
- SDK onLifecycle subscriptions preserve prior hooks and restore them on disposal
  or reconnect. Lifecycle delivery does not advance frame timers. Twelve Rust
  tests, seven SDK tests, and the real C caller pass; the C caller verifies event
  order, owner-thread rejection and invalid enum recovery. Loop and Promise-loop
  lifecycle tests prove execution interruption.
- Mobile hosts still need to call the new lifecycle ABI; launch source/path/query,
  cleanup-service draining, GPU synchronization and native pool integration are
  pending. These checks do not establish mobile lifecycle event acceptance.

Native lifecycle wiring continuation:

- Android and iOS boot now deliver launch/show; background delivers published
  contact cancellations followed by hide/suspend; foreground resumes then shows.
  Android consumes queued latch cancellations too; iOS clears retired touch
  entries before freezing. Callback errors stop scheduling/mark the guest failed.
- Fixed RetainedEngine contact decoding for extended 10-bit coordinates (IDs
  shift by 20 rather than 18). Its contact-255 test now uses x=600 and proves
  the corresponding cancellation ID. Twelve Rust tests and the C caller pass.
- Strict NDK C and iOS Swift/ObjC compilation checks pass after refreshing the
  generated Swift header. Mobile acceptance for these new callback paths remains
  pending; prior mobile results predate these changes. Native unload, memory
  warning, launch parameters and cleanup-service/GPU ordering remain unfinished.

Native memory-warning delivery:

- Android trim-memory callbacks enqueue notification on the GL owner thread;
  the UI-hidden notification alone is not treated as memory pressure. Paused
  guests coalesce a pending warning for delivery after resume, avoiding guest
  execution while backgrounded. Closed hosts ignore notifications.
- iOS memory-warning notifications deliver on the main owner thread and likewise
  defer/coalesce while backgrounded. Callback errors stop the affected guest.
- NDK strict C, Java and iOS ObjC compilation pass. End-to-end OS notification
  acceptance is pending. This wires guest notification only; native retained
  pool integration must still reclaim background instances before notifying the
  foreground guest, as the real engine policy already does in its tests.

Android lifecycle callback acceptance:

- Added an authenticated SDK lifecycle fixture and native acceptance requiring
  launch/show on boot, hide/show after HOME/reactivation in the same revision,
  then memoryWarning after Android send-trim-memory RUNNING_LOW. Guest-side
  callback ordering is checked before reporting; masks 3, 7 and 15 were observed.
- lifecycle-events-emulator-1791049500/evidence.json reports passed, including
  all earlier rendering, two-Activity isolation, teardown, SDK, storage,
  execution-limit and rotation gates. Seven SDK unit tests also pass. The owned
  emulator was stopped afterward. iOS callback acceptance, deferred warning
  acceptance, hardware performance and native retained-pool integration remain
  unverified.

Native orderly unload and GPU retirement:

- Android hot replacement and Activity shutdown now invoke unload plus one
  bounded final frame for healthy guests, then wait for current-context GLES
  work before destroying the engine and deleting GPU objects. Failed guests
  are not revived. Missing EGL contexts retain the platform reclamation path.
- iOS has an idempotent owner-thread shutdown path, called before hot-replaced
  surfaces detach and during deallocation. It invokes unload/final frame, waits
  for the presenter's last Metal submission, releases texture slots, then
  destroys the engine. Generation invalidation ignores stale GPU receipts.
- Strict NDK C and refreshed Swift/ObjC compilation pass. Mobile teardown
  acceptance for these changes remains pending. Final-turn service effects are
  still discarded at destruction; durable cleanup-service draining and stronger
  GPU error/timeout handling remain required.

Android unload service draining:

- Split native unload preparation from destruction. Java drains the bounded
  outgoing queue with the old AppStorage identity before clearing it for a hot
  replacement or Activity shutdown. Preparation is idempotent, preventing
  duplicate unload callbacks/final frames. Failed turns discard effects.
- Added an unload-only storage-write fixture followed by a new guest that reads
  and removes the stored value. unload-storage-emulator-1791051000/evidence.json
  reports passed, including this check and all prior lifecycle/isolation/storage/
  execution-limit/rotation gates. NDK C and Java compile checks pass. The test
  emulator was stopped afterward.
- This proves a synchronous Android storage effect during hot replacement;
  final-frame Promise replies are not delivered to the retiring realm. iOS
  cleanup draining, async-service cancellation/settlement and physical-device
  acceptance remain required.

iOS unload service draining:

- Added a bounded synchronous cleanup-effect callback after the final guest
  turn returns and before GPU/engine release. It uses the retiring surface's
  captured storage identity. Normal service delivery remains queued and rejects
  replaced surfaces; both paths share the same protocol/service dispatcher.
- New UI acceptance writes storage only from unload, replaces the guest, then
  reads/removes the value and requires the guest success receipt. Result bundle
  unload-storage-ios18-1791052000.xcresult reports Passed: six passed, zero
  failed/skipped on arm64 iPhone 16 / iOS 18.5 Simulator. This includes prior
  input/layout/reload, SDK lifecycle, storage and background-state gates.
  Simulator restoration to Shutdown was verified.
- This verifies synchronous cleanup storage during hot replacement, not process
  termination or async-service settlement. Queued replies are not consumed by
  the retiring guest. Physical teardown/performance, native retained-container
  integration and iOS memory-warning acceptance remain unfinished.

Retained-pool lifecycle failure recovery:

- Pool activation now distinguishes creation and lifecycle errors. It validates
  the incoming guest's show/launch turn before LRU eviction, unloads a failed
  candidate and resumes the prior retained guest. Resume no longer marks a
  failed guest foreground. Re-selecting a failed foreground reports its error.
- A real QuickJS test at capacity one uses an infinite show callback and proves
  the healthy guest remains retained and continues its counter. Thirteen Rust
  tests and the real C ABI runner pass. During failed activation the previous
  guest receives hide/show; transient candidate memory still requires admission
  control. Native container integration remains pending.

Retained failed-guest scheduling:

- RetainedEngine now records terminal frame errors while preserving recovery
  from invalid contact input. Pool foreground lookup removes failed guests from
  scheduling; memory pressure recognizes stopped foregrounds and reclaims them.
  Failed memory callbacks cannot be revived by resume.
- Fifteen Rust tests and the C ABI caller pass. New real-engine checks prove an
  infinite frame stops scheduling without destroying a healthy retained realm,
  invalid caller input remains recoverable, and a failed memory hook stays
  stopped and is reclaimed. Native pool wiring remains unfinished.

Launch parameter transport:

- Added mp_launch with bounded 4096-byte UTF-8 JSON data, delivered as the second
  optional lifecycle-hook argument under the execution/job budget. SDK exposes
  immutable launchOptions and passes it to launch subscribers with bounded
  source/path/query validation. Development hosts now supply source development,
  root path and an empty query.
- Sixteen Rust tests, eight SDK tests and the C ABI runner pass. Real-engine
  coverage proves JSON values enter the guest and oversized input rejects;
  SDK coverage proves snapshot isolation and malformed query rejection. Android
  NDK C and iOS ObjC compilation pass.
- Deep-link/QR launch parsing, routing to the requested declared page, retained
  pool launch data, signed-container launches and native launch acceptance are
  pending. The default development context does not prove these requirements.

Launch routing:

- SDK launch delivery validates the destination against declared pages and the
  full UTF-8 payload against 4096 bytes before changing metadata or navigation.
  A valid destination becomes the sole root page with a copied query. Invalid
  destinations/queries preserve the previous launch snapshot and route.
- Development hosts omit a destination so the SDK uses its configured entry,
  including applications whose page list excludes root. Nine SDK tests pass,
  covering query retention, root back delegation, undeclared destinations,
  oversized Unicode data and non-root configured entries.
- Native deep-link/QR parsing, launch data retention on SDK reconnect and pool
  activation, and end-to-end launch navigation acceptance remain unfinished.

SDK reconnect state retention:

- Guest-keyed SDK state now retains the same navigation stack and immutable
  launch snapshot across disposal/reconnection. Omitted reconnect configuration
  inherits the guest page declaration; explicit incompatible pages/entry reject
  before replacing hooks or the frame pump. Lifecycle listeners remain scoped
  to each connection and are cleared on disposal.
- Ten SDK tests pass, including retained launch/query/current page and back
  stack, stale-listener removal, configuration mismatch recovery, and isolation
  from a different host object. Native launch/pool integration remains pending.

Retained engine launch context:

- RetainedEngine accepts a copied bounded launch JSON context before first show
  and delivers it only on first launch. A real-engine test changes the caller's
  source buffer, switches guests and backgrounds/resumes, proving the original
  query survives and launch executes once. Seventeen Rust tests and the C caller
  pass. Native container admission and pool ABI remain unfinished.
- Strict TypeScript checking of sdk/index.ts and its imports found an ambiguous
  cached frame-anchor type; an explicit Anchor annotation fixes it. Strict SDK
  checking and all ten SDK tests pass.

Launch-once invariant and C payload acceptance:

- Shared engine and SDK now reject duplicate successful launch delivery without
  changing guest state. The real C caller invokes mp_launch with source/path/query,
  observes those values from JS, rejects a duplicate, then proves frames still
  run. Invalid first SDK launch preserves the entry and permits a valid retry.
- Seventeen Rust tests, eleven SDK tests and the C caller pass. Tests separately
  exercise byte-limit rejection before launch and duplicate-launch rejection,
  avoiding one validation rule masking another. Native container integration
  and mobile launch-routing acceptance remain pending.

Shared retained-pool C interface:

- Added opaque owner-thread MpPool with capacity 1..3, activation from bounded
  source/pak/launch buffers, foreground frame/render/service draining,
  background/resume, memory pressure, errors and destruction. Package signature
  verification remains the caller's required admission step. Native GPU resources
  are not owned by this engine pool. Pixel borrows invalidate on pool mutation.
- Seventeen Rust tests and the expanded real C caller pass. C coverage retains
  three guests, revisits a counter, evicts via a fourth and cold-starts the LRU,
  verifies background frame rejection/resume, renders after memory pressure,
  rejects foreign-thread operations/destruction, and rejects invalid capacities.
- Native adapters, cleanup effect forwarding on eviction, service completion
  routing, latched contact/damage APIs and signed admission remain unfinished.

Pool completion identity and generation routing:

- Added mp_pool_generation and bounded mp_pool_svc_post addressed to a retained
  guest identity plus its generation. Suspended guests retain completions for
  resume. Generations stay stable across foreground switching and monotonically
  advance on cold creation; stale replies cannot enter a recreated same-ID guest.
- Seventeen Rust tests and the expanded C caller pass. C coverage queues a
  completion to a background guest, observes it after switching back, verifies
  stable generation on retention, and rejects an old generation after LRU
  eviction/cold restart. Native service adapters must still capture and forward
  these tokens; pool GPU/cleanup/damage/input integration remains unfinished.

iOS SDK lifecycle acceptance:

- Added a UI acceptance test using the shared SDK lifecycle fixture: requires
  launch/show mask 3, HOME/reactivation hide/show mask 7, and unchanged guest
  revision. Fixture checks callback ordering before reporting and is restored
  after the test. The receipt is retained as an xcresult attachment.
- lifecycle-events-ios18-1791050000.xcresult reports Passed: five passed,
  zero failed/skipped on arm64 iPhone 16 / iOS 18.5 Simulator, including prior
  native input/layout/reload, SDK, storage and background state checks. Simulator
  restoration to Shutdown was verified. iOS OS memory-warning delivery,
  physical performance, native pool integration and iOS 26 rotation remain
  unverified.

Pool latched input and damage interface:

- Added mp_pool_frame_input, mp_pool_hit_test and mp_pool_render_damage with the
  existing input/damage structures and retained contact cancellation tracking.
- Fixed double density scaling in pool render. C tests now verify density-3
  dimensions/stride/length, full then unchanged damage, latched hits, cancellation,
  invalid-count recovery and hit queries. Seventeen Rust tests and C tests pass.
- Native pool adapters, eviction cleanup, signed admission and GPU resource
  limits remain unfinished.

Pool eviction cleanup forwarding:

- RetainedEngine accepts an owner-thread cleanup handler after successful unload
  and the bounded final frame, before realm release. MpPool exposes a registered
  synchronous cleanup callback with guest identity/generation and borrowed record
  bytes. The mailbox bounds delivery to 32 records per guest. Callbacks must not
  reenter the pool or retain borrowed pointers.
- Seventeen Rust tests and the expanded C caller pass. C coverage observes one
  cleanup record when capacity-one eviction retires a guest, then one from the
  remaining guest during pool destruction, with increasing generation tokens.
- Native storage/GPU adapters, cleanup error reporting and asynchronous-service
  settlement remain unfinished; this is engine/C ABI evidence only.

Pool explicit close and resource retirement:

- Added mp_pool_close and a registered owner-thread retirement callback carrying
  identity/generation, after cleanup effects and before engine release. This is
  the native GPU fence/release integration point; callbacks must not reenter.
- Seventeen Rust tests and the C caller pass. C coverage verifies cleanup precedes
  retirement on eviction and explicit close, and repeated close/destruction does
  not duplicate retirement. Actual native GPU adapter wiring remains unfinished.

Native node allocation admission:

- Mini-owned createNode binding now limits each realm to 16,384 native node
  allocations over its lifetime and returns coded BUSY on exhaustion. Destroy
  does not replenish this churn budget. The original pinned node type conversion
  and return value are preserved; tracked upstream source remains unchanged.
- Eighteen Rust tests and the C caller pass. A real guest creates/destroys nodes
  until admission rejects, while another guest still allocates and frames.
- This is a lifetime allocation policy, not a measured total-memory bound or a
  live-node quota. Long-lived app churn, native texture/font/style resources,
  mobile acceptance and physical resource budgets remain to be addressed.

Live native node quota refinement (supersedes lifetime admission above):

- Inspection confirmed pinned Ui exposes node_children/node_exists and destroys
  whole subtrees. Mini now tracks live guest-created IDs and reclaims quota only
  for IDs the core actually destroyed, preserving root/stale-ID no-op behavior.
  The 16,384 limit is now live nodes, allowing long-running destroy/recreate use.
- Eighteen Rust tests and the C caller pass. The real guest fills quota, receives
  BUSY, destroys a populated subtree, then exceeds 16,384 successful sequential
  create/destroy cycles. Another guest still allocates normally.
- This does not bound native textures/fonts/styles, core-generated auxiliary
  nodes or measured total process memory. Mobile acceptance remains pending.

Native text-node admission:

- Mini-owned setText/replaceText bindings cap each submitted text value at 4096
  UTF-8 bytes before core mutation and return BUSY on exhaustion. Coerced strings
  preserve the pinned numeric-to-text semantics. The previous node value remains
  intact on rejection.
- Nineteen Rust tests and the C caller pass. Real-engine coverage rejects 1025
  emoji (4100 bytes) while preserving prior numeric text as "42". The fixture was
  corrected to pinned Text node type 1 after inspection.
- Aggregate text/shape/cache memory, texture/font/style admission and mobile
  resource acceptance remain unfinished; this is not a total native-memory cap.

Aggregate guest-set native text budget:

- Text setters now account for stored bytes per Text node and cap aggregate
  guest-set text at 2 MiB per realm, in addition to the 4096-byte per-value limit.
  Replacements deduct the old value; empty text and subtree destruction return
  capacity only for nodes the core actually releases. Non-Text IDs retain no-op
  core behavior after per-value admission.
- Twenty Rust tests and the C caller pass. Real-engine coverage fills aggregate
  capacity, observes BUSY, then successfully reuses bytes after replacement and
  destruction. Node generation reuse does not inherit stale text accounting.
- Shape/layout caches, fonts, textures, styles, mobile acceptance and measured
  total process memory remain unfinished and are not bounded by this quota.

Raw guest texture admission:

- The Mini-owned uploadTexture binding rejects source buffers over 4 MiB before
  copying pixels. It inspects live core texture storage before admission and
  rejects uploads when 256 live textures or 8 MiB of pixel/palette bytes would
  be exceeded, with coded BUSY errors. Freeing textures returns capacity.
- Twenty-two Rust tests and the actual C ABI caller pass. Coverage separately
  fills the handle and byte budgets, rejects an oversized source buffer, reuses
  freed capacity, and verifies another guest can still upload. Fixtures respect
  pinned TEX_MAX_DIM=512 and valid texture handle zero.
- This admission covers raw uploadTexture only. IMG/TILESET, fonts, style/cache
  allocations and native mobile resource acceptance remain unfinished; this
  is not evidence of a total native-memory bound.

Guest IMG-entry texture admission:

- uploadImgEntry now uses Mini-owned admission before the pinned core copies or
  decompresses an entry. Source buffers are capped at 4 MiB; valid header
  dimensions/formats estimate decoded pixels plus the 1024-byte T8 palette
  against the shared 256-live-texture / 8 MiB texture budget. The pinned core
  remains responsible for payload and RLE validation.
- Twenty-three Rust tests and the actual C ABI caller pass. A compressed T8
  image is rejected when raw textures fill capacity, succeeds after freeing a
  raw handle, and exposes exactly 16 decoded index bytes plus its palette;
  truncated headers retain the core's -1 result.
- TILESET loading, boot-time assets, fonts and internal style/cache allocations
  still bypass these guest upload entry points. Native integration and total
  process-memory acceptance remain incomplete.

TILESET admission work in progress:

- Added a guest-runtime closure around pinned loadTileTexture with native
  admission using per-key tile dimensions and decoded T8 pixel/palette bytes.
  It retains metadata rather than duplicating pack payloads. Missing keys and
  negative indices return -1; pinned loading still validates directory/payload.
- The new real-pack fixture fills raw texture capacity, observes BUSY for a
  compressed tile, frees capacity and verifies decoded pixels/palette.
- A first implementation retained a QuickJS Function inside a native closure
  and caused shutdown GC assertions; replaced it with a traced JS closure.
- Current full run is NOT green: 23 of 24 Rust tests pass, but
  quotas_and_failures_remain_local now observes the repeating Promise chain
  returning successfully instead of a deadline error. This repeated twice.
  Host Promise rejection/resource failure reporting needs investigation before
  this change is accepted; the C runner is not reached on this failing run.

Promise failure handling and TILESET verification:

- The host now tracks up to 32 outstanding unhandled Promise identities using
  QuickJS's rejection tracker. Same-turn handlers remove pending failures;
  remaining rejections or tracker overflow fail the turn. Failed frames discard
  outgoing effects and cannot resume. No JS values are retained by this tracker.
- Deadline interrupts are latched so a caught interrupt cannot turn an expired
  turn into success; existing thrown errors retain their diagnostic text.
- The previous recursively returned Promise chain emitted null rejection
  reasons and terminated before the deadline. It now fails rather than silently
  succeeding. The deadline fixture separately schedules bounded live jobs
  without recursively returning their Promise chain. No assumption that the
  observed null reasons prove a specific allocation failure is needed.
- Twenty-five Rust tests and the actual C ABI caller pass, including TILESET
  capacity/reclaim, caught vs unhandled rejections, failed-frame effect discard,
  and the repeating-job deadline. This supersedes the preceding failed-run
  status; mobile acceptance and boot/internal allocation limits remain pending.

Boot pack admission before eager image/sprite allocation:

- The host preflights the pinned pack walker before feed_pak copies or loads
  assets. Directory metadata is limited to 4096 entries and 512 KiB of names;
  valid-dimension image/sprite headers are admitted against 256 textures and
  8 MiB of decoded pixels/palettes. Every directory occurrence counts, including
  repeated names or payload offsets, since the surface allocates each upload.
- Twenty-six Rust tests and the C ABI caller pass. A 257-image pack and nine
  1-MiB textures sharing one payload are rejected with zero native texture
  slots allocated; an independent guest remains healthy.
- Fonts, styles, other internal allocations and measured total process memory
  are not covered by this preflight. Malformed payloads with valid dimensions
  may be conservatively charged even when the pinned core would reject them.
  Full mobile and signed-container integration acceptance remains incomplete.

Style parser admission:

- Boot ui:styles entries and guest loadStyles now share pre-parser limits:
  source at most 1 MiB, declared style records at most 4096, and declared
  timelines at most 256 for the pinned magic/version. Guest rejection reports
  BUSY before mutating the current table. Ordinary malformed inputs retain the
  pinned parser's false result.
- Twenty-seven Rust tests and the C ABI caller pass. Tests reject excessive
  declared capacities even in a truncated header, reject oversized source,
  and verify guest error code plus ordinary malformed-input behavior.
- These limits bound input and top-level capacity requests, not a measured
  aggregate native-memory ceiling. Nested style allocation, font admission,
  mobile validation and container integration remain required work.

Font atlas admission:

- Boot font entries and guest loadFontAtlas now reject source buffers above
  2 MiB. Valid v2/v3 atlas headers estimate bitmap plus native CmapEntry storage;
  runtime admission inspects resident font slots and caps retained atlas data
  at 8 MiB, subtracting the replaced slot before checking capacity.
- Boot preflight conservatively sums every valid font entry against 8 MiB
  before the surface loads it, including repeated slot replacements.
- Twenty-eight Rust tests and the C ABI caller pass. The fixture installs seven
  1-MiB bitmap atlases, rejects an eighth without populating its slot, permits
  replacing slot zero, rejects an oversized source, and preserves malformed
  input's false result.
- This accounts for atlas bitmap/cmap data, not streaming font archives, shaping
  caches, transient replacement allocations, total process memory or mobile
  hardware acceptance. Full container integration remains unfinished.

Broader regression validation after resource admission changes:

- The complete tests/check.sh run passes: 25 Bun tests covering dev revisions,
  discovery, SDK/services/lifecycle/launch/navigation, SDK installation, signed
  metadata/payloads, cold activation/rollback, storage and actual build output;
  native iOS storage and service-wire checks also complete successfully.
- Strict SDK TypeScript checking passes. A fresh Android check compiles current
  hello TSX at logical 336x692, density 3, including the real baked font assets.
- The current shared engine also boots retained compiled iOS revision 23 in two
  independent guests for 30 frames each, with identical 1179x2277 pixel output,
  hash 1700473511, and successful independent teardown. Its 28 Rust tests and
  actual C ABI checks pass. This revision is an existing artifact, not the fresh
  Android check's temporary output.
- These are desktop execution/build checks of mobile-target artifacts. They do
  not establish current physical device acceptance or native host integration
  of signed loading, pooled instances, direct GPU draw-list rendering or the
  remaining development/publishing workflow.

Retained-container callback reentry guard:

- All C pool operations now register an owner-thread active-call guard before
  accessing pool state. Same-pool reentry fails without creating a second mutable
  borrow; destroy is guarded through cleanup/retirement and engine teardown.
  Nested calls into different pools remain possible. Reentry does not rewrite
  last_error, and last_error returns NULL while its pool has an active call.
- Actual C callbacks attempt close, background, error lookup and destroy during
  eviction, explicit close and destruction of a live pool. All are rejected;
  outer cleanup/retirement still completes exactly once and later calls work.
- Twenty-eight Rust tests and the C caller pass. The initial eager guard
  construction caused a RefCell panic on rejection and was corrected before
  the successful run. Native host pooled-instance wiring remains unfinished.

Mobile-target release compile/link regression:

- Current shared engine release archives build offline for arm64 Android and
  arm64 iOS Simulator, including rejection tracking, resource admission and
  pool callback guards. Android runtime.c links against the new archive with
  warnings treated as errors, unresolved symbols rejected and 16-KiB ELF pages.
- The iOS archive links as a simulator dylib with fatal linker warnings at
  deployment target 16.0. The first manual cargo invocation omitted the host's
  existing deployment environment and baked QuickJS objects for SDK 26.4;
  rebuilding with IPHONEOS_DEPLOYMENT_TARGET=16.0 removed those warnings.
- These checks prove compile/link compatibility, not native execution or
  physical hardware acceptance. Native pooled/signed-container wiring and
  direct GPU rendering remain unfinished.

Native iOS package verifier implementation:

- Added host/ios/PackageVerifier.swift using CryptoKit Ed25519 and SHA-256,
  host-provisioned raw trusted public keys, exact manifest fields, metadata
  validation, payload/envelope limits, canonical sorted signing body and host
  ABI/target gates. It returns verified metadata for later loader integration.
- Swift type checking passes. A TypeScript-signed fixture is exercised by a
  temporary native Swift executable for signer interoperability and rejection
  of payload tampering, unsupported target and older host ABI.
- This verifier is not yet wired into the iOS build/loader or exposed through
  the container boundary. Android verification, durable native package storage,
  activation integration and broader malformed-envelope parity tests remain.

Repeatable native package verification checks and host build inclusion:

- Generated iOS projects now include PackageVerifier.swift in the app sources.
  The normal host file copy already carries the source; activation still needs
  explicit verification/loader wiring before any signed-package run is trusted.
- tests/package-native.sh generates TypeScript-signed fixtures, compiles the
  actual Swift verifier and runs 11 acceptance/rejection cases. It is included
  in Darwin tests/check.sh runs. Cases cover tampered payload, older ABI,
  unsupported target, wrong trusted key, signed-field mutation, unknown fields,
  boolean ABI, wildcard domain and malformed signature.
- All 11 cases pass. The verifier also type-checks for arm64 iOS Simulator at
  deployment target 16.0. This is execution on macOS plus mobile type checking,
  not proof of device loading, native durable storage or Android verification.

Android signed-envelope verifier implementation:

- Added host/android/PackageVerifier.java with bounded payload/envelope input,
  exact manifest fields and metadata validation, canonical signing body,
  SHA-256, Ed25519 verification against a host-provisioned raw public key, and
  host ABI/target gates. It is included in native Android Java compilation.
- Android API 34 compilation targeting Java 8 passes (normal bootstrap warning).
  No Android execution/interoperability result is claimed yet. The verifier
  depends on the platform JCA Ed25519 provider and fails closed if unavailable;
  older supported Android versions need provider availability validation or a
  bundled implementation before signed loading can be accepted on them.
- Native loader/storage/pool activation wiring, durable trust-key provisioning
  and Android package verification conformance execution remain unfinished.

Android native signature conformance execution:

- Added tests/package-android.sh and NativePackageTest.java to compile the
  actual verifier, dex it, and execute TypeScript-generated fixtures using the
  Android runtime. Temporary device files are removed on exit.
- Android 37 arm64/16-KiB Pixel_2 emulator passes all 11 interoperability and
  rejection cases. Its Ed25519 provider is present. An initial valid-signature
  rejection exposed JSONObject.quote slash escaping; canonical string emission
  now matches the TypeScript signer's unescaped slashes and the rerun passes.
- No physical Android device was connected. This establishes emulator native
  signature behavior only; older-version provider availability, native package
  storage/activation and host trust provisioning remain unfinished. The owned
  emulator was stopped after testing.

Shared native package structural selection:

- Added mp_package_select with a version-sized C output structure. It uses the
  pinned zero-copy PocketJS package reader with footer verification, target and
  ABI 7 selection, checks embedded identity against verified envelope identity,
  validates UTF-8 JS and returns borrowed JS/assets/build-plan slices. JS omits
  its required trailing NUL; errors clear stale output pointers.
- This API deliberately performs structural admission only. Hosts must verify
  the full payload signature first and admit the returned build plan before
  activating code. It is not yet wired into native loader/activation flows.
- Twenty-eight Rust tests and the C caller pass. A temporary C integration
  executable selects the existing real hello.pocket artifact and verifies
  nonempty code/assets/plan, wrong identity/target rejection and footer tamper
  rejection. Repeatable package-selection fixture coverage remains to add.

Repeatable shared package-selection boundary tests:

- Added deterministic native package fixtures for both mobile targets. Tests
  call the exported selection boundary and verify borrowed code without NUL,
  plan/assets, identity mismatch rejection and clearing of all returned slices.
- Malformed coverage rejects every truncation of a valid fixture, missing target,
  unsupported embedded ABI, unterminated JavaScript, hostile section offset
  with an otherwise valid recomputed footer, and invalid null input.
- Thirty Rust tests and the actual C ABI caller pass. Structural checks still
  do not authenticate publishers or admit plan capabilities/viewport; native
  verification-to-activation integration remains unfinished.

iOS authenticated package ownership boundary:

- Added an Objective-C-callable Swift verifier and MiniVerifiedPackage. Its
  initializer copies mutable caller data before authentication, verifies the
  full payload with the provisioned key, then selects mobile engine inputs
  using verified envelope identity. The object owns bytes for borrowed slices.
- Generated iOS app projects include the new Objective-C package component.
  Swift bridge generation and Objective-C syntax checks pass; the repeatable
  11-case native verifier suite still passes after exposing the bridge.
- This component is not yet called by activation. Returned build-plan admission,
  durable installation, native pool wiring and execution of the combined
  Objective-C verification/selection path remain to implement and verify.

Combined iOS authentication-to-engine execution test:

- Added repeatable TypeScript-generated real .pocket fixtures and an Objective-C
  integration runner linked with the actual Swift verifier and shared engine.
  A verified fixture selects code and boots/frames a guest returning "verified".
- After verification the runner overwrites caller-owned NSMutableData; selected
  code remains intact because MiniVerifiedPackage owns its frozen copy.
- Signed identity mismatch, payload tampering, and a cryptographically valid
  signature over a structurally invalid package are rejected with errors.
  tests/package-load-ios.sh passes on macOS; temporary files are removed.
- This fixture intentionally uses a placeholder build plan. Actual native
  activation must still admit real plan identity/version/viewport/capabilities,
  integrate durable package storage and retained pools, and pass device tests.

iOS verified build-plan identity/viewport admission:

- MiniVerifiedPackage now parses its selected plan, matches app identity/version
  against authenticated envelope metadata, requires iOS target/ABI 7, and admits
  integer logical dimensions 1..1024 with density 1..4, consistent physical
  dimensions and at most 16 MiB of framebuffer bytes. Boolean dimensions are
  rejected. It exposes an admitted shared-engine configuration.
- The combined execution fixture now boots using that configuration. Additional
  cryptographically valid packages with wrong plan version, inconsistent pixel
  dimensions and boolean density are rejected. The integration test passes.
- Capability/modality/profile admission, durable native installation, actual
  host activation and Android equivalent plan checks remain unfinished. This
  is identity/viewport admission, not complete native build-plan validation.

iOS host feature/presentation admission:

- Verified-package plans now require native/fixed presentation, takeover form,
  no companion channels, and a feature dictionary containing boolean values.
  Enabled capabilities are limited to input.touch and text.glyphs.baked, matching
  bin/profile.ts. Unsupported enabled capabilities fail before engine boot.
- Signed fixture tests now reject unsupported net.http, numeric feature flags,
  companions and stretch presentation; the valid fixture still boots using its
  admitted configuration. The combined native integration runner passes.
- Full modality details, plan-hash/profile consistency, runtime viewport matching,
  native permission/domain enforcement and Android plan parity remain incomplete.
  Durable installation and native activation/pool wiring remain required.

iOS screen/input modality admission and real artifact integration:

- Verified plans require one primary touch screen matching logical viewport,
  fixed screen size, declared portrait/landscape orientation, primary touch,
  no pointer, no buttons and numeric zero analog axes. Boolean stand-ins for
  numeric/boolean declarations are distinguished before activation.
- Signed malformed fixtures reject missing screens, mismatched screen geometry,
  mouse input, buttons and boolean analog. The integration fixture suite passes.
- The runner supports PJM_PACKAGE_REAL. Using existing hello.pocket it signs,
  verifies, selects, admits the real compiled plan, preserves owned bytes after
  caller mutation, and boots/frames the actual TSX bundle successfully on macOS.
- Text modality/OSK availability, plan-hash/profile consistency, runtime viewport
  matching, durable native installation and actual device activation remain
  incomplete. No device acceptance is inferred from this execution.

iOS verified-package retained activation boundary:

- MiniVerifiedPackage can activate its admitted configuration and borrowed
  inputs in the shared owner-thread pool, with bounded launch data and native
  error propagation. Verification and plan admission precede this operation.
- Combined native tests exercise signed fixture and existing compiled hello
  activation, background/revisit with stable completion generation, one launch
  callback, preserved frame counter, and oversized launch rejection without
  stopping the retained guest. The integration runner passes on macOS.
- The actual iOS presentation/controller still uses the single-instance dev
  path. Durable installation, policy/resource ownership across retained app
  generations, GPU retirement wiring and real-device pool acceptance remain
  unfinished; this method alone does not complete the native container.

iOS selected-plan hash verification:

- The native Swift bridge verifies the selected plan's sha256-prefixed hash
  over sorted canonical JSON with planHash removed, matching the inspected
  pinned compiler's hashBuildPlanContent contract. Admission checks it before
  producing an engine configuration or entering the retained pool.
- Signed fixtures reject malformed and correctly formatted incorrect plan
  hashes. Other incompatible plans carry freshly recomputed hashes so those
  tests continue to exercise their specific admission checks.
- The existing real compiled hello plan passes native hashing and retained
  activation in the integration runner. Broader canonical numeric/Unicode
  conformance, text/profile/viewport admission, native installation and device
  container execution remain incomplete.

iOS authenticated native service policy gates:

- MiniVerifiedPackage now exposes native URL admission restricted to HTTPS,
  exact authenticated DNS domains and port 443, with credentials rejected;
  host callers must reapply it on each redirect. Permission admission requires
  both authenticated app declaration and explicit host/OS approval.
- Native integration tests accept declared HTTPS (including case-normalized
  DNS/explicit 443), reject HTTP, undeclared/sub/suffix domains, another port,
  credentials and file URLs, and distinguish undeclared vs denied permission.
  The signed fixture and real TSX retained-activation runner pass.
- These policy methods do not perform network I/O or permission prompting.
  Actual native service-handler wiring, redirect transport tests, retained
  generation-policy ownership and Android equivalent gates remain unfinished.

Android authenticated service policy:

- Signature verification can now produce a policy containing immutable domain
  and permission sets copied from verified metadata. URL admission requires
  HTTPS, exact case-normalized DNS host, port 443 and no userinfo; permission
  admission requires declaration plus host/OS grant. No I/O is performed.
- Android 37 native emulator execution passes the 11 signature cases plus URL
  allow/deny and permission tests matching the iOS checks. Temporary files are
  removed, and the owned emulator is stopped with terminal process evidence.
- Actual transports must call the URL gate on each redirect. Service-handler
  integration, URL normalization parity (including IDNA), older crypto provider
  support, native install/activation and device acceptance remain unfinished.

Generated iOS app build with package components:

- Rebuilt the current arm64 simulator shared-engine release archive at iOS 16
  deployment target, generated a fresh native project from current host sources,
  and built its Mini app with Xcode SDK 26.4 for generic arm64 Simulator.
- Xcode reports BUILD SUCCEEDED. The generated source phase includes Swift
  PackageVerifier and Objective-C VerifiedPackage alongside presentation,
  storage and controller sources, confirming generated bridge and app linkage.
- This was a build without simulator launch/installation. It does not establish
  controller invocation of signed package activation, native installation or
  physical device acceptance; those requirements remain unfinished.

iOS retained package/policy ownership:

- Added a main-thread MiniVerifiedContainer owning a three-entry shared pool
  and verified-package registry keyed by completion generation. Warm activation
  uses the already bound package rather than replacing its admitted policy.
  Retirement removes the generation binding; stale identity/generation lookup
  returns nil. Shutdown is idempotent and release requires the main thread.
- Integration tests activate, check correct/stale generation lookup, reactivate
  using a newly verified object while retaining the original binding, close and
  verify policy removal, then shut down twice. The runner passes on macOS.
- Included the component in generated iOS source phases. Its actual UIKit
  surface/controller wiring, cleanup storage dispatch, GPU retirement, durable
  package installation and mobile execution acceptance remain unfinished.

iOS retained cleanup/retirement package routing:

- MiniVerifiedContainer registers shared-pool cleanup and retirement callbacks.
  They resolve the original verified package from identity/generation without
  reentering the pool. Cleanup records are copied into NSData before delivery;
  retirement handlers run while the package binding exists, before engine
  release, then the generation policy binding is removed.
- Native integration tests verify unload cleanup uses the original package even
  after activation with a fresh verified object, retirement follows cleanup and
  occurs once, and stale lookup fails after close. Fixture and real hello TSX
  integration runs both pass on macOS.
- Callbacks provide the integration boundary; actual isolated storage handlers
  and Metal fence/resource retirement are not wired yet. Durable installation,
  UIKit controller activation and device acceptance remain incomplete.

iOS retained cleanup storage dispatch:

- Container activation binds a MiniAppStorage provider to the verified app ID
  and completion generation before retaining the package. Retirement releases
  that provider after cleanup. A configurable host storage root supports tests.
- Final bounded storage request records are validated and dispatched
  synchronously through the retiring generation's provider before external
  cleanup/GPU callbacks. Errors remain visible through lastCleanupError;
  no additional frame runs to settle retired guest promises.
- The native integration fixture emits storage.set.v1 during unload, closes the
  retained guest, opens a fresh provider and reads the committed value. The
  test passes using isolated temporary storage with no cleanup error.
- Normal retained service dispatch, actual controller/Metal integration, native
  package installation and device container acceptance remain unfinished.

iOS retained normal storage/completion dispatch:

- Container storage requests now validate bounded versioned records, route via
  the verified identity/generation storage provider and encode success/error
  replies for the same retained guest. A bounded completion posting method
  rejects stale targets before calling the shared generation-checked mailbox.
- Native fixture tests dispatch storage while the guest is backgrounded, resume
  and observe its correlated reply at a frame boundary, then reject a stale
  generation. Existing unload persistence and retained activation tests pass.
- The UIKit service pump does not invoke these container methods yet. Native
  device integration, other services/async cancellation, durable packages and
  Android container parity remain incomplete.

### Retained iOS container frame/service boundary
- Added main-thread container frame/input/render/effect draining and lifecycle
  methods. Active identity/generation follow successful activation and clear on
  retirement. Frame pixels retain the shared ABI's borrowed lifetime contract.
- The frame pump consumes storage requests through the admitted package's
  generation-bound provider and queues correlated replies for the next guest
  frame. Other effects return as copied records for host dispatch.
- Combined native tests passed with the signed fixtures and existing compiled
  Hello package. Tests cover actual framebuffer output, storage request/reply
  across successive frames, background/resume, memory warning and close.
- UIKit remains on the development single-instance path; connecting the signed
  container to its presenter, GPU fencing and input hit testing remains required.
  Android parity, durable installation and full P0–P4 acceptance remain open.

### Signed-container UIKit/Metal adapter (simulator verified)
- PocketSurfaceView now has an admitted-package initializer and warm activation
  API backed by its three-guest MiniVerifiedContainer. Signed mode uses pool
  input/hit testing, frame/render/storage pumping and background/resume/pressure.
- External service effects carry the original verified package and generation;
  asynchronous replies must explicitly target that identity/generation. Final
  unload effects have a separate synchronous callback (no container reentry).
- Presenter submissions finish before package activation, retirement and final
  container release. Switching updates logical dimensions from the retained
  admitted package and discards prior host contacts.
- A simulator integration test initially missed unload cleanup when shutdown
  ran inside the frame callback. Moving the two 128 KiB native service buffers
  from automatic stack arrays into reusable bounded data buffers fixed this
  failure without increasing the guest stack limit.
- tests/package-surface-ios.sh rebuilt the current release shared engine and
  UIKit app, installed its temporary test app on the already booted iPhone 17
  Pro/iOS 26.4 simulator, rendered four frames (hash 3724634853), verified one
  launch across warm activation and observed final unload/storage records.
  It uninstalled only its test app and preserved simulator boot state. Evidence:
  build/ios-validation/signed-surface-20261004T024116Z.
- Combined package/container native tests also passed after the buffer change.
- The shipping development controller still loads unsigned dev bundles. Native
  signed installation/trust provisioning and controller navigation are pending;
  simulator tests do not establish physical performance, multi-package surface
  eviction, Android parity or full P0–P4 acceptance.

### Native iOS durable signed package cache
- Added MiniPackageStore, using the host-provided raw trusted key and the full
  native package/signature/build-plan admission path before staging. Cached
  packages are reverified at every cold open. Guest-held package snapshots are
  independent of later installation and state changes.
- Descriptor-relative filesystem operations reject symlinks for root ancestors,
  application/slot directories, payloads, envelopes and state. Bounded regular
  file reads, exclusive temporary files, fsync/rename state commits and a
  nonblocking host-store lock protect installation and concurrent access.
- Pending updates promote only at coldStart. Current and previous slots remain
  for deferred rollback; pruning retains only current/previous/pending slots.
  Existing payload slots reject different signed metadata instead of silently
  replacing a retained policy. Crash-left temporary directories and cumulative
  cache quota/recovery are still pending.
- PocketSurfaceView can open an installed identity and warm-switch installed
  identities. A retained generation uses its originally admitted package, so
  warm switching does not promote pending updates.
- Native tests passed: stage/reopen, update promotion, independent snapshots,
  deferred rollback, invalid signed candidates leaving an empty cache,
  payload tamper, wrong trusted key, payload/root/state symlinks, malformed
  slot references and lock contention. The compiled Hello package also passed
  the combined native package/container suite.
- UIKit/Metal simulator test passed installed version 1 plus a staged version 2,
  preserved version 1 on warm activation and selected version 2 after shutdown
  on cold open. Evidence: build/ios-validation/signed-surface-20261004T024745Z.
- Network distribution, host trust provisioning, release controller entry and
  Android store/container parity remain required, alongside other P0–P4 gaps.

### Signed-only iOS controller and app entry
- Added MiniInstalledController for store-backed signed guests, safe-area layout,
  retained identity switching, bounded generation-targeted service responses
  (device info/cancel/unsupported), and orderly shutdown. Controller disappearance
  freezes its guest; app foreground notifications do not revive hidden views.
- Real display-link simulator testing exposed a zero-size initial surface. The
  controller now establishes geometry immediately and updates it on appearance,
  layout and safe-area changes. The corrected test rendered four frames with
  hash 1644551685, preserved one launch across warm activation, froze while
  covered and resumed after uncovering, then completed unload cleanup and cold
  update promotion. Evidence: signed-surface-20261004T025951Z.
- Generated hosts have an explicit compile-time installed/development mode.
  Installed main entry seeds a separately trusted bundled package into the
  private store, cold-opens its identity and displays a simple failure message
  if admission fails. It contains no development controller or URL override.
  Atomic seed-if-empty never overwrites a current or pending downloaded update.
- bin/installed-project.ts exports a signed-only native project from bounded
  package/envelope/raw public-key files, validates signature before creating the
  output, bundles exactly those release resources and disables development
  local-network allowances. Native boot still performs structural/plan admission.
- Actual full app-entry simulator UI test passed initial launch and relaunch with
  an untrusted --pjm-url argument. Built installed binary also lacked the dev
  URL override/startup/receipt strings. Evidence:
  build/ios-validation/installed-entry-20261004T030115Z/Tests.xcresult.
- Installed-project export test passed; native package/store suite passed with
  seed protection. Broader test checks are recorded in the current turn output.
- Distribution transport, CLI integration of native release export, automatic
  cold rehydration after pressure, Android parity, full native services and the
  remaining P0–P4 acceptance requirements remain open.
- Final broader regression used the existing SHA-verified pinned upstream
  checkout after the restricted run could not resolve GitHub. The retried
  tests/check.sh completed with 26 passing Bun tests, no failures, native iOS
  storage checks and 11 native signature interoperability/rejection cases.
  The final signed-only app rebuild also succeeded after protocol name gating.
  Logs are preserved under the installed-entry evidence folder's regression/.

### Public signed-only iOS host export command
- Added pjm export-ios --package DIR --public-key RAW_KEY --output NEW_DIR,
  with --target simulator|device (device default) and optional --bundle ID.
  It verifies the signed payload before native build/output mutation, installs
  the selected Rust target when missing, builds the release shared engine and
  emits the installed-only Xcode project. Existing output folders are rejected.
- Export includes its engine archive, native sources, signed package/envelope
  and separate raw publisher public key. Xcode source/header/archive references
  are relative to the project, so an export can move independently of workspace
  compiler caches. Installed projects use a Release configuration and an
  archive-enabled scheme; development projects retain Debug configuration.
- Actual CLI simulator export succeeded. Moving the generated project to a new
  directory and building it through Xcode succeeded. Two exporter/public CLI
  tests pass (22 assertions), including tamper rejection, invalid/duplicate
  options, bundled archive/resources and preserving an existing output folder.
- Installed-only Release simulator app-entry UI test passed launch/relaunch and
  ignored development URL override. Evidence:
  build/ios-validation/installed-entry-20261004T031226Z/Tests.xcresult; relocated
  build log preserved in its export/ folder. No physical signing, archive
  distribution or hardware performance acceptance is claimed.
- Network distribution, publisher trust rotation, cache crash recovery/quota,
  pressure rehydration, Android parity, services/devtools and other P0–P4
  acceptance work remain open. Goal scope is unchanged.

### Android authenticated structural package bridge
- Added VerifiedPackage: snapshots caller inputs, authenticates the entire
  payload with host-provided trust, invokes private native structural selection,
  verifies the selected plan hash and admits Android ABI/identity, logical and
  physical viewport, framebuffer budget, supported features/screens/modality.
  Guest source/assets returned to callers are independent copied arrays.
- Added package_bridge.c JNI wrapper over shared mp_package_select for Android
  target 2. It bounds inputs, copies selected slices into Java-owned arrays and
  releases the temporary native payload; no borrowed engine pointers escape.
  The normal Android host build now compiles/links the bridge and package class.
- Shared fixture generation can emit either pinned mobile target. Android plan
  admission exposed missing boolean canonicalization; canonical serialization
  now supports boolean/null and normal numeric plan values instead of truncating
  every number to a long. Full edge-case Unicode/numeric canonical parity is
  still unproven; JCA Ed25519 compatibility on older supported Android is open.
- Actual NDK Rust/JNI build and API 37 Pixel_2 emulator execution passed 18 signed
  admission/rejection cases, caller mutation independence and policy checks.
  Existing Android signature/policy regression passed 11 cases. iOS combined
  package/store/container tests also passed after fixture sharing.
- Temporary emulator was originally stopped; its owned session was confirmed
  terminated after tests. Remote test files were cleaned. Evidence:
  build/android-validation/authenticated-package-load-20261004/.
- Android retained pool/JNI lifecycle/render/GPU integration, durable store and
  signed controller remain required. This verifies admission/selection, not
  Android signed container execution or full P0–P4 acceptance.

### Android authenticated retained execution through JNI
- Added VerifiedContainer and pool_bridge.c over the shared three-instance pool:
  owner-thread activation/input/frame/effect draining, generation-addressed
  completions, background/resume, pressure, identity close and final destroy.
  Java frame pixels/damage are copied; native borrowed pointers never escape.
- Original admitted package/policy stays bound on warm activation. Synchronous
  cleanup/retirement callbacks preserve identity/generation and reject container
  reentry. JNI captures callback exceptions, completes engine retirement and
  forwards the first exception at the operation boundary. A successfully
  committed candidate retains its policy even if prior guest cleanup throws.
- Normal Android build now includes the pool bridge and container class. Native
  bridge compiles with warnings as errors; Java API 34 compilation succeeds.
- API 37 emulator tests pass actual signed guest boot/frame, launch-once warm
  state, background completion delivery, copied framebuffer dimensions/damage,
  wrong-thread and stale completion rejection, original policy binding,
  callback reentry rejection, four isolated authenticated guests, three-slot
  LRU eviction, background pressure eviction and final cleanup/retirement.
  A thrown cleanup callback was also tested across successful activation;
  remaining guests executed and all four policy bindings retired correctly.
- Signed admission suite remains 18 cases; iOS package/store/container suite
  passes after adding shared peer fixtures. Evidence:
  build/android-validation/retained-jni-20261004/.
- The existing Android Activity/GLES presenter still uses the development
  single-instance path. Signed pool/presenter/input wiring, automatic isolated
  storage dispatch, durable packages, old-platform crypto and full acceptance
  remain required. No Android signed UI/GPU or physical performance claim.

### Android retained storage dispatch and presentation adapter

- VerifiedContainer now owns an AppStorage binding per admitted generation. Warm
  activation preserves the original binding; storage requests are dispatched
  automatically, targeted completions reject stale generations, and retirement
  storage records are consumed before the binding is removed. Cleanup failures
  remain observable without preventing native retirement.
- Android API 37 native execution passed 18 authenticated admission cases plus
  automatic get/set completion, cleanup persistence, peer identity isolation,
  warm retention, LRU eviction, pressure and throwing cleanup callback checks.
  The shared guest fixture now processes each incoming completion separately.
  iOS package/store/container regression passed with that updated fixture.
- Added a bounded GLES2 copied-frame presenter with BGRA shader swizzle, texture
  recreation on context loss and explicit GPU completion before teardown. It
  compiles against API 34; signed Activity integration and on-screen validation
  are still pending. It uploads software frames, so direct draw-list GPU
  rendering remains incomplete. Durable Android package storage, old-platform
  signature support and all remaining P0–P4 acceptance work are still required.

### Android signed Activity, presentation and touch integration

- InstalledActivity authenticates whole bundled payload/envelope against its
  bundled publisher key before native admission. Development URL intents are
  unused. The retained container and GLES presenter share the GL owner thread;
  Activity pause/resume, memory pressure and teardown route to pool lifecycle.
  Teardown completes GPU work before native retirement and releases GL objects.
- Added bounded initial-hit JNI access and eight-contact Android sampling with
  latched hit identities, short-lived taps, cancellation and logical coordinate
  mapping. Frames fit their fixed aspect ratio inside the inset surface.
- tests/package-surface-android.sh builds a unique temporary APK, uses separately
  signed visual fixture bytes, and asserts screenshot centers red before touch,
  blue after touch, blue after background/resume, and red after close/cold start.
  Final API 37 emulator run passed, with screenshot/UI/runtime evidence in
  build/android-validation/signed-surface-20261004T135908Z. Test app removed.
- Android authenticated admission/pool/storage regression passed 18 cases and
  iOS package/store/container regression passed after shared fixture changes.
  This is emulator integration evidence, not physical performance acceptance.
  Durable Android installation/update/export, full services, older signature
  compatibility, direct GPU draw lists and other P0–P4 requirements remain.

### Android durable authenticated cache and installed cold loading

- PackageStore authenticates complete payload, envelope and admitted plan before
  staging. Package slots are immutable version/SHA identities. Fsynced temporary
  files and atomic renames commit slot files and bounded current/previous/pending
  state under an exclusive host lock. Pending versions apply at coldStart;
  rollback schedules the previously admitted slot. Every cold load reauthenticates
  installed bytes using the host's copied publisher key.
- Host seeding preserves current/pending downloaded packages. InstalledActivity
  now seeds and cold-loads through this store, resolving the platform-provided
  files-directory alias before creating the private package root.
- Successful stage/cold commits prune unreferenced known slots and abandoned
  install/write temporaries. Cleanup failures remain inspectable; referenced
  current/previous/pending slots remain intact. Unknown entries are not removed.
- Native Android store tests passed durable update/reopen, cold promotion,
  running snapshot preservation, seed preservation, rollback, invalid signature,
  disk tamper, wrong key, malformed/path-traversal state, owner thread, lock,
  root/payload symlink rejection and crash/stale cleanup checks. Existing native
  package/pool/storage 18-case regression passed.
- Final installed Activity pixel checks passed with the durable cache: red initial
  guest, blue after touch, blue after background/resume, red after close/cold
  relaunch. Evidence: build/android-validation/signed-surface-20261004T140830Z.
  Temporary app removed; owned emulator stopped after testing.
- Android store currently combines canonical parent checks with O_NOFOLLOW for
  files and directory fsync. Unlike iOS's FD-relative traversal, this does not yet
  prove resistance to concurrent parent-directory replacement. FD-relative
  hardening, global cache quotas, release export, old Android crypto compatibility
  and all remaining P0–P4 acceptance work are required. No physical performance
  or complete security acceptance is claimed.

### Android native directory-relative package file bridge

- PackageFiles/store_bridge.c now implement no-follow FD traversal for directory
  creation, bounded regular-file reads, fsynced atomic writes, directory rename,
  cleanup unlink, directory sync and nonblocking exclusive store locking.
  PackageStore uses these operations instead of path-based file mutation.
- Traversal uses O_PATH search handles for protected Android ancestors, then
  opens the pinned private directory for readable/fsync operations. Each final
  file operation uses openat/renameat/unlinkat on held parent descriptors. Native
  path inputs reject NUL, relative paths and dot traversal, with bounded paths
  and file buffers. No publisher paths enter guest APIs.
- Store regression includes 400 parent directory/symlink replacements during
  native reads/writes, verifies outside sentinel data remains unchanged and
  rejects directory creation through a replaced symlink. Signature/update,
  rollback, cache cleanup, owner and native flock checks also passed together
  with the existing 18-case admission/pool/storage regression on API 37.
- The real signed Activity passed initial red, touch blue, retained resume blue
  and fresh cold-launch red screenshot assertions with the native bridge under
  app permissions. Final evidence: signed-surface-20261004T141957Z. Temporary
  app removed and owned emulator stopped after validation.
- This supersedes the package store's prior path-based mutation limitation.
  Directory enumeration still uses Java File metadata; mutation/read primitives
  refuse symlink parent traversal. AppStorage's own older path-based operations,
  global cache/resource accounting, older Android signature support, release
  export and remaining P0–P4 acceptance work require further implementation.
  These targeted tests do not establish complete security or hardware acceptance.

### Android isolated app-data storage native file migration

- AppStorage now uses PackageFiles for no-follow directory creation, bounded
  regular-file reads, atomic fsynced JSON snapshot replacement and cleanup.
  Native per-app flock uses the persistent .storage-lock inode; package-store
  locking continues to use .package-lock. Neither lock inode is unlinked during
  normal operation. Native cleanup now syncs successful directory mutations.
- Existing AtomicFile storage.json and legacy .bak snapshots remain readable.
  A validated legacy backup is restored atomically; malformed/oversized backups
  fail without replacing the base snapshot. Abandoned .new and recognized UUID
  .write temporaries are removed safely. Corrupt base snapshots fail closed.
- Native Android storage tests passed competing providers, busy isolation,
  guest key-as-data behavior, cross-app isolation, quotas, corruption, lock
  symlinks, legacy backup migration and abandoned-file cleanup. iOS storage
  regression passed. Tests use a unique native test library/temp directory and
  clean remote files, without depending on an existing development APK.
- Android signed package/cache/directory-race and retained engine regression
  passed 18 admission cases with automatic storage and cleanup writes. Real
  installed signed Activity passed initial/touch/resume/cold pixel assertions
  under app permissions. Final evidence: signed-surface-20261004T154744Z.
- Project tests/check.sh passed with the pinned local upstream, including native
  service wire, iOS storage/signatures, SDK, build/dev and installed-export tests.
  This change addresses app-data path mutation through replaced parent symlinks;
  it does not establish complete security/resource acceptance. Global budgets,
  JSON canonical/depth parity, old Android crypto, Android release export,
  direct GPU draw lists and broader P0–P4 evidence remain required.

### Android signed-only release export and portable APK build

- pjm export-android verifies bounded whole-package input, signed Android ABI 7
  target and separately supplied raw publisher key before output/build work.
  Invalid/duplicate flags and existing output directories are rejected. Native
  release export builds the shared arm64 Rust engine and only authenticated
  package/pool/file JNI bridges, with 16 KiB library page alignment.
- The new portable project contains eight signed host Java classes, three public
  package/trust assets, Android manifest, prebuilt libpocketjs.so and build-apk.sh.
  Development Activity/runtime sources are excluded. Manifest disables debugging,
  cleartext traffic and backup. APK build uses relative project paths, SDK platform
  34, build-tools 35.0.0 and JDK 17, with private temporary build files.
- Distribution signing remains explicit outside export. No APK signing key,
  installation, or publication is created by the export command. APK keystore
  signing and publisher package signing remain separate trust layers.
- Android project generation/CLI rejection tests passed alongside existing iOS
  export regressions: four tests, 42 assertions. tests/check.sh includes the two
  new Android tests; the full suite was not rerun in this turn.
- Actual CLI exported a host, its folder was moved with spaces in its path, and
  the exported script built an unsigned APK. Test-only signing verified; ZIP
  16 KiB alignment passed; a unique temporary app launched the authenticated red
  guest despite a development URL override. App was uninstalled and emulator
  stopped. Evidence/unsigned APK: exported-host-20261004T155618Z.
- Android API 37 is the current emulator evidence. The generated manifest's API
  26 minimum is not proof of old signature-provider compatibility. Store submission
  target requirements, old Android crypto, global resource/cache quotas, complete
  native services, direct GPU draw-list rendering, devtools/publish/replay and
  remaining physical P0–P4 acceptance evidence still require work.

### Bundled native Android Ed25519 verification

- Pinned ed25519-dalek 2.2.0 and its resolved dependency graph in core-ffi.
  Added host-only mp_ed25519_verify: exact 32-byte key/64-byte signature, bounded
  64 KiB canonical message, strict verification, checked pointers/lengths and
  panic containment. JNI copies bounded inputs and has no guest callbacks.
- Android PackageVerifier now uses this bundled verifier for publisher
  signatures; JCA Ed25519/KeyFactory are no longer part of signature admission.
  Host trust, whole-payload SHA-256, exact envelope schema, canonical metadata,
  ABI/target checks and native plan admission remain enforced.
- Standard empty-message Ed25519 vector, changed message/signature, weak key,
  noncanonical scalar and invalid input boundaries passed. Shared Rust regression
  passed 31 tests and the real C ABI caller passed. Initial vector fixture had an
  extra byte; it was corrected before the passing run.
- Android signature fixture runner removes every registered Ed25519 provider
  and asserts JCA Signature.getInstance fails. Native verification then passed
  all 11 interoperability/rejection cases. Existing Android package/cache/race/
  storage/pool regression passed 18 admission cases.
- Actual portable export rebuilt and launched a signed-only red guest with the
  new native verifier. Evidence: exported-host-20261004T160513Z. iOS package/store/
  retained-engine regression and four export tests (42 assertions) passed.
  Temporary app was removed; owned emulator stopped after tests.
- This removes the Android Ed25519 provider dependency. Runtime compatibility
  and performance on older Android devices remain unverified; current Android
  evidence is API 37. Full security/canonical parity, global resource budgets,
  native services, direct GPU drawing, devtools/publish/replay and other physical
  P0–P4 acceptance requirements remain incomplete.
- References for verification behavior and test vector:
  https://docs.rs/ed25519-dalek/2.2.0/ed25519_dalek/struct.VerifyingKey.html
  https://www.rfc-editor.org/rfc/rfc8032.txt

### Android strict bounded JSON gate

- Added BoundedJson syntax/UTF-8 validation before Android JSONObject parsing.
  Requires one complete object; rejects decoded duplicate keys, JSON extensions,
  malformed UTF-8, control characters, unpaired surrogate escapes, nonfinite
  numbers and trailing input. Limits: depth 32, 262144 syntax tokens, numeric
  literals 128 characters, plus each caller's existing byte budget.
- Covers signed envelopes/plans, live and retiring storage records, installed
  and development service dispatch, package cache state/metadata, and persisted
  or legacy-recovered app data. Android build/export/test paths include the class.
- Native hostile-input and valid Unicode tests passed alongside Android/iOS
  storage migration, isolation, quota, locking and corruption regressions.
  Signed package/cache/race/container regression passed 18 cases, including
  duplicate-key envelope rejection and proof that ambiguous requests cannot
  mutate storage. Four export tests passed with 42 assertions.
- Final portable export, moved APK build and installed red-frame pixel assertion
  passed. Evidence/unsigned APK: exported-host-20261004T161830Z. Temporary app
  removed and owned emulator stopped after testing.
- iOS/JS strictness/depth parity, shortest canonical number formatting, global
  resource/cache accounting, full services, direct GPU drawing, devtools/publish/
  replay and physical acceptance remain incomplete. Not full security acceptance.

### Installed iOS device-info contract

- InstalledController now includes all four logical safe-area fields in
  device.info.v1. They are zero because the fixed guest viewport is fitted inside
  the UIKit safe surface. The SDK validates platform/model, bounded integer
  viewport/density, finite nonnegative safe areas and opposing inset sums, then
  returns a frozen snapshot. Invalid or incomplete replies reject with PROTOCOL;
  request cancellation retains the existing runtime handle.
- Actual signed iOS guest received the controller's reply on the next frame and
  asserted its complete contract. The same test passed warm retention, modal
  hide/resume, cold update promotion and shutdown checks. Evidence:
  build/ios-validation/signed-surface-20261004T162338Z. Temporary test app removed;
  the originally booted simulator remained booted.
- SDK targeted regression: 12 tests passed. Full tests/check.sh completed with
  30 Bun tests, zero failures, native iOS storage checks and 11 iOS signature
  interoperability/rejection cases. Log: /private/tmp/pjm-device-info-full-check.log.
- Full native services and generation-aware asynchronous cancellation, direct
  GPU drawing, canonical JSON parity, global resource/cache budgets, tooling and
  remaining physical P0–P4 acceptance evidence are still required. Goal active.

### SDK asynchronous cleanup prerequisites

- Frame deadline expiry and SDK disposal now send cancel.v1 with the original
  request ID, matching explicit cancellation. Completed requests receive no
  cancellation; repeated disposal/cancel does not resend. Disposal clears local
  state before delivery, and a failed cancellation send cannot prevent remaining
  promises from closing. Native retirement cleanup remains mandatory because
  cancellation delivery is best effort under mailbox pressure.
- Targeted runtime/connector tests passed 13 cases, including timeout, successful
  completion, failed cleanup transport, idempotent teardown, late replies and
  stable request IDs across reconnection. Existing installed hosts still only
  acknowledge cancel.v1; native asynchronous task providers and generation-bound
  cancellation are the next required work, not implemented by this SDK change.

### iOS surface service retirement boundary

- PocketSurfaceView now exposes onVerifiedRetirement, forwarding the existing
  container retirement callback after its GPU fence. It carries the original
  authenticated package and generation, runs synchronously on the main owner,
  and follows unload cleanup before engine release. Service providers must not
  reenter the container from this callback. Unlike cleanup records, retirement
  also occurs for guests that emit no unload effects.
- Actual signed simulator test asserted cleanup-before-retirement, exact
  originating package/generation, no retirement on warm reopen, and exactly one
  retirement across repeated shutdown. Existing device reply, modal freeze/
  resume and cold update assertions passed. Evidence:
  build/ios-validation/signed-surface-20261004T163511Z. Test app removed; originally
  booted simulator left booted. This adds the provider cleanup boundary; native
  asynchronous networking and other service providers remain to be implemented.

### Installed iOS bounded inline HTTP provider

- InstalledController now dispatches request.v1 with url, optional method,
  headers and canonical bodyBase64. Allowed methods are GET/HEAD/POST/PUT/PATCH/
  DELETE; GET/HEAD cannot carry a body. Validates unknown arguments, URL <=2048
  UTF-8 bytes, <=16 headers/1024 aggregate bytes and forbidden transport headers.
  Canonical base64 bodies decode to <=1536 bytes. Success returns HTTP status and
  base64 bytes; content-length and streamed body both enforce the response limit.
- Applies original authenticated package policy before I/O and on every
  redirect, maximum five. Redirect requests remove Authorization/Cookie.
  Each task owns an ephemeral session without cache, cookie/credential stores,
  15-second request/resource timeout and main-queue delegates. Ownership is
  generation/request-ID scoped; four pending tasks per guest, eight per owner.
  Cancellation removes the exact task; retirement cancels the generation even
  without cancel delivery. Completion posts to the original identity/generation
  through the surface mailbox for frame delivery. Shutdown releases all tasks.
- Signed simulator test uses a deterministic NSURLProtocol transport for success,
  unknown-domain denial before I/O, streamed overflow, concurrency BUSY, explicit
  cancellation and pending-task retirement. Direct delegate calls additionally
  verify allowed redirect sanitization and denied redirect completion. Guest
  receipts passed five response assertions, along with warm retention/modal
  freeze/resume/device contract/cold update/shutdown. Evidence:
  build/ios-validation/signed-surface-20261004T164325Z. Test app removed; originally
  booted simulator left booted. Four export regressions passed, 42 assertions.
  Initial export test invocation lacked Bun in child PATH; corrected PATH passed.
- This proves the controlled installed iOS inline path, not external TLS or
  physical performance acceptance. Android/development HTTP parity, typed SDK
  facade, large-resource handles, per-app rate accounting, response headers,
  mailbox admission/retry policy and all remaining service/resource/tooling/
  GPU/physical requirements remain work. Goal active.
- NSURLSession delegate lifecycle and redirect API reference:
  https://developer.apple.com/documentation/foundation/urlsessiontaskdelegate

### Typed inline HTTP SDK and native header ambiguity rejection

- Added mini.http(options) returning the existing cancellable request handle
  with a validated, frozen HttpResponse. Exported readonly request/response types;
  generated SDK installs the new http.ts dependency. Validates URL/method/body,
  header counts/bytes/control characters/transport fields, and case-insensitive
  duplicate names. Native package URL policy remains authoritative. Base64
  syntax and padding bits are checked without Buffer/atob/URL dependencies, so
  the helper works in the intended QuickJS environment. Native replies require
  integer status 100..599 and canonical <=1536-byte body; violations are PROTOCOL.
- Installed iOS now independently rejects header names differing only by case,
  including callers bypassing the typed facade. Signed fixture passed six HTTP
  response assertions and existing lifecycle/update checks. Evidence:
  build/ios-validation/signed-surface-20261004T164713Z. Temporary app removed;
  originally booted simulator left booted.
- Fifteen SDK runtime/connector/install tests passed. Actual compiler built a
  TSX guest importing HttpResponse and calling mini.http; release signing/admission
  and preserved user config passed one build test with 21 assertions. Log:
  /private/tmp/pjm-http-sdk-build-test.log. Broader check suite was not rerun.
- Android/development HTTP implementations, resource handles, rate accounting,
  complete native services and remaining GPU/tooling/security/device acceptance
  requirements remain incomplete. The full goal stays active.

### Android HTTP runtime and portable build prerequisites

- Inspected published Maven metadata, POMs and Android/JVM source artifacts.
  OkHttp 5.5.0 has distinct Android/JVM variants; selected Android AAR rather
  than substituting the JVM artifact. Its Android source requires explicit
  application-context initialization when the Startup provider is disabled;
  the AAR also contains a public-suffix asset. Provider integration must honor both.
- Pinned Android classes jar, public-suffix asset and complete published
  dependency closure under vendor/android-http: OkHttp Android 5.5.0, Okio JVM
  3.18.1, Kotlin stdlib 2.1.21, JetBrains annotations 13.0, AndroidX annotation
  JVM 1.10.0, Startup 1.2.0 and Tracing 1.0.0. lock.json records source URLs,
  archive SHA-256 and derived runtime hashes/sizes. Apache license included.
- Export verifies all bounded regular runtime files and hashes before writing
  output; exported folders carry jars, asset, lock and license. APK builder adds
  jars to compiler/D8 inputs, packages every dex output, and declares INTERNET.
  Original native library and signed startup are retained. Normal development
  build integration still needs the provider and dependency wiring.
- Initial moved-folder APK built with build-tools 35, but D8 8.6.2-dev could not
  preserve Kotlin 2.1 metadata. This diagnostic is not treated as acceptance.
  Installed stable build-tools 36.0.0 (D8 8.10.9-dev) and updated portable export
  requirement. Final moved folder build passed with no Kotlin metadata or
  missing-class diagnostics, public-suffix asset in APK, and 16 KiB ZIP alignment.
  Evidence: build/android-validation/http-runtime-20261004T165829Z. Used the
  already verified native library from prior export evidence; no native rebuild,
  APK signing, installation or emulator run occurred in this unit.
- Three dependency/export tests passed, including altered-jar and symbolic-link
  rejection; 23 export assertions. Added dependency check to tests/check.sh.
  Real Java compilation also verified OkHttp initialization, cookie-free client,
  redirect disabling and call-timeout APIs. Native HTTP dispatch, bounded task
  owner/completion queue, generation cancellation and device runtime evidence
  remain next work. Full goal active; other outstanding requirements unchanged.
- Android compiler compatibility reference:
  https://developer.android.com/build/kotlin-support

### Installed Android bounded HTTP provider

- Added VerifiedHttp owner-thread admission/drain and bounded worker execution.
  It implements the typed SDK's request.v1 inline contract with original signed
  package URL policy, strict methods/headers/canonical base64, 1536-byte request/
  response bodies, four pending tasks per generation and eight per owner. Eight
  worker threads use a zero-capacity queue; cancelled workers still count against
  execution capacity until they finish. Replies remain in that bounded task set
  under mailbox backpressure. Workers do not touch native engines or queue UI work.
- Android initializes the Android-specific OkHttp application context explicitly.
  No cookie/HTTP cache/authenticator is enabled; no idle connections retained.
  Redirects are manual, maximum five, with policy checked before every attempt,
  Authorization/Cookie stripped and standard 301/302 POST/303 method rewriting.
  Native timeout/deadline spans redirects. Explicit cancellation and synchronous
  pool retirement cancel the exact generation's tasks. Final shutdown cancels all.
- InstalledActivity drains completions before the guest frame and posts using
  their captured identity/generation. Development APK build now carries pinned
  dependencies/assets, uses build-tools 36 and packages all dex files; its
  development Activity still does not dispatch HTTP. Signed surface test path
  also compiles/packages the provider/dependencies. All host Java sources compile.
- Native Android controlled interceptor tests passed initial policy/schema/base64
  denial, successful/overflow/maximal replies, redirect sanitation/denial/loop cap,
  pending capacity, completion retry under backpressure, explicit cancellation,
  unrelated-generation retirement, complete retirement and fresh-generation work.
  Standalone dalvikvm initially failed to initialize Android system APIs; runner
  now uses app_process. No test TLS trust bypass was introduced.
- Fixed JSON slash escaping of 1536 bytes of 0xff: canonical base64 has 2048
  slashes and must fit the 4096-byte reply budget. Both hosts now emit unescaped
  slashes. Android has a bounded terminal encoding error fallback. iOS actual
  signed guest passed seven HTTP reply assertions, including that maximal body.
  Evidence: build/ios-validation/signed-surface-20261004T170842Z.
- Final actual Android CLI export, moved project build, temporary signing,
  signed-only startup/OkHttp initialization and red center-pixel check passed.
  Evidence: build/android-validation/exported-host-20261004T170937Z, including
  native-http.log. Six tooling/dependency/export tests passed (30 assertions).
  Temporary apps/files removed; owned emulator stopped and handle exited zero.
  Originally booted iOS simulator left booted. Full check suite not rerun.
- Controlled provider tests and installed startup are distinct evidence: signed
  Android guest HTTP round-trip acceptance, live TLS/timeout/physical-network
  evidence, rate accounting, iOS completion retry, large-resource handles,
  permission services and all remaining GPU/global-budget/tooling/physical P0–P4
  requirements remain incomplete. Full goal active.

### iOS HTTP completion retry under mailbox pressure

- Added a signed-surface frame-start hook distinct from the public frame observer.
  InstalledController drains ready HTTP replies before guest advancement. Native
  session completion now encodes and stores one bounded reply on its original
  task, rather than dropping task ownership before mailbox admission. Failed
  post retains the reply; successful post removes the task. Ready replies count
  against the same four-per-generation/eight-per-owner capacity as running work.
- Native sessions/body/response references are released at task completion;
  cancellation clears queued replies, and retirement removes the exact generation.
  Encoded response overflow has a bounded FAILED fallback. No growing completion
  queue, event-loop retry timer or pool reentry was introduced.
- Actual signed iOS test stops its frame pump until four HTTP replies are ready,
  fills the real mailbox (24 filler records alongside eight existing replies),
  calls the drain and asserts all four tasks remain retained, then resumes.
  All seven HTTP response assertions pass after the guest consumes prior records.
  Warm activation/modal freeze/resume/device contract/cold promotion/idempotent
  shutdown and retirement assertions still pass. Test fixture ignores pressure
  fillers to keep its diagnostic output within the existing native effect budget.
- Evidence: build/ios-validation/signed-surface-20261004T171552Z. Temporary app
  removed and originally booted simulator left booted. Five export/dependency
  regressions passed (45 assertions). Full check suite not rerun in this unit.
- Signed Android guest HTTP round trips, live TLS/deadline/device acceptance,
  rate accounting, resource handles, development services, permission providers,
  direct GPU drawing, global resource budgets, tooling and remaining physical
  P0–P4 requirements still require work. Full goal active.

### Process-wide rolling HTTP rate accounting

- Both installed hosts now allow 32 validated, authorized HTTP admissions per
  authenticated app identity in a rolling 60-second monotonic-clock window.
  Counters are process-wide, separate from controller, native generation and
  package version; cancel/retire/close does not refund or clear admissions.
  Capacity checks precede rate reservation; Android worker rejection after that
  reservation still counts as an admitted attempt. Existing protocol BUSY carries
  the rate-limit message. Counters reset with a new host process, not persistently.
- At most 64 identities and 32 timestamps each are retained. Expired timestamps
  and empty identities are removed before admission. A full identity table denies
  a new identity without evicting another active quota; existing identities can
  still use remaining admissions. No polling timer or unbounded app-history map.
- iOS deterministic clock tests proved the 32/33 boundary, another controller
  sharing the same quota, pre-expiry denial, exact expiry, 64/65 identity boundary
  and recovery. The actual HTTP admission method returned BUSY after quota
  exhaustion, while pending-task retirement and seven signed HTTP replies still
  passed with mailbox pressure/modal freeze/resume/cold promotion assertions.
  Evidence: build/ios-validation/signed-surface-20261004T172301Z.
- Android actual provider rejected after exhaustion across retirement, new
  generations and a reopened provider. Controlled native tests also proved exact
  nanosecond expiry and identity-table saturation/recovery alongside prior body,
  redirect, capacity, cancellation and completion-backpressure cases. Evidence:
  build/android-validation/http-rate-20261004T172454Z/native-http.log.
- Full tests/check.sh passed 33 Bun tests with zero failures, native iOS storage
  checks and 11 iOS signature cases. Log: /private/tmp/pjm-http-rate-full-check.log.
  Temporary files/apps cleaned; owned Android emulator stopped with terminal-zero
  handle. Originally booted iOS simulator left booted.
- This completes this HTTP rate guard, not all service quotas or host acceptance.
  Signed Android HTTP guest round trips, live TLS/deadline/physical-network
  evidence, resource handles, development HTTP, permission services, per-service
  frequency policy, direct GPU drawing, global resources/cache accounting,
  developer/publish/replay tooling and physical P0–P4 requirements remain work.
  Full goal active.

### HTTP header value parity

- Aligned SDK/iOS header values with the pinned Android transport's ASCII
  constraint. SDK rejects values outside printable ASCII; iOS rejects lossy ASCII
  conversion before native admission. Existing control-character checks remain.
  This avoids an iOS-accepted header failing on Android after transport creation.
- Nine SDK/installation tests passed, including non-ASCII rejection before any
  send. Actual iOS admission returned PROTOCOL for the same input, and signed
  guest HTTP/backpressure/rate/lifecycle/update checks still passed. Evidence:
  build/ios-validation/signed-surface-20261004T172804Z. Test app removed; originally
  booted simulator left booted. No Android code changed in this unit; its native
  Unicode-header rejection case still needs explicit runner coverage.
- Full goal remains active, including unfinished service providers, Android guest
  HTTP round trips, live-network/physical acceptance, GPU/resource/tooling work.

### Signed Android guest HTTP frame round trips

- InstalledActivity now has a host factory for its HTTP provider. Production
  default still initializes the pinned Android OkHttp provider. Test-only
  HttpSurfaceActivity supplies a controlled interceptor; the installed exporter
  never copies this class, and a regression asserts its exclusion.
- Optional signed fixture mode issues six requests from the guest's first frame.
  Guest code rejects same-frame completion, wrong IDs/version/duplicate replies,
  mismatched status/body and wrong rejection codes. It validates successful HTTP,
  initial domain denial, response overflow, redirect domain denial, sanitized
  successful redirect and native non-ASCII-header PROTOCOL rejection. Only after
  all six checks does the guest change its root color to green.
- PJM_HTTP_SURFACE_TEST=1 surface test uses the actual signature/plan admission,
  package store, InstalledActivity dispatch, VerifiedHttp workers, captured
  generation completion posting, engine mailbox and guest frame loop. It checks
  green screenshot center, blue after touch, retained blue after warm resume and
  fresh green after cold reopen. All four pixel assertions passed. Evidence:
  build/android-validation/signed-surface-20261004T173424Z, including
  http-guest-test.log. Native engine was rebuilt for this run.
- Four export regressions passed, 46 assertions. Test app/device files cleaned;
  owned emulator stopped with terminal-zero handle. Test mode is explicit and
  does not alter production exports or weaken TLS trust. Full suite not rerun.
- This supplies the previously missing signed Android guest round-trip evidence,
  including explicit native Unicode-header rejection. Transport remains
  controlled; live TLS/deadline/physical-network evidence, resource handles,
  development and permission services, broader quotas, direct GPU/global-budget/
  developer/publish/replay/physical P0–P4 requirements still remain. Goal active.

### Default native live HTTPS acceptance on both simulators

- Added explicit live surface mode. Its authenticated guest issues request.v1
  to signed-domain https://example.com/, rejects same-frame completion and wrong
  correlation/version/status/empty/oversized body, and marks success only after
  the response reaches the guest's frame poll. Initial endpoint check returned
  HTTP 200, certificate verification result zero and 577 bytes; native runs
  independently perform their own network requests and TLS verification.
- Android live mode launches production InstalledActivity and its default
  VerifiedHttp/OkHttp factory; no test Activity/interceptor is compiled into this
  mode. Test waits for the actual success color rather than assuming network
  timing. Green after live HTTP, blue after touch, retained blue on warm resume
  and fresh green after cold reopen all passed. Evidence:
  build/android-validation/signed-surface-20261004T174259Z/live-http-test.log.
- New test-only LiveHttpApp uses the real iOS InstalledController, retaining its
  production effect dispatch and default URLSession configuration. The signed
  guest validated the live reply (772 base64 characters), and host shutdown
  asserted no pending requests. Evidence:
  build/ios-validation/signed-surface-20261004T174256Z/run.log, LIVE_TLS pass.
- Neither native path uses custom certificate trust, hostname overrides or a
  controlled transport in live mode. iOS fixture setup now explicitly selects
  the iOS package target and enables live guest code only for this opt-in mode.
  Test harness files remain outside production exports.
- Five dependency/export tests passed, 46 assertions. Temporary apps/device
  files removed, owned Android emulator stopped with terminal-zero handle,
  originally booted iOS simulator left booted. Full suite not rerun in this unit.
- This establishes successful live TLS/frame delivery for these simulator runs,
  not slow-network/deadline/revocation tests or physical-device measurements.
  Large resource handles, development HTTP, permission/service providers, broader
  quotas, direct GPU/global-budget/cache/trust/tooling and physical P0–P4 evidence
  still require work. Full goal active.

### Android bounded HTTP resource producer (implementation checkpoint)
- Added owner-thread memory resource registry: opaque random handles, identity/generation binding, four slots per generation and sixteen fixed 1 MiB slots per process. Cancellation retains the process reservation until its worker exits.
- Installed Android HTTP accepts explicit `responseMode: "resource"`, streams into the reserved buffer, and exposes bounded `resource.read.v1` (at most 1536 decoded bytes) and `resource.release.v1`. Inline responses retain their existing limit. Retirement and shutdown dispose handles.
- Added the registry to normal and portable Android compilation paths and native test runners. All Android Java host sources compile with the pinned HTTP dependencies and JDK 17.
- This is an implementation checkpoint, not acceptance: native execution tests, typed SDK wrappers and iOS resource parity remain outstanding. The overall P0–P4 goal remains active.

### Typed resource SDK and native test preparation
- SDK HTTP supports explicit inline/resource response modes and immutable typed handles. Added `mini.resources.read` and `mini.resources.release`, with canonical base64, handle format, bounded integer ranges, exact chunk length/offset/EOF consistency, and validated release replies.
- Response validation captures the admitted request mode so caller mutation cannot change reply interpretation. Read and release retain frame delivery and cancellation behavior.
- Ten SDK/installer tests pass, including adversarial resource replies, EOF, malformed handles, request mutation and cancellation.
- Added Android native execution cases for larger HTTP resource production, chunk reads, cross-generation/identity denial, release and slot retirement limits. Java compilation passes; those newly added native cases have not run yet. iOS resource support remains outstanding.

### Android resource execution acceptance
- Executed the real native Android provider on the API 37 / 16 KiB emulator. Evidence: `build/android-validation/http-resources-20261004T180000Z/native-http.log`; runner exited successfully.
- Verified 1537-byte response production, bounded first/final/EOF chunk reads, cross-identity and cross-generation denial, release invalidation, generation retirement invalidation, exact 1 MiB acceptance, declared oversized rejection, and unknown-length streamed overflow rejection.
- Registry tests verified per-generation four-slot limits and process-wide sixteen-slot accounting across owners, including cancellation holding its reservation until producer completion. Existing inline, redirect, cancellation, mailbox pressure and HTTP rate tests continue to pass.
- This tests the native provider and registry. Actual signed guest resource round trips, iOS parity and full requirement acceptance remain outstanding.

### iOS HTTP resource parity
- Installed iOS now accepts the same explicit resource response mode and provides `resource.read.v1` / `resource.release.v1`. Fixed 1 MiB buffers have opaque random handles, authenticated identity/generation ownership, four slots per generation, and sixteen slots per process.
- URLSession callbacks and registry access use the main owner queue. Resource buffers remain charged while referenced by a cancelled task/session, and are freed on final object release. Reads copy only the bounded requested chunk; resource completion avoids inline base64 of the full body.
- Simulator build and existing installed-host acceptance pass. New controlled native delegate tests verify 1537-byte and exact 1 MiB production, unknown-length overflow rejection, chunk/EOF reads, cross-identity/generation denial, release and retirement. Evidence: `build/ios-validation/signed-surface-20261004T180241Z/run.log` includes `PJM_RESOURCE_PASS` and `PJM_SIGNED_SURFACE_PASS`.
- Signed guest resource round trips, extended iOS process quota/cancellation accounting execution and all remaining P0–P4 requirements remain outstanding. Goal stays active.

### iOS resource quota lifetime execution
- Added cross-controller native execution of the four-slot generation and sixteen-slot process limits. Holding a resource reference after registry retirement keeps its reservation; dropping that reference restores capacity for another controller.
- The test exposed a temporary Objective-C retention issue: scanning `resources.allValues` retained every buffer until autorelease-pool drainage. Changed quota admission to enumerate handle keys and inspect individual entries, so a released buffer restores capacity promptly.
- Rebuilt and executed the iOS simulator acceptance successfully. Evidence: `build/ios-validation/signed-surface-20261004T180446Z/run.log` contains `PJM_RESOURCE_ACCOUNTING_PASS`, `PJM_RESOURCE_PASS`, and `PJM_SIGNED_SURFACE_PASS`.
- The accounting test deliberately retains native resource references to verify lifetime charging; it does not yet prove a signed guest resource round trip or a real network cancellation race. Those and the full goal remain pending.

### Signed iOS guest resource lifecycle
- Added a signed guest fixture mode that uses the production HTTP/service dispatch and original generation binding: resource creation, bounded chunk read, EOF read, release, and denial after release. Android and iOS runners now accept the resource mode.
- The actual guest test exposed `eof` encoded as numeric 1/0 by Objective-C boxing of a comparison. Changed the provider to emit explicit JSON booleans. Native tests checking only `boolValue` had not detected that contract error.
- Signed iOS guest execution passed over the default HTTPS transport and normal TLS trust; 577-byte resource, frame 22. Evidence: `build/ios-validation/signed-surface-20261005T023111Z/run.log`. Runner exited successfully and removed its temporary app; the pre-existing simulator remains booted.
- This fixture exercises the wire protocol directly rather than compiling the SDK wrappers. Android signed resource execution, compiled SDK guest acceptance and the broader goal remain pending.

### Signed Android guest resource lifecycle
- Production InstalledActivity signed guest resource mode passed on the API 37 / 16 KiB emulator over default HTTPS trust: creation, bounded read, EOF, release and denial after release; green completion, blue touch, blue warm resume and green cold restart screenshots verified.
- Evidence: `build/android-validation/signed-surface-20261005T023331Z/`. Runner exited successfully, removed its temporary app, and the owned emulator was stopped with terminal exit verified.
- Initial cold screenshot ran before asynchronous completion. Added the same bounded twenty-second completion polling used at initial launch; the repeated test passed all four checks.
- Added a strict JSON boolean type assertion to the controlled iOS resource test to guard against the EOF boxing bug (that new assertion still awaits its next iOS run). Twelve targeted SDK/installer/export tests passed. Compiled SDK guest resource acceptance and remaining full-goal requirements remain pending.

### Signed multi-chunk resource acceptance
- Strengthened signed resource fixture to read the full response in repeated bounded chunks, correlate each request ID, verify exact decoded length and offset progression, require strict boolean EOF, then release and verify denial.
- Added test-only iOS `ResourceHttpApp.m` transport producing 4097 bytes of 0xff. The shipping installed controller, package admission, original guest binding and service dispatch are unchanged.
- Signed iOS execution passed all three content-checked reads (1536, 1536, 1025 bytes), EOF and release denial. Evidence: `build/ios-validation/signed-surface-20261005T023543Z/run.log`, `RESOURCE_MULTICHUNK`, frame 8. Default live HTTPS resource test also passed at `signed-surface-20261005T023442Z` (577 bytes). Both runners completed and cleaned their apps.
- Ten targeted SDK/installer tests pass. These guest fixtures still use the wire protocol directly; compiled SDK guest acceptance and remaining broad P0–P4 work remain outstanding.

### Resource reply protocol validation
- SDK now rejects unknown fields in version-one HTTP replies, resource descriptors and chunks, in addition to checking bounded types, canonical body encoding, offsets and EOF consistency.
- Added regression cases for numeric EOF and unexpected descriptor/chunk/response fields. Ten SDK and installer tests pass.
- This is SDK protocol validation evidence only; it does not close compiled SDK guest acceptance or any remaining P0–P4 requirement. Goal remains active.

### Resource SDK compiler integration and full regression
- Extended the actual TSX compiler/release integration test with typed resource response narrowing, chunk read and release calls. Compiled artifact contains both resource service kinds; authenticated release checks and preservation of user tsconfig continue to pass.
- Full `tests/check.sh` completed with exit zero. Evidence: `/private/tmp/pjm-resource-full-check.log`; native service/storage/package checks and all included Bun suites passed, including actual compiler artifacts and portable export/dependency integrity.
- Compilation and packaging are now verified for resource SDK calls. This does not prove their execution inside a native compiled SDK guest; that and the remaining full objective remain outstanding. Goal stays active.

### Signed native SDK resource execution
- Added an SDK resource guest fixture bundled from the actual `sdk/native.ts` and dependencies, signed into the native package and run inside QuickJS through the installed iOS controller.
- Verified HTTP resource response, all three content-checked SDK reads of the controlled 4097-byte body, SDK release, and a rejected SDK read with DENIED after release. Real promises and the SDK frame mailbox pump delivered the results; completion marker observed at frame 7.
- Evidence: `build/ios-validation/signed-surface-20261005T023908Z/run.log`, `http-live-pass:sdk-resource-4097`; runner completed successfully and cleaned its app.
- This fixture bundles SDK modules using Bun and appends them to the signed native test guest. The separate TSX compiler integration proves TSX compilation; a single combined upstream-compiled TSX native resource app and Android SDK execution remain pending. Full P0–P4 goal remains active.

### Signed Android SDK resource execution
- Extended controlled Android test transport and runner to execute the same actual SDK resource fixture used on iOS. Production InstalledActivity and VerifiedHttp remain unchanged; only the test-only activity injects the 4097-byte response.
- Native QuickJS guest passed content verification across three SDK chunks, SDK release and DENIED rejection after release. Green completion, blue touch, blue warm resume and green fresh cold restart screenshots all passed.
- Evidence: `build/android-validation/signed-surface-20261005T024043Z/`; runner exited zero and cleaned its app. Owned emulator shutdown also exited zero.
- README documents the opt-in SDK resource mode on both hosts. Combined upstream-compiled TSX native acceptance, broader services, direct GPU rendering/tooling and the rest of the full goal remain outstanding.

### Development panel foundation
- Inspected pinned upstream DevTools: its existing launcher assumes PSP USB and a browser host, so directly invoking it would not establish native phone debugging.
- Added a token-protected `/devtools` page to the existing development server. It displays current manifest/build status and polls with no-store; values are rendered as text, with a restrictive same-origin content policy.
- Added a passing panel regression test and included it in repository checks. Native server execution of this new route remains to be tested.
- This is the initial development panel foundation. CLI opening, native inspector transport, logs, stepping, tape/replay, QR and publishing remain outstanding; the UI explicitly indicates the missing inspector/replay connection. Full goal remains active.

### DevTools CLI and server integration
- Added `pjm devtools` to open the active development panel, with `--no-open` for a printed URL. Session metadata must be bounded, regular and non-symlinked, reference a live process, and contain the expected HTTP token URL without credentials/query/fragment.
- Development server integration verifies panel HTTP response/content policy, rejection of an incorrect token and CLI resolution against a running session. Existing compile/watch/recovery/shutdown tests passed; evidence `/private/tmp/pjm-devtools-integration.log`, runner exited zero.
- Two panel/session validation unit tests pass. README documents current functionality and its limits. Browser rendering inspection remains outstanding; native inspector, stepping, tape/replay, QR and publish remain unimplemented. Full goal stays active.

### Bounded development build history
- Development status and panel now expose a bounded 32-record build history: published/superseded/failed/stopped outcome, revision, monotonic compiler duration and finish time. Error messages are capped at 2048 UTF-8 bytes without splitting characters.
- History snapshots and records are immutable. A passing unit test covers eviction, byte limits, snapshot independence and invalid durations/revisions; repository checks include it.
- Actual development compile/watch/recovery integration passed with timing/history assertions. Evidence `/private/tmp/pjm-build-history-integration.log`; runner exited zero.
- Compiler duration is not save-to-physical-device presentation latency; host acknowledgements and P4 timing acceptance remain pending. Native inspector/replay and the full remaining objective are still outstanding.

### Native development frame event channel
- Added token-protected bounded device-event ingestion to the development server and its status/panel snapshot. Validated revision/platform/kind records have a 4096-byte streamed body cap and a 32-entry immutable history.
- Android development host queues a frame-ready event on its existing network owner after the first successful frame of a revision. This acknowledges engine frame completion, not display scanout or physical save-to-screen latency. Installed release hosts remain unaffected.
- Device-event unit tests pass, and all Android Java sources compile. Actual native event transport integration and iOS event reporting remain to be tested/implemented; full goal stays active.

### Device-event server integration and iOS reporting
- Server integration now posts a valid event through the active token session and verifies status retrieval; future revisions, unsupported platforms and bodies over 4096 bytes are rejected. Actual development compile/watch/recovery suite passed (68 assertions), evidence `/private/tmp/pjm-device-event-integration.log`.
- iOS development controller reports once after each replacement surface's first completed frame, using its existing request path. Simulator-target Objective-C syntax check passes with development configuration.
- Three event/panel unit tests pass. Native end-to-end event reporting on either device remains to be executed; these checks do not establish physical display or hot-restart latency. Full goal remains active.

### Native iOS development event round trip
- Added a reusable native event integration runner: create temporary project, launch real development host, await its first completed-frame report, edit TSX, await a new revision's frame report, then terminate and clean the project.
- Executed on the pre-existing iOS simulator successfully. Revisions 2 and 3 reported frame-ready through the production development request path to the token-bound server status. Evidence: `build/ios-validation/device-events-20261005T024933Z/run.log`; runner terminal exit zero and cleanup completed.
- Recorded compiler durations were 1599 ms and 1645 ms for those revisions. These are compiler timings, not physical-device save-to-screen acceptance; network receipt timestamps alone do not prove scanout or the P4 target.
- Android native event execution, native inspector/log transport, replay and all remaining full-goal requirements remain outstanding. Goal stays active.

### Native Android development event round trip
- Executed native development event runner on API 37 / 16 KiB emulator. Initial revision 2 and edited TSX revision 3 both reported frame-ready through the production Android network owner to the token-bound DevTools status.
- Evidence: `build/android-validation/device-events-20261005T025109Z/run.log`; runner exited zero, removed the temporary project and stopped its development session. Owned emulator shutdown terminal exit was verified.
- Compiler durations were 2365 ms and 2191 ms for those revisions, already above the two-second end-to-end P4 goal. This provides evidence that optimization remains required; no physical-device or save-to-screen acceptance is claimed.
- Native frame reporting is now executed on both simulators. Inspector/log transport, replay, latency optimization and all remaining requirements keep the full goal active.

### Compiler-stage timing for restart optimization
- Instrumented the shared compiler path with resolve/type-check, preparation, compiler-process and package timings. Development build records carry immutable validated stage maps without changing artifact or release contents.
- Actual compile/watch/recovery integration passed with stage assertions and a captured sample. Evidence `/private/tmp/pjm-compiler-stages.log`: total 1571 ms, resolve 906 ms, prepare 21 ms, compiler 594 ms, package 48 ms.
- This sample indicates resolve/type-check work warrants investigation. It is instrumentation only, not a speed improvement or proof of the physical two-second target. Two diagnostic/event unit tests also pass; full goal remains active.

### Type-check reuse safety baseline
- Inspected pinned upstream checker: it constructs a fresh TypeScript program and entry/import graph for every check. No cache or program-reuse change has been introduced yet.
- Expanded development integration to compile a reachable typed dependency, edit only that dependency to introduce TS2322, verify last good revision stays active, and recover after repairing the dependency. All 72 assertions pass.
- Evidence `/private/tmp/pjm-checker-reuse-baseline.log`: first build resolve 922 ms / compiler 583 ms; warm recovered dependency build resolve 475 ms / compiler 800 ms / package 190 ms, total 1466 ms. This qualifies the earlier first-build observation: warm compiler work also materially contributes.
- These tests establish a safety baseline for future optimization, not latency acceptance or a completed optimization. Full goal remains active.

### Overlapping type-check and compilation
- Shared build path now resolves/admit-checks metadata and starts the isolated upstream compiler before synchronous parent-process type-checking. Pipes begin draining first; both outcomes are awaited, and type-check failure prevents packaging/publication. Public check still checks synchronously.
- No checker cache or stale dependency graph is introduced. Imported-file type failure, last-good retention, repair recovery, rapid-save supersession and authenticated release checks passed: `/private/tmp/pjm-parallel-compile.log`, 95 assertions, exit zero.
- Warm recovered dependency sample dropped from previous 1466 ms to 974 ms in the first overlap run. These separate samples demonstrate a useful local improvement, not a controlled hardware benchmark or P4 acceptance.
- Added explicit type-check timing; compilerMs now includes the overlapping compiler/check gate and must not be summed with typeCheckMs. Updated timing and dependency tests passed at `/private/tmp/pjm-overlap-timings.log` (first total 1009 ms, resolve 132 ms, type-check 802 ms overlapping compiler gate 808 ms, packaging 65 ms).
- Native device acceptance of the optimization and all remaining full-goal requirements remain pending; goal stays active.

### Optimized native iOS rebuild measurement
- Native integration runner now measures monotonic elapsed time from its TSX write to observing a matching new-revision frame-ready event, including watcher/compiler/host transport and test polling.
- Optimized native iOS run passed: edit-to-observed-frame 1357 ms; rebuilt revision 3 compiler pipeline 1005 ms. Evidence: `build/ios-validation/overlap-native-20261005T025821Z/run.log`; runner terminal exit zero and cleanup completed.
- This is one simulator measurement of frame-ready reporting, not physical scanout, a statistical benchmark or complete P4 latency acceptance.
- Added passing telemetry regressions for overlapping-stage snapshot immutability and invalid stages; three diagnostic/event tests pass. Android optimized native timing and remaining full-goal requirements remain outstanding.

### Optimized native Android rebuild measurement
- Optimized native Android launch/rebuild event test passed on API 37 / 16 KiB emulator. Evidence `build/android-validation/overlap-native-20261005T030027Z/run.log`; edit-to-observed-frame was 2217 ms, so this run does not meet the two-second target.
- Rebuilt revision 3 total compiler pipeline 1937 ms: resolve 3 ms, overlapping type-check 834 ms / compiler gate 1288 ms, package 645 ms. Packaging cost under emulator load merits investigation; no physical or statistical acceptance claimed.
- Initial attempt exited because device discovery ran while emulator was offline. Waited for the same emulator to boot, then reran the terminal failed test. Successful runner exited zero and cleaned project/session; owned emulator shutdown terminal exit verified.
- Full goal remains active with latency optimization and all remaining requirements outstanding.

### Package checksum verification optimization
- Replaced the compiler's second per-byte BigInt FNV verification pass with equivalent two-word 32-bit arithmetic. Exact products remain below the 53-bit integer limit; the checksum footer is still verified before upstream structural decode. Upstream package encoding and signed verification remain unchanged.
- Removed redundant Uint8Array copies of compiler JS/pak buffers. Validation is retained; upstream decode skips only its now-duplicated checksum computation after our verifier succeeds.
- Independent BigInt reference tests pass for multiple sizes through 1 MiB, nonzero-offset views and corrupted footers (22 assertions). Actual compile/watch/dependency-failure/recovery and authenticated release tests passed: `/private/tmp/pjm-package-hash-integration.log`, exit zero.
- Observed warm packaging remained variable (511 ms in this run); no end-to-end speedup or P4 acceptance is inferred from this implementation change. Native measurements and further profiling remain pending. Full goal stays active.

### Bounded development log ingestion
- Inspected engine console support: upstream console methods route to the Rust host logger. Native forwarding must be integrated explicitly; console logs do not yet reach the panel automatically.
- Development event channel now admits strict log records with revision/platform binding, debug/info/warn/error level and at most 2048 UTF-8 message bytes. Shared history remains 32 entries and body reads remain capped at 4096 bytes; panel renders records as text.
- Two event unit tests pass, including Unicode boundaries and invalid types/levels. Actual token-bound server log POST and status retrieval passed within the development/recovery integration: `/private/tmp/pjm-device-log-ingestion.log`, runner exit zero.
- Native console forwarding, inspector/replay and full remaining goal requirements are still outstanding; goal stays active.

### Development console forwarding implementation
- Added an opt-in compiler prelude only for `pjm run`: console log/info/debug/warn/error continue calling the original host console and emit best-effort bounded debug notifications via the guest effect mailbox. Messages cap at 512 UTF-8 bytes; failures do not prevent normal console output.
- Android/iOS development service dispatch forwards admitted records with current revision and platform through the existing token session. Each host caps pending log uploads at eight; release installed hosts are unchanged.
- Two console capture tests pass, covering Unicode bounds, original-call preservation and missing/failing transport. All Android Java sources and iOS development Objective-C syntax checks pass. Added a release compiler regression asserting the debug notification prelude is absent (still awaits its next execution).
- Native console end-to-end acceptance, boot-log handling and remaining full-goal requirements remain pending. Goal stays active.

### Native iOS development console execution
- Native integration fixture now logs a Unicode warning in the first guest frame and requires matching revision/platform console records at initial launch and after a TSX rebuild.
- iOS executed successfully: both revisions' `native-console-proof 😀` records reached DevTools via guest effects and native development HTTP forwarding. Evidence `build/ios-validation/console-native-20261005T030658Z/run.log`; runner exit zero, cleanup completed. Edit-to-observed console record was 1345 ms in this simulator run.
- Actual compiler/artifact regression verifying absence of debug.log.v1 outside development builds and authenticated release checks passed: `/private/tmp/pjm-console-release-exclusion.log`.
- Android native console execution, boot-time console retention, inspector/replay and the full remaining goal remain pending.

### Android console acceptance attempt and diagnostics fix
- Native Android console test timed out with revision 1 built but no native window/frame/log events. Runner exited nonzero and cleaned its project/session. Device runtime logs showed no PocketJS startup or crash record; the cause remains unproven.
- Evidence retained at `build/android-validation/console-native-failed-20261005T030832Z/run.log`. This is failed evidence, not Android console acceptance.
- Identified a test observability gap: captured native host stdout/stderr was awaited then discarded during cleanup. Runner now emits the bounded tail (12,000 characters) so a subsequent failed run retains build/install/launch diagnostics.
- Owned emulator was confirmed by process identity, terminated gracefully and terminal exit zero verified. Android console delivery remains pending; full goal stays active.

### Android launch diagnostics hardening
- Android launcher now rejects activity-manager Error/Exception/failed Status output even if the adb shell command exits zero. Existing successful cold/warm launch responses remain accepted. This guards silent launch failures but does not establish the cause of the previous console timeout.
- Added passing behavioral tests for launch responses and included them in repository checks. Launcher module import also passes.
- Native event runner now captures only the latest 12,000 characters per output stream rather than buffering unlimited native logs, while preserving the diagnostic tail on cleanup.
- Native Android console rerun and prior timeout diagnosis remain pending; full goal remains active.

### Native Android console delivery acceptance
- Reran native console acceptance with a boot-confirmed snapshot-disabled emulator and retained launcher diagnostics. Both revision 2 and rebuilt revision 3 delivered frame-ready and matching Unicode warn log records to DevTools.
- Evidence: `build/android-validation/console-native-20261005T042312Z/run.log`; test runner exit zero. Edit-to-observed matching log was 1243 ms; compiler pipeline revision 3 was 918 ms in this run. This is one emulator event measurement, not physical scanout or statistical P4 acceptance.
- Activity manager reported successful cold launch. The previous failed run's cause remains unproven; this success establishes the present console path, not a retrospective diagnosis.
- Temporary project/session cleaned, owned emulator shutdown terminal exit zero verified. Boot logs, inspector/stepping/replay and remaining full goal requirements remain outstanding.

### Development startup console verification (20261005T043013Z)

Strengthened `tests/device-event-native.ts` to require a startup info log, first-frame warning, and frame-ready acknowledgement for the same active revision on both initial launch and hot restart. Existing iOS boot effects are drained after surface adoption, so no host change was required. The iPhone 17 Pro / iOS 26.4 simulator passed for revisions 2 and 3; observed save-to-frame/log time was 994 ms. Evidence: `build/ios-validation/boot-console-20261005T043013Z/run.log`. Android startup-log acceptance remains unverified; previous Android evidence covers first-frame logs only.

Complete `tests/check.sh` run against the existing pinned upstream source passed: 44 Bun tests, zero failures, plus native service/storage/package checks. Evidence: `build/validation/regression-20261005T043013Z/check.log`. Superseded runs that attempted an unnecessary upstream download were stopped after this successful run. These measurements do not prove physical-device performance or full P0–P4 completion; the durable goal remains active.

### Android startup console verification (20261005T043210Z)

The Pixel 2 / API 37 arm64 emulator passed startup info log, first-frame warning, and frame-ready acknowledgements for revisions 2 and 3. Captured events were independently checked for correct severity, content, and revision. Observed save-to-frame-and-logs time was 1208 ms. Evidence: `build/android-validation/boot-console-20261005T043210Z/run.log`. The runner now requires severity as well as message and calls its timing `saveToObservedFrameAndLogsMs` to accurately describe the observation. This closes startup console acceptance on both simulator hosts, not physical-device acceptance.

### DevTools diagnostic interface (20261005T043558Z)

The live panel now displays application/revision/window/build summaries, visible build failures, device activity and bounded build history. Users can filter console severity, restrict activity to the active revision, pause polling, and expand raw session details. All guest messages are inserted with `textContent`. The real in-app browser showed captured Android events; error filtering and pause/resume controls were verified, including literal HTML-like guest text with no execution. Automated script-level coverage checks literal rendering, revision/error filters, pause/resume polling and visible build errors. Real server/reload integration plus panel tests passed: 4 tests, 95 assertions. Evidence: `build/validation/devtools-interface-20261005T043558Z/integration.log`. Native inspector, stepping, replay and publishing remain pending.

### Signed-release publish command (20261005T043848Z)

Added `pjm publish` with trusted raw public-key verification, target/ABI/signature/hash gates before upload, offline `--dry-run`, HTTPS multipart upload, environment bearer-token authentication, deterministic idempotency key, no redirects, a 30-second deadline and a 16-KiB exact receipt bound. Receipts must match the admitted signed app identity, version and hash; keys are excluded from uploads. README describes the explicit distribution contract and immutable-version server requirements. Upload behavior was tested with a controlled fetch transport, including malformed endpoints/tokens, hash mismatch, unsafe release URL, unknown receipt fields, overflow and HTTP conflict. Actual compiler-produced signed release dry-run passed. Evidence: `build/validation/publish-20261005T043848Z` (2 real-build/publication tests, 51 assertions; 4 publication/panel tests, 45 assertions). `tests/check.sh` now includes publishing coverage. No production endpoint was supplied and no external publication occurred. Distribution server integration, trusted downloads, key rotation, inspector/replay and physical acceptance remain pending; the original goal remains active.

### Strict signed-manifest parsing (20261005T044112Z)

Found and fixed a JavaScript admission gap: JSON.parse discards duplicate keys before signature verification. Added bounded strict UTF-8 JSON parsing for the package store, signed-only host exports and publishing. It rejects duplicate decoded keys, unpaired surrogates, BOM, extensions, excessive nesting/numeric length and non-finite numbers before ordinary parsing. Signed duplicate-key envelopes are explicitly rejected by the publishing test. Seven build/export/publish/parser tests passed (117 assertions); store/publish/parser follow-up passed five tests (45 assertions). Evidence: `build/validation/strict-envelopes-20261005T044112Z`. This improves manifest grammar consistency but does not establish full cross-host canonical JSON parity: native iOS parsing and internal package/build-plan publishing admission remain pending. The original goal is active.

### Native iOS strict manifest and plan admission (20261005T044548Z)

Added a bounded raw-byte JSON grammar check before Foundation parsing of signed manifests and embedded build plans. It preserves exact decoded key bytes when detecting duplicates, validates UTF-8 and escaped surrogate pairs, rejects BOM/extensions/non-finite or overlong numbers and limits depth/tokens. Fixture envelopes are carried as base64 raw bytes: Foundation had removed a BOM from the previous text fixture before verification. The iOS verifier passed 17 interoperability/rejection cases plus direct grammar tests. The actual native package admission matrix passed correctly signed duplicate-key/escaped-equivalent/BOM build-plan rejections, authenticated ownership, boot and activation. Signed surface rendering passed on the pre-existing simulator, and test cleanup removed only its own app. Evidence: `build/ios-validation/strict-admission-20261005T044548Z`. Android fixture consumption was updated for raw envelopes; Android rerun of the expanded cases is still pending. Complete service/storage parsing parity, canonical-number parity and publish-side internal admission remain pending. The full goal is active.

### Strict iOS service dispatch (20261005T044746Z)

InstalledController and the development controller now validate service-record bytes with the native strict JSON parser before dispatch. Added actual signed-host tests with duplicate envelope versions and duplicate nested URL keys; both are rejected with no admitted network request. The signed simulator suite passed strict-service, resource/accounting, HTTP rate/backpressure and rendered-surface gates. The real development host passed startup/info and first-frame/warn logs with matching revisions 2 and 3 after launch and reload (observed frame-and-logs time 983 ms). Evidence: `build/ios-validation/strict-services-20261005T044746Z`. Both runners terminated and removed their own temporary artifacts/apps, leaving the pre-existing simulator booted. Native iOS storage snapshot strict parsing and complete canonical parity remain pending, as do the broader original requirements. Goal remains active.

### Strict storage snapshot admission (20261005T045015Z)

Native iOS AppStorage now uses the shared strict byte parser and copies admitted objects into mutable storage state. Its standalone test links the same Swift verifier as shipping hosts. Duplicate and escaped-equivalent keys, lone surrogates, non-finite numbers, trailing commas and invalid UTF-8 were rejected; failed operations preserved exact file bytes. Existing competing providers, busy isolation, quota and symbolic-link tests passed. JavaScript AppStorage now uses strict snapshot parsing and rejects invalid Unicode keys/values before mutation. Full checks passed 47 Bun tests with zero failures plus native service/storage/package checks; final targeted JavaScript storage tests also passed after the Unicode-key guard. Evidence: `build/validation/strict-storage-20261005T045015Z`. Full canonical numeric parity, expanded Android native fixtures and broader P0–P4 requirements still remain; goal active.

### Expanded Android native and physical admission (20261005T045248Z)

The connected Pixel 8 Pro (API 36) passed 17 signature interoperability/rejection cases using raw-byte malformed-envelope fixtures. Both the Pixel_2/API 37 arm64 emulator and the physical Pixel 8 Pro then passed all 21 authenticated package admission and retained engine execution cases, including correctly signed duplicate/escaped-duplicate/BOM plans. Both also passed native bounded JSON grammar/depth/token tests and signed store update/cold-promotion/rollback/tamper/owner/lock/symlink checks. Evidence: `build/android-validation/strict-admission-20261005T045248Z`. All runners completed successfully and cleaned their temporary device files; the emulator created for these tests was stopped. These are physical-device package/security/engine correctness checks executed through temporary command-line fixtures. They do not prove rendered frame performance, touch UX, memory acceptance, or physical UI isolation across mounted apps; those original gates remain pending. Goal remains active.

### Native replay input contract (2026-10-05)

Inspected the pinned upstream tape runner: it imports the web/Wasm host and rebuilds demo bundles, so it cannot stand in for this project’s native engine replay. Added `devtools/tape.ts` as the native replay input contract: strict byte parsing, exact package SHA-256/target/window identity, ordered frame input/latched hits/cancellations, lifecycle events and service completions, immutable admitted records, 8-MiB/36000-step limits and shared input numeric bounds. Two tests passed (13 assertions) covering ordering, immutability, incompatible format/target/package identity, malformed duplicate completion keys, mismatched hit arrays and limits. Added tests to full checks. This is input-contract work only: native tape recording, shared-core replay execution, divergence hashes, screenshots/tree export and the DevTools replay UI remain pending. Goal remains active.

### Native tape contract alignment and replay build review failure (2026-10-05)

Revalidated state after the native replay build request was rejected: the combined escalated command did not execute, so no native-replay source file or build process exists. Automatic approval review could not complete because of an account usage limit; this was not an unsafe-action determination. The denied build was not retried through another permission route.

Independent source review found that the initial tape validator allowed 2048 logical dimensions while Instance::new caps each at 1024, and allowed a back lifecycle event that the shared core does not implement. Corrected the contract to 1024 and show/hide/memoryWarning. Tape tests passed: 2 tests, 16 assertions, including incompatible viewport/event rejection and memoryWarning admission. Native replay execution is still unimplemented/unverified; the original P0–P4 goal remains active. Other authorized workspace work remains possible, so this is not a goal-level blocked determination.

### Replay orchestration and divergence checks (2026-10-05)

Added devtools/replay.ts to orchestrate a validated tape through an engine binding: package SHA-256 must match before boot, original frame/completion/lifecycle order is preserved, framebuffer dimensions and service-effect limits are checked, and SHA-256 frame/effect goldens must cover every frame. Framebuffer/effect differences stop at the first divergent frame. Package and golden inputs are snapshotted before callbacks; the engine is closed on completion or failure. Tests passed (3 tape/replay tests, 26 assertions) using an explicit test adapter, covering ordered dispatch, exact-golden replay, first-divergence stopping, incomplete-golden rejection and package mismatch before boot. Added coverage to tests/check.sh. Native binding, recorder, replay CLI, inspection exports and real native replay acceptance remain pending. The prior native build approval-review usage-limit failure was not bypassed or retried; this is independent workspace implementation/test work. Goal remains active.

### Bounded tape recording (2026-10-05)

Added TapeRecorder, scoped to an original package SHA-256/target/window. It snapshots each owner-fed input/completion/lifecycle record, preserves event order, validates one record at a time, tracks encoded bytes and steps, stops at capacity, and exports a replay-admissible tape. Tests check mutation isolation, rejected records consuming no slots, post-finish rejection, and full 36000-step round-trip. The capacity test exposed that tape parsing inherited a manifest-sized token budget; tape now uses a separate bounded 2304128-token allowance derived from its schema/step limit. Default manifest/storage/service parsing remains at 262144 tokens. Six recorder/replay/tape/parser tests passed (55 assertions); related JavaScript parser/storage/store/publish regressions also passed. Native host capture hooks, native replay binding/CLI and end-to-end replay remain pending. The native build approval-review limit was not bypassed. Goal remains active.

### Native replay session source and launch identity (2026-10-05)

Added core-ffi/src/replay.rs as the native ReplaySession implementation source using the same Instance/package structural selector as mobile hosts. It requires caller plan admission before boot, preserves provided launch data, executes frame input with original latched hits/cancellations, delivers completions/lifecycle events, returns framebuffer/effect snapshots, and stops after turn failures or frame capacity. Rustfmt parsed/formatted the source successfully; compilation and execution have NOT been verified because the native build approval-review usage-limit failure remains unresolved. No denied build was rerouted or retried.

Added required bounded strict-object launchData to the unpublished native tape contract; TapeRecorder captures original launch data and tests round-trip a page query. Recorder/replay/tape tests passed (5 tests), including rejection of array/duplicate/oversized launch data. Public native binding, native replay acceptance, CLI, host capture hooks, tree/screenshot export and UI remain pending. This advances implementation without claiming native verification; full goal remains active.

### Native replay acceptance fixture source (2026-10-05)

Added native ReplaySession tests that construct real structurally valid PocketJS packages and exercise two fresh sessions with identical original launch/query data and recorded completions; compare returned framebuffer/effect sequences across frames; assert identity and plan denial before guest boot (including an infinite-loop source that must never execute); and assert a failing guest turn stops later replay frames. Rustfmt parsed/formatted test source successfully. These native tests have NOT been compiled or run while the prior native build approval-review usage-limit failure remains unresolved. Existing JavaScript recorder/replay/tape tests were rerun successfully. This is test/source progress, not native replay acceptance. The denied native build was not retried or bypassed; full goal remains active.

### Persistable replay golden identity (2026-10-05)

Added devtools/golden.ts to encode/decode bounded comparison artifacts tied to both exact tape-byte SHA-256 and original package SHA-256. A golden must contain every contiguous frame and valid framebuffer/service-effect hashes; unknown fields, identity mismatches, incompatible versions, incomplete frame coverage, malformed hashes and oversized artifacts are rejected. Admitted comparisons are immutable. Six golden/recording/replay/tape tests passed (50 assertions). Added golden coverage to tests/check.sh. These are serialized comparison formats and JavaScript orchestration checks, not proof of native replay execution. Native build verification remains unavailable after the prior approval-review usage-limit failure; it has not been bypassed. Native binding/CLI/capture and broader original acceptance gates remain pending. Goal remains active.

### Native FFI replay binding source (2026-10-05)

Added devtools/native-engine.ts binding to existing mp_package_select/create/boot/launch/frame_input/render/service/lifecycle/destroy functions using the authoritative 64-bit C layouts and local Bun FFI type definitions. It distinguishes composition ABI 1 from package host ABI 7, validates slice lengths, snapshots framebuffer bytes, drains bounded effects and closes native handles/library. Added replay build-plan admission matching native identity/viewport/hash/capability/screen gates before boot. Four plan/replay/golden tests passed (29 assertions), including bundling the binding source without loading a native library. Added coverage to tests/check.sh. No native library was executed and no denied build was retried/bypassed: native runtime acceptance remains unverified after the earlier approval-review usage-limit failure. The binding is not exposed as a completed CLI yet. Recording hooks, native verification, replay UI/export and broader full-goal gates remain pending.

### Public replay command and comparison persistence (2026-10-05)

Added pjm replay argument validation, bounded regular-file inputs, exact package/tape binding, optional original-tape golden checks, explicit validation-only mode that reports nativeAdmission=false, and execution wiring to the native FFI adapter. Golden outputs use fsynced temporary files plus exclusive hard-link publication, preserving existing files and symlinks with cleanup on failure. The validation-only CLI was executed and passed; mismatch and malformed-flag tests passed without loading native code. Six CLI/plan/replay/golden tests passed (45 assertions). Added command documentation and regression coverage. Native execution remains unverified after the earlier approval-review usage-limit failure; no denied native build was retried/bypassed. Host capture hooks and broader original requirements remain pending; goal active.

### Replay frame PNG export (2026-10-05)

Added bounded BGRA-to-RGBA PNG encoding, selected-frame capture snapshots in replay orchestration, and --png-frame/--png-output CLI wiring with exclusive output persistence. A captured divergent frame can be exported before comparison aborts. Invalid frame selections and conflicting output paths are rejected before native loading. PNG tests check channel order, alpha, inflated scanlines, input preservation and framebuffer limits; replay tests check selected-frame capture and pre-boot selection rejection. Targeted PNG/CLI/replay tests passed. Native execution/capture and tree export remain pending after the earlier approval-review usage-limit failure; no denied native build was retried or bypassed. Goal remains active.

### Native retained-tree inspector export source (2026-10-05)

Inspected upstream read-only node/layout APIs and added Instance::debug_tree_json plus optional mp_debug_tree FFI output. Export includes original node IDs, parents, ordered children, node kinds, text and layout, using bounded iterative traversal (16384 nodes/pending IDs) and a 4-MiB JSON limit. Text is JSON-escaped; non-finite geometry and stale/cyclic references are rejected. Inspection does not call highlight/debug mutation APIs. Added native test source comparing pixels before/after inspection and escaped guest text. Rustfmt syntax checks passed. Native compile/run remain unverified after the previous approval-review usage-limit failure; no denied native build was retried or bypassed. CLI binding/tree persistence and actual inspector acceptance are still pending; full goal active.

### Inspector snapshot admission (2026-10-05)

Added devtools/tree.ts for bounded strict parsing of native retained-tree exports. It validates exact schema, original signed node IDs, types, text/geometry, root ownership, parent-child consistency, connectedness and cycle/duplicate rejection; bounds 16384 nodes/traversal IDs, per-node 4096-byte text, 2-MiB total text and 4-MiB snapshot; and freezes admitted data. Two tests passed (12 assertions), preserving literal guest text and geometry and rejecting malformed/stale/cyclic/disconnected/oversized structures. Added coverage to tests/check.sh. Native tree binding, CLI capture and actual native inspector execution remain pending after the earlier approval-review usage-limit failure; no denied build was retried/bypassed. Full goal remains active.

### Replay selected-frame tree CLI wiring (2026-10-05)

Connected optional native mp_debug_tree binding to validated selected-frame tree capture in replay orchestration and --tree-frame/--tree-output persistence. The inspector symbol is loaded only when requested, with library cleanup on resolution failure. Tree/frame selection, paired options, and distinct output paths are checked before boot/loading; snapshots pass strict tree admission before writing. Nine CLI/tree/plan/replay tests passed (57 assertions), including selected-frame inspection order and missing-capability rejection before boot. Native symbol invocation and rebuilt-core acceptance remain unverified after the prior approval-review usage-limit failure, which was not bypassed/retried. The original implementation and physical acceptance scope remains active.

### Replay TypeScript verification (2026-10-05)

Strict no-emit TypeScript checking of all devtools modules and bin/replay.ts found a nullable mp_last_error pointer at the Bun FFI boundary. Guarded that pointer before constructing CString, preserving the fallback diagnostic when native error text is unavailable. The strict type check now passes. All eight replay test files pass together: 16 tests, 109 assertions, covering tape/recorder, golden comparison, plan admission, PNG/tree capture and public CLI validation. These checks do not execute the native library. Native compilation and execution remain unverified after the earlier automatic approval-review usage-limit failure; no denied build was retried or bypassed. The full goal remains active.

### Repeatable replay type-check gate (2026-10-05)

Added tests/replay-typecheck.ts and wired it into tests/check.sh. It discovers all devtools TypeScript modules plus the replay command, uses the existing installed upstream compiler/types (PJM_TEST_UPSTREAM override supported), writes a temporary strict no-emit configuration and always removes it. Compiler failures propagate as the gate's exit code. The new gate passes against the current dependencies; an intentionally missing dependency directory exits nonzero with a specific setup diagnostic. No native build or execution was attempted. Full implementation and hardware acceptance remain outstanding.

### Replay shutdown ownership (2026-10-05)

The native adapter now snapshots its initial app/version identity. Shutdown marks the adapter closed and detaches its engine handle before destruction, avoids querying mp_last_error after mp_destroy (which may already have freed the handle), and attempts inspector/main library cleanup even when an earlier cleanup throws. A shared cleanup helper preserves the first error, including a thrown undefined. Added failure-path regression coverage and the normal check gate; strict TypeScript checking and targeted cleanup/plan tests passed. These are source-level and JavaScript checks, not native FFI execution. Native acceptance remains unverified after the earlier approval-review failure; full goal active.

### Total replay execution deadline (2026-10-05)

Added a 60000-ms monotonic total replay deadline and --timeout-ms integer override bounded to 1..300000. Checks occur before boot, between every tape turn, after native frame execution and before returning success. Expiry closes the engine and prevents subsequent turns/successful golden publication. Invalid/backward/non-finite clocks are rejected. This is a cooperative total bound; it does not interrupt synchronous native calls, which still need existing native guest turn limits. Strict no-emit TypeScript checking and CLI/replay tests passed, including expiry during boot/frame, cleanup, and timeout argument rejection. Native replay remains unexecuted following the earlier approval-review failure. Full goal remains active.

### Replay failure diagnostics and cleanup scope (2026-10-05)

Replay orchestration now owns cleanup across its entire validation/execution scope, including malformed tapes, wrong package identity, invalid capture selection and deadlines. Removed redundant CLI engine shutdown. When replay and shutdown both fail, AggregateError retains both errors and the original error as cause/message, preserving first-divergent-frame diagnostics; successful replay still fails if shutdown fails. Tests cover combined divergence/cleanup failure, close exactly once, cleanup-only failure and malformed preboot input cleanup. Strict type checking and targeted tests passed. This verifies JavaScript orchestration, not native library execution. Full implementation/hardware acceptance remain pending.

### Distribution receipt grammar admission (2026-10-05)

Current-source inspection found uploadPublication still used ordinary JSON.parse for receipts despite strict parsing of signed input envelopes. Replaced it with the shared strict UTF-8/JSON parser after the existing 16-KiB streaming bound. Added actual upload-path rejection cases for duplicate literal/escaped appId fields, BOM, lone surrogate, trailing content and malformed UTF-8. Publication/strict-JSON tests pass (2 tests, 51 assertions). The existing publication fixture is deliberately arbitrary signed bytes; it demonstrates signature/upload behavior only. Publish-side internal PocketJS structure/build-plan admission remains required and is not established by these tests. No external upload or native build was performed. Full goal active.

### Publish admission structural selector foundation (2026-10-05)

Read pinned upstream engine/core/src/package.rs and core-ffi/src/package_ffi.rs admission behavior. Added container/pocket-inputs.ts selecting borrowed inputs without guest execution: 64-MiB payload/checksum, header/variant/section bounds, fatal target/identity/source UTF-8, first matching target/section semantics, ABI 7, embedded app identity, nonempty <=1-MiB plan and NUL-terminated <=16-MiB source. PAK remains optional as in select_guest. Uses existing exact-number FNV footer verifier. One test with 220 assertions passes using pinned upstream encoded valid/rejected fixtures, every truncated prefix, and malformed corpus. Added normal check coverage. This selector is not yet wired to preparePublication and does not itself validate plan policy/version/hash; those remain the next publication admission work. Native execution/full acceptance still unverified.

### Publish structural and build-plan admission wiring (2026-10-05)

preparePublication now authenticates first, selects structurally valid pinned-format inputs for the requested target and signed app identity, checks logical dimensions 1..1024/density 1..4/16-MiB physical surface, and reuses shared plan admission for canonical hash, signed identity/version, ABI/target, fixed native viewport, supported feature/input/screen policy. Read current iOS/Android VerifiedPackage rules to confirm these bounds/capabilities. Replaced arbitrary signed-byte publication test fixture with a package encoded by pinned upstream. Added correctly signed rejection cases for arbitrary bytes, wrong embedded identity/ABI, unterminated JavaScript, wrong plan version, unsupported feature, physical viewport mismatch, oversized logical viewport and boolean analog. Four publication/selector/replay-plan tests pass (270 assertions); strict TypeScript gate passes. No external publication/native build executed. Production distribution, hardware gates and remaining objective scope are still pending.

### Compiler-produced release publication compatibility (2026-10-05)

Ran tests/build.test.ts against the newly wired publish admission. Initial run hit EPERM because pinned compiler jsx-plugin writes its transform cache relative to the shared checkout outside writable roots. Added failure diagnostics to expose actual compiler stderr. Independently verified using a temporary git archive of the same pinned upstream HEAD with read-only shared Git/dependency symlinks and a writable local compiler cache. The complete public create/check/build/sign/publish --dry-run test passed (1 test, 26 assertions), proving actual compiler-produced Android plan/package acceptance alongside type/SDK/build output checks. The test's temporary release and keys were removed by its cleanup. No upload, native compilation or native execution occurred; the earlier native replay build review failure was not bypassed. Full objective remains active.

### Publication structural work limits (2026-10-05)

Bounded container/pocket-inputs.ts to 128 variants and 262144 total section visits, independently of byte limits. This prevents repeatedly referenced section tables from multiplying structural validation work. A <70-KiB checksum-valid fixture with 65 variants sharing 4096 entries rejects at the work bound; its 64-variant boundary reaches normal identity admission, demonstrating the intended threshold. Three publication/selector tests pass (264 assertions). These are client publication limits; the pinned native parser's analogous repeated-table work remains to be bounded in the native wrapper and is not covered by this JavaScript check. Full goal active.

### Native package work preflight source (2026-10-05)

Added checked-arithmetic admission_work_bounded preflight to shared mp_package_select before calling the pinned upstream Package parser. Enforces 128 variants/262144 aggregate section visits, manifest/table bounds and each section-table range without dereferencing borrowed guest inputs. Existing signature/structural/identity/plan admission is still required afterward. Added Rust regression source for shared-table over-limit/exact-limit cases, invalid table offset, short inputs and ordinary fixture admission. Rustfmt parse/format check passes; native test compilation/execution remain unverified after the earlier build approval-review failure, which was not retried/bypassed. JavaScript structural tests still pass (2 tests, 223 assertions). Full goal active.

### Device-info surface budget admission (2026-10-05)

Current host/SDK inspection confirmed device.info.v1 exists in development and installed iOS/Android hosts. SDK response validation bounded each axis/density but did not bound their product. Added the same 16-MiB BGRA physical-surface budget used by engine/package admission, rejecting individually valid 1024x1024 density-4 reports. Added exact 1024x1024 density-2 boundary acceptance alongside invalid-response tests. SDK/native SDK tests pass (15 tests); these mailbox fixtures validate the SDK contract, not physical device reporting or performance. Remaining clipboard/media/location/permission services and hardware gates remain outstanding. Full goal active.

### Persisted package selection strict grammar (2026-10-05)

Read plan permission requirements (manifest declaration, per-app persistent first-call approval, per-app quotas) and inspected existing reference store policy. Found PackageStore.state still used ordinary JSON.parse unlike envelope/data readers. Replaced with strictJson after the existing bounded regular-file read. Added mutation-path regression: duplicate current fields including escaped equivalent, BOM, malformed UTF-8 and trailing content reject cold start, rollback, discard update and staging; original state bytes and package entries remain unchanged after each rejection. Store/storage tests pass (6 tests). This fixes reference package state admission; native persisted permission decisions and clipboard/media/location services remain unimplemented. Full goal active.

### Host-owned per-app permission persistence reference (2026-10-05)

Added PackageStore.permissionDecision/setPermissionDecision for clipboard.read/media/location. Tri-state missing/granted/denied decisions use a separate host-owned permissions.json beside package state, outside guest data/storage.json. Strict bounded schema (1024 bytes, format 1, only boolean known decisions), verified-host supplied app identity, real-directory/regular-file gates, shared app lock and exclusive temporary atomic rename preserve isolation and reject corruption. Decisions represent app-level host approval only, not manifest declaration or current OS permission; all three gates are required at native service invocation. Two new tests cover restart, app isolation, guest storage independence, revocation, invalid identity/name/value, duplicate/corrupt/BOM state, symlinks, busy locks and temporary cleanup. Eight store/storage/permission tests pass. Native persistence/prompts/quota/service wiring and crash-durability fsync acceptance remain pending. Full goal active.

### Android permission persistence source (2026-10-05)

Added tri-state permissionDecision/setPermissionDecision to native Android PackageStore, using owner-thread/root flock protection, no-follow PackageFiles reads/writes, 1024-byte strict BoundedJson schema and per-authenticated-app host-owned permissions.json. Only clipboard.read/media/location boolean decisions accepted; host approval remains distinct from signed declaration/current OS permission. Extended NativePackageStoreTest source for reopen/isolation/revocation/unknown permission/traversal and duplicate-state preservation. Source whitespace checks pass, and reference permission tests still pass (2 tests). Android Java/native fixture compilation/execution has not been performed; native persistence acceptance, iOS equivalent, prompts, quotas and service wiring remain pending. No previously denied build was retried or bypassed. Full goal active.

### iOS permission persistence source (2026-10-05)

Added matching tri-state permissionDecision/setPermissionDecision API to MiniPackageStore. Uses main-thread owner/root flock, held no-follow app directory, bounded strict JSON permission state, exact boolean decisions for clipboard.read/media/location, existing fsync(file)/atomic rename/fsync(parent) write helper, and finally-based descriptor/unlock cleanup. Unknown decision returns nil without error; malformed/busy/invalid identity returns an error. Changed package state parsing to shared strict JSON before mutable dictionary conversion. Extended package-load-ios.m source for restart/isolation/revocation/unknown permission and duplicate-state preservation. Source diff checks pass; six reference permission/store tests pass. iOS native compilation and execution remain unverified; native authorization dialogs, signed declaration/OS checks at calls, quotas and clipboard/media/location service integration remain pending. Full goal active.

### Typed clipboard SDK contract (2026-10-05)

Added app.clipboard.read/write using clipboard.read.v1/clipboard.write.v1, existing frame mailbox delivery/cancellation, exact read {text} response and null write acknowledgement. Text admission rejects nonstrings, unpaired surrogates, >2048 UTF-8 bytes and >3072 escaped JSON bytes to preserve 4096-byte envelope budget; no silent truncation. Tests cover maximal multibyte write, invalid inputs before sending, literal text frame delivery, malformed responses and cancellation. Initial test run stalled on Bun's pending rejection matcher before simulated delivery; stopped owned session (exit 130), switched to existing node assert.rejects pattern. Eleven SDK/installation/clipboard tests pass. No system clipboard was read/written; mobile host adapters, prompts, permission/declaration gates and quotas remain pending, so current hosts return unsupported. Full goal active.

### Installed iOS clipboard write source (2026-10-05)

Consulted Apple's UIPasteboard documentation and added clipboard.write.v1 installed-host dispatch using generalPasteboard.string. Enforces exact {text}, lossless UTF-8 <=2048 and escaped JSON <=3072 bytes, process-wide rolling per-app quota 16 writes/60 seconds with 64 identity cap, main-owner execution and original verified identity/generation reply path. Plan requires approval for clipboard reading; write does not consume clipboard.read approval. Errors return PROTOCOL/BUSY/FAILED. Added native-clipboard-ios.m source using overridable recording adapter/quota hook to avoid system clipboard changes during tests. Source whitespace check and clipboard SDK test pass; native fixture/controller compilation and execution remain unverified. Read prompts/OS handling, Android and development adapters remain pending. No clipboard was accessed during this turn; full goal active.

### Installed Android clipboard write source (2026-10-05)

Consulted Android's ClipboardManager/ClipData documentation. Added VerifiedClipboard and installed-host dispatch/export inclusion. UI adapter calls setPrimaryClip(newPlainText), guarded by foreground status; no native call occurs in this source-edit turn. Owner-thread mailbox retains original verified package/generation/id, bounds four tasks, 15-second monotonic expiry, text/escaped-JSON limits, process-wide 16/60-second per-app quota and 64 identity entries. Cancellation/retirement/close remove queued work before UI writes; synchronized task ownership serializes UI action against retirement. Replies drain before frames, retaining busy completions and dropping retired ownership. Source checks and clipboard SDK test pass; Java/native compilation, lifecycle fixtures and actual device clipboard acceptance remain unverified. Clipboard reads/prompts and development host adapters remain pending. Full goal active.

### Android clipboard lifecycle fixture source (2026-10-05)

Added immutable clock injection to VerifiedClipboard (production elapsedRealtime unchanged) and NativeClipboardTest using queued recording UI adapter and actual authenticated package supplied by package-load fixtures. Cases cover cancellation/retirement before UI execution, text preservation, original package/generation, busy reply retention, exactly-once drain, 15-second expiry before queued action, close-before-action and closed-start rejection. Wired source into package-load-android.sh and invocation once at the first admitted fixture. Shell/source checks and clipboard SDK test pass; native compilation and execution have not run, so these cases remain unverified native acceptance. No system clipboard access. Full goal active.

### Android clipboard/permission Java compilation evidence (2026-10-05)

Ran standalone JDK 17 javac source/target 8 against installed Android API 34 android.jar for VerifiedClipboard, VerifiedPackage, PackageVerifier, BoundedJson, PackageStore, PackageFiles and NativeClipboardTest/NativePackageStoreTest. Compilation passed (expected bootstrap classpath warning only). Added reusable tests/android-service-types.sh with SDK/JDK checks and temporary output cleanup. This compiles Java source without rebuilding/loading/executing the denied native Rust core; no native replay build was retried or bypassed. Android clipboard UI/lifecycle fixture execution and installed Activity compilation remain to verify. iOS source remains uncompiled; permissions/read prompts/service/hardware work outstanding. Full goal active.

### Installed Android clipboard wiring type verification (2026-10-05)

Expanded android-service-types.sh to compile the installed Activity and all supporting presenter/container/storage/HTTP/resource classes against API 34 and offline vendor HTTP jars. Found actual wiring compile failure: VerifiedClipboard.start declared generic Exception while installed dispatch handles JSONException. Narrowed result/start/drain to their actual propagated JSON exception (UI adapter failures remain caught and returned). Full installed Java source compilation now passes, with expected Java 8 bootstrap/deprecated API notes only. Added export assertions preserving the exact clipboard source and installed dispatch wiring. This still does not execute UI/JNI/device lifecycle tests or rebuild native Rust. Full goal active.

### Android declared/host/OS permission gate (2026-10-05)

Added PermissionGate with owner-thread tri-state PROMPT/GRANTED/DENIED classification. Accepts original VerifiedPackage rather than guest identity, denies undeclared permissions before reading/persisting approval, records only host dialog decisions through PackageStore and checks current OS grant every invocation. A saved app approval cannot override OS denial, and prompt-needed is never authorization. Included gate in installed exports and both Java compile/native fixture source lists. Extended native store fixture for media prompt/grant/OS revoke/persisted deny and undeclared clipboard approval refusal. Complete installed Java source/test compilation passes; fixture execution and actual dialog/service invocation wiring remain pending. Full goal active.

### iOS permission gate and bridge syntax verification (2026-10-05)

Added MiniPermissionStatus (Unavailable/Denied/Prompt/Granted) and store gate methods taking original MiniVerifiedPackage. Denies undeclared approval persistence, distinguishes missing decision from corrupt/unavailable store, checks app approval and caller-supplied current OS state, and documents explicit Granted comparison. Extended native fixture source for first-call prompt, undeclared clipboard approval denial, OS revoke and saved denial. Bridge inspection found new store code incorrectly referenced Swift NativePackageVerifier rather than its @objc MiniPackageVerifier name; corrected both strict readers. An attempted syntax check with an old development generated header failed because it lacks verifier declarations and includes UIView. Generated a current verifier-only bridge with swiftc -typecheck -emit-objc-header (no native library/binary build) and PackageStore.m then passed clang -fsyntax-only; Swift typecheck passed. Reference permission tests pass (2 tests). Runtime persistence/gate tests and native dialogs/service wiring remain pending; denied Rust core build was not retried or bypassed. Full goal active.

### Repeatable iOS installed service syntax gate (2026-10-05)

Added tests/ios-service-types.sh, wired into normal checks on Darwin. Uses installed iOS simulator SDK/arm64 iOS 15 target, typechecks PackageVerifier.swift and emits a current bridge header into a temporary directory; checks PackageStore.m, InstalledController.m, native-clipboard-ios.m and package-load-ios.m with clang -fsyntax-only. Gate passes with no diagnostics; temporary header/module cache cleaned. This verifies current iOS host/fixture source types and method wiring without linking/loading/executing native code or rebuilding the previously denied Rust core. Runtime clipboard/persistence/gate fixtures, first-call prompts and full acceptance remain pending. Full goal active.

### Installed iOS clipboard read authorization source (2026-10-05)

Added clipboard.read.v1 installed dispatch and bounded original-package/generation task state. Exact empty args, signed declaration/persisted app decision, four-task cap, shared per-app clipboard quota, foreground/window check, 15-second prompt deadline and native UIAlert first-call approval. Prompt records approval for original authenticated identity; rechecks stored decision and foreground before pasteboard access. UIKit enforces its own read policy; nil read returns DENIED, oversized/unencodable text FAILED, empty nontext clipboard returns empty string. Host app approval does not claim an OS permission bypass; UIKit OS behavior remains to verify. Cancel/retirement/shutdown invalidate timer and dismiss owned alert; completed replies drain before frames and remain on mailbox backpressure. Source syntax gate passes, but no dialog/system clipboard/JNI runtime test executed. Added SDK error propagation cases for DENIED/BUSY/TIMEOUT/FAILED. Android reads/development adapters/media/location/hardware scope remain pending. Full goal active.

### Android clipboard read queue authorization source (2026-10-05)

Extended VerifiedClipboard with startRead and UI permission/decision/prompt/read adapter contract. Denies undeclared clipboard.read before queuing, requires exact empty args, shares bounded pending/rate/expiry state with writes, retains original package, rechecks foreground/deadline/persisted gate before OS read and after prompt decision. UI callbacks serialize with cancellation/retirement under task ownership; stale callbacks cannot persist approval/read/deliver. Prompt dismissal scheduled on cancellation, retirement, close, expiry and completed delivery. Bounds/validates returned Unicode/escaped text with no truncation. Extended native fixture source for invalid/undeclared read rejection. Java source compilation passes; concrete Activity read/dialog adapter wiring and read lifecycle fixture runtime remain pending. No clipboard accessed. Full goal active.

### Installed Android clipboard read adapter source (2026-10-05)

InstalledActivity now retains its main-owner PermissionGate and wires clipboard.read.v1 to VerifiedClipboard.startRead. UI adapter queries/records app approval for original VerifiedPackage, presents one native AlertDialog at a time, delivers selected decision after dismissal through the queued task, and dismisses active prompt on Activity pause. Programmatic dismissal has no selected decision and cannot persist approval. Focus check precedes ClipboardManager access; only ClipData.Item.getText is returned (no URI coercion), empty/nontext clipboard becomes empty string, null/focus failure denial. Android OS read restrictions remain enforced by platform rather than inferred from app approval. Full installed Java source compilation passes; SDK/export reference tests are separate and do not prove UI/runtime behavior. No system clipboard accessed; first-call dialogs, lifecycle/native fixture execution and physical acceptance remain pending. Full goal active.

### Android clipboard prompt cleanup robustness (2026-10-05)

Dismissal scheduling and adapter exceptions no longer interrupt reply completion, cancellation, retirement or close of other tasks. A prompt decision delivered synchronously before the adapter returns its dismiss handle now triggers cleanup of that returned handle when the task is already completed or cancelled. Full installed Android Java compilation passes; clipboard SDK, installed export and reference permission tests pass (5 tests, 37 assertions). These checks do not execute the native prompt or clipboard lifecycle fixtures; runtime and physical acceptance remain outstanding. Full goal active.

### iOS clipboard late permission decision guard (2026-10-05)

Added monotonic request start time and a shared live/deadline/foreground guard before permission decision persistence and before pasteboard reads. A delayed timer cannot authorize an expired request: the callback checks the 15-second boundary itself. Timeout timer now uses common run-loop modes so UI tracking does not defer it. Added recording-controller fixture source for just-before/exact deadline, completed reply preservation, hidden foreground and cancelled task rejection without pasteboard/store access. iOS Swift/Objective-C host and fixture syntax gate passes; clipboard SDK/reference permission tests pass (3 tests, 11 assertions). Native fixture execution, permission dialogs and platform clipboard/device acceptance remain unverified. Full goal active.

### Reference permission decision persistence ordering (2026-10-05)

Permission writes now open the host-owned directory with directory/nofollow flags, create an exclusive private temporary file, sync complete file bytes, atomically replace permissions.json and sync the containing directory. Sync failures propagate rather than claiming durable approval; temporary output and descriptors are cleaned. Added a real filesystem test showing an already-open prior snapshot remains unchanged across replacement, replacement inode differs, mode is 0600, reopened store observes the new decision and no temporary/lock remains. Permission/store/storage tests pass (9 tests). This validates ordinary filesystem replacement and isolation, not power-loss/crash fault injection or native device acceptance. Full goal active.

### Descriptor-bounded reference store reads (2026-10-05)

Added shared readBoundedFile: nofollow/nonblocking open, descriptor regular-file/size checks, incremental reads with a hard byte limit even if a file grows after initial stat, and guaranteed descriptor close. Package payload/manifests/selection/permissions and guest storage now use it instead of unbounded pathname reads after lstat. Added exact empty/one-byte/64 KiB boundaries, oversize, symlink, directory and invalid-limit tests; included helper test in normal check list. Initial run exposed changed storage symlink error wording; preserved the existing Invalid storage error contract with underlying cause. Final bounded-file/permission/store/storage suite passes (10 tests). Parent-directory race resistance and physical/crash acceptance are not claimed. Full goal active.

### Shared reference durable atomic replacement (2026-10-05)

Extracted writeAtomicFile for host-locked private directory replacements: exclusive 0600 temporary file, complete write/file sync, atomic rename/directory sync, nofollow directory open and cleanup. Guest storage, package selection state and permissions use the same ordering. Added real filesystem rename-failure test preserving existing directory output, temporary cleanup, private mode, invalid basename and redirected-directory rejection; added to normal checks. Atomic-file/permission/store/storage tests pass (10 tests). Package staging payload/manifest directory sync ordering is still pending; synced selection state alone does not establish full package crash durability. No power-loss fault injection or physical acceptance claimed. Full goal active.

### Reference newly staged package sync ordering (2026-10-05)

New package staging now writes and syncs payload and signed manifest using the shared atomic-file helper inside the private install directory, then renames the complete slot and syncs the app directory before committing pending selection state. Failed pre-selection staging still leaves current selection unchanged; an orphan slot after a failed post-rename sync is not selected. Atomic-file/permission/store/storage suite passes (10 tests), including signed update/rollback and tamper preservation coverage. This establishes source ordering for newly staged slots; legacy existing slot migration, newly created ancestor-directory durability and power-loss fault injection remain unverified and full crash durability is not claimed. Full goal active.

### Reference ancestor and existing-slot sync ordering (2026-10-05)

New store/app/data directories now sync themselves and their parent after creation. Restaging an authenticated existing slot syncs its regular nofollow-opened payload/manifest and slot/app directories before pending-state publication, without replacing immutable files. Added reopen/restage test confirming unchanged payload/manifest bytes and inodes, no slot temporary files, and successful cold start. Atomic-file/store/storage/permission suite passes (11 tests). Source persistence ordering is strengthened; actual power-loss recovery, filesystem failure injection, parent-directory race resistance and native/device acceptance still require stronger evidence. Full goal active.

### Reference staging payload ownership (2026-10-05)

PackageStore.stage now validates payload type/size before allocation, makes a private byte snapshot before inspecting caller metadata, and verifies and installs that same snapshot. A regression mutates the caller buffer from a metadata getter during validation and confirms cold-start bytes remain the original signed snapshot. Store/permission/storage/atomic-file tests pass (12 tests). This establishes reference payload ownership; it does not prove native/device isolation or complete the full goal. Full goal active.

### Signed metadata verification snapshot (2026-10-05)

verifyPackage captures caller metadata once into a strict JSON copy with the native 64 KiB envelope limit, then validates shape, hash, signature and host compatibility against that copy and returns it. Prevents dynamic properties changing capabilities between verification and return. Added changing-domain getter test and caller-array mutation isolation plus oversized envelope rejection. Package/store/permission/storage/publication tests pass (16 tests). This is reference verification evidence, not native runtime or device acceptance; full goal active.

### Publication and installed-export input read bounds (2026-10-05)

Shared verifyInstalledInputs now reads payload, envelope and raw publisher key using descriptor-bounded nofollow regular-file reads, replacing lstat followed by unbounded readFileSync. Publication and both installed exports inherit hard read-time limits (64 MiB/64 KiB/32 bytes) while preserving the installed-input error contract and cause. Publication/Android export/bounded-file tests pass (4 tests, 82 assertions); separate iOS installed-export check recorded in this turn. No actual upload, native build or device execution performed; full goal active.

### Replay bounded input and artifact directory persistence (2026-10-05)

Replay CLI package/tape/golden reads now use descriptor-bounded nofollow regular-file reads, preserving replay input error wording and underlying cause. New replay artifacts sync their directory after exclusive hard-link publication, retaining existing-output preservation. Added public validation-only subprocess symlink rejection check confirming target bytes remain unchanged and no native code needs loading. Replay CLI/golden/tape/bounded-file tests pass (6 tests, 72 assertions); replay strict TypeScript gate passes. No native replay execution or power-loss acceptance performed; full goal active.

### Replay validation snapshot ownership (2026-10-05)

Replay snapshots bounded package/tape inputs before injected clock or golden callbacks can mutate caller buffers; package hash checking and engine boot now consume the same private snapshot. Golden frame values are copied once before validation, preventing changing properties between checks and comparison. Added mutation regression proving original boot bytes, intact tape execution and one getter read. Replay/cleanup/CLI tests pass (9 tests, 71 assertions); strict replay TypeScript check passes. Native replay remains unexecuted; full goal active.

### Publication admission ownership (2026-10-05)

preparePublication retains admitted signed bytes/metadata privately in a WeakMap keyed by the returned preparation object and exposes detached copies for inspection. uploadPublication accepts only that admitted preparation identity and constructs multipart bytes/idempotency/receipt checks from the private snapshot. Forged/spread preparation objects fail before transport; mutating exposed payload/capability metadata cannot alter uploaded signed inputs. Extended publication test for both cases. Publication and both installed-export suites pass (5 tests, 100 assertions), using mocked transport only. No external publication occurred; distribution deployment and device acceptance remain pending. Full goal active.

### SDK native reply/event discriminator validation (2026-10-05)

Fixed FrameRuntime.enqueue accepting mixed event/request records that beginFrame would classify as an event despite a pending request ID. Event, success and failure envelopes now allow only their own fields; failure errors require exact code/message keys. Added rejection regression for mixed discriminators, success error, failure data, extra top/error fields and confirms subsequent valid reply still settles the original pending request with no event delivery. SDK/native-SDK/clipboard/install suites pass (18 tests). Native host/runtime/device acceptance remains unverified; full goal active.

### SDK native batch capacity enforcement (2026-10-05)

FrameRuntime limits are now frozen after validation. Native connection rejects maxQueued beyond the 32-record mailbox contract; pump bounds aggregate text/UTF-8 bytes before split and rejects excessive record count before enqueueing any records. Regression covers attempts to configure 33 records, immutable limits, oversized empty-line batch, 33 tiny events and successful pending reply after rejection. SDK/native-SDK/clipboard/install tests pass (19 tests). Invalid per-record protocol batches may still fail after earlier valid records are queued; atomic malformed-batch admission and broader guest timer/listener resource budgets remain pending. Native/device acceptance not claimed; full goal active.

### Atomic SDK completion batch admission (2026-10-05)

Added FrameRuntime.enqueueBatch: validates available queue capacity and decodes every bounded reply before appending any of the batch. Single enqueue delegates to it; native pump admits its complete poll batch atomically. Malformed later records cannot leave a valid prefix queued, while previously admitted records and pending requests remain intact. Regression confirms prior event delivery, rejected prefix does not settle request, and subsequent valid FIFO batch succeeds. SDK/native-SDK/clipboard/install suites pass (20 tests). Native/device execution and broader timer/listener budgets remain pending; full goal active.

### SDK frame timer and event listener budgets (2026-10-05)

FrameRuntime now defaults to 256 active timers and 256 total event listeners; native connections permit lower bounds but reject raising either native ceiling. Quota checks precede mutation, duplicate listeners do not consume another slot, cancellation/firing frees capacity, invalid callbacks/event names and unsafe timer deadlines/IDs reject. Fixed repeated stale unsubscribe deleting a newly registered event set. Added quota recovery, duplicate listener and stale unsubscribe regression. SDK/native-SDK/clipboard/install tests pass (21 tests). Lifecycle listener budgeting, guest/native global memory accounting and physical acceptance remain pending. Full goal active.

### SDK lifecycle listener capacity and disposal delivery (2026-10-05)

Lifecycle listeners now use a separate bounded pool under configured maxListeners (native ceiling 256), validate callable handlers, recover slots on removal, ignore duplicate registrations for capacity and prevent stale removal closures deleting newer sets. Both lifecycle and service-event delivery stop remaining callbacks after disposal. Added capacity/removal/reconnect and disposal-during-delivery regression tests. SDK/native-SDK/clipboard/install suites pass (23 tests). These are SDK allocation bounds, not native global memory or physical isolation acceptance. Full goal active.

### SDK exact frame deadline arithmetic (2026-10-05)

Request deadlines now reject unsafe frame addition before reserving an ID or sending work, matching timer deadline checks. currentFrame is a read-only getter backed by internal accounting; frame counter exhaustion disposes pending state before reporting BUSY rather than continuing with imprecise arithmetic. Regression starts at a nonzero frame, rejects MAX_SAFE_INTEGER timeout with no send/ID consumption, rejects public frame assignment and confirms the next one-frame request times out normally. SDK/native-SDK/clipboard/install tests pass (24 tests). SDK source checks do not establish native performance or device acceptance; full goal active.

### Guest SDK strict ambient-independent type gate (2026-10-05)

Added tests/sdk-typecheck.ts to normal checks. Uses pinned upstream TypeScript, strict/noEmit and ES2022-only libraries with no DOM/Node/Bun ambient types; includes every SDK module and cleans temporary config. Gate passes, proving the current guest SDK APIs (including completion batches, timer/listener limits and read-only frame state) do not rely on host-only type globals. This is compile-time source evidence, not actual compiler-bundled QuickJS/native/device execution. Full goal active.

### Shared strict JSON grammar for SDK replies (2026-10-05)

Extracted host-independent strictJsonText into sdk/json.ts and retained container strict UTF-8 decoding as a wrapper. SDK reply admission uses the same depth/numeric/Unicode/duplicate-key grammar with an 8192-token budget, and generated SDK installation includes the new module. Added SDK duplicate/escaped duplicate/BOM/lone-surrogate/nonfinite/depth rejection regression. Updated clipboard malformed-Unicode test to assert earlier frame admission failure and explicit cancellation rather than later promise rejection. Strict-JSON/SDK/native-SDK/clipboard/install/publication suites pass (27 tests, 83 assertions); SDK and replay strict type gates pass. Native fixture execution, canonical-number parity and physical acceptance remain pending. Full goal active.

### SDK outgoing strict JSON admission (2026-10-05)

Outgoing service records now pass the shared strict JSON grammar/token budget after byte validation before any transport call. Lone Unicode surrogates and excessive nesting fail locally with PROTOCOL; serialization failures such as cycles and BigInt also use PROTOCOL rather than leaking generic exceptions. Regression verifies all rejected inputs produce no transport call and a valid emoji request still settles normally. SDK/native-SDK/clipboard/install tests pass (26 tests); strict SDK type gate passes. Guest-turn allocation/execution limits and actual bundled native/device acceptance remain pending. Full goal active.

### SDK request serialization preserves JSON value semantics (2026-10-05)

Request serialization now rejects undefined/function/symbol/BigInt values, nonfinite numbers and sparse-array holes instead of silently dropping fields or turning values into null. Failures use PROTOCOL before transport. Expanded outgoing regression to cover NaN/Infinity/undefined/functions/symbols/sparse arrays while retaining valid emoji round-trip. SDK/native-SDK/clipboard/install tests pass (26 tests); strict SDK type check passes. Native bundled/device acceptance remains pending; full goal active.

### Generated SDK dependency bundle integration (2026-10-05)

Added installed SDK integration test: install into a fresh project, import via @pocketjs/mini dependency link, bundle with browser target/IIFE, execute in an isolated VM without TextDecoder/TextEncoder/Bun/process, deliver frame-owned clipboard read, reject duplicate-ID JSON and cancel pending work. Confirms json.ts and all dependency imports are included and work without host-only APIs. SDK/native-SDK/clipboard/install suites pass (27 tests). This executes a Bun-produced bundle in a JavaScript VM; it does not establish PocketJS compiler/QuickJS/native/device runtime acceptance. Full goal active.

### Typed SDK storage request and reply bounds (2026-10-05)

Storage SDK methods now validate nonempty Unicode keys up to 128 UTF-8 bytes, snapshot strict JSON values within 2048 encoded bytes before sending, check returned values under that ceiling and require null mutation acknowledgements while preserving frame promises/cancellation. Added storage boundary/malformed-input/oversized-get/malformed-ack tests. SDK/native-SDK/clipboard/install suites pass (28 tests); strict SDK type check passes. JSON number/escaping size parity across native serializers and actual native/device storage acceptance remain pending. Full goal active.

### Combined reference regression gate (2026-10-05)

Added tests/reference-check.sh for independently repeatable SDK/container/publication/devtools/replay source validation without invoking native builds or device execution. Runs strict SDK/replay type gates and 30 explicit test files; current execution passes 84 tests, 604 Bun expect assertions (node assert checks are additional and not counted there). Includes generated dependency bundle VM integration and publication mocked transport. Full check remains separate: native runtime/service execution, actual PocketJS compiler integration, physical GPU/performance/isolation and all remaining plan scope are not established by this gate. Full goal active.

### Current SDK actual PocketJS compiler integration (2026-10-05)

Expanded real public create/check/build/release/sign/publication-dry-run fixture to compile TSX imports that exercise clipboard.read and bounded storage.set alongside HTTP/resource APIs. Authenticated package JavaScript inspection confirms clipboard/storage records and strict JSON parser are included. Ran pinned compiler from a temporary git archive with shared read-only dependencies/Git metadata and its own writable cache; preserved upstream source and removed temporary checkout and test releases/keys. Integration passes (1 test, 29 assertions, about 4.25 seconds for test). This proves current compiler packaging/signing/dry-run integration, not execution of the compiled bundle in QuickJS/native hosts, live publication or physical acceptance. Full goal active.

### Location SDK versioned contract source (2026-10-05)

Added location.get.v1 SDK contract with default 15-second deadline, 0..60-second cached-age bound and highAccuracy flag; returns immutable latitude/longitude/accuracyMeters/timestampMs after exact shape/range validation. Uses normal frame-owned request/cancellation and is included in generated SDK dependency copies and public types. Location/native-SDK/generated bundle tests pass (15 tests); strict SDK type check passes. Added location suite to full/reference checks. Native declaration/host approval/OS permission, platform location provider, lifecycle cancellation and device execution are not implemented by this SDK change and remain pending. Full goal active.

### Android location contract JVM validation (2026-10-05)

Added pure Java LocationContract validating exact native request fields, 1..15000 ms timeout, 0..60000 ms cached age, strict Boolean accuracy mode, finite coordinate/accuracy ranges and safe Unix-millisecond timestamp. Immutable value objects detach request options. Added independent JDK --release 8 compile/execution gate (22 checks pass), wired to full checks on Darwin; it neither loads nor rebuilds native Rust/JNI. SDK options now reject explicit null instead of treating it as a default; location test and strict SDK type check pass. Native provider/permission/lifecycle wiring and physical location acceptance remain pending. Full goal active.

### Android location cached-fix monotonic age admission (2026-10-05)

LocationContract.cachedFixAllowed uses Android elapsed-realtime nanoseconds rather than wall timestamps. Zero maximum age never admits cached data, future monotonic fixes reject, negative times reject and exact permitted age accepts with safe ordered subtraction/bounded scaling. Extended JVM suite for exact/one-nanosecond-over deadline, zero cache policy, future fixes and Long.MAX_VALUE arithmetic; 30 checks pass. No location provider/OS permission runtime executed and native integration remains pending. Full goal active.

### Android location owner mailbox JVM lifecycle (2026-10-05)

Added LocationMailbox retaining original host package token/generation/request ID with a four-task cap. Provider callbacks may complete across threads; reserve/drain/cancel/retire/close require owner. Backpressure retains completed replies, exact deadline converts late success to TIMEOUT, cancel/retire/close fence stale task objects, and cleanup handles returned after synchronous completion/cancellation are stopped. Stop action failures do not prevent remaining teardown. Independent JVM tests pass: 30 contract checks and 14 mailbox checks covering cancellation, original ownership, backpressure/exactly-once drain, exact timeout, cap/duplicates, stale callbacks, synchronous stop attachment and cross-thread completion/owner rejection. No JNI/provider/permission/device execution; concrete installed adapter wiring remains pending. Full goal active.

### Android location reentrant cleanup ownership (2026-10-05)

Mailbox drain/retire now iterate task snapshots and remove by original token identity; close clears ownership before invoking provider stop actions. Synchronous cleanup/delivery can cancel other tasks or reuse an ID without invalidating an iterator or deleting the replacement request. Added replacement-during-delivery and cross-task cleanup regression. Independent JVM suites pass (30 contract checks, 17 mailbox checks). Concrete provider/permission/installed-host and device acceptance remain pending. Full goal active.

### Android location queued provider-start fence (2026-10-05)

Added runIfActive for queued UI/provider startup: serializes original task-token liveness with cancellation, rejects completed/closed/retired work, converts expiry to retained TIMEOUT without starting a provider, and converts synchronous startup failure to retained FAILED. Adapter action must initiate asynchronous work without waiting. JVM regression confirms zero provider starts for cancelled/retired/exact-expiry tasks and failure mapping. Independent suites pass (30 contract, 24 mailbox checks). This tests lifecycle state using recording callbacks; FusedLocation/permission/installed adapter and device acceptance remain pending. Full goal active.

### Android location mailbox suspend/resume lifecycle (2026-10-05)

Added owner-only suspend/resume. Suspend first closes new admission, completes unfinished work with retained BUSY and stops provider cleanup; synchronous cleanup cannot start another task while suspended. Late provider callbacks cannot overwrite the terminal result. Resume reopens admission without replaying stopped work, while already completed pre-hide results retain their original ownership. JVM regression covers stopped cleanup, rejection while hidden, stale success, resumed fresh request and pre-hide completed result preservation. Suites pass (30 contract checks, 31 mailbox checks). Activity/provider/permission integration and device lifecycle acceptance remain pending; full goal active.

### Android signed location service wrapper source (2026-10-05)

Added VerifiedLocation adapting exact JSONObject request fields to LocationContract and denying undeclared location permission before mailbox reservation. Pluggable UI authorization checks persisted app/current OS approval before provider start and successful completion; foreground and task liveness rechecked, provider values revalidated, cleanup handle posted to provider UI, and original VerifiedPackage/generation retained for frame drain/backpressure. Cancel/retire/suspend/resume/close delegate to tested mailbox. Included source in full installed Java compilation gate; compilation passes, plus 30 contract/31 mailbox JVM checks. Concrete native approval dialogs/FusedLocation provider/InstalledActivity dispatch and exports are still pending; wrapper runtime and device execution not claimed. Full goal active.

### Android location process-shared request quota (2026-10-05)

Added a bounded ledger shared across VerifiedLocation controllers: 16 admitted calls per authenticated app per rolling minute, at most 64 live identities, expired buckets removed. Clock is read while holding the ledger lock to avoid concurrent-call ordering races. Wrapper rejects quota exhaustion with BUSY and releases reserved mailbox slot; ledger failure releases slot and returns FAILED. JVM tests cover quota, independent app, exact expiry, 64-identity capacity/recovery and clock regression (87 checks). Contract/mailbox tests also pass (30/31 checks); installed Java compilation passes. Provider/approval/Activity integration and device acceptance remain pending; full goal active.

### Android location asynchronous approval adapter source (2026-10-05)

VerifiedLocation now supports asynchronous native app/OS approval before provider start. Approval adapter returns its cleanup handle and supplies persistence as a host action; wrapper executes it at most once only under original live task/deadline/foreground fence, then rechecks authorization before starting one provider. Two-operation cleanup group covers approval and provider, handles synchronous completion before handles return, and attempts all cleanup despite exceptions. Independent cleanup JVM cases pass alongside 30 contract/31 mailbox/87 quota checks; installed Java source compilation passes. Wrapper approval flow itself remains source-only; actual dialogs/FusedLocation/InstalledActivity integration and device execution remain pending. Full goal active.

### Android location independent UI deadline source (2026-10-05)

VerifiedLocation now schedules a main-looper timeout from the original monotonic reservation deadline instead of relying only on frame drains. Expiry completes retained TIMEOUT and requests cleanup; completion/cancel/retire/suspend removes the scheduled callback through the bounded three-operation cleanup group (deadline/approval/provider). Handler rejection completes FAILED without provider startup. Java source compilation passes and independent contract/mailbox/quota/cleanup JVM tests pass; actual Handler scheduling and native dialogs/provider execution remain unverified. Main-looper scheduling is cooperative, with deadline rechecked before approval persistence/start/success. Concrete installed adapter and physical acceptance remain pending; full goal active.

### Android FusedLocation one-shot provider source (2026-10-05)

Located cached Play Services location 21.2.0 plus base/basement 18.3.0 and tasks 18.1.0; inspected actual jar CurrentLocationRequest/FusedLocationProviderClient API and POM dependency requirements. Added main-owner FusedLocationProvider with one-shot duration/cache-age/accuracy/granularity request, cancellation token, main-queue callbacks, missing-fix TIMEOUT, security DENIED and invalid/stale result FAILED. Fresh requests reject fixes measured before provider startup; cache requests use monotonic validated age; output validates finite coordinates/accuracy/safe timestamp. Standalone Java compilation against Android API 34 and the actual cached extracted classes passes (expected Java 8 bootstrap warning); temporary extracted jars removed. No location access occurred. Full reproducible dependency lock/transitive Kotlin-coroutine/runtime-resource packaging, native approval/Activity wiring, APK/device acceptance remain pending. Full goal active.

### Pinned FusedLocation API compile gate (2026-10-05)

Added vendor/android-location/compile-lock.json pinning cached API AAR byte sizes/SHA-256 for location 21.2.0, base/basement 18.3.0 and tasks 18.1.0. Added tests/fused-location-types.sh: resolves those exact Gradle cache versions, rejects missing/changed artifacts, extracts classes to a cleaned temporary directory and compiles provider/wrapper source against Android API 34. Gate passes; no native Rust build, SDK download or location access occurred. Lock is explicitly compile-only and does not cover full Kotlin/coroutine/AndroidX/resources/manifest runtime closure or redistribution packaging. Actual installed adapter/permission/APK/device work remains pending. Full goal active.

### FusedLocation startup failure cleanup (2026-10-05)

Provider startup now catches request/listener registration failures, cancels the cancellation token to stop a request whose listener registration failed, and reports SecurityException as DENIED and other startup failures as FAILED. Successful position validation completes before invoking the host completion callback, so an exception from that callback cannot trigger a second FAILED completion. Pinned cached API source compilation passes. Independent JVM tests pass (30 contract, 31 mailbox, 87 quota checks and cleanup cases); reference checks pass 85 tests across 31 files with 621 assertions, including the location SDK contract. Provider failure paths themselves remain source-checked, not runtime-tested. InstalledActivity still returns UNSUPPORTED for location and exports lack the full Play Services runtime closure; native approval/OS permissions, APK integration and device acceptance are the next location milestone. Rust/native replay build remains unverified after the earlier approval-review failure. Full goal active.

### Concrete Android location consent adapter source (2026-10-05)

Added LocationApproval using native AlertDialog app consent and Activity.requestPermissions for coarse/fine OS location (both permissions together for fine requests). PermissionGate reads saved app consent independently of OS grants; saved denial prevents prompting, saved approval avoids a repeated app dialog, and current OS grants are checked again before authorization. Persistence remains a host action passed back to VerifiedLocation and executed only under its original live task/deadline/foreground guard. Pending dialog ownership retires before dismiss/delivery; cancellation detaches callback while retaining an OS-in-flight fence until its result arrives. Process-wide OS request identifiers never reuse and saturate on exhaustion; stale callback codes cannot complete a replacement request. Approval contention maps BUSY and asynchronous framework failure maps FAILED without saving a denial. Android service source compilation passes with the real API 34 jar; wrapper/provider cached API compilation passed after Decision failure support was added. Dialog, OS callback and wrapper runtime behavior are not yet executed; InstalledActivity/export wiring remains pending.

Inspected cached POMs for all four Google artifacts: location additionally needs Kotlin stdlib 1.9.0 and coroutines Android/core 1.7.3; base/basement require AndroidX collection 1.0.0, core 1.2.0 and fragment 1.0.0/1.1.0. Several exact AndroidX binaries and the coroutines-core POM binary are absent from the cache (core may select a JVM variant). Full transitive conflict/variant resolution, AAR resources/manifest handling and lock/export packaging must be completed before APK integration is claimed. Full goal active.

### Android installed location integration and offline APK closure (2026-10-05)

Resolved actual Google location dependencies with Gradle 8.13 in an isolated temporary Gradle user home, downloading official Google/Maven metadata and artifacts after network escalation was approved. Resolution succeeded with 27 artifacts and a retained Gradle dependency lock. Added an offline runtime lock with original artifact URLs/byte sizes/SHA-256 and hashes for 422 extracted files: 27 jars, original AAR manifests/resource XML/symbol tables, namespace list and original POM metadata. Shared Kotlin stdlib 2.1.21 and AndroidX annotation-jvm 1.10.0 are verified byte-identical to the HTTP runtime. Gradle selected JetBrains annotations 23.0.0; installed export replaces its old HTTP 13.0 jar to avoid duplicate classes. The exporter verifies every runtime file before producing output. Regression checks reject modified jars/resources, symlinked files and traversal lock paths.

InstalledActivity now routes location.get.v1 to VerifiedLocation, drains original app/generation replies at frame boundaries and includes cancellation, retirement, suspend/resume and close. Fused provider creation is deferred until an authorized request starts. Native consent uses LocationApproval, callback codes never reuse, and results received while paused wait for foreground resume. A pause caused by the host's own OS permission request preserves approval work; a real stop suspends it. UI foreground/authorization and original task/deadline remain checked before persistence/provider start/completion. Native clipboard and location approval dialogs are prevented from overlapping. These Activity/permission lifecycle paths are source-compiled, not yet runtime-tested.

Installed export now includes all location sources, offline runtime jars/resources and required coarse/fine manifest declarations, inspected Google API activity/version metadata and AndroidX core component factory. APK builder compiles AAR resource groups, generates namespace resource classes, then compiles Java and dex before packaging. Actual relocated export (folder containing spaces) built an unsigned APK successfully using a deliberately non-executable engine fixture. This proves Java/resource/dex packaging only, not native engine execution or location. D8 reports upstream local-variable debug information stripping and a Google companion-object warning; physical runtime compatibility remains unproven. Original manifests and published license metadata are retained for dependency/distribution review.

Updated the native signed-surface fixture to use the production exporter/build script, preserving controlled HTTP test transport support. Its Rust/device path was not run. Development APK source compilation no longer includes the unused installed Activity; development-native service parity remains separately pending. Reference suite passes 86 tests across 32 files with 636 assertions; independent location JVM suites pass (30 contract, 31 mailbox, 87 quota checks and cleanup cases); installed/development Android Java source gate passes. Latest native Rust replay/work-limit changes remain uncompiled after the earlier review failure; full P0–P4 hardware/performance/isolation, GPU, iOS location/media and other outstanding scope remains active.

### Current native core, public replay and physical wrapper validation (2026-10-05)

Fresh automatic approval review allowed native build/test execution. Compiled current core and passed all 36 actual Rust tests, including package table work bounds, replay original launch/completion order and failure cleanup, read-only tree inspection, retained guests/LRU isolation and resource/guest limits. Built current debug and release native libraries. macOS release build succeeded with a nonfatal rust-objcopy debug-strip warning (toolchain libLLVM rpath unavailable); execution still requires its own evidence and distribution tooling remains to be reviewed.

Added tests/replay-native-cli.ts and executed the public pjm replay command through actual Bun FFI against the release library. Pinned-format fixture guest, three tape frames, native completion, packed touch and hide/show/cancellation reproduce identical saved pixel/effect hashes in a second engine. PNG signature/dimensions/inflated rows and literal quoted/emoji/newline/HTML-looking node text are verified; changing frame 1's expected pixel hash produces exit 1 with the original first-divergence diagnostic. First regression run had an incorrect expected diagnostic word, corrected to the real “Replay diverged at frame 1”; native changed-golden rejection itself worked in both runs. This is actual headless native software rendering/inspection, not a desktop host or mobile graphics/performance acceptance. Host recording hooks and replay UI remain pending.

Revalidated the connected Pixel 8 Pro and rebuilt the current Android release core and JNI bridge. Existing signed admission/retained execution suite passed 21 cases with secure storage/rollback/owner/lock/symlink and guest isolation. Added NativeLocationTest with a separate signed location-declaring fixture, real Android JSONObject/SystemClock/Handler and controlled provider/approval/delivery callbacks. Plain Dalvik attempt exposed missing MessageQueue native registration; switched the owned temporary test runner to framework app_process. The framework run passed location protocol, queued cancellation/retirement, cancelled consent persistence fence, live denial/approval, original app/generation backpressure, revoked authorization, suspend/stale completion and close, plus all 21 original package cases. Base fixtures retain undeclared-location assertions; no production permission checks were relaxed. Test files were removed from the device on completion. Evidence: build/android-validation/native-current-20261005/package-load.log and location-wrapper-framework.log; failed harness attempt retained in location-wrapper.log.

The physical wrapper suite does not read location, use Google FusedLocation, show app/OS consent dialogs, fire deadline callbacks or prove SDK-to-Activity frame delivery. Those real platform integrations, GPU backend, graphics/memory/performance gates, iOS location/media, recording/replay UI, development-service parity and remaining full P0–P4 acceptance scope still require work. Full goal active; the earlier native review failure is no longer the current build blocker.

### Physical installed surface and viewport input validation (2026-10-05)

Executed the current production exporter/build path and signed installed Activity on Pixel 8 Pro/API 36. The temporary app passed authenticated startup and actual GLES-presented screenshot colors: initial red, center-touch blue, warm resume blue, and cold restart red. Evidence: build/android-validation/installed-current-20261005 and native-current-20261005/installed-surface.log. Inspected the actual screenshot: fixed square guest centered with black letterboxing and system safe regions.

Hardened the surface fixture to stop before device taps unless the authenticated guest marker is present and the owned process PID is valid; logs are scoped to that process instead of reading unrelated AndroidRuntime entries. Added surface-input-points.ts deriving tap coordinates from the authenticated SurfaceView's actual UI bounds. Physical bounds [0,113][1008,2190] produce center (504,1151) and letterbox (504,380). A new test taps that letterbox before the viewport and verifies the guest remains red; viewport tap still turns blue, warm state remains blue, and cold restart resets red. Rerun passes with evidence under build/android-validation/viewport-current-20261005 and native-current-20261005/viewport-surface.log. Both runners exited zero and uninstalled their owned temporary app/removed device files. No sensor permissions or location access occurred. This establishes the simple installed software-frame/viewport lifecycle path, not full native GPU or complex-page graphics/performance/memory acceptance.

Inspected actual pinned GPU sources rather than relying on illustrative plan/header comments. The pin contains engine/ui-cabi/src/gl/es2.rs, the shared gl/mod.rs DrawList walk/texture/font caches/batching/scissor implementation, and hosts/android/app/jni/runtime.c GLES2 calls. PocketUiSurface.with_ui provides retained Ui borrowing. Existing public GL entry points use a process-global static RENDERER, so direct reuse would mix retained guests' resource ownership; integration needs per-instance/context renderer ownership and bounded GPU resources, not a global C-ABI shortcut. GPU implementation and all other outstanding original requirements remain active.

### Per-renderer GLES2 adaptation and bounded planning (2026-10-05)

Added core-ffi/src/gles adaptation from the actual pinned GLES2 backend, preserving its MIT license and recording original source SHA-256. Verified those hashes against Git blobs at fe971ebb8e14724d2a98d4df6b34c065caf11132; upstream tracked source remains unchanged. Removed process-global renderer/trace and GLES1 singleton entry points. Renderer owns pipeline/texture/font/geometry state and uses an Rc marker to prevent Send/Sync. Explicit destruction requires its original GL context current; no implicit GL calls on CPU Drop, so future host integration must distinguish lost/current contexts and retire resources safely.

Retained all 11 upstream pure planner/texture/glyph/scissor tests. Added original-state isolation, expanded geometry admission and actual retained-Ui resource-budget regressions. Admission bounds 262144 DrawList words/expanded vertices, clip depth 256, finite UVs and supported opcodes; geometry uses fallible exact reservation before font preparation/uploads. Image admission checks real UI texture tables, maximum driver dimensions, 512 slot history, 16 MiB individual decoded RGBA storage and 64 MiB conservative aggregate including generated glyph pages/white texel. Two-phase cache sync deletes all stale allocations before uploading replacements. Tests demonstrate aggregate rejection and recovery after a texture is freed, plus slot-history rejection. All 51 native core tests pass; the final source also passes Android aarch64 target checking against NDK 28.2.13676358.

This is compiled, tested CPU-side GPU-backend adaptation, not active GPU presentation. It is not yet attached to Instance/shared FFI/Android host. GL-driver execution, context loss/retirement, process-wide GPU/CPU budgets, generated glyph allocation policy, physical shader goldens, Metal backend and all remaining original P0–P4 services/tooling/performance/isolation acceptance remain outstanding. Existing physical surface results still describe software BGRA upload. Full goal active.

### Explicit GLES context lifecycle and Instance ownership (2026-10-05)

Added ContextState with nonzero, strictly increasing host binding epochs, one active renderer and owner-thread marker. Mismatched epochs cannot render, release or mark loss. Release removes ownership before explicit destruction; loss discards CPU state without driver deletion. Failed creation leaves state empty; old epochs cannot be reused after successful attachment. Three recording-state regressions pass, bringing the native core suite to 54 passing tests. These tests do not issue GL calls.

Android Instance now owns this state and exposes attach, retained-UI direct render, release and context-loss methods. Render rejects stopped/suspended guests and invalid/overflowing physical viewport bounds before accessing the renderer. Unsafe driver operations explicitly require the original context current on the owner thread; an epoch alone does not establish that driver condition. Final Android aarch64 source checking passes. Stable FFI/JNI/Activity wiring, retirement coordination and physical GL lifecycle/golden tests remain pending; production still presents software BGRA. All other original outstanding requirements remain active.

### Individual-instance GLES shared API (2026-10-05)

Added mp_gles_attach/render/release/lost to the shared ABI and C header. The render descriptor requires exact structure size and contains top-left physical viewport/window dimensions. Calls reuse owner-thread, error and panic handling; unsupported platforms fail explicitly rather than falling back. Header documents current-context obligations, monotonic binding epochs and release/loss before destruction. Actual macOS FFI regression creates/boots a real guest, rejects null/unsupported rendering, checks diagnostics and proves a subsequent guest frame still succeeds. All 55 native tests pass; Android aarch64 checking and C header syntax checking pass. No GL driver calls were tested. Retained-pool GPU cleanup before eviction, JNI/Activity wiring, physical driver acceptance and all other remaining goal scope are still outstanding. Full goal active.

### Independent retained-resource retirement boundary (2026-10-05)

RetainedEngine now provides an owner-thread resource retirement hook receiving the stopped Instance after the final guest turn and before identity retirement. It runs independently of guest resume/unload/frame success; repeated unload cannot repeat it because engine ownership is taken first. Native tests verify healthy and failed guest ordering, and real pool LRU eviction, memory-pressure eviction, repeated close and pool-drop each retire exactly once. Fixed a missing Rc import in the initial test compile. Final native suite passes 57 tests. This is the resource-adapter boundary, not yet a connected GL cleanup implementation: pool binding/FFI, actual current-context verification, JNI/Activity wiring and physical GPU retirement remain required. Full original goal remains active.

### Actual EGL identity checks and linked Android GPU library (2026-10-05)

Android bindings capture non-null eglGetCurrentDisplay/eglGetCurrentContext before renderer creation. Rendering and explicit resource deletion reject mismatched actual EGL identity before GL calls; host epochs remain necessary because driver handles may reuse after loss. Individual-instance mp_destroy rejects a still-attached GPU binding without freeing the handle, requiring release or explicit loss first. Added explicit Android EGL/GLESv2 linking. Final optimized Android aarch64 shared-library build succeeds, and ELF dynamic inspection confirms libEGL.so/libGLESv2.so dependencies. Native regression suite remains 57 passing tests. These are source/link and CPU-test evidence; EGL mismatch/destruction behavior and shaders still need actual driver execution. Retained-pool GPU adapter, Android host wiring, physical goldens and all other original outstanding scope remain active.

### Physical GLES pbuffer rendering and lifecycle (2026-10-05)

Added native Android C driver test and reusable device-selected runner. Executed final release library on connected Pixel 8 Pro through actual EGL display, two independent GLES2 contexts and a 32x32 pbuffer. Real guest root draws green; glReadPixels verifies RGBA green with full alpha before and after original-context destruction and renderer recreation. No-current attachment, stale epoch render, wrong actual-context render/release, premature mp_destroy, repeated release and old-epoch attachment reject as expected. Correct-context release succeeds, explicit loss makes no driver deletion, fresh context renders and releases, and final instance/context/surface destruction succeeds. Initial physical run and final reusable runner both exit zero; runner removes its owned device/local files. Default-sandbox adb daemon start was denied, then approved escalation allowed the physical execution. No sensor or app permission was accessed.

This proves simple native GLES offscreen rasterization and exercised lifecycle guards on one physical driver. It does not prove installed Activity direct rendering, retained-pool GPU ownership/retirement, complex image/text/scissor goldens, Metal, graphics memory/performance acceptance or remaining original P0–P4 scope. Full goal stays active.

### Retained-pool GLES ownership and physical retirement (2026-10-05)

Added mp_pool_gles_render with lazy per-guest attachment and pool-wide binding epochs; post-loss bindings must increase the epoch. All ordinary pool calls validate every attached renderer's actual EGL context before mutation or guest turns; last_error and explicit loss remain available without current GL. Destroy validates before freeing and preserves the handle on mismatch. Installed resource retirement releases each engine's attached renderer before identity retirement, including LRU/memory-pressure eviction, close and shutdown. Loss validates pool epoch and every retained binding before any CPU-only invalidation. Failed guest health does not prevent resource inspection/retirement. Native caller callbacks must preserve the current context throughout their synchronous pool operation.

Final optimized Android build succeeds and 57 native regression tests pass. Expanded physical Pixel pbuffer test passes with two retained renderers, LRU eviction, warm guest switch, mixed-epoch rejection, no-current memory-warning/destroy rejection with readable diagnostic, wrong-loss rejection without partial invalidation, pressure eviction, close, shutdown, actual context destruction/pool loss/recreation and green readback afterward. Owned temporary test files are removed. This verifies executed simple pool GPU lifecycle paths, not measured driver allocation reclamation or complex graphics/performance isolation. JNI/Activity direct presentation, Metal, broader shaders/goldens, process resource budgets and all remaining full goal scope stay active.

### Android direct-frame JNI and retained GPU release (2026-10-05)

VerifiedContainer/JNI now expose direct input-frame plus GLES render, context-loss notification and explicit all-guest GPU release. Input arrays retain count/hit/cancellation bounds; direct draw avoids software rendering, copied Java pixels and framebuffer upload. These JNI entry points are source-checked, not yet invoked by InstalledActivity. Existing installed software presentation remains until lifecycle wiring is completed.

Added mp_pool_gles_release to delete retained renderers while the original context is current, preserving guest realms and requiring a newer binding epoch afterward. Physical Pixel suite passes release/rebind on the same actual context, old-epoch rejection, successful intervening guest frame and green readback; final Android release build succeeds. Java service/installed source compilation and Android JNI C syntax checking pass. Native regression suite remains 57 passing tests. Inspection found queued GLSurfaceView lifecycle work may execute before current EGL on resume; Activity wiring must release bindings before pause and distinguish actual loss before reattachment. Physical Activity path, full service parity, Metal and remaining acceptance scope are still active.

### Installed Android direct GLES presentation and physical lifecycle (2026-10-05)

InstalledActivity now submits input plus direct retained DrawList GLES rendering through JNI, using the existing centered fitted physical viewport and logical touch mapping. It no longer calls the software framebuffer-copy/upload draw path. Surface recreation reports a bound old context lost and advances epochs; pause releases bindings before background/close and advances the binding epoch while preserving guest realm state. Existing retirement synchronization remains. Added explicit EGL/GLESv2 native linker flags to installed export, development linker and signed admission/surface fixture linkers so static archive GPU references resolve.

Android Java source compilation passes. Fresh physical signed app build/install on Pixel 8 Pro passes direct-rendered initial red, letterbox rejection red, viewport touch blue, HOME/warm resume blue and BACK/cold restart red. Runtime log contains no errors; evidence under build/android-validation/signed-surface-20261005T115029Z. Runner exits zero and removes its temporary installed app/device files. This proves the simple installed direct-GLES input/pause/resume/restart path on this device, not forced Activity EGL loss, complex glyph/image/scissor correctness, resource accounting, benchmark performance, Metal or other remaining original acceptance scope. Full goal stays active.

### Failed-draw binding visibility and pause cleanup (2026-10-05)

Added owner-thread mp_pool_gles_epoch and JNI/Java query available without current EGL. InstalledActivity updates its binding flag in finally after direct drawing, so attachment followed by rendering failure remains visible for later release/loss. Pause cancellation errors are reported but no longer skip resource/service cleanup. Physical Pixel driver regression intentionally attaches then rejects an invalid viewport, observes the retained native epoch, recovers with valid rendering and releases during pool destruction. It also verifies the unbound query after release. Final Android native build and physical driver suite pass; Java source/JNI syntax checks pass and 57 native regression tests pass. The Activity failure/pause branch itself remains source-checked; successful Activity physical evidence predates this small correction. Inspection also identified Java/JNI close ownership on rejected native destruction as a remaining issue to repair before broader failure acceptance. All remaining original scope stays active.

### JNI close ownership transfer and final callback failure (2026-10-05)

Replaced control-operation destruction with dedicated JNI destroy receiving a one-element consumed flag. Rejected native destruction leaves Peer/global owner and Java policy/handle intact. Successful native destruction sets the transfer flag before reporting captured retirement exceptions and releasing Peer/global owner. Java finally clears its handle/maps only on transfer, preventing both lost live handles after rejection and stale freed handles after callback error. Java source compilation and strict JNI C syntax/warning checks pass.

Physical Pixel signed-container suite passes all 21 package cases plus JSON, controlled location and package-store suites with the updated JNI. Added and executed a final-close listener failure regression: expected exception is delivered, repeated close is harmless, and further effects reject the closed handle. Native wrong-EGL destruction rejection was previously tested in the C driver; equivalent rejection/recovery through Java/JNI still needs a dedicated EGL harness. Full original goal and other remaining scope stay active.

### Physical Java/JNI rejected-close recovery (2026-10-05)

Added NativeGpuCloseTest using actual Android EGL14 with a pbuffer and GLES2 context. Authenticated package is activated through VerifiedContainer, directly rendered, then EGL is unbound. Java close rejects and native binding query still returns the original epoch, proving Java/Peer ownership was preserved. Restoring the original EGL context allows another direct frame, successful close and harmless repeated close. Harness destroys its owned EGL objects and the package runner removes owned temporary files. Physical Pixel execution passes this regression and all 21 signed-package/container cases plus strict JSON, controlled location and package-store suites. This closes the previously missing Java/JNI rejection recovery evidence; allocation accounting, complex graphics/forced Activity loss, benchmark performance, Metal and all other remaining original scope are still active.

### Installed fixed-rate pacing and bounded request backlog (2026-10-05)

Verified current PocketUiSurface publishes a default 60 Hz core tick rate. Added FramePacer to InstalledActivity: display timestamps schedule 60 Hz guest requests, one outstanding request applies backpressure, delayed callbacks skip deadlines without catch-up bursts, draw completion releases the reservation, and pause resets the schedule. Pacer is included in production export and source compilation. Added a cleaned JVM runner to check.sh. Simulated 10-second 60/90/120/144/240 Hz timelines produce approximately 600 requests each; backpressure, long delay, backwards timestamp and reset cases pass. Java source gate passes and installed export tests pass (initial CLI test lacked Bun on child PATH; rerun with correct PATH passes both cases).

First physical signed-surface run failed because the initial screenshot was already blue before any harness tap; its runtime log is empty and cause remains unexplained. Evidence preserved under signed-surface-20261005T115954Z. Repeat using the same app sources passes initial/letterbox red, viewport blue, warm blue and cold red, with owned app/files removed. Added initial-color assertion before any harness input to stop immediately on unexpected initial state. Physical functional pass does not measure frame cadence, sustained benchmark FPS, input latency or memory. That measurement and the unexplained first-run initial state still need investigation; all other original outstanding scope stays active.

### Opt-in bounded CPU/submission counters and physical pacing evidence (2026-10-05)

Inspected the existing benchmark TSX: 1,000-row VirtualList plus plan/newsletter/submit form. Added constant-memory FrameMeasurements, opt-in via pjm-measure launch flag, recording CPU duration of host frame work and intervals between draw submissions. Counts/maxima/totals emit once on pause under the owned PocketJS log; they are explicitly labelled host_cpu_submission, not swap/display timestamps. Invalid/backwards clock samples are rejected and accumulation is bounded. Export/source gates include the class. JVM deterministic counter checks and refresh-rate tests pass.

Physical Pixel signed simple fixture with instrumentation passes initial/letterbox red, touch blue, warm blue and cold red. Warm owned log under build/android-validation/signed-surface-20261005T120336Z records 389 frames, elapsed 6474847253 ns, total CPU 558000285 ns, maximum CPU 20407878 ns, maximum submission interval 21473796 ns, zero CPU/interval samples above 33 ms. This supports near-60 Hz submission for the simple fixture, excluding pause; it is not compositor FPS, benchmark sustained scrolling, first actual present, input latency or memory acceptance. 1,000-row/form physical workload, PSS baseline/delta, Perfetto/Instruments and all other remaining original scope still require work. Full goal active.

### Actual benchmark compile and signed installed APK preparation (2026-10-05)

Public benchmark build encountered an upstream ignored generated-style mirror write into the read-only reference checkout and failed. Archived the exact pinned revision into /private/tmp/pjm-benchmark-compiler-fe971ebb and reused its read-only dependency modules; isolated compiler build succeeds without modifying the upstream tracked source. Actual benchmark compiles 1,000-row VirtualList/form TSX, 20 styles and two baked font slots (14/16 px, 98 glyphs each), with 58528-byte pak and 203769-byte JS. Development package is examples/benchmark/build/benchmark.pocket.

Added benchmark-project.ts to sign that actual payload in memory with a temporary Ed25519 key and export through the production authenticated Android path. No private signing key is saved. Linked current native JNI/core with EGL/GLES2 and 16 KiB page alignment. Production resource/Java/dex APK build succeeds after setting ANDROID_SDK_ROOT; artifact build/benchmark-gpu-20261005/project/build/Mini-unsigned.apk is 4929435 bytes. Google companion/debug-local warnings remain the same as previous successful fixtures. This prepares the real benchmark for device testing; it has not yet been installed/rendered or measured. Physical list/form graphics, scrolling frame acceptance, memory delta, compositor measurements and all other original outstanding scope remain active.

### Physical actual benchmark rendering and first mixed workload (2026-10-05)

Added benchmark-surface-android.sh: refuses to replace a pre-existing fixed test bundle, signs the actual exported APK with an owned temporary key, requires authenticated benchmark marker before input, scopes logs/memory to its process and uninstalls/removes owned files on exit. Pixel first run renders actual baked text and VirtualList rows 1–14; screenshot inspected. Total process PSS is 132970 KiB, including 84952 KiB Graphics; this is not the required incremental per-instance baseline/delta. Evidence: build/android-validation/benchmark-gpu-20261005-first. Its pause log was missed due immediate read; runner now polls for measurement completion.

Added authenticated-surface-derived benchmark coordinates for the actual 390x844 logical viewport. Second run executes six one-second upward swipes and opens the form. Inspected screenshots show rows 20–33 after scrolling, selected row 27, and rendered form. Owned measurement log records 776 frames over 13122584560 ns, maximum CPU 15966634 ns, no CPU samples above 33 ms, but maximum submission interval 162813558 ns and three intervals above 33 ms. This is a mixed scrolling/idle/form-switch run, not isolated scrolling or compositor FPS acceptance. Form screenshot unexpectedly shows Newsletter Yes after only the mode-switch tap despite initial false; input/recycled-hit/press behavior needs investigation. Evidence: build/android-validation/benchmark-gpu-20261005-scroll. Both runners exit zero/remove owned app/files, but runner exit proves operation/capture only, not performance/form correctness acceptance. Full original goal active; identified timing/input issues and remaining scope require work.

### Authoritative native benchmark input reproduction (2026-10-05)

Physical form-only retesting could not start: the selected Pixel serial disappeared and a fresh device inventory was empty. No new device acceptance evidence was collected. Hardened the benchmark runner to require the selected device state before signing, evidence-directory creation or installation.

Added native benchmark input regression using the actual compiled benchmark and macOS native core. The first swipe harness guessed targets from inspector rectangles and failed its required visible-row advancement assertion; it was not evidence of scrolling. Added optional owner-thread native hit testing to ReplayEngine through existing mp_hit_test, rejecting non-finite coordinates. The corrected six-swipe sequence advances the maximum visible row from 17 to 69 and then opens the form through an authoritative hit target. Newsletter remains No. The isolated form-switch case also remains No; both final runs pass, as do shell syntax and diff whitespace checks. Captured inspector evidence is under build/benchmark-native-input. This rules out the anomaly for these deterministic native sequences only; Android input timing/packing and the earlier physical Newsletter Yes result remain unresolved. Device reconnection, physical repetition, performance/memory acceptance, iOS GPU and all remaining original goal scope are still required. Full goal active.

### Freeze ended Android contacts across queued pointer reuse (2026-10-05)

Inspection found InstalledActivity retained ended contacts until the next rendered sample but continued updating them from later MotionEvents with the same Android pointer ID. Thus a quick new gesture before frame drain could overwrite an old gesture's final position while keeping its original latched hit. Added owner-thread TouchContact terminal update protection and skipped ended contacts in Activity event processing. New contacts keep independent identifiers and hits; final samples remain available for their existing frame-drain path. Production export and Java source gate include the helper.

A JVM regression simulates an ended scroll contact plus a new contact reusing pointer zero, followed by queued move/up updates. It verifies the old final position/hit/identifier remain intact while the new contact completes independently. Regression and existing frame pacing/measurement tests pass; all Android host/service Java sources compile and diff whitespace checks pass. This repairs a concrete queued-event defect, but no physical Android rerun has established that it caused the earlier newsletter anomaly. Physical validation and all remaining full-goal scope stay active.

### Preserve between-frame gesture displacement (2026-10-05)

Installed touch coalescing also discarded a gesture's initial position when down/move/up all arrived before the first guest frame. That allowed the guest to see a zero-distance contact at the final point. TouchContact now keeps its initial position for the first sample, then supplies the latest/final position on the next sample. An ended contact drains only after that final sample; an already-reported contact still drains on its normal final sample. Sampling state advances after successful drawing, and existing cancellation uses only reported identifiers.

JVM regression now checks compressed gesture initial/final delivery, terminal draining and normal live movement alongside pointer reuse. It and pacing/measurement tests pass. Android host/service Java compilation and whitespace checks pass. Actual compiled benchmark native replay with two samples per swipe advances maximum visible row from 17 to 119 across six swipes and keeps Newsletter No after mode switch. This proves that preserved displacement reaches the actual native guest recognizer in this deterministic scenario; it does not establish physical Android causality, latency or performance acceptance. Full goal active.

### Updated Android APK and iOS final-position delivery (2026-10-05)

Fresh approved adb inventory remains empty; no device test was attempted. Exported actual compiled benchmark with current Android TouchContact fixes into build/benchmark-touch-20261005/project using a fresh in-memory package signing key. Production Java/dex/resource packaging succeeds and produces build/Mini-unsigned.apk; existing Google dependency warnings remain. APK awaits temporary signing/install through the device runner.

Inspected iOS touch sampling: it removed an ended, already-reported contact before delivering the final position and collapsed an unreported complete gesture to its endpoint. Added initialPoint/finalReported state so the first sample uses the initial point and the final point is delivered before removal. UIKit touch identity already excludes ended contacts from later updates. Expanded ios-service-types.sh to typecheck the Metal presenter and compile PocketSurfaceView along with existing service fixtures. The first ad hoc compile omitted generated PJM_TEST_MODE and failed; the permanent runner supplies that configuration. Runtime iOS touch behavior and physical Android causality still require testing; full goal active.

Expanded iOS check initially exposed missing UIKit import before generated Swift UIView declarations in service translation units. Runner now imports UIKit before those declarations; final expanded iOS source/type checks pass. This is compilation evidence only, not simulator/device runtime acceptance.

### Executable iOS sampling-state regression (2026-10-05)

Moved the iOS initial/final delivery decision into TouchSampling.h, used directly by PocketSurfaceView. Added an executable C regression covering a gesture already ended before its first frame, initial-then-final delivery, sustained live samples, and final delivery/draining for an already-reported gesture. ios-service-types.sh compiles/runs this test with strict warnings before its existing Swift/UIKit source checks. Both sampling regression and expanded iOS compilation pass. Installed export copies the entire iOS host directory, including the new header. These are deterministic sampling-state and compilation results; UIKit event delivery, simulator/physical behavior, native Metal DrawList implementation and remaining full-goal acceptance stay unproven. Full goal active.

### Development Android contact sampling parity (2026-10-05)

Development MiniActivity routes input through pinned PocketContactLatch. Inspection confirmed its sampler used only the latest point and removed an ended previously-sampled contact without final delivery. Added local host/android/contact_latch.h adaptation of the exact pinned source, retaining license attribution and original pointer-lifetime/identifier/cancellation policies. Local include precedence selects this adaptation without modifying reference files. It keeps the initial point for first sampling and final displacement for one later sample; capacity reclamation requires final delivery.

Executable C regression verifies an ended compressed drag and new contact sharing platform pointer zero coexist with distinct guest identifiers, initial/final displacement is delivered before removal, and cancellation retains the published new identifier. Strict C compilation and regression pass; Android NDK runtime source compilation also passes. Development/installed behavior now shares this sampling policy, but no physical device performance or full development-host parity is claimed. Full goal active.

### Contact capacity and pending cancellation validation (2026-10-05)

Expanded the actual development sampler regression to fill all eight slots with ended gestures, verify a new DOWN is refused while final positions remain undelivered, verify all final positions are delivered, then verify capacity reclamation succeeds. Hardened guest-ID allocation to reserve pending cancellation IDs in addition to resident and previous-frame IDs; a boundary regression forces ID wrap toward a queued cancelled identifier and verifies distinct active/terminal IDs. Updated adaptation comments to describe final-sample reclamation and the bounded 24-ID reservation set.

Strict C sampler regression passes. Replay type checking passes, and package-input/replay/tape tests pass 10 cases with 282 assertions. These verify input bookkeeping and replay contracts, not OS gesture delivery or performance. Remaining full-plan requirements stay active.

### Shared bounded GPU texture decoding for Metal preparation (2026-10-05)

Inspected pinned sources: no existing Metal DrawList backend was found. Extracted the actual GLES pixel-format conversion into shared gpu_texture.rs compiled for Android/iOS/tests. GLES uses that function; future Metal uploads can use identical RGB565/RGBA4444/RGBA8888/indexed decoding instead of duplicating semantics. Conversion now rejects zero dimensions, checked-size overflow and RGBA output above 16 MiB before allocation, and uses fallible exact reservation. Added malformed/oversized dimension regressions alongside existing pixel-format fixtures. License attribution points to preserved upstream license.

First cargo invocation lacked rustc on PATH and did not run tests. Corrected compiler configuration: all 57 native library regressions pass; final added conversion boundary assertions pass in a focused rerun. This is a shared prerequisite and allocation hardening, not an implemented Metal DrawList renderer. Geometry/resource snapshot API, GPU ownership, Metal shaders/presentation and physical acceptance remain required. Full goal active.

### Shared GPU command admission and owned frame snapshot (2026-10-05)

Extracted GLES DrawList and image admission into shared gpu_frame.rs, preserving opcode, finite-UV, clip-depth, expanded-vertex and texture-budget checks. Android GLES calls the shared admission functions. Added an internal owned command snapshot with finite positive viewport validation and fallible bounded allocation, providing a stable prerequisite for Metal frame handoff. It explicitly does not yet capture texture/font resources or issue GPU work.

Initial new regression mistakenly called pinned ui.setStyle with an object and failed; existing 57 regressions passed in that run. Corrected to actual ui.setProp API and strengthened fixture to generate different background colors on successive guest frames. Final focused regression proves current commands change while the first owned snapshot remains unchanged and validates its expansion bound. It passes. Complete Metal resource capture, FFI handoff, shader/driver implementation, host lifecycle and device validation remain required; full goal active.

### Owned bounded GPU texture resource handoff (2026-10-05)

Added internal capture_textures alongside owned command snapshots. It admits the entire retained-UI texture set and driver dimensions before any decoded copies, reserves the bounded slot table fallibly, and owns RGBA bytes plus generation-tagged handle, content revision, dimensions and filter mode. All formats use shared gpu_texture decoding. Failed admission/copy returns no partial snapshot.

Three focused gpu_frame regressions pass: owned commands survive changed guest turns; actual texture free/reused-slot replacement changes identity/pixels while the old snapshot stays intact; aggregate decoded storage over the 64 MiB bound rejects before decoding. This is resource handoff preparation only, not live Metal rendering. Glyph-page preparation/metadata, combined frame ownership, FFI, shaders/Metal driver and device validation remain required. Full goal active.

### Combined GPU snapshot with visible glyph resources (2026-10-05)

Added capture_frame combining validated owned commands, texture bytes and visible-glyph sampling metadata. It walks only admitted opcodes, deduplicates slot/glyph pairs with fallible bounded reservation, prepares actual upstream glyph pages, rechecks aggregate/driver image admission during preparation, and then captures owned texture bytes. Metadata includes glyph identity, page texture handle, UV rectangle and baked logical dimensions. Missing font/invalid glyph entries retain the existing GLES skip behavior; no raw guest GPU API is exposed.

Four focused gpu_frame tests pass. New actual baked-font fixture renders ArA across two generated pages, verifies repeated glyph deduplication, finite normalized UVs, dimensions and matching owned texture resources, then frees a source page without altering captured pixels. Snapshotting all resource bytes is an initial internal handoff, not a performance-approved per-frame upload/cache policy. FFI lifetime/ownership, Metal command expansion/shaders/driver/cache, lifecycle, GPU budgeting and physical validation remain required. Full goal active.

### Backend-neutral geometry expansion for Metal (2026-10-05)

Added gpu_geometry.rs adapting the pinned GLES command walk into driver-independent vertices and clipped texture batches. It consumes only admitted owned snapshots, reserves geometry/batch/resource lookup capacity fallibly, preserves painter order, handles rectangles/gradients/triangles/textured geometry/glyphs/scissors, and resolves glyphs from captured page metadata. Solid geometry uses a reserved white-texture identifier; this initial planner omits GLES's optional white-patch batching optimization. No GPU calls or driver names occur in this stage.

Five focused GPU snapshot/geometry regressions pass. Cross-page ArA expands to 18 vertices and three ordered batches with first/third page identity matching. Nested clip fixture verifies three six-vertex ranges, restored outer clip and original per-vertex colors. Shared snapshots/texture identity/aggregate rejection continue to pass. Metal FFI/driver/shaders/cache/physical presentation and remaining original full-goal requirements remain pending. Full goal active.

### Synchronous GPU callback ABI and instance reentry guard (2026-10-05)

Added mp_gpu_snapshot and mp_pool_gpu_snapshot owner-thread callback handoff with C vertex/batch/texture descriptors and explicit borrowed lifetime. All geometry/pixel bytes remain owned by the call; host must copy/upload before return, return zero to accept, never retain pointers or unwind. Invalid max-side/missing callback fail before capture; callback rejection does not advance or stop the guest. Header documents logical clipping, RGBA color layout and reserved white texture identity. This supplies host integration data, not a Metal driver.

New actual-instance callback test exposed missing individual-instance FFI reentry protection and initially aborted on its assertion. Reused the retained-container thread-local guard before instance borrowing and destruction; fixed the Android attached-GPU destruction diagnostic path to avoid nested guard acquisition. Final six focused GPU tests pass, including callback reentry/limits/rejection and recoverable guest framing. C header syntax passes. Full native suite final result recorded below. Metal upload/command submission/lifecycle/performance and remaining original full-goal scope stay active.

Final native library suite: 63 passed, zero failed. No device or Metal driver execution occurred in this stage.

### Actual direct Metal driver execution (2026-10-05)

Added MiniDirectMetalRenderer: owner-thread device/pipeline/samplers, runtime Metal shader compilation, direct 20-byte native vertices, RGBA texture uploads cached by generation-tagged handle/content revision/dimensions, clipped triangle batches and straight-alpha separate RGB/alpha blending matching GLES. Target/viewport/slices/ranges/texture dimensions and aggregate bytes are validated; failed host submission returns error. It encodes into caller-owned command buffer/target; reset drops cache references without taking presentation ownership. Header/implementation are included by whole-directory iOS export, and the iOS source gate includes the implementation.

Built actual shared native library and executed tests/metal-driver.sh on the host's actual Metal device. A real native guest/root DrawList renders green through GPU snapshot, Metal shader and command buffer into a 32x32 offscreen BGRA target. Every pixel matches a centered 16x16 green viewport with opaque black letterboxing. Deliberately incompatible RGBA target rejects; subsequent guest turn and correct-target Metal encoding/command completion recover successfully. Driver resets and instance destroys. No software framebuffer copy was used for this render.

This establishes simple actual Metal GPU execution on the Mac development machine, not a desktop product host or iOS device acceptance. UIKit surface integration, bounded submissions/retirement, forced loss, texture/glyph/gradient/alpha goldens, actual iOS device performance/memory and remaining original full-goal scope stay required. Full goal active.

### UIKit direct Metal integration and bounded submissions (2026-10-05)

PocketSurfaceView now advances input and renders through mp_gpu_snapshot/mp_pool_gpu_snapshot plus MiniDirectMetalRenderer into its CAMetalLayer drawable. VerifiedContainer adds advanceGpuInput and shares storage/effect draining with existing framebuffer adapter. Normal rendering no longer calls render_damage/presentPixels. GPU work is bounded to three outstanding command buffers; drawable unavailability/backpressure skips guest advance. Completion collection reports driver errors and test-mode GPU readback hashes actual submitted pixels. Background, activation, retirement and shutdown fence pending submissions and clear cached textures. Native project includes DirectMetalRenderer.m as a compiled source for installed/development export.

Initial iOS source check caught an Objective-C NSError ivar write-back ownership error; corrected with local error output. Expanded compilation passes after that correction, and installed iOS exporter tests pass two cases/22 assertions. Source gate now also includes VerifiedContainer.m; final result recorded below. This integration has not yet executed in UIKit/simulator/iPhone. Actual prior offscreen Metal evidence remains simple driver-only. Forced lifecycle loss, bounded total in-flight resource memory, complex GPU goldens/performance and all remaining original scope require further validation. Full goal active.

Final expanded iOS compilation including VerifiedContainer.m passes. No UIKit runtime execution was performed in this stage.

### Simulator direct Metal signed surface and production entry acceptance (2026-10-05)

Fresh simulator inventory showed no booted devices. Booted the existing iPhone 17 Pro/iOS 26.4 validation simulator 69A9330F-92B1-4192-B44E-035E41272064, then rebuilt the actual release simulator core and Xcode app with current direct Metal integration. tests/package-surface-ios.sh passes signed surface rendering with nonzero actual GPU readback hash 1644551685, four guest frames, warm activation, hidden/foreground lifecycle fence, HTTP replies, backpressure, strict service/resource/rate checks, final cleanup and exactly-once retirement. Evidence: build/ios-validation/direct-metal-surface-20261005. Owned temporary app/files removed.

Executed tests/package-entry-ios.sh through production signed-only export and real simulator XCTest. testSignedHostIgnoresDevelopmentURL passes launch/terminate/relaunch with authenticated surface and no error status; test duration 9.563 s. Exported release binary passes the development-entry leakage check. Evidence: build/ios-validation/direct-metal-entry-20261005 including Tests.xcresult. Owned temporary app/files removed; test simulator remains booted for further authorized validation.

These establish simple simulator UIKit/direct Metal lifecycle/service and production entry behavior. They do not establish touch screenshot colors, sustained complex graphics/glyphs, physical iPhone latency/FPS/memory, first-present cold timing or full P0–P4 acceptance. All those and other original outstanding scope stay required; full goal active.

### Production direct Metal touch/color/lifecycle screenshots (2026-10-05)

Strengthened installed-entry fixture to enable its actual red-to-blue visual guest. XCTest now samples rendered screenshot pixels, waits for initial red, checks opaque black letterbox and verifies a letterbox tap leaves center red across three later captures, then taps the logical viewport and waits for blue. HOME/activate retains blue; terminate/relaunch returns red. It still rejects development URL influence and checks authenticated surface/no error status.

Production exported app on iPhone 17 Pro/iOS 26.4 Simulator passes the complete test in 16.852 s. Evidence: build/ios-validation/direct-metal-touch-20261005 including Tests.xcresult. Owned temporary app/files removed. Updated README and iOS provenance to describe current direct Metal/GLES paths and distinguish earlier software evidence. This proves simple visible touch and warm/cold state behavior in this simulator, not <=2-frame input latency, physical iPhone performance or full graphics/memory acceptance. Full goal active.

### Actual Metal textures, alpha, clipping and in-flight revisions (2026-10-05)

Expanded offscreen Metal driver test beyond native solid geometry. Constructed actual GPU upload descriptors/quad batches with half-alpha red texture and half-width logical clip, then encoded a second outstanding frame with the same generation-tagged handle and newer blue texture revision into a separate target. Cleared original source bytes before commit. Per-pixel checks prove the first frame retains red/clip and the second uses blue/full viewport, both with opaque composited alpha and black letterboxes. Actual GPU command completion and earlier native guest/target rejection recovery checks pass.

Renderer explicitly rejects command buffers that do not retain referenced resources, documenting that requirement in its header; normal host command buffers satisfy it. Expanded iOS source gate passes. This proves these specific shader/upload/cache/in-flight behaviors on actual host Metal hardware, not broad screenshot equivalence or physical iOS performance. Glyph/gradient/full benchmark rendering, process-wide CPU/GPU budget and remaining original scope stay required. Full goal active.

### Actual 1,000-row/form benchmark through iOS Metal (2026-10-05)

Added benchmark-project-ios.ts compiling the actual benchmark TSX through the isolated exact-pin compiler for pjm-ios, then signing in memory/exporting the production installed project. It refuses existing output and preserves the prior Android package. Compilation succeeds: 56 modules, 20 styles, two baked font slots/98 glyphs each, 58528-byte pak and 203761-byte JS. Project/evidence: build/benchmark-ios-metal-20261005. Private package key is not saved.

Added BenchmarkMetalTests using fitted logical coordinates for six slow upward gestures and header form switch. Production Xcode simulator XCTest passes; screenshot attachments exported and visually inspected. Initial rows 1–14 render correctly with baked text/rounded controls. After gestures, rows approximately 56–70 are visible and Selected remains none. Form shows Plan Basic and Newsletter No. This provides actual UIKit/direct Metal glyph, virtual-list scroll and form rendering evidence on iPhone 17 Pro/iOS 26.4 Simulator. Test screenshot-difference assertions alone prove only changed output; row/form assertions here come from explicit image inspection. Owned temporary benchmark app uninstalled after execution; build/screenshots preserved.

No sustained FPS/compositor, first-present, touch-latency or memory acceptance was measured. Physical iPhone and Android revalidation, process-wide resource limits, remaining services/tooling and all other original requirements remain active.

### Optimized real benchmark offscreen CPU/GPU cost (2026-10-05)

Added benchmark-metal-cost.m/.sh loading the actual compiled pjm-ios benchmark through structural package selection, launching the guest, warming thirty frames, then executing six sixty-sample scroll gestures plus releases. Each measured frame advances real input, captures/expands/uploads the native GPU snapshot, encodes/commits Metal work and waits for completion. CPU duration ends at commit; actual completed-command GPU timestamps are counted separately only when available. Inspector row assertion verifies the measured sequence advances maximum visible row from 17 to 69.

Optimized native release build succeeds with a toolchain warning that rust-objcopy could not strip debug info because libLLVM.dylib was unavailable; optimization/build still completes. Initial measurement lacked row-advance assertion and is retained separately. Final verified-scroll measurement: 366 frames, CPU total 102766000 ns (~0.281 ms average), maximum 2136000 ns, zero CPU samples above 33 ms; 366 valid GPU timestamp samples, total 0.037352209 s (~0.102 ms average), maximum 0.001429583 s; maximum copied texture payload 528384 bytes. Evidence: build/benchmark-ios-metal-20261005/offscreen-cost-verified-scroll.json.

These are serialized warm offscreen costs on actual Mac Metal hardware, not a desktop host deliverable or iPhone FPS/compositor/present/latency/cold/memory acceptance. Device benchmarks and all remaining original full-goal requirements stay active.

### Shared completion-owned Metal resource reservations (2026-10-05)

Added thread-safe MiniGpuResourceBudget with a shared 128 MiB bound for explicit texture payload and vertex-buffer bytes across renderers. Renderer reserves before creating/uploading resources; cache reuse shares the original reservation, changed revisions acquire separate reservations, failure releases local reservations, and command completion closures retain all referenced image/white/vertex reservations even after cache reset. Native project/build/source runners include the helper.

Budget capacity/release/overflow/zero-size and concurrent-reservation executable test passes and is included in standard checks. Initial cache-reset assertion failed: completion ownership captured the same mutable cache dictionary that reset clears. Diagnostics showed 252 bytes before reset and 248 afterward. Corrected completion capture to retain an immutable dictionary copy; final regression result is recorded below. Expanded iOS compilation passes. Driver overhead, caller-owned drawables/readbacks, native snapshot CPU copies, other GPU backends and full process memory remain outside this explicit-byte ledger and still require accounting/measurements. This is resource ownership hardening, not full memory acceptance. Full original goal active.

Final actual Metal regression passes after immutable completion capture: cache reset preserves both texture/vertex reservations before commit, and all expected pixels/revision/recovery checks pass. Earlier failed assertion was an ownership defect in the initial implementation, not an accepted result.

### Process-shared native GPU snapshot-copy reservations (2026-10-05)

Added a process-shared 128 MiB reservation ledger for native GPU handoff copies. Draw words, decoded RGBA texture payloads and slot tables, glyph lookup bookkeeping, expanded vertices/batches/clip state and FFI texture descriptors reserve with checked atomic accounting before allocation. Reservations are owned by the corresponding snapshot or geometry object and release automatically on every failure and return path. The bound applies across engine handles and concurrent owner threads; it is separate from the existing retained-UI quotas and Metal driver-resource ledger.

The allocator capacity, overflow, zero-size, release and eight-thread contention tests pass. A real retained-UI rectangle snapshot regression calibrates its complete frame reservation, then uses a one-byte-short combined budget to force geometry admission failure. It verifies that the live frame bytes remain accounted, dropping the frame returns usage exactly to zero, and the entire capacity can be reserved again. Replaced the deprecated atomic update call; the final native library suite is warning-free with 66 passed and zero failed.

This ledger covers explicitly sized native snapshot copies. QuickJS/runtime allocator overhead, retained source assets and UI structures, generated glyph source pages, Android driver allocations, Metal driver overhead, caller-owned drawables/readbacks and OS process overhead remain outside it. Full physical-device process-memory acceptance therefore remains pending; the original goal stays active.

### Exact iOS canonical JSON bytes for signatures and plan hashes (2026-10-05)

Cross-runtime comparison found that Foundation's sorted JSON output is not compatible with the pinned compiler's ECMAScript number spelling. Concrete failures included JavaScript `1e-7` versus Foundation `9.9999999999999995e-08`, and JavaScript's fixed `100000000000000000000` versus Foundation `1e+20`. A correctly signed envelope or build-plan hash containing such a number could therefore fail only on iOS.

Replaced Foundation canonical emission in both iOS signature verification and plan-hash verification with an explicit serializer. It uses Swift's shortest round-trip binary64 digits, applies ECMAScript's 1e-6/1e21 fixed-versus-exponent thresholds, emits negative zero as zero, normalizes exponent signs/zeroes, distinguishes booleans from numbers, preserves JSON string escaping without slash escaping, and sorts object keys by UTF-16 code units like JavaScript `Object.keys().sort()`.

The fixture generator now carries the JavaScript signer's exact unsigned canonical bytes and the native iOS test compares them before signature admission. Difficult-number vectors and a surrogate-pair-versus-BMP key-order vector pass. The 17-case signature/strict-JSON suite passes, actual authenticated package ownership/admission/engine boot/retained activation passes, and the complete iOS host source gate compiles. Android's accepted mobile manifests/plans continue to use safe integral fields in current tests, but arbitrary binary64 edge-case parity there is not yet established. Physical-device and remaining original requirements stay active.

### Standard native-core and real replay gate (2026-10-05)

Revalidated the public replay CLI against the current GPU/memory/canonical changes using the actual compiled 1,000-row benchmark package: two fresh native executions produced identical framebuffer/effect hashes; PNG export was a valid 390x844 RGBA image and retained-tree export contained 135 connected nodes. The repository already contained a stronger native replay fixture covering packed touch, completion ordering, hide/show, cancellation, literal quoted/emoji/newline inspector text, decoded PNG pixels and deliberate first-frame divergence. That established regression also passes against the current release core.

Added tests/native-core.sh and wired it into the Darwin full check. The gate runs the complete Rust library suite, builds the optimized native library, then executes tests/replay-native-cli.ts through real Bun FFI. Final gate result: 66 native tests passed, optimized build completed, deterministic replay/golden/PNG/tree/divergence checks passed. The toolchain still warns that rust-objcopy cannot find libLLVM while stripping debug information; this does not fail the optimized build or execution. Reference-only checks remain separate. Host tape capture, pause/step/seek UI and physical mobile replay acceptance remain pending; the full goal stays active.

### iOS Core Location service and controlled simulator runtime (2026-10-06)

Added the installed iOS `location.get.v1` service. It validates the exact versioned argument shape, signed `location` declaration, host-owned persisted app consent, current Core Location authorization, foreground ownership, maximum cache age and finite coordinate/accuracy/timestamp output. Work is bounded to eight service requests per process instance and four per generation, with a process-shared 16 calls/minute/app rolling limit and 64-identity cap. Replies retain the authenticated package and generation until frame delivery; cancellation, retirement, suspension and close detach providers, timers and prompts. The generated host links CoreLocation and includes the required When In Use usage description.

Introduced an overridable manager-construction seam while retaining `CLLocationManager` in production. The signed-surface simulator harness supplies a deterministic manager and an independently signed location-declared package. On the booted iPhone 17 Pro/iOS 26.4 simulator, the generated Xcode app passes fresh one-shot delivery, recent cached delivery without a provider request, OS denial, actual run-loop timer expiry, cancellation followed by a stale provider callback, background rejection and malformed-argument rejection. The same run then passes strict service parsing, resource accounting, HTTP/backpressure, direct Metal rendering, cleanup and exactly-once retirement with hash 1644551685. Evidence: `build/ios-validation/location-runtime-20261006`.

The first test uses a controlled provider and pre-recorded host approval. A follow-up run installs another temporary generated app, grants its bundle When In Use simulator permission and sets 43.238949,76.889709 through `simctl location`. The production `CLLocationManager` adapter returns exactly that coordinate with five-meter accuracy through the signed service, after which the complete signed-surface suite still passes. Evidence: `build/ios-validation/location-real-adapter-20261006`. Cleanup terminates/uninstalls the owned app and clears the simulated location.

This does not display the app consent or iOS permission dialogs, read a physical sensor or establish physical iPhone acceptance. Those platform/device checks and the remaining original scope stay active.

Expanded the simulator fixture to hold four live requests in one generation, reject the fifth, hold four more in another generation, and reject a ninth service-wide request. Retirement cancels both groups. After the preceding six accepted calls, two additional denied calls reach the 16-call rolling limit; a separate service object for the same authenticated app is then rejected before its provider starts, proving the process-shared quota. The full run passes with `PJM_LOCATION_LIMITS_PASS generation=4 instance=8 process-rate=16 shared`; evidence: `build/ios-validation/location-limits-20261006`.

Added a signed location-declared guest that bundles the real TSX SDK and calls `mini.location.get`. The first integration attempt exposed two harness-only problems: the test had replaced the surface's installed-controller effect callback, and its synthetic base frame was the boot-time function retained by the engine while the SDK installed a later wrapper. The final fixture chains JSON service records to the original controller dispatcher and uses a stable boot-time frame delegate that invokes the SDK hook without recursion. The Android controlled-location fixture retains its prior guest through a separate environment flag.

The final iPhone 17 Pro/iOS 26.4 simulator run logs the exact SDK request, routes it through `MiniInstalledController` and production `CLLocationManager`, receives 43.238949,76.889709 on a later frame, validates it in the SDK promise and emits `PJM_LOCATION_SDK_PASS`. It then passes generation/instance/process location limits and the existing signed Metal/HTTP/resource/lifecycle/cleanup suite. Evidence: `build/ios-validation/location-sdk-frame-final-20261006`. This is end-to-end simulator service evidence; system consent UI and physical-device sensor acceptance remain outstanding.

Extended that signed SDK guest through the real simulator pasteboard. Its authenticated manifest declares `clipboard.read`, the host decision is pre-approved for the verified app identity, and the guest writes the Unicode text `PocketJS SDK 😀`, awaits the later-frame null acknowledgement, reads through `clipboard.read.v1`, then validates the exact text in its SDK promise before disposal. The generated host logs `PJM_CLIPBOARD_SDK_PASS write-read-frame-path` and continues to pass the location limits plus signed Metal/HTTP/resource/lifecycle suite. Evidence: `build/ios-validation/location-clipboard-sdk-20261006`.

This proves same-app simulator `UIPasteboard` write/read, native routing and frame/SDK delivery. It does not show the first-call host approval alert, cross-app iOS paste privacy UI, denial interaction or physical-device behavior; those acceptance items remain open.

### Full native and compiler gate after service integration (2026-10-06)

Ran `tests/check.sh` against the combined Core Location, clipboard SDK/frame path, GPU budgets and replay work. Native iOS touch sampling, service typing, package signatures and storage execute successfully; Android location contracts/mailbox/quota/cleanup, frame pacing and touch regressions pass; the shared GPU reservation test passes. The Rust library reports 66 passed and zero failed. The optimized library builds and the public native replay CLI executes deterministic frames, lifecycle/completion/input ordering, PNG pixels, literal retained-tree inspection and deliberate divergence rejection.

The development server/compiler watch and recovery integration passes, including failed revisions and subsequent publication. Public build with actual pinned compiler artifacts, SDK, package/store/storage/permission, installed iOS/Android export, Android HTTP/location runtime-lock and reference suites all pass. The known optional strip warning remains because the Rust toolchain's `rust-objcopy` cannot locate `libLLVM.dylib`; it does not fail or prevent optimized library execution. No new physical-device acceptance is inferred from this host gate.

### Deterministic replay pause, step and seek core (2026-10-06)

Added `ReplaySession`, an owner-thread state machine over the existing strictly admitted native tape and `ReplayEngine` interface. Sessions start paused; play only changes state, while bounded host ticks execute one recorded action at a time so UI turns can pause between actions. Step requires paused state. Seek accepts an exact action boundary, closes the current engine, creates and boots a fresh engine, then deterministically replays the validated prefix. Backward seek therefore never depends on hidden mutable runtime state. Immutable snapshots expose state, action/frame counts, current frame hashes and terminal failure text. Failed engines close once, a later seek can rebuild from the start, and explicit close is idempotent.

Three focused tests pass for pause/play/tick/step behavior, immutable progress, forward/backward seek, boundary rejection, failure teardown and seek recovery. Strict TypeScript checking includes the new module. The real native replay gate now checks the compiled engine's first step, full resumed play, backward seek and seek-then-step hashes against the established three-frame golden. The complete 66-test native suite and optimized build pass before that execution; the known optional `rust-objcopy` warning remains. The browser DevTools panel and development-server endpoints are not yet connected to `ReplaySession`, so interactive product UI acceptance remains pending.

### Development-server replay controls and browser panel (2026-10-06)

Connected `ReplaySession` to the token-bound development server. The server now admits an 8-MiB-bounded tape against the current published signed package and optimized native library, exposes play/pause/step/strict seek/close commands, advances playing sessions one action per owner-thread clock turn, publishes immutable replay progress in the normal state snapshot, closes sessions during shutdown, and invalidates them whenever a newer build publishes. The browser panel exposes all six controls and action/frame progress while preserving text-only diagnostic rendering.

Added integration expectations for missing sessions, oversized uploads and null replay state, plus panel coverage for replay rendering and control enablement. Repository whitespace validation and a direct browser-script VM smoke test pass. The current shell does not expose Bun, so the Bun test suite and full development-server execution have not yet been rerun for this change. Host-side tape capture, live component highlighting, physical mobile replay and remaining original requirements stay active.

### Executed native development-server replay acceptance (2026-10-08)

Installed a temporary official Bun runtime under `/tmp` and reused the existing exact pinned PocketJS checkout. Focused panel/session tests pass (6 tests, 50 assertions), and the replay strict type gate passes. The complete development-server/compiler watch test passes with actual native replay enabled (1 test, 101 assertions): the compiled package loads, a native frame exposes hashes, malformed tape/duplicate-key seek requests are rejected, a failed upload preserves the live session, backward seek reproduces identical frame/effect hashes, play/pause and completed seek/close work, and a subsequent published build closes the prior replay. The standard Darwin gate now enables this native server coverage. Evidence is saved in `build/validation/replay-server-20261008`.

Replay package reads use descriptor-bounded nofollow regular-file admission. Oversized streaming bodies cancel the reader; seek requests retain the original session across asynchronous body consumption and reject replacement races. The development artifact is a compiled package, not a publisher-signed release envelope; corrected the panel and README wording accordingly. Host recording, live component highlighting and the full original acceptance scope remain open.

### Opt-in iOS development capture source and server admission (2026-10-08)

Added cold-boot recording to the UIKit development surface. It records successful engine frame inputs with sampled packed contacts, original latched hits and cancellation arrays; accepted service completions; hide/show/memory-warning events; and the otherwise easy-to-miss cancellation frame executed before background suspension. Admission happens before eval, preserves the exact development launch object and compiled package hash, and rejects warm/signed-pool configuration. Capture stops at 36,000 actions or 8 MiB and returns a bounded tape only after at least one frame. Disabled recording skips per-frame allocation. Re-evaluation or failed boot stops capture.

`PJM_RECORD=1 pjm run` passes an opt-in argument to the iOS development host. After 600 frames the controller finishes capture and uploads to the authenticated session. Server strict tape admission rejects wrong package/target, exposes a no-store downloadable recording, and invalidates it on successful rebuild. DevTools shows the download link only when a recording exists. Expanded iOS source checks now compile the development controller as well as the surface. Source checks pass, panel/recorder tests pass (5 tests, 35 assertions), and actual compiler/native replay server integration passes (1 test, 108 assertions). Evidence: `build/validation/recording-server-20261008/integration.log`.

This is implemented iOS capture source and executed server admission, not observed mobile capture/replay equivalence. Simulator/device execution, Android capture, signed-container capture, interactive record control, preview/highlighting and remaining original acceptance requirements stay open. Full goal active.

### Actual UIKit capture and native replay execution (2026-10-08)

Added `tests/recording-native-ios.ts` using the production development controller/surface, generated Xcode project, existing compiled iOS core and actual pinned TSX compiler. It creates a temporary sample that invokes `mini.deviceInfo` after three frames, runs a uniquely identified app on the booted iPhone 17 Pro/iOS 26.4 simulator, waits for the authenticated recording upload, downloads and strictly admits the tape, verifies 600 frames, exact package hash/development launch data, an actual iOS service completion and the SDK delivery log. It then executes the tape twice through fresh native FFI engines and compares every frame/effect hash.

The complete run passes. Evidence: `build/ios-validation/recording-20261008/{recording.json,capture.pocket,frames.json,result.json,server.log}`. Temporary app is terminated/uninstalled and sample/server files are cleaned. This establishes real simulator capture with SDK completion and deterministic replay of that tape. No gestures or hide/show were driven in this run, and no host Metal pixels, physical-device performance or signed multi-guest capture were compared. Those checks, Android recording and the remaining full original objective stay active.

### UIKit tap and lifecycle capture through XCTest (2026-10-08)

Extended the real recording runner with `RecordingInputTests.swift`. The production development host launches with recording enabled, waits for advancing frame receipts, taps the logical surface center, verifies a touch receipt, presses Home, activates the same app and waits for the 600-frame capture. The downloaded tape must contain sampled contacts and exactly ordered hide/show events in addition to the earlier SDK device-info completion and delivery log. Two fresh native replays compare every pixel/effect hash; a separate assertion requires the captured sequence to change pixel output.

The generated Xcode simulator UI test and complete tape/replay checks pass. Evidence: `build/ios-validation/recording-input-20261008`, including `Tests.xcresult`, source/build log, tape, compiled package, all frame hashes and result JSON. Result: 600 frames, 603 actions, recorded touch, hide/show, SDK completion, two matching native replays. Owned temporary app is removed and server/sample artifacts are cleaned. Focused recorder/session regressions also pass (5 tests, 37 assertions). Host GPU pixels were not compared with replay pixels; physical-device performance, complex gestures/cancellation, Android/signed-container capture, live inspection and all remaining full-goal requirements stay open.

### Android GL-owner capture implementation and native encoding checks (2026-10-08)

Added opt-in Android development recording via `PJM_RECORD=1` and the launcher intent extra. JNI observes successful `mp_frame_input` calls, preserving sampled packed contacts, latched signed hits and cancellation arrays, including the cancellation frame before background suspension. Accepted service replies and show/hide/memory-warning events are recorded synchronously on the engine GL owner. Java binds the original development launch object and published package SHA-256, enforces 36,000-action/8-MiB limits, stops admission at capacity, and uploads the tape after 600 frames through the existing network owner. Replacement cold boots disable/discard old capture before unload; disabled capture skips JNI allocations. Download and build invalidation reuse the validated shared server contract.

Extracted the exact packed-input encoder into `recording_input.h`. An executed native C fixture covers empty input, high-bit packed coordinates, minimum/maximum signed hit IDs, cancellations 0/255, all eight slots, insufficient buffer and invalid input counts. The emitted samples pass the shared strict native-tape validator (new regression plus Android launcher test: 2 tests, 12 assertions). Android host Java compilation passes and the full JNI translation unit compiles cleanly under the production API-23 NDK compiler with `-Wall -Wextra -Werror`. Added the encoding regression to the full gate.

ADB inventory confirms no currently connected Android device. No Android capture/upload/JNI callback/replay runtime acceptance is claimed. APK execution on emulator/hardware, signed-container recording, mobile GPU/replay comparisons and all other original requirements remain active.

### Actual Android GL capture, tap/lifecycle and native replay (2026-10-08)

Located the installed Pixel_2 ARM64 API 37/16-KiB emulator and started an owned read-only session with snapshot load/save disabled. The machine retains stable Cargo/rustc binaries but lacks the rustup launcher; a temporary `/tmp` adapter routes only stable Cargo invocation and rustc discovery to those exact installed binaries, without changing the permanent toolchain. Added `tests/recording-native-android.ts` to create a temporary TSX SDK sample, build the current production development APK through the public run path, wait for real host receipts, tap the surface center, press Home and resume the same Activity.

The complete run passes. The uploaded/downloaded tape contains 600 frames, sampled touch, hide/show and native Android SDK device-info completion; the guest's delivery log is observed. Two fresh native FFI replays compare every framebuffer/effect hash, and the captured sequence changes pixel output. Evidence: `build/android-validation/recording-20261008` including tape, compiled package, frame hashes, result and production build/server log. Temporary sample/server files are cleaned, the development host is stopped and the owned read-only emulator is shut down. This supersedes the earlier source-only Android capture status. Host GLES pixels were not compared to replay pixels; physical hardware/performance, signed-container recording, live inspection and all remaining original requirements remain open.

### Read-only native live tree transport and DevTools view (2026-10-08)

Added `DeviceInspection`: exact UTF-8 envelope parsing, 4-MiB tree/16,384-node admission through the existing tree validator, current revision/platform ownership, strictly increasing frame sequence, one immutable retained snapshot and explicit rebuild invalidation. Token-bound GET/POST transport separates full trees from lightweight polling state. Added opt-in `PJM_INSPECT=1` to both native launchers. UIKit/JNI snapshot the native engine tree on its owner thread every 60 frames, with at most one host upload outstanding and no guest-state mutation. Disabled inspection skips the snapshot allocation. The panel renders up to 200 nodes with original IDs, parents, types, literal text and logical layout, plus full download; active selection/highlighting remains pending.

Admission/panel tests pass (4 tests, 40 assertions), strict devtools types pass, iOS host/development-controller source checks pass, and Android Java/production NDK JNI checks pass. Actual compiler/server/replay integration passes (1 test, 114 assertions), including stale revision/frame rejection and rebuild clearing. Actual iOS simulator XCTest capture/replay run passes and the live snapshot contains the tapped counter. The first fixture incorrectly required one combined `Count: 1` text node and failed; inspection preserves native fragments (`Count: ` and `1`), so the corrected assertion checks their combined text while preserving the snapshot. Evidence: `build/ios-validation/inspection-20261008-retry/inspection.json` and associated XCTest/tape artifacts. Android runtime inspection is being executed; browser visual acceptance, selection/highlighting, signed-container inspection and all remaining original requirements are open.

Android actual live inspection also passes through the current production APK on the owned API 37 ARM64/16-KiB read-only emulator. The downloaded tree has the correct current revision/platform and reflects `Count: 1` through original native text fragments after the driven tap. The same run passes SDK completion capture, hide/show, 600 frames and two exact native replay sequences. Evidence: `build/android-validation/inspection-20261008/inspection.json` and associated tape/package/frame hashes/result/server log. The temporary sample/server is cleaned and the emulator is shut down. Complete reference checks pass (90 tests across 34 files, 686 assertions). Browser visual inspection, selection/highlighting, signed-container support and remaining full original requirements stay active.

### Snapshot-bound component selection (2026-10-08)

The panel now exposes selectable native node buttons and literal selected-node details, plus explicit clear. The token-bound selection endpoint accepts exactly revision, frame and original node ID within 128 bytes. It rejects missing snapshots, stale build/frame ownership, unknown IDs, duplicate JSON keys and malformed requests. State exposes one immutable selection. New admitted snapshots and published builds clear it, because native IDs can be reused in later frames. No arbitrary client-provided rectangle is accepted.

Reference/type checks pass: 91 tests across 34 files, 706 assertions, including panel click/clear behavior and exact snapshot ownership. The actual compiler/server/native replay integration passes 119 assertions, including selection admission and rejected stale/unknown-node requests. Native highlighting and browser visual acceptance have not yet been implemented/observed for this change. Signed-container inspection, physical hardware and the remaining original goal stay open.

### Native highlight overlay implementation in progress (2026-10-08)

Both development hosts consume snapshot-bound selection before the same-revision poll shortcut. UIKit retains its captured tree/frame and draws a cyan CAShapeLayer over the fitted viewport. Android retains the accepted snapshot on the UI owner and draws a noninteractive overlay matching the full GL viewport. Neither path changes guest input or the shared engine's debug state. Snapshot replacement, background suspension, absent/stale selection and retired build ownership clear or suppress the overlay. Signed pools remain excluded from this development path.

Inspection of the exact pinned upstream confirms `Ui::layout_of` returns parent-relative coordinates, not screen bounds. Both provisional overlays now accumulate retained ancestry. Correct resolved transforms, perspective and ancestor clipping still need a native world-bounds contract; highlighting is therefore not accepted as complete. Current iOS host/surface/controller source checks and Android host Java compilation pass. Actual overlay screenshots, geometry/lifecycle runtime checks and browser visual acceptance have not yet run. These are the next required work, along with the full outstanding objective.

### Shared read-only inspection geometry foundation (2026-10-08)

Added a Mini-owned core geometry module using public retained-tree and resolved-style accessors from the exact pinned engine. Its 2D matrix composition follows the pinned renderer's parent transforms, translation, origin, rotation, scale and skew; its deterministic trigonometric polynomial follows pinned fmath. A bounded tree walk computes screen AABBs and ancestor overflow clipping without changing guest debug/paint state. Perspective descendants currently return unavailable bounds rather than an incorrect parent-relative box; projection parity remains required.

Executed geometry tests compare a real retained nested/rotated node against the upstream renderer's independently captured debug rectangle, verify draw words are unchanged by the read-only walk, test ancestor clipping, reflected/fractional bounds, finite-coordinate rejection and perspective unavailability. All three new geometry tests pass. The complete Rust library suite passes 69 tests, zero failures. The module is not yet exported through inspection snapshots or consumed by the overlays; perspective projection, transport and runtime/browser acceptance remain unfinished. Full goal active.

### Projected bounds export and shared overlay consumption (2026-10-08)

Extended the read-only geometry walk with the pinned renderer's 3x4 matrix composition, transform origin, rotateX/rotateY/rotateZ, translateZ, scale/skew and perspective near guard. Context roots use their 2D world matrix and center; descendants preserve the same context and root clip, matching `collect_3d` rather than inventing nested overflow/perspective contexts. A real retained-tree fixture compares projected screen bounds with the extents of actual emitted native triangles and verifies read-only draw preservation; rotateY produces finite changed bounds.

Native inspector nodes now carry optional `bounds` in logical screen x/y/width/height, separately from parent-relative `layout`. Hidden/offscreen nodes carry null. The shared strict tree decoder accepts and freezes this additive field while rejecting negative/nonfinite/empty rectangles and unknown shapes. UIKit and Android consume native bounds directly, removing duplicated parent-accumulation approximations. Missing/null bounds suppress the overlay.

Validation: complete Rust library suite 70 passed; reference/type gate 92 tests and 716 assertions passed; iOS host/controller/surface checks and Android Java compilation passed. The optimized macOS core rebuilt and the public native replay CLI passed deterministic golden, PNG, literal tree, pause/step/seek and divergence checks, now also asserting every exported node owns a bounds field and a visible rectangle exists. An initial added CLI assertion used an absent helper; replaced it with the suite's explicit error checks and reran successfully. The known optional libLLVM strip warning remains nonfatal. Actual mobile overlay geometry/screenshots, rebuilt mobile core transport, stale-selection/lifecycle runtime and browser visual acceptance still need execution; full original objective stays active.

### Actual iOS root selection, clear and screenshot evidence (2026-10-08)

Rebuilt the optimized ARM64 iOS simulator core from current sources. Extended the UIKit UI fixture to submit snapshot-bound root selection through the real server, observe the live CAShapeLayer-backed highlighted-node receipt, save a screenshot, clear through the selection endpoint, observe zero highlight, save another screenshot and verify zero after Home/resume. Added a readonly highlighted-node getter, reported only in test-mode accessibility receipts; guest state and rendering inputs are unchanged.

The generated app on iPhone 17 Pro/iOS 26.4 passes the complete XCTest case. Authoritative xcresult summary reports Passed, one passed test, zero failed/skipped tests. Two exported screenshots were visually inspected: the cyan border/tint follows the fitted root app viewport and is absent in the cleared screenshot. The downloaded current mobile snapshot exports bounds on all 11 nodes; root bounds equal [0,0,402,778]. The same run captures touch, hide/show, SDK completion, 600 frames/603 actions and two exact native replays. Evidence: `build/ios-validation/highlight-20261008`, including `Tests.xcresult`, `attachments`, inspection/tape/hash results and `highlight-review.json`. The runner now exports attachments and asserts mobile bounds ownership/root size for subsequent executions.

Apple attachment export initially needed access to its external test-report cache; the approved tool invocation succeeded. The owned app/server/temp sample were cleaned. This is simulator root overlay evidence, not transformed-node screenshot acceptance, Android overlay acceptance, host GPU/replay pixel equality or physical-device performance. Those and browser verification plus the full remaining original objective stay active.

### Android root overlay screenshot acceptance and capture race (2026-10-08)

Added a UI-owned selected-node receipt to the Android test path and extended the production APK recording runner to select root 1, capture a screenshot, clear, capture again and verify no highlight after Home/resume. The first run passed native receipts/capture/replay but its supposed highlighted screenshot had no border; visual review and PNG edge analysis rejected it as overlay evidence. Since selections expire with every snapshot, ADB screenshot delivery can outlast the selected snapshot.

The corrected fixture continuously selects the latest admitted snapshot with at most one selection request in flight while screenshot capture runs, then stops that pump before explicit clear. A bounded RGB/RGBA PNG reader handles all PNG row filters and checks the viewport's side strips for cyan pixels, avoiding false positives from the counter text. It requires more than 100 cyan edge pixels during selection and exactly zero after clear. No production snapshot interval or ownership rule was weakened.

The complete retry passes on the owned read-only Pixel_2 ARM64 API 37/16-KiB emulator with the current production APK and rebuilt Android core. The selected screenshot contains 7,192 cyan edge pixels; the cleared screenshot contains zero. Visual review confirms the border/tint follows the inset app viewport. The live native tree includes screen bounds on every node and exact root dimensions. The same run passes touch, hide/show, SDK completion, 600 frames/603 actions and two exact native replays. Evidence: `build/android-validation/highlight-20261008-retry`, including both PNGs, tree, tape/package/frame hashes/result and `highlight-review.json`; the first attempt remains saved as incomplete visual evidence. The app/server/temp project were stopped/cleaned and the owned emulator was shut down. Transformed-node screenshots, browser verification, signed-container debugging, physical performance and the full remaining objective stay open.

### Browser verification of component selection and replay controls (2026-10-09)

Used the Browser skill and Codex in-app browser against an isolated actual compiler/development-server session with the optimized native replay engine. The component fixture is a saved real iOS native tree rebound to the temporary build revision, explicitly not live mobile inspection or viewport-matching evidence. Actual UI actions show selected node 5 details including bounds, clear removes them, missing-file feedback appears, and malformed tape admission remains visible/recoverable. The first hand-built tape contained extra window inset keys and was correctly rejected; fixed the fixture to the exact width/height/density contract before executing replay.

Browser upload/load, step to action/frame 1, backward seek to 0, play, pause at action/frame 23 of 120, and close all work. Error filtering shows no matching activity and pause/resume captions transition correctly. Literal `<img ...>` console text remains text: no image elements or JavaScript dialog are created. Removed obsolete product wording that said highlighting was pending, replacing it with snapshot-bound device highlighting and selection-reset guidance. Started a fresh session to observe the updated copy and save selected-node/paused-replay screenshot and accessibility evidence. Focused panel/inspection regressions pass six tests, 70 assertions; whitespace checks pass.

Evidence: `build/browser-validation/devtools-20261009/{panel.jpg,accessibility.txt,tape.json,fixture.json,result.json,server.log}`; earlier interactive sequence is associated with the saved 20261008 fixture. The agent-created tab was closed and both temporary server/project sessions were cleaned. Responsive breakpoint validation, transformed-node mobile screenshots, signed-container debugging and all remaining original requirements remain open; full goal active.
