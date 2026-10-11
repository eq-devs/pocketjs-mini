# v0.0.1 release audit

Audit date: 2026-10-11. This is a readiness checklist, not a completed release.
The user's release priority defers additional DevTools work. The full attached
technical plan remains the broader roadmap; this checklist does not remove its
requirements.

| Area | Current evidence | Remaining work |
| --- | --- | --- |
| Pinned shared engine and native hosts | Current full gate passes native core tests, iOS source compilation, service contracts and installed host export tests. Earlier mobile runs prove native pixels and input. | Execute final release packages on both platforms after final changes. |
| Deterministic input and lifecycle | Existing mobile capture runs include touch, hide/show and native service completion; fresh native replays match. | Physical touch-to-present measurements and complex gesture/cancellation acceptance. |
| TSX SDK, routing and frame timers | SDK tests and installed SDK bundle execution pass. Page-stack queries and subscriptions are bounded. A real two-page TSX demo passes navigation/state/background/cold-reset checks in both development hosts; Android system Back and root exit also pass. The signed TSX example also passes both installed hosts, with Android system Back/root exit. | Physical-device route/Back acceptance. |
| Essential native services | Signed hosts implement device info, storage, HTTP/resource responses, clipboard, location, network path status/events and media. Both platforms pass real media consent/denial/chooser cancellation and system image selection → JPEG → SDK resource read/release, including cold reopening. Android backend isolation/quota checks and iOS quotas/generation retirement pass. Production resource registries also pass process-cap stress with controlled producers on both platforms. Development hosts implement device info/storage, clipboard writes and native network snapshot/change events, with fresh subscriptions after hot reload. Both development hosts pass clipboard declaration denial, native deny/allow, exact SDK readback and persisted cold/hot reopening. Both development hosts pass real HTTPS SDK resource read/release and domain denial across initial, cold reopen and hot reload; Android also passes native controlled-transport HTTP/cancel tests. Android development location declaration/native denial passes SDK initial/cold/hot checks; approved fused-provider SDK coordinates also pass after a fresh request following native app/OS approval, including cold/hot reopening. Controlled wrapper approval/ownership/cancellation tests pass. iOS development location shares the bounded Core Location service and passes real SDK declaration/native consent denial and native app/system approval with actual Core Location coordinates across initial/cold/hot execution, plus controlled ownership/cancellation/activation checks. iOS development media now shares native picker/worker and HTTP resource accounting; controlled JPEG/resource/quota/retirement tests and real SDK declaration/native consent denial pass initial/cold/hot execution. Actual iOS development library selection also passes SDK JPEG header read/release, cold reopening and live reload in one UIKit test. Android development media shares the bounded native worker and HTTP resource registry; controlled ownership/cancellation checks, real SDK declaration/native consent denial, and actual system image selection with JPEG read/release pass across initial/cold/hot execution. | Physical camera acceptance, combined live HTTP/media worker stress, iOS camera checks, wider location revocation/stress and extended development HTTP stress, remaining consent UI acceptance and Android first-request location timing/stability. Physical network transitions and iOS connectivity-change acceptance remain unverified. |
| Packages and isolation | Gate passes signature/metadata, store, permissions, isolated storage and retained-engine tests. A named 26-case native package matrix passes on Android and in a UIKit simulator app, including retained-state and storage checks. Signed heap-limit and infinite-loop guests are also stopped on both native platforms, with healthy retained state preserved and failed effects denied. Core tests cover interruption and retirement. | Wider malicious workload/service-flood acceptance and physical memory/isolation acceptance across concurrent guests. |
| Examples and performance | The 1,000-row list/form fixture and benchmark runners exist. | Establish physical cold-start, sustained scroll, frame-latency and memory evidence against the plan's suggested budgets. |
| CLI and distribution | Create/build/run, signed export and publish validation have automated coverage. | Final clean-environment release workflow, distribution downloads and publisher-key rotation integration. |
| DevTools | Existing inspection, replay and root-highlight evidence is retained. | Further work deferred until after v0.0.1; not a release gate. |

## Executed checks

The current full `tests/check.sh` run completed successfully. Its retained log is
`build/validation/cpu-clock-outside-budget-20261011/check.log` (exit receipt: `result.json`, exitCode=0). It includes the 74-test Rust library
suite, optimized native core/replay execution, compiler/server integration,
SDK/package/store/storage/permissions checks and installed host export checks.
This command does not run all mobile UI/device acceptance scripts.
The earlier v0.0.1 gate remains retained at `build/validation/v001-20261009/check.log`.

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


## iOS delayed and oversized provider recovery

Two additional signed TSX simulator tests each pass one XCTest with zero
failures/skips. Both preserve the real host dispatch, provider reader, codec,
resource pool, SDK promises and frame delivery; the controlled source is test-only.

The late-provider case deliberately invokes its completion five seconds after
admission even when its progress is cancelled. The SDK waits for a native
provider-start receipt, cancels the selection and checks CANCELLED. An immediate
replacement returns BUSY while the old callback still retains the operation
permit. After that callback ends, a new image request succeeds and its resource
is released. The late result cannot replace the new request's reply. Evidence:
`build/ios-validation/media-provider-late-20261009-retry`.

The oversized case supplies a valid PNG padded to 8 MiB plus one byte. Selection
returns FAILED; a following valid 64×32 image passes JPEG marker reads and
resource release. This proves oversized-provider rejection and recovery through
the installed SDK; it is not a physical peak-memory measurement. Evidence:
`build/ios-validation/media-provider-overflow-20261009`.

Both tests also pass cold reopening, route/query/counter retention and
background/resume. The test observer now clears persisted media results before
starting each guest, so cold-run receipts cannot reuse prior results. The first
late-provider attempt timed out waiting for recovery. Its test-only provider
wrote its completion receipt from a background queue and could contend with
storage; the retry posts that observation on the main owner. The failed result
is preserved separately. Production service behavior was unchanged this turn.

Focused media SDK/export regressions pass four tests and 53 assertions;
whitespace checks pass. Owned temporary apps/projects were cleaned, and the
preexisting simulator remains running. Source/UI quotas, retirement under load,
positive system-library selection, physical camera and release/device work
remain open. DevTools stays deferred for v0.0.1.


## iOS media quotas and generation retirement

The signed SDK quota fixture fills all four guest resource slots with distinct
image handles, reads each JPEG marker and verifies that a fifth selection returns
BUSY. Releasing one handle permits a fresh image with a distinct handle; that
replacement is readable, and all handles are released. The same sequence repeats
on cold reopening. Evidence: `build/ios-validation/media-resource-quota-20261009`.

A separate fixture holds four image resources and saves their opaque handles
through SDK storage. A test-only native observer closes that guest using the
real container API, then reopens its authenticated package within the same host
process. It asserts an increased generation. The new guest verifies DENIED for
every old handle, creates and reads four fresh JPEG handles, and releases them.
This tests generation retirement without relying on process termination to
clear old resource state. It repeats on cold reopening. Evidence:
`build/ios-validation/media-generation-retirement-20261009`.

Both runs pass one XCTest, zero failures/skips, plus the existing route/query/
counter, background/resume and cold-reset sequence. Controlled image sources and
the retirement trigger exist only in the test observer; production dispatch,
package authentication, retained container, retirement callbacks, GPU cleanup,
resource mapping and SDK operations execute unchanged. This is one guest's
quota and sequential generation isolation, not a concurrent multi-identity
process-cap or physical memory proof.

Focused media SDK/export checks pass four tests and 53 assertions; whitespace
checks pass. Logs are retained under
`build/validation/ios-media-quota-20261009`. Temporary test apps/projects were
cleaned; the preexisting simulator remains running. Positive system image
selection, physical camera/performance, concurrent guest/process resource stress,
development parity and wider release work remain open. DevTools stays deferred
for v0.0.1, and the overall goal remains active.


## Actual iOS Photos-library selection (2026-10-10)

A fresh owned iPhone 17 Pro/iOS 26.4 simulator imports a generated 64×32 red PNG
and runs the authenticated installed TSX app. The real per-app consent and
PHPicker UI execute. XCTest selects the owned image from the observed native
photo bounds. The production NSItemProvider reader, ImageIO codec, shared pool
and SDK return a 64×32 JPEG; the guest checks its JPEG marker and matching
resource size, then releases its handle. Cold reopening repeats actual selection
with the saved approval. No source UI/provider replacement is enabled.

The test also passes route/query/counter retention, background/resume, cold reset
and an ignored untrusted development URL. Authoritative XCTest summary reports
one passed test, zero failures/skips. Picker/result screenshots were reviewed;
the owned red image is the newest thumbnail in the real Photos grid. Evidence:
`build/ios-validation/media-library-selection-20261010-coordinate` including
xcresult, attachments, signed package, original PNG, fixture hash, complete
command log and owned-device cleanup receipt.

`tests/media-library-ios.ts` makes this repeatable: create a device, wait for
completed boot, import only its owned fixture, execute the signed UI test and
remove the device in cleanup. Its successful run reports cleaned=true. Earlier
attempts are retained separately: a collection-view selector did not match the
iOS 26 Photos hierarchy, a current-year text selector did not match the displayed
label, and the remote image lacked an accessibility activation point. The final
runner uses the observed thumbnail identifier and taps its center coordinates;
SDK dimensions reject accidentally choosing a stock asset.

