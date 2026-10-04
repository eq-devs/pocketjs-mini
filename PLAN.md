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
