# v0.0.1 release audit

Audit date: 2026-10-09. This is a readiness checklist, not a completed release.
The user's release priority defers additional DevTools work. The full attached
technical plan remains the broader roadmap; this checklist does not remove its
requirements.

| Area | Current evidence | Remaining work |
| --- | --- | --- |
| Pinned shared engine and native hosts | Current full gate passes native core tests, iOS source compilation, service contracts and installed host export tests. Earlier mobile runs prove native pixels and input. | Execute final release packages on both platforms after final changes. |
| Deterministic input and lifecycle | Existing mobile capture runs include touch, hide/show and native service completion; fresh native replays match. | Physical touch-to-present measurements and complex gesture/cancellation acceptance. |
| TSX SDK, routing and frame timers | SDK tests and installed SDK bundle execution pass. Page-stack queries and subscriptions are bounded. A real two-page TSX demo passes navigation/state/background/cold-reset checks in both development hosts; Android system Back and root exit also pass. The signed TSX example also passes both installed hosts, with Android system Back/root exit. | Physical-device route/Back acceptance. |
| Essential native services | Signed hosts implement device info, storage, HTTP/resource responses, clipboard, location, network path status/events and media. Both platforms pass real media consent/denial/chooser cancellation. Android backend isolation/quota checks and an iOS controlled NSItemProvider → JPEG → SDK resource read/release flow pass. Development hosts implement device info/storage. | Positive system image import/camera acceptance, additional iOS media cancellation/quota stress, development service parity, remaining consent UI acceptance and real Android location provider acceptance. Physical network transitions and iOS connectivity-change acceptance remain unverified. |
| Packages and isolation | Gate passes signature/metadata, store, permissions, isolated storage and retained-engine tests. Core tests cover interruption and retirement. | Final native attack-package suite and physical memory/isolation acceptance across concurrent guests. |
| Examples and performance | The 1,000-row list/form fixture and benchmark runners exist. | Establish physical cold-start, sustained scroll, frame-latency and memory evidence against the plan's suggested budgets. |
| CLI and distribution | Create/build/run, signed export and publish validation have automated coverage. | Final clean-environment release workflow, distribution downloads and publisher-key rotation integration. |
| DevTools | Existing inspection, replay and root-highlight evidence is retained. | Further work deferred until after v0.0.1; not a release gate. |

## Executed checks

The current full `tests/check.sh` run completed successfully. Its retained log is
`build/validation/v001-20261009/check.log`. It includes the 70-test Rust library
suite, optimized native core/replay execution, compiler/server integration,
SDK/package/store/storage/permissions checks and installed host export checks.
This command does not run all mobile UI/device acceptance scripts.

After navigation hardening, 28 focused SDK/native SDK/installed SDK tests passed
and the SDK strict type check passed. Tests cover multi-byte route byte limits,
malformed Unicode, atomic push/replace/reset rejection, listener capacity and
recovery after unsubscribe, and valid launch recovery after a rejected query.

No percentage is assigned by this audit: device and service gaps vary greatly
in effort. No physical-device performance acceptance or release readiness is
claimed from these automated results.

## Android system Back acceptance

The full regression gate after Back integration passes, including 72 native
core tests; evidence is retained in `build/validation/back-20261009/check.log`.
Focused SDK/export tests and SDK types pass. Development JNI passes production
NDK compilation with warnings treated as errors, and both Java hosts compile.

An actual authenticated installed app bundles the real SDK, opens a detail
route, receives touch, survives Home/resume, returns to the green root surface
on the first system Back, and leaves the app on the second. Cold reopen returns
to the fresh red detail fixture. Screenshots and UI hierarchy assertions verify
both the page change and foreground ownership; colors alone do not prove exit.
Evidence: `build/android-validation/back-20261009-retry`. The first run failed
because the test listener painted root color during launch and did not repaint
detail; the corrected fixture and successful retry are retained separately.

The owned read-only ARM64 emulator and temporary signed app were cleaned up.
This establishes signed-host emulator behavior, not physical-device acceptance
or a rendered signed multi-page TSX application. Development recording
deliberately discards a capture when Back occurs rather than publishing an
incomplete action sequence. Development-host TSX Back evidence follows below.

## Actual TSX page navigation on both platforms