All agent-created simulators and their libraries were removed. The original
simulator and its library remain in place. Focused media/export checks pass four
tests and 53 assertions; whitespace checks pass. The most recent full regression
gate remains the earlier passing iOS media gate; production service code was
unchanged this turn. Android positive import, physical camera/performance,
concurrent process limits, development parity and broader release work remain
open. DevTools stays deferred for v0.0.1; the overall goal remains active.


## Actual Android system-library selection (2026-10-10)

The authenticated installed TSX app passes real per-app consent and DocumentsUI
selection of an owned 64×32 red PNG on the API 37, 16 KiB emulator. The production
provider reader, image codec, shared resource pool and SDK return a 64×32 JPEG.
The guest checks its JPEG marker and matching resource size, then releases the
handle. Cold reopening repeats actual selection with saved approval. Route/query/
counter retention, Home/resume, system Back/root exit and cold reset also pass.
Evidence: `build/android-validation/media-library-selection-20261010-tile-selector`.
The runner exits zero; screenshots show the owned red file in the actual picker
and the rendered Home page after successful selection. Native error capture is
empty on this passing run. A second complete run also exits zero, repeats actual
selection on cold reopening, reports no native errors, and confirms fixture
deletion and emulator cleanup. Its evidence is
`build/android-validation/media-library-selection-20261010-repeat`.

`tests/media-library-android.ts` starts and stops only its owned read-only
emulator. A separate test-only activity creates the fixture through app-owned
MediaStore access, verifies its SHA-256 and published bytes, and deletes the exact
URI during cleanup. This activity is absent from production exports. The installed
host's picker/source is unchanged. The deletion receipt and cleaned emulator
metadata are retained; temporary app and local project are removed. The PNG
fixture is shared with the iOS runner.

Earlier raw shared-storage and shell MediaStore provisioning attempts failed
before selection. The first app-owned attempt created the image but encountered
a native frame failure. Another attempt reached the picker but required a
corrected file-tile accessibility selector. Those failed attempts remain separate.
The JNI bridge now retains a bounded ASCII native error detail for frame and
lifecycle failures; the runner saves native errors and fails promptly when the
host reports a permanent failure. The initial native failure's cause remains
unproven; two passing runs do not establish cold-start stress acceptance.

Focused SDK and both installed exports pass six tests, 91 assertions; the retained
log is `build/validation/media-library-android-20261010/focused.log`. The actual
Android run compiles and links the JNI sources with warnings treated as errors.
Physical camera/performance, concurrent resource/process stress, development
service parity and release/distribution work remain open. Further DevTools work
stays deferred, and the overall goal remains active.


## Development-host network parity (2026-10-10)

Both development hosts reuse the signed hosts' native network monitors for
`device.network.v1` reads and frame-boundary change events. Requests reject
non-empty arguments with `PROTOCOL`. Each host stores one latest snapshot and
one delivered snapshot, retries admission after a full event queue, stops native
monitoring while hidden, and clears guest subscription state on replacement.
iOS adds non-fatal development event admission so backpressure can retry without
stopping the guest. Android includes the monitor source and network-state
permission in its development build; API 23 safely returns `unknown` rather than
calling a newer callback API.

The actual Android TSX app receives Wi-Fi at event count zero, offline at one,
restored cellular at two, and Wi-Fi after resume at three. Its cold guest reads
Wi-Fi with count zero. Hot reload advances revision two to three, renders the
new fixture label, and starts the new watcher at count zero. All stages reject
invalid arguments as `PROTOCOL`; route/query/counter, Home/resume, system Back,
root exit and cold reset also pass. Evidence:
`build/android-validation/network-development-20261010`. Connectivity is restored
before cleanup; the owned read-only emulator is stopped.

UIKit passes one XCTest, zero failures/skips, for native network snapshot,
protocol rejection, background/resume and cold reopen alongside navigation.
The separate hot-reload check advances revision two to three and observes the
new fixture with Wi-Fi and zero events. Evidence:
`build/ios-validation/network-development-20261010`, including authoritative
`summary.json`, attachments, hot-reload tree and screenshot. The temporary app,
server and local project are cleaned; the existing simulator remains running.
Both platform screenshots were inspected for readable network and protocol
receipts. No native source/provider replacement is used by these tests.

Focused SDK/launch checks pass three tests, 31 assertions. Both native source
checks and the full regression gate pass, including 72 native core tests and
compiler/server, SDK/package/storage and installed-export checks. Evidence is
`build/validation/network-development-20261010/check.log`. The known optional
Rust debug-strip warning persists; optimized build/execution succeeds.
Physical transitions, iOS connectivity-change acceptance, retained
watch/process stress and remaining development HTTP/clipboard/location/media
parity remain open. DevTools stays deferred; the full goal remains active.


## Shared resource process-cap validation (2026-10-10)

Android's production registry passes 64 rounds with eight owner threads,
1,024 admissions and 497 delayed-producer checks. It enforces 16 resources
per process and four per generation, rejects foreign/retired handles, and
retains permits until cancelled producers finish. Evidence:
`build/android-validation/resource-process-20261010`, including the native
receipt, proof, result and owned-emulator cleanup record.

iOS's production registry passes 32 rounds across six authenticated installed
controllers, 512 admissions, 256 delayed-token checks and 128 actual native
generation retirements. XCTest reports one passed test, zero failures/skips.
Evidence: `build/ios-validation/resource-process-20261010-scene`, including
`summary.json`, native receipt attachments and result. The earlier attempt
failed to show its test window; that attempt proves no resource invariants.
The scene-owned window correction affects only the test fixture. The temporary
app/project were removed; the preexisting simulator was retained.

These runs use controlled producer slots/tokens, not simultaneous live HTTP
and media workers. Physical memory acceptance and live-worker stress remain
open. Focused SDK/export checks pass six tests with 91 assertions. The latest
full regression gate remains the network-development run recorded above;
this milestone adds test fixtures and runners without changing production
registry behavior. Further DevTools work remains deferred for v0.0.1.


## Development clipboard writes (2026-10-10)

Both development hosts now implement `clipboard.write.v1`: strict single-text
arguments, valid Unicode, 2-KiB UTF-8 / 3-KiB encoded-text limits, foreground
admission and 16 requests per app per minute with bounded identity history.
Android shares the installed host writer and its four-request mailbox,
cancellation, 15-second expiry, retirement and completion retries. Development
writes do not construct a verified package or grant clipboard-read permission.
iOS writes execute on the existing main-owner deferred service turn.

Actual TSX SDK writes and malformed-request `PROTOCOL` receipts pass initial
launch, cold reopen and hot reload on both native development hosts. Existing
navigation/state/background/network checks also pass. Evidence:
`build/android-validation/clipboard-write-development-20261010` and
`build/ios-validation/clipboard-write-development-20261010`. UIKit's authoritative
summary has one passed test, zero failures/skips. Its system pasteboard was also
read externally and exactly matched `PocketJS development 😀`; Android's SDK
completion proves the native write call succeeded, without a separate system
clipboard readback. Screenshots and native trees retain the SDK receipts.
Temporary apps/projects/servers were cleaned; the owned Android emulator was
stopped and the preexisting iOS simulator retained.

Both native source checks pass. Focused SDK/launch/export checks pass four
tests with 55 assertions. The full regression gate passes, including 72 native
core tests, with evidence at
`build/validation/clipboard-write-development-20261010/check.log`. Additional
controlled development mailbox assertions were added to `NativeClipboardTest`
and compiled; this run did not execute that separate Dalvik fixture.
Clipboard-read consent, development HTTP/location/media parity, live combined
resource workers, physical acceptance and distribution remain open. DevTools
remains deferred for v0.0.1; the full goal remains active.


## Native package admission attack matrix (2026-10-10)

Expanded the signed-package fixture to 26 named cases: one valid guest and
25 rejected inputs. Both native implementations reject malformed or changed
plan hashes, unsupported modality/features/companions, inconsistent viewports,
plan-version mismatch, duplicate/escaped duplicate plan keys, a BOM, identity
mismatch, altered payloads, signed invalid containers, wrong trust keys,
altered signatures, unsupported minimum host ABI, wrong signed targets and
signed truncated containers. Fixtures retain public test keys and signed
payloads; private signing keys are not retained.

Android executes the production verifier, package store and retained container
in `app_process` on the owned ARM64 emulator. Its native receipt identifies
every accepted/rejected case, and the runner checks it against the fixture
matrix. The same run executes EGL close ownership, controlled location and
clipboard mailbox tests. The new development clipboard checks prove four-slot
admission, invalid-identity rejection, retired UI work suppression and correctly
owned completion delivery. Evidence:
`build/android-validation/package-load-expanded-20261010`. The owned emulator
was stopped and temporary native files removed.

UIKit executes the existing Objective-C native fixture inside a temporary
Release simulator app, using production verifier/store/container classes and
the mobile core. Assertions are explicitly enabled and a runtime self-check
fails the fixture if they are disabled. The final run passes one XCTest with
zero failures/skips; its attachment records all 26 named verdicts. Evidence:
`build/ios-validation/package-matrix-20261010-assertions`. The preceding
`package-matrix-20261010` run also passed; the final run adds the assertion
self-check. Native checks include retained activation, generation ownership,
storage completion/error handling, cleanup, staged updates/rollback, locking,
tamper rejection and symlink denial. The temporary app/project were removed;
the preexisting simulator was retained.

