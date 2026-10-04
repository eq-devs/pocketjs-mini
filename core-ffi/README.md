# Shared engine composition

This Mini-owned Rust module composes the pinned PocketJS `Guest`, `UiSurface`
and software rasterizer behind the C interface in `include/mini_core.h`.
Each handle owns its guest, core, resources, framebuffer and service queues.
The iOS development view now calls this interface. All three native acceptance
tests pass on iPhone 16 / iOS 18.5 Simulator (shared-core-ios18-1791015600.xcresult).
Android now calls the same interface and passes emulator acceptance
(build/android-validation/1791045089023/evidence.json).

Call `mp_create`, `mp_boot`, then `mp_frame`/`mp_render` and finally
`mp_destroy`, on one owner thread. Host completion records enter through
`mp_svc_post`; guest records leave through `mp_svc_take`. Records are bounded
to 4 KiB and queues to 32 entries in either direction. An undersized take
buffer keeps the complete record queued. Native overflow throws a coded
`BUSY` error that the SDK preserves. Failed guest frames stop the instance and
discard its pending effects.

`mp_frame` resolves initial hit targets inside the engine. Native hosts that
latch their own DOWN facts use `mp_hit_test` and `mp_frame_input`: up to eight
active contacts, parallel latched hits and eight separate cancelled IDs. The
engine encodes cancellations as the pinned terminal records, so cancellation
cannot become an ordinary release/tap. Hosts retain quick taps for at least
one sample before release. Both APIs update the internal contact table.

`mp_render_damage` uses the pinned damage tracker and repaints retained BGRA
pixels incrementally. It reports up to eight physical-pixel regions; an
unchanged frame reports zero. Initialize `MpDamage.size` before calling. A
new/lost GPU texture always needs a full upload of the persistent framebuffer.
Damage describes this render call: one native presentation consumer must keep
pending regions across skipped uploads. The older `mp_render` remains usable
by hosts that upload the whole framebuffer. Planning failure falls back to a
full repaint and invalidates the tracker.

The ABI uses pinned packed contact snapshots and committed hit facts. Logical
dimensions are limited to 1024, raster density to 1..4 and framebuffer allocation
to 16 MiB. Guest heap configuration accepts 8..32 MiB; tests use 24 MiB. Boot
execution is bounded to two seconds and frame/job execution to 50 ms. QuickJS
stack bounds are 256 KiB in release and 1 MiB in debug, where unoptimized Rust
callbacks require more stack. These limits do not bound total native resource
memory. No GPU surface ownership, detach/resize API or LRU container is exposed
yet. These remain required before the full shared FFI goal is complete.

The build checks the upstream revision and tracked-source cleanliness. Its
lockfile retains upstream dependency versions, including rquickjs 0.12.0.
The pinned checkout must exist at `examples/hello/.pjm/pocketjs` (bootstrap it
through the project's normal check/run workflow).

On macOS with stable Rust and Xcode tools available:

```sh
bash tests/core-ffi.sh
```

The runner exercises Rust isolation/budget tests and the real C ABI. It also
accepts `app.js app.pak width height density target` arguments to mount a real
compiled TSX fixture in two independent instances and compare their pixels.
Target 1 is iOS and target 2 is Android. This is an engine test, not a desktop
application host or phone performance measurement.

Android and iOS Simulator libraries cross-compile locally. Android uses NDK
Clang plus bindgen and 16 KiB linker page alignment. Both mobile adapters pass their simulator/emulator acceptance on this engine.
Android JNI state is owned per Activity. Emulator acceptance verifies a second
guest starts fresh and its teardown preserves the first guest's state. The
three-instance container, physical-device acceptance and performance evidence
remain pending.

Owner-thread `mp_suspend`/`mp_resume` preserve a healthy realm and queues.
Suspension rejects guest frames and effect draining, while bounded native
completions may queue for the first resumed frame. Calls are idempotent for a
healthy booted guest and cannot revive a failed guest. Both native hosts now
wire these calls on their owner threads. iOS lifecycle acceptance passes four
tests; Android emulator acceptance preserves revision/state across background
and resume. Physical checks, system-killed recovery and thread migration remain
unverified.

`pool::InstancePool` provides the shared owner-thread retention policy (1..3
guests, LRU, background/resume, close and memory pressure). Its adapter callbacks
must finish lifecycle cleanup and GPU work before resource release. Policy tests
pass; native adapters and its C ABI are not integrated yet. Preparing a new
guest before eviction preserves the current guest on load failure, but requires
separate admission control for transient process memory.

`retained::RetainedEngine` connects this policy to real engine instances and
tracks contacts for cancellation before suspension. Engine-level tests prove
state retention, LRU cold restart, memory-pressure reclamation and cancellation.
`mp_lifecycle` invokes the optional SDK lifecycle hook between frames under a
50 ms execution/job budget. RetainedEngine orders launch/show/hide/unload and
memory-warning notifications. SDK `onLifecycle` listeners do not advance timers.
Native hosts must still wire this ABI and supply launch parameters; GPU adapters
and cleanup-service draining remain required.