`examples/navigation` uses Solid TSX and the generated SDK to render Home and
Detail in one guest. Item 42 passes through the route query; a shared counter
survives page changes. Both native development hosts execute button navigation,
query/counter retention and Home/resume. Cold reopen returns Home with counter
zero. Android additionally executes system Back to Home, verifies retained
counter one, and confirms root Back exits from the UI hierarchy.

iOS evidence: `build/ios-validation/navigation-20261009`. The current simulator
core was rebuilt, and the authoritative XCTest summary reports one passed test,
zero failed/skipped. Android evidence:
`build/android-validation/navigation-20261009-retry`. Both sets include real
packages, native trees and screenshots. Home/Detail/returned-Home screenshots
were visually inspected for legible text, fitted native viewport, item 42 and
retained counter. No cross-platform screenshot hash equality is claimed.

The initial Android attempt timed out before native receipts; its evidence is
retained separately. The emulator connection was rechecked before the passing
retry. The runner now explicitly checks completed boot before launch. A direct
compile from the restricted shell also hit the upstream transform-cache write
restriction; the authorized native runners completed actual compilation.

Temporary servers, launchers and the uniquely identified iOS app were cleaned
up. Android development cleanup force-stopped its host and removed its reverse
tunnel; the owned read-only emulator was shut down. The existing iOS simulator
was left running. Physical-device performance remained unverified; subsequent signed TSX
deployment evidence follows below.


## Signed TSX deployment and iOS storage reply correction

The real navigation example compiles into authenticated local packages and
passes both installed hosts. Android evidence is
`build/android-validation/signed-navigation-20261009`; UIKit evidence is
`build/ios-validation/signed-navigation-20261009-storage-fix`, with one passed
XCTest, zero failures/skips. Both retain query 42 and counter one through page
changes and Home/resume, then reset Home to zero after cold reopen. Android
also verifies system Back to Home and root exit. UIKit ignores an untrusted
URL launch argument and uses its bundled signed package. No development server
is needed by either run.

These packages append a test-only SDK storage observer to the TSX example.
Native observational subclasses read normal isolated storage for assertions;
authentication, services, rendering, input and lifecycle remain inherited from
the production installed hosts. Ephemeral private publisher keys are not saved.
Public keys, signed assets, input points, screenshots and test reports are kept.
Detail, returned Home and cold Home screenshots were visually reviewed: text
fits the viewport, query/counter are correct, and no host failure is visible.

The first UIKit attempt failed during Xcode test-framework copying. Subsequent
runs reached Home but exposed missing `ok` in retained storage completion
replies, which the real SDK correctly rejected. `VerifiedContainer.m` now emits
`ok: true` for successful storage and `ok: false` for errors. Focused native
package/container regression assertions cover set/get success and invalid set
failure; the regression passes. Failed runs are retained separately, rather
than represented as passing evidence. Temporary apps and the owned Android
emulator were removed; the preexisting iOS simulator remains running.

This is simulator/emulator acceptance, not physical-device performance,
concurrent-guest isolation acceptance or full release readiness. Further
DevTools work remains deferred for v0.0.1.


## Native network path status and events

The signed hosts implement `device.network.v1`: a current snapshot request plus
`device.network.v1` change events. The SDK adds `network.get()` and
`network.watch(listener)`, validates/freeze snapshots and dispatches changes at
frame boundaries. Unknown/offline/connected shapes are explicit; native path
availability does not establish successful Internet access. Listener capacity,
local cancellation, failed initial-read cleanup and malformed replies are
covered by SDK tests. The generated SDK includes its new contract module.

Both platform hosts compile and their signed TSX navigation acceptance passes
with a test-only network/storage observer. UIKit reports one passed XCTest and
zero failed/skipped in `build/ios-validation/network-20261009-retry`; Android
snapshot evidence is in `build/android-validation/network-20261009`. The first
UIKit attempt failed strict compilation of the test observer's missing type
annotation; its failed evidence is retained separately.

A second Android run, `build/android-validation/network-transitions-20261009`,
temporarily disables Wi-Fi and mobile data only in the owned read-only emulator.
The real SDK receives offline event one, restored cellular event two, then Wi-Fi
event three. UI hierarchy evidence confirms storage proof and the active signed
app. Button routing, query/counter retention, Home/resume, system Back/root exit
and cold reset also pass. Original connectivity settings were restored to one
for both Wi-Fi and mobile data before the owned emulator was shut down.