Focused package/permission/store regressions pass 13 tests. No production
behavior changed in this milestone; the latest full regression gate remains
`build/validation/clipboard-write-development-20261010/check.log`. This matrix
proves package admission and the executed container checks. Mobile execution
of heap-exhaustion and infinite-loop attack guests, physical process-memory
acceptance, remaining native services and release distribution remain open.
DevTools remains deferred for v0.0.1; the full goal stays active.


## Signed runtime attacks and retained recovery (2026-10-10)

Added two correctly signed and admitted attack guests to the native package
fixture: an infinite frame loop and a 1-GiB ArrayBuffer allocation attempt.
They use separate host-authenticated identities and the production retained
container. Each run keeps a healthy guest alongside the attacker, verifies
failure through the engine diagnostic, denies later frames/effect reads, then
reactivates the healthy guest with its original generation and frame count.
A service record emitted before failure is never delivered to the resumed
healthy guest. This executes attack code after admission, in addition to the
26-case package rejection matrix.

Android passes both attacks on its owned ARM64 emulator. The loop fails with
`interrupted` in 50 ms; the allocation fails with `out of memory` below the
clock's millisecond resolution. Native logs and explicit attack receipts are
retained at `build/android-validation/runtime-attacks-20261010-diagnostics`.
The same run passes package/store/isolation, EGL close, clipboard and controlled
location checks. Its native error log is empty and the owned emulator is cleaned.

UIKit passes one XCTest, zero failures/skips, with assertions enabled. Its
native receipt records `interrupted` at about 50.076 ms and `out of memory` at
about 0.210 ms, both followed by successful healthy retained recovery. Evidence:
`build/ios-validation/runtime-attacks-20261010-denied-effects`, including
`summary.json`, the attachment and extracted `runtime-attacks.json`. The
temporary test app/project are removed; the preexisting simulator is retained.
These timings are observations from this run, not physical-device performance
acceptance or process-memory measurements.

The initial attempts remain retained separately at the unsuffixed
`runtime-attacks-20261010` directories. UIKit's crash log locates a test assertion
that incorrectly expected zero bytes from a failed guest's service queue; the
correct behavior denies queue access. The corrected test requires denial and
checks the healthy guest receives no attack record. Android initially exited
137 without a saved exception stack; that first exit's cause is not established.
Inspection did reveal that its CPU-frame JNI binding discarded the native
failure reason. Frame/effect JNI errors now use the existing bounded ASCII
native diagnostic helper, matching the GPU path. The final Android run proves
both expected native reasons and all recovery checks.

The full regression gate passes after the JNI change, including 72 native core
tests, source/SDK/package/store and compiler/server integration checks. Evidence:
`build/validation/runtime-attacks-20261010/check.log`. Wider malicious workloads,
service floods, physical memory/isolation, native service parity and final
release/distribution work remain open. DevTools stays deferred for v0.0.1;
the full goal remains active.


## Android development clipboard-read consent (2026-10-10)

The development host now implements `clipboard.read.v1` through the existing
bounded clipboard mailbox. A host-owned authorization object binds committed
metadata identity and its `clipboard.read` declaration; service arguments cannot
supply either. Signed callers still bind their original verified package and
native permission gate. Development consent is stored in a separate private
preference namespace, with at most 64 identities, and native deny/allow decisions
persist across cold reopen and hot reload. Text/Unicode validation, four pending
requests, shared 16-per-minute admission, 15-second expiry, cancellation,
retirement and completion retries remain shared with installed callers.

Real TSX SDK checks pass undeclared denial, native denial and native approval.
The approved client verifies the exact Unicode text `PocketJS read consent 😀`.
All three scenarios pass initial launch, cold reopen and hot reload, with the
existing navigation/background/system Back/network checks. Nine native read
verdicts are retained in
`build/android-validation/clipboard-read-development-20261010-focus-retry`,
including per-scenario native trees, consent XML/screenshots, results and
`clipboard-read-summary.json`. The Android clipboard preview and native guest
receipt were visually inspected. The owned emulator is stopped and temporary
apps/projects/servers are cleaned.

The same owned-emulator run executes shared clipboard regressions for declared
and undeclared development reads, late approval after retirement, correctly
owned Unicode completion and background denial. It also reruns signed package,
store, retained-container, EGL close, controlled location and both signed
runtime attack checks. Focused SDK/launch/export checks pass four tests with
55 assertions; Android source compilation passes.

Earlier attempts are retained separately. The first consent selector failed on
Android's uppercase button text; the runner now selects native button IDs.
The next run exposed a real focus race: a dismissed dialog's decision could
arrive before the activity regained focus. Decisions now wait for the native
focus callback; timeout/retirement cleanup also clears that pending callback.
A later emulator-startup run and compiler gate timed out while system logs
showed sleep intervals. The final native run inhibits idle sleep only for its
process lifetime and passes; it does not change permanent power settings.

The final full regression gate passes, including 72 native core tests and
compiler/server, SDK/package/store and installed-export checks. Evidence:
`build/validation/clipboard-read-focus-20261010-retry/check.log`. The earlier
sleep-interrupted gate remains retained as failed evidence. iOS development clipboard-read consent,
development HTTP/location/media parity, physical acceptance and distribution
remain open. DevTools stays deferred for v0.0.1; the full goal stays active.


## iOS development clipboard-read consent (2026-10-10)

The UIKit development host now supports `clipboard.read.v1` with a host-bound
metadata declaration and native denial/approval. Development decisions use a
separate private preference namespace from signed package permissions, capped
at 64 identities. Read tasks bind the original surface and identity, allow four
pending requests, share the 16-per-minute clipboard admission limit, enforce
15-second main-run-loop expiry, validate Unicode/2-KiB raw and 3-KiB encoded
text, and retry completions through bounded native admission. Cancellation and
surface replacement cancel timers/alerts and discard old replies. Signed host
read authorization is unchanged.

Actual TSX SDK validation passes undeclared denial, native denial and native
approval. The approved guest reads the exact Unicode literal
`PocketJS read consent 😀`. Each scenario passes initial launch, cold reopen
and hot reload, plus navigation, retained state and background/resume checks.
Authoritative summaries report three passed XTests in total, zero failures or
skips. All nine native read verdicts were checked from exported native tree
attachments and hot-reload snapshots. Evidence:
`build/ios-validation/clipboard-read-development-20261010`, including each
scenario's result/summary, attachments, hot-reload tree/screenshot and the
combined `clipboard-read-summary.json`. The final approved screenshot was
visually inspected. Temporary primary test apps/projects/servers were removed;
the preexisting simulator was retained.

The full regression gate passes, including 72 native core tests, source checks,
compiler/server integration, SDK/package/store and installed host export
checks. Evidence: `build/validation/clipboard-read-ios-20261010/check.log`.
These runs read text written by the same test app; cross-app OS paste-privacy
UI, physical clipboard behavior and extended iOS read cancellation/quota stress
remain unverified. Development HTTP/location/media parity, physical acceptance
and final distribution remain open. DevTools remains deferred for v0.0.1;
the full goal remains active.

### Android development HTTP provider integration (2026-10-11)

The development host now binds an immutable exact-domain HTTPS policy from the
committed app metadata and uses the production bounded HTTP provider for
`request.v1`, `resource.read.v1`, `resource.release.v1` and `cancel.v1`.
Signed calls retain their authenticated package policy and original package
ownership; separate completion drains prevent development replies from entering
signed delivery. Hot replacement retires requests/resources before binding the
next generation; shutdown closes the provider on its owner thread.

The current Java development host and native HTTP fixture compile. Actual
Android `app_process` execution on an owned read-only Pixel_2 emulator passes
both signed HTTP regressions and development policy tests: immutable domains,
HTTPS/port/userinfo/subdomain rejection, redirect denial, completion retry,
identity isolation, resource retirement and cancellation. Evidence:
`build/android-validation/http-development-20261011/{native.log,result.json,owned-emulator.json}`.
The owned emulator was cleaned. This run uses a controlled transport interceptor;
live TLS and end-to-end development SDK cold/hot acceptance remain open, along
with iOS HTTP parity, development location/media, physical acceptance and
release distribution. Further DevTools work stays deferred for v0.0.1.

The complete regression gate also passes after this integration (exit 0):
`build/validation/http-development-20261011/check.log`, including the 72 native
core tests and compiler/server, SDK/package/store and installed-export checks.

### Android development live HTTPS SDK acceptance (2026-10-11)

A real TSX SDK fixture requests `https://example.com/` through the development
APK's production OkHttp provider, reads the resource in bounded SDK chunks,
checks the response body, releases its handle and proves a later read is denied.
An undeclared HTTPS domain is rejected by host policy. The initial execution,
cold reopen and hot reload each observe `HTTP: SUCCESS bytes=577 domain=DENIED
released=DENIED` in the actual native inspection tree. Existing navigation,
background/resume, system Back/root exit, clipboard and real emulator network
transition checks pass in the same run. No transport injection or TLS bypass is
used. The first run's test fixture had TypeScript catch-variable errors, repaired
in the running session before initial/hot admission; this is recorded in
`build/android-validation/http-development-sdk-20261011/http-summary.json`.
A fresh run of the corrected fixture also passes without build errors or manual
repair: `build/android-validation/http-development-sdk-20261011-clean`, including
three native verdicts, screenshots, result JSON and owned-emulator cleanup. These are
emulator checks, not physical performance, live combined-worker stress or iOS
HTTP acceptance. DevTools remains deferred for v0.0.1.

