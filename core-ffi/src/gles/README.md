# Instance-owned GLES2 renderer adaptation

Adapted from the pinned PocketJS GLES backend. `origin.json` records the original
Git commit and source hashes; they were checked against that commit's Git blobs.
The upstream MIT license is preserved in `LICENSE-UPSTREAM.txt`.

The renderer retains the upstream shader pipeline, deterministic DrawList walk,
image/font cache, batching, blending and physical scissor conversion. Its global
renderer and trace state were removed. Each `Renderer` owns its caches and is
neither Send nor Sync. Creation, rendering and explicit destruction require the
owning GLES2 context current. Dropping CPU state performs no implicit GL deletion;
context-loss and host retirement must distinguish valid from lost object names.

Admission bounds a stream to 262144 words, 262144 expanded vertices and clip depth
256. Truncated/unknown opcodes, non-finite texture UVs and unsupported native
surface quads are rejected. Geometry reservation uses fallible exact capacity.
Texture admission bounds slot history to 512, each decoded RGBA image to 16 MiB,
and the whole image set to 64 MiB including the white texel. It checks the driver's
maximum dimensions. Coverage optimizations may use fewer bytes; the admission
count remains conservative. All stale image objects are deleted before any
replacement upload, preventing old/new admitted sets from overlapping wholesale.

These are local decoded-storage ceilings, not measurements of driver memory or
a process-wide resource ledger. Generated glyph preparation and total CPU/GPU
budgets still need integration with the instance/container resource policy.

The code is compiled for Android and native unit tests. Current tests exercise
the real core's geometry/texture/glyph data and planner state; they do not issue
GL calls. `tests/gles-driver-android.sh` separately executes real EGL pbuffer
rendering on an explicitly selected Android device; Pixel 8 Pro readback verifies
a green guest pixel before and after context loss/recreation. It also verifies
no-current attachment failure, stale epoch rejection, actual context mismatch,
preserved handle after premature destruction and explicit release. This narrow
offscreen driver test does not prove Activity presentation or complex shaders.
The shared pool API now lazily attaches per-guest renderers, guards ordinary
operations against every retained EGL binding, and releases resources during
eviction/close/shutdown. Pool loss prevalidates every epoch before discarding;
pool-wide epoch history prevents reuse after loss. Physical driver tests cover
these paths, including wrong-context mutation/destruction rejection and green
readback after pool recreation. InstalledActivity now uses direct JNI rendering,
centered viewport mapping and release/rebind across pause. Physical signed-app
checks verify simple colors, touch and warm/cold lifecycle. The shared C API exposes `mp_gles_attach`,
`mp_gles_render`, `mp_gles_release` and `mp_gles_lost` for individual instances,
with an exact-size physical viewport struct and unsupported-platform failures.
Android `Instance` now owns an
explicit context state and exposes unsafe attach/render/release operations plus
a CPU-only context-loss operation. Monotonic host epochs fence stale names;
Android additionally captures the actual EGL display/context at attachment and
checks both before rendering/deleting. Hosts must report loss before handle
reuse; EGL identity alone cannot distinguish reused driver handles. Destroy
rejects a still-attached instance, retaining the handle for release/loss.
State tests exercise mismatch rejection, exactly-once release, loss/recreation,
reused-token rejection and independent instances without issuing GL calls.
The development host still uses software BGRA upload. Forced Activity context
loss, complex graphics goldens, Metal and performance/memory acceptance remain
required work.