Each host owns one monitor and retains a latest snapshot rather than a change
history. Monitors stop while hidden; iOS uses epoch guards against callbacks
from cancelled monitors. At most three iOS retained guest watch records are
kept, changes post only to the active identity/generation, and retirement removes
that guest's record. Busy completion queues retry the current snapshot next
frame. Native integration uses the existing owner threads and service mailbox.

No physical network transition, iOS connectivity-change, background change
coalescing under stress, or retained-guest switch acceptance is claimed by these
runs. Development-host service parity, media and release/device work remain
open. DevTools remains deferred for v0.0.1.


The full regression gate passes after network integration, including 72 core
tests, strict SDK types, network SDK contracts, generated SDK bundling and
installed export checks. Evidence: `build/validation/network-20261009/check.log`.
The first restricted-shell gate failed in the existing development integration
fixture because it attempted a GitHub clone; the passing retry uses the existing
`PJM_TEST_UPSTREAM` setting pointing to the pinned local checkout and authorized
loopback/cache access. Its original log is kept as `restricted-check.log`.
Focused Android service compilation also passes; the mobile signed runners
compile and execute the new native hosts rather than relying on source checks.


## Media contract and bounded native image normalization

The generated SDK now exposes `media.select({source, maxDimension, quality})`
with library/camera source choices, dimensions 64–1024, quality 25–90, and a
7200-frame picker deadline. Replies contain only an owned JPEG resource
handle/size plus width/height; binary images and filesystem paths stay outside
the JSON channel. SDK tests reject malformed options/descriptors and oversized
images, verify frame-boundary delivery and frozen nested resource descriptors,
and preserve cancellation while waiting longer than an ordinary service call.

Both native codec implementations accept bounded encoded data, cap source bytes
at 8 MiB, sides at 8192 and pixels at 16 Mi pixels, then normalize one image to
an RGB JPEG within the requested dimensions and the 1-MiB resource limit.
EXIF orientation is applied to pixels and original GPS metadata is not copied.
Transparent pixels flatten to white. Apple ImageIO output uses a capped data
consumer; Android uses a fixed output buffer and sampled decode. This does not
establish a physical peak-memory or latency measurement for platform decoders.

The ImageIO implementation executes on macOS against real native APIs; tests
cover resize, orientation, GPS removal, white alpha, malformed/oversized input
and option rejection. Logs are under
`build/validation/media-foundation-20261009`. Android executes its real graphics
codec in a temporary test APK on the owned read-only emulator, with additional
rotated-pixel assertions. Passing evidence is
`build/android-validation/media-image-20261009-retry`. Its initial test wrongly
required EXIF orientation one; the platform's undefined orientation is valid
for physically normalized pixels. Both attempts are retained separately.

The full regression gate passes, including 72 core tests, the new media SDK
contracts, ImageIO runtime checks, Java admission policy, generated SDK bundling
and exported projects. Both platform source checks pass. Codec sources are
included in generated hosts, with the required ImageIO framework on iOS.
Temporary test APK and emulator were removed; no personal library or camera
was accessed by these checks.

At this foundation milestone neither signed host dispatched `media.select.v1`;
both returned `UNSUPPORTED`. Native picker/camera UI, permission and OS
consent, provider input bounds/timeouts, lifecycle cancellation and adoption
into the shared isolated resource pool still required implementation. The next
milestone below supersedes this status for Android.

## Android media service and native chooser checks

The signed Android host now dispatches `media.select.v1` to per-app native
consent followed by the system document chooser or camera. Camera output uses
a narrowly scoped temporary FileProvider URI. The generated manifest contains
the provider and chooser visibility declarations. No broad storage or camera
permission is requested. Reads enforce an 8-MiB source cap, normalization has
one worker, and a two-minute native deadline bounds waiting. An external
chooser result waits for foreground delivery; unrelated backgrounding cancels
the pending operation. Cancelled and retired callbacks cannot start new reads.