### iOS development HTTP integration and live SDK acceptance (2026-10-11)

Installed and development hosts now share the bounded NSURLSession request and
resource helpers. The development facade binds a copied app identity, immutable
exact-domain allowlist and generation from committed metadata; signed requests
keep their authenticated package authorization and original package ownership.
Both use ephemeral sessions, checked redirects and stripped redirect credentials,
inline/resource limits, rolling app rate limits and the same process resource
accounting. Development request/resource/cancel dispatch runs on the main owner;
old requests/resources are cancelled when their surface is replaced or destroyed.
Completion admission checks the original task before retaining a bounded reply.

The actual UIKit TSX SDK fixture passes live HTTPS status/body checks, undeclared
domain denial, resource read/release and denied reads after release. Actual native
trees prove the 577-byte success in initial, resumed, cold-reopened and hot-reloaded
states. Evidence: `build/ios-validation/http-development-sdk-20261011`, including
`http-summary.json`, the authoritative XCTest summary (1 passed, 0 failed/skipped),
attachments, hot-reload tree and screenshot. No TLS bypass or transport injection
is used. The owned app/project/server were cleaned; the preexisting simulator was
retained. A first source check rejected a method-only assertion macro moved into
a C helper; the corrected source check passes. The full regression gate also
passes: `build/validation/http-development-ios-20261011/check.log` (72 native core
tests plus compiler/server, SDK/package/store and installed exports).

Installed-host native regression also passes after the refactor:
`build/ios-validation/http-shared-signed-regression-20261011/run.log` records
7 HTTP replies, bounded completion retry, strict-service denial without a
network side effect, resource ownership/release/retirement/overflow, retained
cancellation process accounting and rolling-rate checks. The owned signed test
app was removed; the existing simulator remains available.
Development location/media parity, extended development HTTP cancellation/quota
stress, live combined HTTP/media workers, physical acceptance and distribution
remain open. Further DevTools work remains deferred for v0.0.1.

### Android development location integration (2026-10-11)

The shared location wrapper now supports a separate host-bound development
identity/declaration/consent adapter. Signed requests retain original package
policy and ownership, with separate signed/development completion delivery.
The development Activity uses real native app consent and current Android
coarse/fine grants, separate bounded persisted consent, the production fused
provider and original request tokens. Cancellation, replacement, background
and shutdown retire/stop requests; an in-flight OS permission dialog is fenced
until its matching callback, preserving its task across the permission pause.
Clipboard and location consent UI exclude one another.

The development APK build now packages the checked offline location dependency
closure, shared HTTP dependencies, compiled AAR resources, generated resource
classes and required Play Services manifest entries. Java compilation and the
full regression gate pass: `build/validation/location-development-android-20261011/check.log`
(72 native core tests plus compiler/server, SDK/package/store and installed exports).
Actual Android native controlled-provider tests pass both signed and development
location protocol/ownership/cancel/retired-consent/backpressure/suspend checks:
`build/android-validation/location-development-native-20261011/native.log`.
The owned native-test emulator was cleaned.

The first real development APK SDK run observed declaration denial but then
failed with `Guest turn deadline exceeded` during unrelated network-transition
checks. Its status, partial native tree and logs are retained in
`build/android-validation/location-development-sdk-20261011`; its owned server,
project and emulator were cleaned. Root cause is not established. A fresh retry also reaches SDK declaration
denial and then fails with the same guest deadline error, with the last frame
receipt at 150 in both runs. Retry evidence:
`build/android-validation/location-development-sdk-20261011-retry`; the failed
guest server and owned emulator were cleaned through normal test cleanup.
This is a reproducible regression awaiting diagnosis, not a passing SDK
acceptance run. Native consent denial persistence and approved real
provider/OS permission acceptance are not yet claimed. iOS development
location, development media, physical acceptance and release distribution
remain open. DevTools remains deferred for v0.0.1.

### Android location denial SDK acceptance and deadline diagnostics (2026-10-11)

Native guest deadline errors now retain their original budget and report the
action and total elapsed microseconds. The 50-ms turn budget and fail-closed
behavior are unchanged. The Android native test checks the active session's
failure receipt and retains status/ownership evidence before normal cleanup,
instead of continuing to wait on a failed guest.

A fresh instrumented run passes both real SDK location declaration denial and
native app-consent denial, including initial load, cold reopen and hot reload.
All six native trees contain `Location: DENIED`; the deny case captures the real
native location dialog and presses its denial button. Both cases also pass the
original network offline/restoration checks, navigation, background/resume and
system Back/root exit. Evidence:
`build/android-validation/location-deadline-20261011/location-summary.json`,
per-case trees/dialog/screenshots/results and owned-emulator cleanup.

The earlier two deadline failures did not recur in this run; their cause is
still unproven, so this pass is not a diagnosis or stability acceptance claim.
The native core checks pass all 72 tests after the timing change. The complete full regression gate also passes (exit 0):
`build/validation/location-deadline-20261011/check.log`. Approved real fused-provider/OS permission acceptance,
iOS development location, development media, physical acceptance and distribution
remain open. DevTools stays deferred for v0.0.1.


### Android approved development location provider acceptance (2026-10-11)

The actual development APK now passes native app consent and Android foreground
location permission, then receives coordinates through Google's fused provider
and the real SDK. Initial fresh request, cold reopen and hot reload report
43.2389483,76.8897083, matching the owned emulator GPS input within 0.0001 degrees.
Evidence: `build/android-validation/location-provider-development-20261011-approved/location-summary.json`
and its `allow` native trees, dialogs, screenshot and result. The wrapper exited
zero and cleaned its owned emulator.

The first request exhausted its native 15-second deadline during permission and
provider startup; its timeout is retained separately. Success follows a fresh
request after permission approval. This does not establish first-request timing
or physical GPS acceptance. Three earlier failed attempts remain retained.
The SDK fallback now follows the requested location deadline plus one second
of delivery grace instead of the generic ten-second fallback; the native deadline
is unchanged. Focused tests verify delivery after 650 frames and cancellation
at 960 frames for a 15-second request (2 tests, 21 assertions).

The latest full-gate log is retained at
`build/validation/location-provider-20261011/check.log`; its terminal exit receipt
was not recovered, so the previous confirmed gate remains the release-audit
baseline. Earlier guest deadline failures still have no established cause.
iOS development location, development media, physical acceptance and final
release distribution remain open. Further DevTools work is deferred for v0.0.1.


### iOS development location integration and denial acceptance (2026-10-11)

The development controller now dispatches location requests through the shared
bounded Core Location implementation. Development identity/declaration and
persisted consent use a separate, bounded preference store; no signed package
is fabricated. Native app consent, current OS authorization, strict options,
15-second deadline, per-generation/instance limits, shared identity rate,
original request ownership, cancellation and retirement remain enforced.
Replacement closes the old service; replies require the original app identity,
revision and surface. Background notifications suspend pending work.

The actual UIKit native regression passes controlled development declaration,
saved consent and OS denial, validated position, signed/development sink
isolation, cancellation, stale provider callbacks, generation retirement,
request quota and closed-service checks. Existing signed location SDK/provider,
clipboard, HTTP/resource/rate/backpressure checks also pass.
Evidence: `build/ios-validation/location-development-controlled-20261011/run.log`.
Controlled policy/provider inputs do not prove development consent UI approval.

The real development TSX SDK passes declaration denial and native app-consent
denial on the existing iOS simulator. XCTest taps the actual Location access
alert's denial button. Initial, resumed, cold and hot-reloaded native trees
contain Location: DENIED; navigation, query/counter retention and background
resume pass in both cases. Both XCTest summaries report one passed test,
zero failures and zero skips. Evidence:
`build/ios-validation/location-development-sdk-20261011-retry/location-summary.json`
and per-case dialog/screenshots/native trees. Temporary apps, projects and
servers were cleaned; the user's preexisting simulator remains running.
The first attempt failed test compilation because the dialog check was inserted
in the wrong helper; the corrected retry passes, with the failure retained
separately at `build/ios-validation/location-development-sdk-20261011`.

The full regression gate passes (exit 0), including all 72 Rust core tests:
`build/validation/location-development-ios-20261011/check.log` and `result.json`.
iOS development approval/system-permission/provider UI acceptance, both
platforms' development media, combined live workers, physical acceptance and
release distribution remain open. DevTools remains deferred for v0.0.1;
the full goal stays active.


### iOS development location native approval and activation handling (2026-10-11)