HTTP and media use the same four-per-generation, sixteen-per-process resource
pool. A native emulator test authenticates a signed package and exercises the
real media worker/codec with controlled sources. It passes readable JPEG output,
shared quota, foreign identity/generation rejection, explicit release,
late-callback cancellation and oversized input. It also verifies that closing
the media service leaves other shared handles readable. This test substitutes
the source UI; it does not prove a system document provider or camera result.
Evidence: `build/android-validation/media-service-20261009`.

Two fresh signed TSX apps execute the actual consent dialog. The cancellation
case grants access, opens Android's system document chooser, presses Back and
observes `CANCELLED` through SDK storage. Cold reopening skips consent and repeats
the chooser cancellation. The denial case observes `DENIED` without opening
the chooser, and preserves denial after cold reopening. Both runs also pass
route/query/counter retention, background/resume, button/system Back, root exit
and cold reset. Evidence:
`build/android-validation/media-picker-cancel-20261009-button-fix` and
`build/android-validation/media-picker-deny-20261009`.

Initial attempts are retained separately: a consent test assumed mixed-case
button text, a retry omitted the required Android SDK environment, and a
baseline navigation attempt timed out. The successful chooser/denial runs
cover the complete navigation sequence with current sources. Teardown now
retires the container before closing the media service and shared pool.

The full gate passes with 72 core tests and the SDK/codec/export checks;
log: `build/validation/media-service-20261009/check.log`. Positive system image
import, camera capture, iOS media dispatch, development-host parity and physical
memory/performance acceptance remain pending. DevTools stays deferred for v0.0.1.

The signed Android HTTP SDK resource fixture also passes after adopting the
shared pool: its managed response changes native pixels, resource reads/release
execute through the installed host, background/resume preserves the resulting
guest state, and cold reopening starts fresh. Evidence:
`build/android-validation/media-shared-http-20261009`. Current complete Android
Java source compilation and whitespace checks pass. Owned temporary apps and
the read-only emulator were cleaned after the runs.

## iOS media service and signed SDK acceptance

The installed iOS host now implements media selection with per-app consent,
PHPicker for library images and UIImagePickerController plus native camera
permission for capture. PHPicker file representations are streamed inside the
provider callback with an 8-MiB hard cap, then normalized by the existing
bounded ImageIO codec. Camera images are checked for dimension/pixel bounds,
scaled and oriented into a bounded thumbnail before JPEG normalization. Camera
hardware acceptance remains outstanding. Generated projects include PhotosUI,
AVFoundation, the service implementation and the camera usage description.

One process-wide operation permit and its reserved HTTP/media resource slot
stay retained through provider/worker completion. Cancellation removes the
handle and stops UI/progress immediately; late callbacks cannot install data or
post another reply. The native two-minute deadline runs while frame delivery is
paused. The host preserves its own full-screen picker presentation; actual app
backgrounding rejects the operation with BUSY. Container retirement cancels its
media work before dropping resource mappings. Completion delivery occurs only
at a host frame boundary and retries a busy guest mailbox.

Three signed TSX simulator runs each pass one XCTest, zero failures/skips:

- Actual consent, PHPicker cancellation, saved approval and cold reopening:
  `build/ios-validation/media-picker-cancel-20261009-retry`.
- Actual consent denial and persisted denial after cold reopening:
  `build/ios-validation/media-picker-deny-20261009`.
- A controlled owned PNG passed through a real NSItemProvider, bounded reader,
  ImageIO normalization, shared resource pool and SDK. The guest checks 64×32
  JPEG metadata, reads its JPEG marker and matching total size, and releases
  the handle: `build/ios-validation/media-provider-20261009`. This replaces the
  picker result only and does not establish positive system-library selection.

All three also cover native route/query/counter retention, background/resume,
cold reset and an ignored untrusted development URL. Consent and system-picker
screenshots were visually reviewed. The first cancellation run passed the
initial picker flow but its cold-reopen test waited for the underlying surface
while the full-screen picker covered it. Correcting the test order yields the
complete passing run; the failure is retained separately.

The full regression gate passes, including 72 core tests. Evidence:
`build/validation/ios-media-20261009/check.log`. Final iOS source checks and six
focused SDK/export tests (91 assertions) pass. The UIKit test apps and temporary
projects were removed; the preexisting simulator stays running. Additional
cancellation/quota/provider-error stress, positive library selection, camera
hardware, development parity and physical performance remain required.
DevTools stays deferred for v0.0.1; the overall goal remains active.