The real development SDK now passes native app consent and the actual iOS
When In Use permission dialog without a test pre-grant. Production Core Location
returns 43.238949,76.889709 through the SDK on the initial request, resumed
surface, cold reopen and hot reload (revision 3). XCTest passes one test with
zero failures/skips; coordinate assertions use 0.0001-degree tolerance.
Evidence: `build/ios-validation/location-provider-development-20261011-activation/location-summary.json`,
per-stage native trees, consent/system-permission screenshots and hot-reload
screenshot. The coordinate input is simulated, not physical GPS acceptance.
Temporary apps, projects and servers were cleaned and the test location input
cleared; the preexisting simulator remains running.

The first approval run reached the actual native/system dialogs but ended with
SDK BUSY; its live native tree and failed XCTest attachments are retained at
`build/ios-validation/location-provider-development-20261011`. The authorization
handler previously rejected permission completion while the app was inactive.
It now defers authorized completion until activation, keeps the original native
deadline, and rechecks current authorization before starting the provider.
Signed activation does not clear explicit host suspension.

Final native controlled tests pass authorization-before-activation, retirement
before an authorization callback, deadline expiry while waiting for activation,
and the existing declaration/consent/OS denial, provider ownership, cancellation,
quota and closed-service cases. Existing signed location SDK/provider,
clipboard, HTTP/resources/backpressure and rate tests also pass.
Evidence: `build/ios-validation/location-activation-controlled-20261011-final/run.log`.
The full gate passes (exit 0), including 72 core tests:
`build/validation/location-activation-20261011/check.log` and `result.json`;
final observer source compilation also passes in `final-source.log`.

Both development hosts now have real SDK location denial and approved provider
acceptance on their emulator/simulator. Android's first permission-stage native
timeout remains a separate limitation. Wider revocation/retained-service stress,
development media on both platforms, combined live workers, physical acceptance
and release distribution remain open. DevTools remains deferred for v0.0.1;
the full goal stays active.


### iOS development media integration and shared resources (2026-10-11)

The development controller now dispatches media.select.v1 through the production
native picker/worker implementation. Development declaration and bounded saved
consent are separate from signed-package permissions; no signed package is
fabricated. Original identity/generation/surface guards, native consent,
camera authorization, bounded decoding/JPEG normalization, cancellation,
retirement, 120-second timeout, process picker lease and shared rate remain.
HTTP and media share the development resource registry and the existing
process-wide resource allocator, enforcing four resources per guest generation
and sixteen per process, including buffers still held by delayed producers.

Actual UIKit controlled native tests pass declaration and saved-consent denial,
validated 64x32 JPEG completion, resource read/release and released-handle denial,
signed/development sink isolation, combined registry capacity, process capacity,
delayed producer retention, cancellation/retirement followed by stale completions,
and completion rejection after owner closure. Evidence:
`build/ios-validation/media-development-controlled-20261011-visible/run.log`.
These controlled picker/worker inputs do not prove actual development image
selection. Existing signed location/clipboard/HTTP/resource regressions also pass.
The first attempt failed fixture assertion-macro compilation; the second used
an unattached presenter and correctly encountered BUSY. Corrected foreground
fixture execution passes; both failures remain in
`build/validation/media-development-ios-20261011/fixture-{compile,foreground}-failure.log`.

Real development TSX SDK declaration denial and native app-consent denial pass
initial, resumed, cold and hot-reload checks. XCTest taps the actual Image access
dialog denial button. Each case reports one passed test, zero failures/skips.
Evidence: `build/ios-validation/media-development-sdk-20261011/media-summary.json`,
per-case native trees, dialogs, screenshots and results. Navigation, retained
query/counter, network snapshot and clipboard checks also pass.

The signed host still passes actual native media consent and system picker
cancellation on initial and cold execution after the shared implementation
change. Evidence: `build/ios-validation/media-shared-signed-cancel-20261011`;
XCTest reports one pass, zero failures/skips. Temporary apps, projects and
servers are cleaned; the user's existing simulator remains running.

The full regression gate passes (exit 0), including 72 core tests:
`build/validation/media-development-ios-20261011/check.log` and `result.json`.
iOS development real image selection/camera acceptance, Android development
media, combined live workers, physical-device measurements and final release
distribution remain open. DevTools remains deferred for v0.0.1; full goal active.


### iOS development real library selection and live reload (2026-10-11)

A disposable iPhone 17 Pro / iOS 26.4 simulator receives one owned red 64x32 PNG
fixture (stock simulator images may also be present). The real development TSX
SDK requests media, XCTest approves the native Image access dialog and selects
the owned image through PHPicker. Production decoding returns image/jpeg with
64x32 dimensions. The SDK reads the JPEG header, validates the resource size,
releases the handle and verifies that a later read is DENIED. Initial selection,
background/resume, cold reopen and a real live reload from revision 2 to 3 pass.

Live reload stays in one UIKit test: after cold selection it posts an explicit
test readiness marker, the host watcher edits TSX, and the still-open application
selects the image again for the new guest. No host relaunch follows that marker.
One XCTest passes with zero failures/skips. Evidence:
`build/ios-validation/media-library-development-20261011-live-window/media-summary.json`,
`live-reload-ready.json`, per-stage native trees, picker/result screenshots and
`owned-simulator.json` (cleaned=true). Its disposable simulator was deleted;
the user's existing simulator/library was untouched.

The earlier successful run at `media-library-development-20261011` proves
initial/cold selection, but its second XCTest relaunched the host. Its
`scope-correction.json` explicitly excludes true live-reload acceptance.
The first single-session attempt at `media-library-development-20261011-live`
failed when its test readiness observation window expired before the marker;
no revised guest was compiled. Native initial/cold results and the failed
XCTest are retained. Extending only the test observation window to cover native
UI setup/cold selection allows the corrected live run to pass. Each owned
simulator was cleaned. Native service deadlines are unchanged.

XCTest terminates the foreground app when it finishes, so the post-test device
screenshot showed Home. That image is retained as `post-test-home.png`; the
reported hot-reload screenshot now comes from the native XCTest attachment
captured inside the app. Test artifact collection is corrected accordingly.

Production source is unchanged in this step. The previous full gate remains
`build/validation/media-development-ios-20261011/check.log` (confirmed exit 0);
the new real compiler/SDK/UIKit execution verifies this additional acceptance.
Development chooser cancellation/camera checks, Android development media,
combined live workers, physical performance/isolation and final release
workflow remain open. DevTools stays deferred for v0.0.1; full goal active.


## Android development media integration — 2026-10-11

The development host now uses the bounded native media picker and JPEG worker,
with separate persisted development consent and the same resource registry as
HTTP. Replies retain the original app identity and reload generation. Signed
and development delivery stay separate. Exported development APKs include the
FileProvider cache path and picker/camera visibility declarations.

Controlled native execution passed declaration rejection, cancellation before
queued UI, late provider retirement, original resource ownership, shared quota,
JPEG read/release and signed/development delivery isolation. Evidence:
`build/android-validation/media-development-controlled-20261011/proof.xml`.
The owned emulator cleanup receipt records cleaned=true.

Actual compiled TSX/SDK execution passed both undeclared media and native
Image access denial across initial launch, cold reopening and live reload.
Six native trees and the consent XML are retained under
`build/android-validation/media-development-sdk-20261011`; `result.json` records
the scope and `owned-emulator.json` records cleaned=true. Navigation, Android
Back/root exit and real emulator network transitions also passed in these runs.
This run does not establish development image selection or camera acceptance.

Android source compilation passed (`build/validation/media-development-android-20261011/source.log`).
The new full gate log reaches its final passing test at
`build/validation/media-development-android-20261011/check.log`, but its terminal
exit receipt was not retained; the prior confirmed full gate remains the release
baseline. Development image selection/cancellation/camera, minimum-version
compatibility, combined live workers, physical performance and final release
validation remain open. Further DevTools work is deferred for v0.0.1.


## Android development library selection — initial evidence, 2026-10-11

The development media driver now supports real library selection and chooser
cancellation. A separate temporary test APK provisions and deletes its own
hashed 64x32 image in MediaStore; the production development host is unchanged.

`build/android-validation/media-library-development-20261011-retry/media-initial.json`
proves actual native consent, system picker selection and SDK JPEG dimensions,
header read, release and subsequent DENIED read. The run was deliberately
stopped at cold reopen after identifying a test ordering bug: its frame-count
wait preceded the external picker interaction. The order is fixed so the picker
is resolved before waiting for resumed frames. `partial-scope.json` excludes
cold/live-reload acceptance. Fixture deletion and owned emulator cleanup are
retained. The first attempt (`media-library-development-20261011`) failed before
launch on an adb reverse listener collision; its separate failure/cleanup
receipts remain retained. The corrected run is in progress and not yet accepted.

The full gate now has a confirmed exitCode=0 receipt at
`build/validation/media-library-development-android-20261011/result.json`, with
its complete `check.log`. Further DevTools work remains deferred for v0.0.1;
physical and final release acceptance remain open.


The subsequent `media-library-development-20261011-picker-order` run proves
initial and cold native image selection with SDK JPEG read/release. Its
`partial-scope.json` excludes live reload: inspection was awaited before
resolving the reload's external picker. Both cold and hot test sequences now
resolve the picker before foreground frame/inspection assertions. The owned
launcher was deliberately stopped for normal test cleanup, and fixture deletion
plus cleaned=true emulator receipts are retained. No native service timeout or
quota was relaxed. The corrected full run is `media-library-development-20261011-live-picker`;
its outcome is pending.


## Android development library selection — full run passed, 2026-10-11

`build/android-validation/media-library-development-20261011-live-picker`
completed with exit 0. Real native Image access approval and DocumentsUI
selection of the separately owned red 64x32 image passed actual compiled TSX/SDK
JPEG metadata/header read, resource release and DENIED reads after release at
initial launch (revision 2), cold reopening (revision 2) and true live guest
reload (revision 3). The host was not relaunched for the live reload. Native
inspection trees, picker/result screenshots and `media-summary.json` retain
this scope. Native fixture deletion is proved by `fixture-cleaned.xml`; the
owned emulator cleanup receipt records cleaned=true. Navigation, Android
Back/root exit, background resume and emulator connectivity transitions passed
in the same run. Physical camera/performance acceptance is not claimed.

Both test ordering issues are fixed: cold frame checks and hot inspection checks
follow external picker resolution. The earlier partial runs and original
forwarding collision are retained with explicit scope/cleanup receipts.
Production source is unchanged in this library-selection step. The confirmed
full regression gate remains `build/validation/media-library-development-android-20261011`
(`result.json`, exitCode=0). Development chooser cancellation/camera, combined
live workers, minimum-version compatibility, physical performance/isolation
and final release/distribution work remain open. DevTools remains deferred for
v0.0.1; the full goal is active.


## Android development chooser cancellation — 2026-10-11

The real compiled TSX/SDK and DocumentsUI run at
`build/android-validation/media-cancel-development-20261011` passed with exit 0.
After native Image access approval, system Back dismissed the external picker
and the SDK returned CANCELLED at initial launch (revision 2), cold reopen
(revision 2), and true live guest reload (revision 3, without relaunching the
host). Per-stage picker XML, native trees and the hot screenshot are retained
under `cancel/`; `media-summary.json` records the exact scope. Navigation,
background resume, Android Back/root exit and real emulator network transitions
also passed. The owned emulator receipt records cleaned=true.

`tests/media-development-android.ts` now accepts validated `PJM_MEDIA_CASES`
(undeclared, deny, cancel) and reports only the cases actually executed. The
prior default declaration/denial behavior is preserved. No production source
changed in this step; the confirmed full gate remains
`build/validation/media-library-development-android-20261011/result.json`
(exitCode=0). iOS development cancellation is being exercised separately;
camera, combined live workers, minimum-version compatibility, physical
performance/isolation and final distribution remain open. DevTools remains
deferred for v0.0.1; the full goal is active.


## iOS development chooser cancellation — 2026-10-11

The actual UIKit/TSX/SDK run at
`build/ios-validation/media-cancel-development-20261011` passed with exit 0:
one XCTest, zero failures/skips. Native Image access was approved, and the real
PHPicker Cancel control produced SDK CANCELLED at initial launch (revision 2),
cold reopening (revision 2) and true live guest reload (revision 3). The latter
kept the same UIKit application open after the readiness marker; it did not
relaunch the host. `media-summary.json` maps each stage to its native tree
attachment. Picker/result screenshots, the ready marker and hot result are
retained; `owned-simulator.json` records cleaned=true for the disposable
simulator. The user's existing simulator was untouched.

The iOS driver now recognizes cancellation as a real picker mode and uses the
same one-session reload watcher and native attachment collection as library
selection. The wrapper accepts `PJM_MEDIA_DEVELOPMENT_CASE=cancel` when
`PJM_MEDIA_DEVELOPMENT=1`. Its legacy console message in this retained run was
broader than the cancellation scope; `media-summary.json` explicitly corrects
it, and the wrapper label is fixed. This cancellation run makes no JPEG
read/release or physical-camera claim. No production source changed; the last
confirmed full gate remains
`build/validation/media-library-development-android-20261011/result.json`
(exitCode=0). Both development hosts now have real picker cancellation evidence
across initial/cold/live stages. Camera, combined live workers, minimum-version
compatibility, physical performance/isolation and final distribution remain
open. DevTools remains deferred for v0.0.1; the full goal is active.


## Android API-23 compatibility audit — numeric and network fixes, 2026-10-11

The development manifest still declares API 23; this step preserves that target.
Media and location numeric contracts now use isNaN/isInfinite rather than
Double.isFinite, which Android documents as API 24. Existing argument, NaN,
infinity and coordinate-bound checks pass. The network service now uses one
application-context connectivity receiver on API 23 to refresh the active
network snapshot, and keeps the native default-network callback on API 24+.
Pause unregisters either observer, and callbacks from retired registrations
cannot update the snapshot after resume. Missing/failed platform access remains
unknown rather than a false connectivity assertion.

`tests/network-compat-java.sh` executes 24 controlled JVM checks for API-23
wifi/cellular/offline updates, metering, duplicate registration, read/register
failures, pause/resume and stale callbacks, plus the API-24 callback path. It is
included in `tests/check.sh`. These stubs do not establish Android device
acceptance. Real Android SDK source compilation passes at
`build/validation/android-api23-network-20261011/source.log`; the full gate has
confirmed exitCode=0 in that directory's `result.json` and retained `check.log`.

The actual emulator network regression at
`build/android-validation/network-api23-regression-20261011` failed at frame 120
with Guest turn deadline exceeded (50 ms budget, action 56995 us). Its initial
network tree, failure receipt and cleaned=true owned-emulator receipt remain
retained. A separate retry is running with the same bounds; it cannot erase or
explain the failed attempt. Deadline stability remains unresolved.

Full API-23 compatibility is not accepted. Remaining source/runtime gaps include
platform ExifInterface(InputStream) and Java Consumer/BooleanSupplier APIs,
plus a full runtime/dependency audit and execution on the declared minimum.
Android documents those APIs as API 24:
[Double](https://developer.android.com/reference/java/lang/Double#isFinite(double)),
[network callbacks](https://developer.android.com/reference/android/net/ConnectivityManager#registerDefaultNetworkCallback(android.net.ConnectivityManager.NetworkCallback)),
[EXIF stream](https://developer.android.com/reference/android/media/ExifInterface#ExifInterface(java.io.InputStream)),
[Consumer](https://developer.android.com/reference/java/util/function/Consumer),
[BooleanSupplier](https://developer.android.com/reference/java/util/function/BooleanSupplier).
Camera, combined live workers, physical performance/isolation and final
release/distribution remain open. DevTools remains deferred for v0.0.1;
the full goal stays active.


The separate actual emulator retry at
`build/android-validation/network-api23-regression-20261011-retry` passed with
exit 0, including native SDK network transitions, resume, cold reopening and
live reload, plus navigation/Back/root exit. Its `result.json` records those
checks; `owned-emulator.json` records cleaned=true. This is the existing API-37
emulator/default-callback path, not API-23 runtime execution. The earlier
56995-us deadline violation remains retained and unexplained; one subsequent
pass does not establish deadline stability or minimum-version acceptance.


## Android callback compatibility — 2026-10-11

Native clipboard approval and media/location state callbacks now use small
host-owned interfaces rather than java.util.function.Consumer/BooleanSupplier.
Both development and signed hosts use the same callback contracts. Clipboard
approval still accepts the original Boolean value, and foreground/cancellation
checks retain their existing getAsBoolean behavior; owner/generation fencing,
native prompt decisions and source/resource bounds are preserved. This removes
these API-24 Java interfaces from the host's callback signatures without raising
the development manifest's API-23 minimum. JNI/FFI contracts are unchanged.

`build/validation/android-api23-callbacks-20261011/source.log` confirms both
hosts, permission adapters and native fixtures compile against the real Android
SDK. Media/provider-input and location contract/mailbox/quota/cleanup JVM checks
pass. The full `tests/check.sh` gate in that directory passed with an explicit
`result.json` exitCode=0 receipt and complete `check.log`.

`build/android-validation/callbacks-package-load-20261011` passed native
app_process execution on the owned API-37 emulator. NativePackageLoadTest
invokes NativeClipboardTest.verify on the accepted retained package, exercising
development declaration denial, late retired consent, original ownership,
approval/readback, background rejection, queued cancellation and retirement.
Controlled signed/development location ownership/cancellation also passed,
alongside 26 package cases (1 accepted, 25 rejected), infinite-loop/heap-limit
attack isolation, retained healthy generation and package-store checks. Its
native log and result are retained; owned-emulator.json records cleaned=true.
These controlled callbacks do not establish actual API-23 device execution or
new native consent-dialog acceptance.

Minimum-version acceptance remains open: platform EXIF stream decoding, the
complete runtime/dependency API audit and execution on the declared baseline
still need verification. The prior emulator deadline failure remains retained
and unexplained. Camera, combined live workers, physical performance/isolation
and final release/distribution remain open. DevTools remains deferred for
v0.0.1; the full goal stays active.


## Android EXIF stream compatibility — 2026-10-11

The media decoder now uses pinned AndroidX ExifInterface 1.4.2 instead of the
platform InputStream constructor. The original AAR declares minSdk 21. Source
byte/dimension/sample checks still precede parsing/decoding; bounded JPEG output,
orientation normalization, metadata stripping and alpha handling are preserved.
The media parser plus JSpecify 1.0.0, original manifests/POMs/licenses and SHA-256
records are retained under `vendor/android-media`. Its annotation dependency
uses the existing verified shared annotation-jvm 1.10.0 closure.
`bin/android-media.ts` rejects missing, changed or redirected consumed files.
Both development APK builds and portable installed exports copy the verified
parser/runtime and license files; no build-time network resolution is needed.
Installed export verifies this closure before creating its output.

Real SDK compilation passes. The full gate at
`build/validation/android-exif-compat-20261011` passed with an explicit
result.json exitCode=0, including the new media integrity test. The focused
installed-export check also passes (`export.log`), checking exact jar/license
bytes and the decoder import. `build/android-validation/media-exif-compat-20261011`
passed native codec and media-service execution, including EXIF rotation/pixel
orientation, GPS metadata removal, alpha-white JPEG, resize, malformed/oversized
input rejection, resource ownership/shared quota, cancellation and retirement.
Codec/service proof XML and results are retained separately; owned-emulator.json
records cleaned=true. These are API-37 emulator checks, not baseline/hardware
acceptance.

The actual newly packaged development SDK/picker run at
`build/android-validation/media-library-exif-compat-20261011` failed at frame 90
with Guest turn deadline exceeded (50 ms budget; action 64298 us). Its native
consent/failure receipts and fixture deletion/cleaned=true emulator evidence
are retained. It does not establish a completed post-change library selection,
cold reopen or live reload. The prior successful library proof remains scoped
to the earlier source. The native decoder itself passes, but repeated normal
emulator guest deadline failures remain unexplained and need investigation
without relaxing the limit or erasing failed evidence.

The platform EXIF stream-constructor gap is removed. Complete dependency/API
compatibility audit and execution on the declared minimum remain open, together
with deadline stability, camera, combined live workers, physical performance/
isolation and final release/distribution. DevTools remains deferred for v0.0.1;
the full goal is active.


## Guest deadline CPU diagnostics — 2026-10-11

Guest turn failures now retain wall-action/total time and thread CPU-action/total
microseconds, plus whether QuickJS's interrupt fired. Expired turns with an
existing QuickJS/job error also retain the diagnostic while preserving the
original failure text. CPU timing is diagnostic only; the Instant-based wall
deadline, 50 ms frame/lifecycle budget, interrupt and between-job checks are
unchanged. An unavailable platform clock is reported explicitly rather than
used for enforcement. The already locked libc 0.2.186 dependency is now direct.

A focused regression proves that sleeping past a 1 ms turn budget still fails,
and that a prior action error is retained with its deadline context. The full
gate at `build/validation/deadline-cpu-20261011` passed with exitCode=0, including
73 Rust tests; its check.log and result.json are retained.

`build/android-validation/deadline-cpu-attacks-20261011` passed the actual native
attack matrix, retained guest isolation and service mailbox checks. The infinite
frame loop failed at 50036 us wall action / 18231 us thread CPU action, with
interrupted=true, under the original 50 ms limit. The healthy retained guest
survived and failed effects were not delivered. Its native log contains the
explicit RUNTIME_ATTACK_DIAGNOSTIC line; the owned emulator receipt records
cleaned=true. The wall/CPU difference validates the diagnostic on Android but
does not by itself diagnose the earlier normal-app failures.

The ordinary SDK/system-picker flow is being exercised at
`build/android-validation/media-library-deadline-cpu-20261011`. Earlier failures
remain retained. No execution limit was relaxed. Deadline stability, full
minimum-version runtime acceptance, camera, combined live workers, physical
performance/isolation and final distribution remain open. DevTools remains
deferred for v0.0.1; the full goal is active.


The ordinary rebuilt development APK run at
`build/android-validation/media-library-deadline-cpu-20261011` subsequently
completed with exit 0. Actual native consent and system selection of the owned
image passed SDK JPEG 64x32 metadata/header reads, release and DENIED reads after
release at initial launch (revision 2), cold reopening (revision 2) and true live
reload (revision 3, without host relaunch). This verifies packaging/execution
with the pinned AndroidX parser and the current CPU diagnostic source. Native
trees and picker/result screenshots are retained; media-summary.json records
the scope. Fixture deletion and cleaned=true owned-emulator receipts pass.
Navigation, Back/root exit, background resume and connectivity transitions also
pass in this run.

No normal-app deadline failure occurred in this execution, so it supplies no
normal-failure CPU measurement and does not diagnose or erase the earlier
56995/64298-us wall violations. Deadline stability remains open, while the
previously missing post-EXIF-change SDK library-selection evidence is now
established. No wall deadline was relaxed, and physical/minimum-version
acceptance is not claimed.


### Android development camera cancellation — partial evidence (2026-10-11)

`build/android-validation/media-camera-cancel-development-20261011` proves
native app consent, actual Camera2 handoff, Back cancellation returning SDK
CANCELLED, and deletion of the unique private capture file on initial launch.
Camera UI, SDK tree, pending filename and empty-directory receipts are retained.
The harness now supports this camera cancellation case.

Later navigation ceased progressing. The verified owned launcher was stopped
gracefully; the wrapper exited 1 and its owned-emulator receipt records
cleaned=true. `partial-scope.json` explicitly excludes cold reopening, live
reload, camera JPEG capture, URI-grant revocation and physical acceptance. No
normal guest deadline diagnostic was reported, so the cause is still unresolved.
Production code was unchanged in this step; the latest full passing gate remains
`build/validation/deadline-cpu-20261011`. DevTools remains deferred for v0.0.1.


### Android camera cancellation across launch/cold/live reload (2026-10-11)

The actual development SDK rerun at
`build/android-validation/media-camera-cancel-back-diagnostic-20261011` passed
with exit 0. Camera2 hierarchies contain its shutter control; each stage has a
unique private pending capture filename, SDK CANCELLED result after Back, and
an empty private capture directory afterward. Initial/cold revisions are 2;
true live reload is revision 3 without host relaunch. Navigation, detail Back
(handled=1), root exit, background resume and connectivity transitions also
pass. The owned-emulator receipt records cleaned=true. `camera-summary.json`
records the exact scope.

The prior partial run remains retained and its navigation stall is unexplained.
A JNI Back error now reaches the host catch/log path with the original engine
message; test-mode receipts also identify handled/unavailable/error outcomes.
The navigation driver requires a handled detail Back receipt. Failure still
closes the guest as before, and execution budgets are unchanged. Both Java
hosts compile and the actual development APK builds/runs with these changes.

The saved hot camera screenshot shows an unexpected launcher-like surface
despite the Camera2/shutter hierarchy; camera visual acceptance is not claimed.
The final SDK screenshot visibly shows CANCELLED and the reloaded fixture.
Successful camera JPEG capture, inspected URI-grant revocation, physical camera
acceptance and the earlier navigation/deadline stability issues remain open.
Additional DevTools work stays deferred for v0.0.1; the full goal is active.

The full regression gate after the Back diagnostic changes completed with
exitCode=0 at `build/validation/android-back-diagnostic-20261011`; `check.log`
and `result.json` are retained. This includes 73 Rust library tests and the
existing SDK, package, replay, compiler and host export checks. It does not
establish physical-device or minimum-version acceptance.


### Camera capture and UI evidence correction (2026-10-11)

`media-camera-capture-development-20261011` proves actual initial Camera2
shutter/Done capture, SDK JPEG 48x64 header read, resource release/after-release
DENIED and private-file deletion. Cold capture failed with a native turn
deadline: action=13578 us, total=55423 us, actionCpuUs=364, totalCpuUs=4088,
interrupted=false under the unchanged 50 ms wall limit. The operation phase
was not recorded; scheduling delay is an inference, not a completed diagnosis.
Its owned emulator was cleaned. Native host error messages now identify frame,
boot, resume, hide/shutdown or memory-warning phases for future failures.

The phase-labelled retry entered Quick Share while waiting for cold camera
confirmation. Inspection identified that `uiautomator dump` may return success
without replacing XML when it cannot become idle; the harness could read stale
Camera2 controls and tap another activity. The verified launcher was stopped
gracefully and its emulator cleaned. The revised hierarchy reader first removes
its own temporary XML and requires the dump-success marker and valid new XML.
This applies to media/permission prompts and root-exit observations.

The previous cancellation run's SDK CANCELLED and empty private-file receipts
remain evidence, but its cold/hot Camera2 UI handoff claims are withdrawn pending
a fresh-hierarchy run. `ui-scope-correction.json` accompanies both affected
folders. Earlier camera screenshot anomalies were not visual acceptance.
The new capture run is retained at `media-camera-capture-fresh-ui-20261011`.
Physical camera/performance and deadline stability remain open; DevTools stays
deferred for v0.0.1 and the full goal remains active.


The fresh-hierarchy capture attempt reached actual camera review/Done, then
failed in `Frame revision=2` before any receipt: action=52465 us wall versus
290 us thread CPU, total=52467 us and interrupted=true. The frame's SDK reply
decode/strict JSON stack and deadline context are retained in
`media-camera-capture-fresh-ui-20261011/camera/first-frame-failure.txt`.
This strongly suggests scheduling delay, but does not establish stability or
a complete cause. That failed owned session was stopped gracefully and cleaned.

The old health check required a successful frame receipt and matched only the
outer 'Guest turn deadline exceeded' wording. It could therefore miss an
interrupted guest error before frame 30. The development host now also writes
a test-only JSON status with its session URL, revision and original message;
the harness checks that session independently of frame receipts and recognizes
the preserved '(deadline budget=...)' context. Successful boot clears both
status formats. Phase-labelled errors leave the 50 ms budget unchanged. Both
Java hosts compile. The actual APK verification follows in
`media-camera-capture-session-status-20261011`.


`media-camera-capture-session-status-20261011` again passed initial SDK camera
JPEG read/release and private-file cleanup, then entered Quick Share during
cold capture. Its fresh Camera2 XML alone did not prove foreground input
ownership; the current session's status JSON was empty, with no reported guest
deadline. The verified launcher was stopped and its owned emulator cleaned.
This narrows the camera test issue beyond merely stale dump files; the earlier
stale-file failure mode remains independently fixed, but was not proved to be
the sole cause of the wrong-screen interaction. The camera harness now requires
Camera2 current-window focus before shutter/Done taps and saves that evidence.
The focused rerun is at `media-camera-capture-focused-20261011`.


### Actual camera capture — initial and cold reopen verified (2026-10-11)

`media-camera-capture-focused-20261011` verifies actual Camera2 shutter/Done
controls with fresh hierarchy and current-window focus, SDK JPEG 48x64 header
read, release, after-release DENIED and private capture-file cleanup at initial
launch and cold reopening (both revision 2). Navigation, background resume,
Back/root exit and connectivity transitions also pass before cold reopening.
`camera-summary.json` records these two stages.

Live-reload camera interaction still entered Quick Share; input/window state
artifacts identify its actual foreground ownership. That stage is not accepted.
The verified launcher was stopped gracefully, wrapper exit is 1, and the owned
emulator receipt records cleaned=true. Fresh XML and a focus check do not fully
resolve this input interaction issue. No guest deadline was reported in this
attempt; earlier measured wall/CPU failures remain open and retained.

Both Java hosts compile after the final phase/session diagnostic changes; the
retained log is `build/validation/camera-capture-diagnostics-20261011/android-java.log`.
The full regression run for this source is retained in the same directory.
Successful live-reload photo capture, complete camera visual acceptance,
physical camera/performance, stability and remaining release requirements are
still open. DevTools remains deferred for v0.0.1; the full goal is active.

The final full regression gate for the camera harness and diagnostic changes
completed with exitCode=0 in `build/validation/camera-capture-diagnostics-20261011`,
including 73 Rust tests. This does not make the incomplete live camera stage
pass or establish physical/minimum-version acceptance.


### Android camera capture across launch/cold/live reload (2026-10-11)

`build/android-validation/media-camera-capture-overlay-20261011` completed
with exit 0. Actual native Camera2 shutter/Done controls, fresh hierarchy and
current-window focus pass initial launch (revision 2), cold reopening (2) and
true live reload (3, without host relaunch). Each SDK result is JPEG 48x64,
with header read, release and after-release DENIED, and each private pending
capture file is deleted. Camera/SDK screenshots were reviewed; the hot camera
screen now visibly contains an unobstructed camera shutter. Navigation,
Back/root exit, background resume and network transitions also pass in this
run. Its `camera-summary.json` records scope and owned-emulator cleaned=true.

The wrong-screen interaction was the concurrent test's actual clipboard-write
preview, not a launcher menu. Cold/hot retained window blocks identify a visible
`ClipboardOverlay` owned by SystemUI with NOT_FOCUSABLE / NOT_TOUCH_MODAL flags;
the screenshot text exactly matches `PocketJS development 😀` from the fixture.
The harness waits for this overlay to disappear before camera controls. It
keeps the real clipboard and camera operations, natural overlay behavior,
fresh-hierarchy/focus checks and all original native deadlines. AOSP confirms
the named non-focusable clipboard window and its share/remote-copy controls:
https://android.googlesource.com/platform/frameworks/base/+/refs/heads/main/packages/SystemUI/src/com/android/systemui/clipboardoverlay/ClipboardOverlayWindow.java
https://developer.android.com/develop/ui/views/touch-and-input/copy-paste

The preceding activity-trace run separately failed in Resume revision=2:
50446 us wall / 4046 us thread CPU, total=50449 us, interrupted=false. Current
session status reporting detected that failure automatically and cleaned its
emulator. This remains a scheduling-delay inference and unresolved stability
evidence, independent of the corrected overlay interaction. Earlier failed
and partial runs stay retained.

Production source was unchanged in this step. The latest full regression
baseline remains `build/validation/camera-capture-diagnostics-20261011`
(exitCode=0, 73 Rust tests); the actual rebuilt APK/SDK flow above verifies the
new harness. Physical camera, URI-grant revocation inspection, minimum-version
runtime acceptance, deadline stability, combined live workers, physical
performance/isolation and final distribution remain open. DevTools stays
deferred for v0.0.1; the full goal is active.


### CPU diagnostic sampling excluded from guest execution budgets (2026-10-11)

The CPU diagnostic previously sampled the thread clock between the guest action
and pending jobs while the wall deadline was active. That system call could
consume the guest's 50 ms window. The shared core now samples CPU before the
window starts and, only on an expired turn, after the deadline is cleared.
Wall completion time is frozen before the ending sample. The mid-turn
actionCpuUs field is removed; totalCpuUs remains a diagnostic surrounding the
turn, not an enforcement clock. Wall limits, interrupts, job checks, failure
handling and the ABI are unchanged. Renderer priorities were not changed.

A meaningful regression injects 80 ms CPU-clock delays: clock calls must see no
active deadline, a healthy 50 ms turn succeeds, and an action sleeping past a
1 ms wall budget still fails with its diagnostic. The full gate at
`build/validation/cpu-clock-outside-budget-20261011` completed with exitCode=0
and 74 Rust tests, including prior action-error preservation checks.

`build/android-validation/media-camera-grants-outside-clock-20261011` passed
actual rebuilt development camera capture AND cancellation at initial launch
(revision 2), cold reopening (2) and true live reload (3). All six cases observe
the exact capture URI granted to Camera2 with read/write owned mode 0x3, global
0 and persistable/persisted 0; after SDK completion the permission report no
longer contains that unique filename and the private file directory is empty.
Capture stages also pass JPEG 48x64 header/read/release/after-release DENIED;
cancellation stages return CANCELLED. Fresh hierarchy, camera focus, clipboard
overlay waiting, navigation, Back/root exit and connectivity checks remain in
place. `camera-security-summary.json` records scope; emulator cleaned=true.
The authority is the development host's FileProvider; direct signed-host camera
permission acceptance and physical camera acceptance are not implied.

Earlier grant runs are retained with scope.json: the first rejected an empty
unsupported direct service dump; later valid activity-permission inspection
observed the Camera2 grant but stopped at ordinary frame/job deadlines. The
accepted query is `dumpsys activity -a permissions`, which produces a validated
report even when this capture's grant has disappeared. Other system grants
remain unrelated to the unique private capture grant.

The actual native package/isolation/mailbox attack suite at
`build/android-validation/cpu-clock-outside-budget-attacks-20261011` also
passed with the corrected core: all 26 package cases and both runtime attacks
passed, infinite-frame/heap guests stopped, retained healthy state survived and
failed effects were not delivered. Its owned emulator was cleaned.

Moving diagnostic work outside the window fixes a concrete measurement defect;
it does not prove that every earlier wall violation had that cause or establish
long-run/physical stability. Physical performance/isolation, minimum-version
runtime acceptance, combined live workers, direct signed camera validation and
final release/distribution still require evidence. DevTools remains deferred
for v0.0.1 and the full goal is active.


## Combined actual HTTP/camera SDK attempts (2026-10-11)

Added `tests/development-http-media-fixture.ts` and a mixed mode in the owned
Android HTTP runner. The fixture retains three actual HTTPS resources while
Camera2 holds the fourth slot, expects a capacity BUSY response, reads/releases
the JPEG, reuses its slot for HTTPS, and refills/reads/releases four HTTP
resources. The driver requires the exact mixed success receipt at initial,
cold reopen and live reload. It also detects mixed SDK failures while waiting
for native consent or camera controls. Camera and expected-capacity promises
are observed together; finally releases every tracked handle. This is a shared
resource occupancy/reuse test, not simultaneous HTTP-transfer/JPEG-decode or
multi-guest process-limit acceptance.

Both native attempts failed before mixed acceptance:
`build/android-validation/http-media-shared-sdk-20261011` stopped at frame
revision 2, with 55,722 us total elapsed, 527 us thread CPU and interrupted=false;
`build/android-validation/http-media-shared-sdk-20261011-repeat` stopped at
resume revision 2, with 63,904 us total elapsed, 2,970 us thread CPU and
interrupted=false. Both reached actual Camera2 controls/review and retained
transient capture-URI evidence. Neither proves completed JPEG delivery, mixed
quota/reuse, cold reopening or live reload. Native failure receipts and
`attempt-result.json` retain this distinction, and both owned-emulator cleanup
receipts confirm cleaned=true. Low CPU compared with elapsed time does not
identify the cause; normal guest deadline/lifecycle stability remains open
with the original 50 ms wall limit unchanged. Further repeat-only attempts
should give way to tracing the camera-return/frame/resume transition. Extra
DevTools work remains deferred for v0.0.1.
