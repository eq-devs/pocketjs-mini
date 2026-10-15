# v0.0.1 release audit

Audit date: 2026-10-15. This is a readiness checklist, not a completed release.
The user's release priority defers additional DevTools work. The full attached
technical plan remains the broader roadmap; this checklist does not remove its
requirements.

| Area | Current evidence | Remaining work |
| --- | --- | --- |
| Pinned shared engine and native hosts | Current full gate passes native core tests, iOS source compilation, service contracts and installed host export tests. Earlier mobile runs prove native pixels and input. | Execute final release packages on both platforms after final changes. |
| Deterministic input and lifecycle | Existing mobile capture runs include touch, hide/show and native service completion; fresh native replays match. | Physical touch-to-present measurements and complex gesture/cancellation acceptance. |
| TSX SDK, routing and frame timers | SDK tests and installed SDK bundle execution pass. Page-stack queries and subscriptions are bounded. A real two-page TSX demo passes navigation/state/background/cold-reset checks in both development hosts; Android system Back and root exit also pass. The signed TSX example also passes both installed hosts, with Android system Back/root exit. | Physical-device route/Back acceptance. |
| Essential native services | Signed hosts implement device info, storage, HTTP/resource responses, clipboard, location, network path status/events and media. Both platforms pass real media consent/denial/chooser cancellation and system image selection → JPEG → SDK resource read/release, including cold reopening. Android backend isolation/quota checks and iOS quotas/generation retirement pass. Production resource registries also pass process-cap stress with controlled producers on both platforms. Development hosts implement device info/storage, clipboard writes and native network snapshot/change events, with fresh subscriptions after hot reload. Both development hosts pass clipboard declaration denial, native deny/allow, exact SDK readback and persisted cold/hot reopening. Both development hosts pass real HTTPS SDK resource read/release and domain denial across initial, cold reopen and hot reload; Android also passes native controlled-transport HTTP/cancel tests. Android development location declaration/native denial passes SDK initial/cold/hot checks; approved fused-provider SDK coordinates also pass after a fresh request following native app/OS approval, including cold/hot reopening. Controlled wrapper approval/ownership/cancellation tests pass. iOS development location shares the bounded Core Location service and passes real SDK declaration/native consent denial and native app/system approval with actual Core Location coordinates across initial/cold/hot execution, plus controlled ownership/cancellation/activation checks. iOS development media now shares native picker/worker and HTTP resource accounting; controlled JPEG/resource/quota/retirement tests and real SDK declaration/native consent denial pass initial/cold/hot execution. Actual iOS development library selection also passes SDK JPEG header read/release, cold reopening and live reload in one UIKit test. Android development media shares the bounded native worker and HTTP resource registry; controlled ownership/cancellation checks, real SDK declaration/native consent denial, and actual system image selection with JPEG read/release pass across initial/cold/hot execution. | Physical camera acceptance, current-iOS mixed HTTP/media timing stability, iOS camera checks, wider location revocation/stress and extended development HTTP stress, remaining consent UI acceptance and Android first-request location timing/stability. Physical network transitions and iOS connectivity-change acceptance remain unverified. |
| Packages and isolation | Gate passes signature/metadata, store, permissions, isolated storage and retained-engine tests. A named 26-case native package matrix passes on Android and in a UIKit simulator app, including retained-state and storage checks. Signed heap-limit and infinite-loop guests are also stopped on both native platforms, with healthy retained state preserved and failed effects denied. Core tests cover interruption and retirement. | Wider malicious workload/service-flood acceptance and physical memory/isolation acceptance across concurrent guests. |
| Examples and performance | The 1,000-row list/form fixture and benchmark runners exist. | Establish physical cold-start, sustained scroll, frame-latency and memory evidence against the plan's suggested budgets. |
| CLI and distribution | Create/build/run, signed export and publish validation have automated coverage. The reference HTTPS downloader passes actual local TLS update/rollback, bounded streaming/cancellation and externally configured publisher trust replacement. Android native update discovery/staging is integrated optionally and passes controlled checks plus actual local HTTPS/native verifier/cache update/cold promotion/rollback with a temporary test CA. iOS native discovery/staging is now optionally integrated and passes native Foundation/UIKit controlled checks and actual UIKit HTTPS/native cache updates using a temporary test trust anchor. Installed UIKit TSX HTTPS staging, running counter retention, new cold screen and cold rollback pixels also pass. Android installed TSX staging, counter retention, cold update and rollback pixels pass traced and untraced emulator runs. | Sustained deadline/lifecycle stability, production endpoints and final clean-environment release workflow. |
| DevTools | Existing inspection, replay and root-highlight evidence is retained. | Further work deferred until after v0.0.1; not a release gate. |

## Minimum-version and device status (2026-10-14)

Actual Android API 23 emulator runs now cover development navigation, clipboard
consent/denial, real HTTPS resources, system library selection, camera capture/
cancellation and fused location across initial, cold and hot execution. Location
uses injected emulator coordinates; camera uses the emulator camera. These do
not prove physical sensor behavior or every API 23 dependency path. Android API
26 also passes installed signed TSX HTTPS update, cold promotion and rollback.
Evidence is retained under `build/android-validation/minimum-api23-*` and
`build/android-validation/minimum-api26-20261014`.

iOS 17.5 passes installed signed TSX HTTPS updates/rollback and the native
26-case package matrix plus two runtime isolation attacks. The same two suites now pass on an actual iOS 16.0 runtime with an owned
iPhone 14 Pro simulator. Each reports one passed XCTest and zero failures, and
both owned simulators were deleted. This covers these package/update paths; it
does not establish every native service on iOS 16. Evidence:
`build/ios-validation/installed-update-ios16-20261014` and
`build/ios-validation/package-matrix-ios16-20261014`.
The updated physical benchmark APK is prepared. The user has instructed us to
leave the Pixel untouched until they explicitly say it is free. No physical
benchmark acceptance is claimed.

## Executed checks

The latest full `tests/check.sh` run passed on documented Bun 1.3.11. Its log is
`build/validation/native-engine-regression-bun1311-20261015/full-check.log` (exit receipt:
`build/validation/native-engine-regression-bun1311-20261015/result.json`, exitCode=0).
The iOS export architecture fix also passed both actual native builds and
five focused export tests (155 assertions). The full run includes the 74-test Rust library
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


## Deadline scheduler tracing and fresh mixed receipts (2026-10-11)

Test-mode Android hosts now mark JNI frame/resume/hide calls with native trace
sections outside guest deadlines. The owned HTTP runner optionally records a
bounded 32-MiB Perfetto ring buffer, stops its uniquely named session, saves the
trace locally and cleans its files/emulator. No guest deadline, renderer
priority or production inspection feature was changed. Java service/host
compilation passes after the final marker changes.

`build/android-validation/http-media-scheduler-20261011` failed before app
launch because the initial trace config path was not accessible to Perfetto;
the owned emulator was cleaned. The corrected config-directory run at
`http-media-scheduler-20261011-config-path` passed initial actual mixed SDK
occupancy/BUSY/reuse/refill/read/release checks (HTTP 4,616 bytes, JPEG 48x64),
then failed at cold camera-return resume (56,963 us elapsed, 17,992 us thread
CPU). Its scheduler trace has CPU-2 data loss and cannot support precise timing
attribution. Its media-cold receipt matches the old back-home frame 660 and
counter one: it is explicitly excluded from cold acceptance.

The driver now requires a fresh test-only guest run marker for each mixed
media/quota proof. `http-media-scheduler-20261011-fresh-run` compiled that fixture,
then failed before initial camera acceptance: frame turn 516,944 us elapsed,
5,170 us thread CPU. Its 20,913,817-byte scheduler trace has no reported ftrace
loss/overrun or nonzero error statistics. SQL outputs retain scheduler coverage
and native section/state breakdowns. One JNI frame takes 623.866 ms, including
555.421 ms runnable, 57.321 ms blocked and 11.125 ms running. This establishes
scheduling delay in the native flow, but the section also includes work outside
the guest budget and does not alone identify the exact failing turn or cause.
Failure submarkers and process-name polling were added afterward for the next
capture; they have Java compilation evidence, not a new runtime trace yet.
Both traced app attempts confirm stopped tracing and owned-emulator cleanup.

Overall initial mixed-resource evidence is now positive once, while fresh cold
and live reload, sustained deadline stability, simultaneous HTTP/JPEG workers
and physical performance remain open. The existing 50 ms wall limit remains
unchanged. Extra DevTools work remains deferred for v0.0.1. Tracing follows the
[Perfetto detached ring-buffer configuration](https://perfetto.dev/docs/concepts/detached-mode).


## Android rendering thread scheduling and mixed SDK acceptance (2026-10-11)

The scheduler trace showed the native GL owner mostly at priority 120 (ordinary
application scheduling), while competing render threads received higher
priority. Both Android hosts now configure their GL owner using Android's
[THREAD_PRIORITY_DISPLAY](https://developer.android.com/reference/android/os/Process#THREAD_PRIORITY_DISPLAY)
on surface creation, with a SecurityException fallback to the existing
scheduler priority. No guest wall deadline, interrupt, resource quota or
service admission limit changed. Network/media worker factories are unchanged;
this does not assert that every scheduler sample for those workers is identical.

`build/android-validation/http-media-display-priority-20261011` passed the full
actual development HTTPS/Camera2 shared-resource fixture at initial revision 2,
cold revision 2 and true live revision 3. The three run markers are distinct;
exact mixed receipts verify three HTTP handles plus a camera reservation,
capacity BUSY rejection, JPEG header/read/release/DENIED-after-release, freed-slot
HTTPS replacement and four-handle refill/read/release. Actual temporary camera
files and transient URI grants are removed at each stage. Native navigation,
Back/root exit, retained/cold-reset state and network transitions also pass.
The stopped 33,527,806-byte trace reports no nonzero ftrace loss/overrun/error
statistics and no native failure markers. Both GL owners predominantly appear
at priority 116 (display nice -4), with transient startup samples at other
priorities. `mixed-sdk-summary.json` retains the acceptance scope and cleanup.

The untraced repeat at `http-media-display-priority-20261011-untraced` failed
while hiding the app for the initial camera: 59,737 us elapsed, 293 us thread
CPU, interrupted=false. The owned launcher was verified by its own session PID
and exact command/project before stopping it after the native failure; the
runner then cleaned its owned emulator. The optional signed navigation step
was not reached. This failure contradicts any sustained-stability or
all-cause-fix claim: display scheduling is verified, but timing robustness
remains open. Normal guest lifecycle scheduling remains the next investigation.

Hide/shutdown failures now write test status receipts instead of only logging,
and the development driver treats any native frame/boot/resume/hide/shutdown/
memory-warning error as terminal. Those final changes pass Java compilation
and whitespace validation; a fresh runtime check of hide error reporting is
still needed. Installed Android export/media closure tests pass 3 tests and
48 assertions. Direct signed-host scheduling acceptance, simultaneous live
HTTP/JPEG workers, process-wide real producer stress and physical performance
remain open. DevTools remains deferred for v0.0.1.


## Reference HTTPS distribution and publisher trust integration (2026-10-11)

Added `container/distribution.ts` with host-supplied HTTPS manifest/package URLs,
redirect rejection, a shared 30-second network deadline, optional cancellation,
64-KiB envelope/64-MiB package bounds and fixed 64-KiB accumulation slabs. The
slabs bound bookkeeping even with tiny stream chunks. At most two downloads
run across cache roots, with one per normalized root, including separate store
objects pointing to the same root. Roots are released on success or rejection.
No guest API chooses endpoints or publisher trust.

`PackageStore.stageNative` authenticates a private byte snapshot and validates
its embedded target/ABI/identity/build plan before any app selection mutation.
Existing reference store staging remains compatible with its opaque signed
fixtures. Publication uses the same extracted native payload admission helper,
so download and publish checks do not drift. This reuses existing plan validation
and adds no DevTools feature.

`tests/distribution.test.ts` uses an actual localhost TLS server and an ephemeral
certificate. Default system trust rejects that certificate; only the test
transport explicitly trusts its temporary CA. Certificates/private keys and
cache directories are removed afterward. Signed packages exceed one slab.
Valid updates retain the running snapshot and activate after cold reopening;
rollback also activates cold. Redirects, oversized headers/streamed envelopes,
ambiguous JSON, byte tampering, wrong requested version, signed embedded identity
or ABI mismatch and signed arbitrary payloads all preserve the selected state.
Two blocked downloads demonstrate process admission and same-root exclusion;
actual cancellation releases admission without changing selection.

A replacement publisher's package is rejected under the old pinned key. A
separately configured host store with the replacement key stages and cold-loads
the new package; rollback to the revoked old key fails without rewriting state.
This proves reference host-owned trust replacement, not an automatic signed key
transition protocol or native mobile rotation handoff.

Evidence: `build/validation/distribution-tls-20261011/check.log` reports 8 passing
tests/93 assertions; `admission-regression.log` reports 10 passing tests/78
assertions for package, installed exports and plan admission. `result.json`
records those scopes, and the TLS integration is included in `tests/check.sh`.
A cancellation-test race was corrected by observing promises before abort; the
final larger-package run passes. No full regression gate or new mobile runtime
acceptance is claimed this turn. Native iOS/Android download wiring, latest
version querying, production endpoints, signed transition/mobile trust handoff,
clean-environment release and physical acceptance remain open. Android lifecycle
stability remains unresolved; DevTools stays deferred for v0.0.1.


## Android native update discovery and staging (2026-10-11)

Added `host/android/PackageDownload.java` and an optional installed-host update
hook. Android exports accept `--distribution <HTTPS-latest-index-url>` and bundle
strict host-owned `distribution.json` configuration. The latest index has exactly
appId/version/manifestUrl/packageUrl; package and envelope URLs must remain on the
configured HTTPS origin, with no credentials/query/fragment or redirects. No
SDK/guest command configures URLs or publisher keys.

Native discovery/envelope/package reads share a 30-second call deadline, 64-KiB
JSON limits and a 64-MiB package limit. Two background workers and process-wide
root permits bound concurrency; the same normalized cache root cannot have two
operations. Owner-thread delivery validates the existing signed/native cache
contract and stages the package without replacing its running snapshot. Activity
destruction cancels transport and suppresses queued late delivery. Publisher trust
remains the separately bundled key; mobile rotation/handoff remains open.

`tests/NativePackageDownloadTest.java` passes on Android app_process using a
controlled OkHttp interceptor and actual native package signature/structure/cache
operations: download/cold promotion/rollback, tampering, wrong origin, redirects,
oversized index, root/process quota, owner retirement and permit recovery.
Evidence: `build/android-validation/package-download-controlled-20261011/native.log`
contains the required PACKAGE_DOWNLOAD verdict; result.json records controlled
scope. The same run passes the 26-case package matrix (1 admitted/25 rejected),
2 runtime attacks, retained healthy state and withheld failed effects. The owned
emulator cleanup receipt confirms cleaned=true. This is not actual Android TLS
transport or a rendered activity update across cold reopening.

Java source compilation and updated installed export tests pass (2 tests/56
assertions). The full tests/check.sh gate passes with 74 Rust library tests and
the reference TLS integration; retained log/result are in
`build/validation/android-distribution-20261011`. Earlier gate evidence remains
retained. Live Android HTTPS and installed-activity update/cold acceptance, iOS
native downloads, mobile publisher trust transition, clean-environment release,
physical acceptance and sustained Android lifecycle stability remain open.
Extra DevTools work remains deferred for v0.0.1.


## Actual Android native HTTPS package downloads (2026-10-11)

Added `tests/NativePackageDownloadTlsTest.java` and an owned loopback TLS runner.
The production downloader executes real OkHttp TLS requests on Android
app_process through a narrowly scoped reverse tunnel. Default system trust must
reject the ephemeral server certificate with an SSLHandshakeException. A
separate test client uses a memory trust store containing only the owned test
certificate, while retaining default hostname validation. Production certificate
trust is not changed and no certificate is installed on the emulator.

The actual native signature/structure/cache path downloads the signed update,
retains the existing version's authenticated snapshot, promotes version 2.0.0
after cache-owner reopening and cold start, then rolls back to version 1.0.0.
Further actual HTTPS requests verify that tampered bytes, a redirect, ambiguous
manifest JSON and an oversized chunked manifest preserve the selected state.
The server observes 11 real HTTPS requests. This strengthens the earlier
controlled-interceptor check; it does not establish rendered installed-activity
update/cold acceptance, production service integration or physical performance.

Evidence: `build/android-validation/package-download-actual-tls-20261011` contains
`native.log` with the required PACKAGE_DOWNLOAD_TLS verdict, actual server
request timestamps, native receipts and `tls-acceptance-summary.json`. The same
run passes the controlled downloader checks, 26-case package matrix, two runtime
attacks and retained healthy state. Server/private test key/reverse tunnel/native
temporary files and owned emulator are cleaned; the public certificate remains
only as an evidence artifact. Current scripts pass syntax/whitespace checks. No
production source changed or full regression gate rerun was needed this turn.

Remaining distribution gates are rendered Android activity/cold update behavior,
iOS native downloading, publisher trust transition/mobile cache handoff and a
real distribution endpoint/clean release workflow. Android lifecycle stability,
minimum-version and physical performance/isolation acceptance also remain open.
DevTools stays deferred for v0.0.1.

## iOS native distribution implementation and regression checks (2026-10-11)

Added optional host-owned update discovery/download to the installed iOS host
and `pjm export-ios --distribution <HTTPS-latest-index-url>`. The export writes
and bundles bounded host configuration separately from the pinned publisher key.
The native URLSession pipeline uses system HTTPS trust, denies redirects and
cross-origin manifest/payload URLs, and applies a shared monotonic 30-second
deadline, 64-KiB JSON and 64-MiB streamed payload limits. Downloads are limited to
two per process and one per cache directory inode. All cache admission stays on
the main owner and uses the existing signature/structure verifier; shutdown
cancels requests and rejects late delivery. Running guests retain their original
authenticated snapshot; updates are promoted only at cold start.

Native Foundation controlled-transport tests pass update/cold cache reopening,
rollback, signature tampering, changed origins, redirect status, duplicate JSON,
streamed byte limits, process/root quotas and cancellation recovery. Both mobile
export suites pass (4 tests, 97 assertions); iOS host source compilation passes.
The full regression suite passed with local networking enabled at
`build/validation/ios-distribution-20261011/check-network.log`. Its first sandboxed
run failed to bind the existing localhost HTTPS test server; that failed run is
retained separately. The component test uses controlled NSURLProtocol responses,
so it does not establish real iOS HTTPS transport or rendered app cold updates.

UIKit acceptance is tracked separately below. Actual iOS HTTPS acceptance,
rendered mobile update/cold behavior, publisher-key rotation handoff, production
endpoints, lifecycle stability and physical-device performance/isolation remain
open. Further DevTools work stays deferred for v0.0.1; the goal remains active.

## UIKit native controlled-download acceptance (2026-10-11)

The corrected test runs inside an actual UIKit simulator app and passes native
URLSession controlled downloads with the production signature verifier/cache:
update to 2.0.0 preserves the running 1.0.0 snapshot, a reopened cache promotes
2.0.0 cold, rollback restores 1.0.0, and invalid/tampered/cross-origin/redirect/
duplicate/oversized streamed responses preserve the selected state. Process and
same-root quotas, shutdown suppression and admission recovery also pass. The
same app passes the 26-case package matrix (one accepted, 25 rejected) and both
runtime attack cases with healthy retained state and no failed effects delivered.

Evidence: `build/ios-validation/package-download-controlled-20261011-return`,
including the XCTest attachment, passed summary and owned-simulator cleanup
receipt. Two earlier failed harness attempts are retained: the first blocked
main-queue delegates by waiting inside a main-queue block; the second reached the
download PASS result but trapped because the reusable C test entry lacked an
explicit return. The entry now runs from a run-loop timer and returns zero.
Every disposable simulator was deleted; the preexisting simulator was untouched.
A fresh native Foundation test also passed after these fixture repairs.

These responses come from a test-only NSURLProtocol, not an HTTPS server. Actual
iOS TLS/transport, rendered installed-controller cold updates, production
endpoints, mobile trust-key handoff and physical-device acceptance remain open.
Further DevTools work remains deferred for v0.0.1; the full goal stays active.

## Actual iOS native HTTPS package downloads (2026-10-11)

The production URLSession downloader now passes actual HTTPS discovery/download
inside a UIKit simulator app. Its ordinary system-trust client rejects the
self-signed temporary server certificate with NSURLError -1202. A test-only
subclass explicitly anchors that certificate, retains the SSL hostname policy,
and downloads a signed package accepted by the production verifier/store. The
running 1.0.0 snapshot stays intact; a reopened cache promotes 2.0.0 cold, and
rollback restores 1.0.0. Real TLS tampered bodies, redirects, duplicate manifest
keys and an oversized chunked manifest are rejected without changing selection.
A deliberately wrong SSL hostname policy also fails certificate evaluation.

Evidence: `build/ios-validation/package-download-actual-tls-20261011-eku`, including
the passed XCTest attachment/summary, native receipt, 11 observed HTTPS requests,
public test certificate, acceptance summary and owned-simulator cleanup receipt.
Only one request reached the normal latest index, confirming the redirect did
not follow and the rejected trust/hostname cases did not reach HTTP. The server
was stopped, host-only private key deleted, and disposable simulator removed.
Neither production trust nor the preexisting simulator trust store was changed.
The earlier failed test-certificate attempt is retained separately: system trust
correctly rejected it, but its explicit test anchor failed before HTTP. The
replacement fixture certificate includes explicit TLS server key usage and
extended usage; Apple certificate/hostname verification remains enabled.

The same run passes the 26-case signed package matrix and both runtime attacks.
The previous full regression gate remains passed; this turn changes test code,
not production downloading logic. iOS source/fixture compilation is rerun.
This proves native transport and cache behavior, not a rendered installed host
update/cold UI flow, a production endpoint or physical-device performance.
Rendered mobile update acceptance, native trust-key rotation handoff, final
release distribution, lifecycle stability and physical-device acceptance remain
open. DevTools stays deferred for v0.0.1; the full goal remains active.

## Rendered installed iOS HTTPS update and cold rollback (2026-10-11)

A real signed TSX fixture now passes the installed UIKit host's optional export
configuration → native HTTPS discovery/download → authenticated staging → cold
startup flow. The two independently compiled releases share the host-pinned
publisher key: 1.0.0 renders red and 2.0.0 green. While 2.0.0 is pending, 1.0.0
keeps rendering and a real tap increments its counter; Home/resume preserves
that counter. Process termination/relaunch selects 2.0.0, renders green pixels
and starts its fresh counter at zero. A test-only host rollback button calls the
existing store rollback API; the next process launch renders 1.0.0 red again.

The test compares native active-package metadata, newly written guest SDK
storage receipts, current/pending cache versions and screenshot pixel colors.
Screenshots were also visually inspected: staged 1.0.0 has Counter: 1, cold 2.0.0
has Counter: 0. Both saved package signatures were independently verified with
the retained public publisher key. Three launches each completed actual HTTPS
index, manifest and payload requests (nine requests total).

Evidence: `build/ios-validation/installed-update-20261011`, including passed
XCTest summary, screenshots and exact proof attachments, both signed releases,
public publisher/server keys, generated test host source, acceptance summary,
network trace and owned-simulator cleanup receipt. The temporary private TLS key
and exported project were removed, server stopped, test app uninstalled and
only the disposable simulator deleted. The preexisting simulator was untouched.

Transport uses a test-only TLS certificate trust subclass in the generated host;
SSL certificate/hostname evaluation and the production downloader/store remain
in use. The read-only observer and rollback control are test-only. This is a
local simulator acceptance run, not production endpoint or physical acceptance.
Android rendered update/cold acceptance, mobile publisher-key transition,
production distribution/clean release, lifecycle stability and physical-device
performance/isolation remain open. DevTools remains deferred for v0.0.1; the
full goal remains active.

## Rendered installed Android HTTPS update and rollback (2026-10-12)

Android now passes the installed Activity's optional export configuration → real
HTTPS discovery/download → authenticated staging → cold startup flow with two
signed TSX releases sharing a host-pinned publisher key. While 2.0.0 is pending,
1.0.0 continues rendering red and a real tap increments its counter. Home/resume
preserves that running counter. Force-stop/relaunch selects 2.0.0, renders green
pixels and resets the fresh guest counter. A test-only host control invokes the
existing cache rollback API; the next cold launch renders red 1.0.0 again.

Both traced and untraced runs pass all stages. Each compares native package
version, freshly written SDK storage, current/pending cache selection and
screenshot pixels (red 220/38/38, green 22/163/74). Each observes nine actual HTTPS
requests across three launches. Traced screenshots were also visually inspected.
The saved traced-run signatures were independently verified with the retained
public publisher key. Evidence: `build/android-validation/installed-update-20261012-trace` and `build/android-validation/installed-update-20261012-untraced`.
Both include XML receipts, screenshots, pixel checks, both signed releases,
public keys, generated test host source, acceptance and cleanup receipts.

The bounded 14.38-MB scheduling trace stopped cleanly and reported no error,
overrun or lost-event stats. It contains 1,233 JNI frame markers, mean 5.907 ms
and maximum 214.868 ms. These sections include native rendering/GPU work outside
the guest turn budget; their durations do not measure guest execution alone.
The trace passed rather than reproducing the earlier deadline failure, so it
cannot establish that failure's scheduling cause.

Earlier attempts remain retained: the first stopped at missing SDK build setup;
a later observer used an uncanonicalized private path and could not read cache
state; the canonical-path run failed the actual guest deadline (50-ms budget,
86.537-ms elapsed, 7.041-ms thread CPU). The successful runs do not erase that
failure or prove sustained deadline stability. No guest budget, interruption,
heap limit, worker quota or production scheduler policy was relaxed.

The test injects only an explicit temporary certificate client with ordinary
hostname verification into the generated export; the production updater,
verifier/cache and rendering code remain in use. The read-only observer and
rollback control are test-only. Each test app, reverse mapping, XML file,
server, TLS/APK private keys and owned read-only emulator were cleaned up.
This establishes simulator rendered update behavior, not production endpoint,
physical-device performance or general lifecycle/deadline stability. Native
publisher-key handoff, final release/distribution, minimum-version audit,
stability and physical performance/isolation remain open. DevTools remains
deferred for v0.0.1; the full goal stays active.

## v0.0.1 release metadata alignment (2026-10-12)

Added shared release metadata in `bin/release-version.ts` and `pjm --version`
(`pjm 0.0.1 (build 5)`). Generated UIKit hosts, installed Android exports and the
Android development host now advertise 0.0.1/build 5. Android build/code 5 is
higher than its earlier development code 4, preserving update installation
ordering. Generated SDK package metadata and the compiler's default version for
new apps also use 0.0.1. Explicit guest versions remain independent: exports of
the signed 1.0.0 fixture retain that signed version, and the real compiler build
check authenticates a new default app at 0.0.1. Host ABI remains 7.

The full regression suite passes with evidence at
`build/validation/release-metadata-20261012/check.log` and its exit receipt. It
includes version/upgrade metadata assertions on both generated exports, CLI
version output, SDK package version, real compiler/signed build/publication
checks and native/core/service regressions. The earlier focused sandbox run
could not write a generated transform cache in pinned upstream; the authorized
full run passes and leaves tracked upstream source unchanged.

Declared platform minimums are unchanged: iOS 16.0, development Android API 23,
and installed Android API 26. These declarations are not minimum-version runtime
acceptance. Final native release packages after all changes, dependency/API
minimum audits and execution, key handoff, production/clean distribution,
sustained deadline stability and physical performance/isolation remain open.
DevTools remains deferred for v0.0.1; the full goal stays active.

## Minimum OS availability audit (2026-10-12)

The iOS source gate now uses the declared iOS 16.0 deployment target and
rejects unguarded newer Objective-C APIs with compiler errors. Swift availability
checking and the native source gate pass; see
`build/validation/minimum-api-20261012/ios-availability.log`. This proves source
availability checking, not execution on iOS 16 or physical devices.

Added `tests/android-api-check.sh`, an offline host source/bytecode analysis
runner with an intentional API 28 negative control against minimum API 23.
The local lint installation reports no issues even for that control, so the
runner exits with failure and its output is not accepted as compatibility
proof. Earlier reports of no issues are retained as invalid audit attempts.
`android-api-jdk.log` and `result.json` record the unresolved analyzer validation.
The vendored Android location/media dependency manifests declare minimum API
levels no higher than 21; this alone does not prove their bytecode/runtime
compatibility. Android minimum-OS API analysis, dependency checks and baseline
execution remain open. DevTools remains deferred for v0.0.1.

## Android minimum API source fixes and validated analyzer (2026-10-12)

Resolved the previous invalid lint audit: the manual project descriptor must
list individual Java source files. The offline runner now supplies those files,
compiled classes, dependency classpaths and a temporary API cache. It verifies
its own configuration by rejecting an intentional API 28 ImageDecoder call
with `current min is 23`. No lint issue suppression is used.

The first valid run found API 24 `AtomicInteger.getAndUpdate` and two-argument
`Map.remove` calls in shared location code. Replaced them with a saturating
compare-and-set allocator and synchronized identity-checked removals. Request
codes still never wrap or reuse, and reentrant callback replacement remains
protected. Also replaced installed-host `ArrayList.removeIf` with backward
contact removal so all host sources pass the conservative API 23 source check;
the installed manifest still declares API 26.

The validated API runner, Android service source compilation, existing location
contract/mailbox/quota/cleanup tests and five focused SDK/export/input tests
pass. Existing mailbox tests cover replacement during delivery and reentrant
retirement. Evidence: `build/validation/minimum-api-enumerated-20261012`,
including `android-api-final.log` and `result.json`. One focused invocation
failed because the CLI inherited a PATH without Bun; the configured-PATH rerun
passes and both logs are retained. The earlier false-green analyzer attempts
remain retained and superseded by this validated run.

This establishes host source API availability, not a dependency bytecode audit
or execution at Android 23/26. Older runtime tests, deadline stability, mobile
key transition and physical acceptance remain open. DevTools stays deferred.

## Android native minimum API import gate (2026-10-12)

Added `bin/android-elf.ts` to inspect arm64 ELF dynamic imports against the
selected NDK's API 23 system-library stubs, including transitive platform
libraries and symbol versions. Missing required imports, unavailable platform
libraries, wrong architecture and an empty required-import parse fail the
check. The development builder and installed exporter execute it after linking
and before packaging. Optional weak imports are reported separately, not
accepted as proof of their fallback behavior.

`tests/android-native-api.ts` relinks both current JNI hosts and validates the
checker with an actual API 26 `ASharedMemory_create` library: rejected against
API 23, accepted against API 26. Both hosts pass: 149 required installed imports
and 154 development imports. Current optional weak imports are `getrandom`
and `gettid@LIBC`; older-runtime fallback behavior remains unverified.

The real `pjm export-android` command rebuilt the native core and completed
with the new gate. Its generated portable project built an unsigned APK, and
three focused export/launch regressions passed. Evidence:
`build/validation/android-native-api-20261012/result.json`,
`export-cli-target-adapter.log`, `apk-build.log`, `regressions.log` and
`controlled-rebuilt/result.json`. The environment has no actual rustup binary;
the first export attempt failed on the existing adapter's unsupported target
query. A temporary adapter subsequently verified the installed Android standard
library before returning that target and delegated cargo to the existing stable
toolchain adapter. No target installation or toolchain settings were changed.
Both attempts are retained. D8 emitted existing dependency debug-local
information diagnostics, but APK construction exited zero.

This proves native strong-import availability and packaging, not execution at
API 23/26, Java dependency runtime compatibility, publisher-key transition,
physical acceptance or sustained deadline stability. DevTools remains deferred.

## Android optional weak-import absence acceptance (2026-10-12)

Added a test-only ELF fixture that renames only the undefined weak imports
`getrandom` and `gettid` to absent names of the same byte length. A test JNI
probe observes null weak bindings, then invokes the existing native package
matrix in the same app_process. The normal production source and library
artifacts are unchanged by this fixture; the optional mode is enabled with
`PJM_TEST_MISSING_WEAK_IMPORTS=1` on the owned matrix runner.

The actual read-only emulator run passed all 26 package cases (one valid,
25 rejected), both infinite-loop/heap isolation attacks with the healthy guest
retained, controlled native location/clipboard/container checks, and controlled
cold-update/rollback/downloader rejection checks. It printed the required
`WEAK_IMPORTS missing-getrandom missing-gettid loader-passed` receipt before
running the matrix. Independent ELF inspection confirms the original optional
import names are absent and renamed bindings remain weak, while required
imports still pass the API 23 stub audit. Native error output is empty.

Evidence: `build/android-validation/weak-imports-20261012/native.log`,
`weak-missing.so`, `acceptance-summary.json`, `result.json` and
`owned-emulator.json`. The owned emulator and temporary device fixture were
cleaned up. The SDK server needed authorized local-socket access for this run;
no user emulator was reused or removed.

This establishes the tested absent-import loader/engine path on the emulator.
It does not emulate Android API 23/26, force an unavailable kernel entropy
syscall, prove every fallback branch or establish physical memory/performance
acceptance. Minimum-OS startup, dependency bytecode compatibility, deadline
stability and wider release work remain open. DevTools stays deferred.

## Guest-turn scheduling trace diagnostics (2026-10-12)

The attached plan describes excessive JS execution as a security limit; the
current implementation enforces 50 ms elapsed wall time for frame/lifecycle
turns. Earlier ordinary failures recorded much less thread CPU time than wall
time, but the previous JNI trace section also included rendering. No deadline
or interrupt policy was changed in this unit.

Added an opt-in `android-turn-trace` core feature. It emits native Android
trace sections for guest boot, each action/job turn and deadline failures.
Trace calls occur outside the active guest deadline. Default builds use no-op
hooks. The installed update UI runner enables the feature only with
`PJM_GUEST_TURN_TRACE=1` and `PJM_UPDATE_TRACE=1`, builds it in the separate
`core-ffi/target/android-turn-trace` directory and links Android's API 23 trace
library. Normal release archives are not replaced by the diagnostic build.

All 74 core tests pass, including wall-clock enforcement and the slow diagnostic
sampling regression. The actual installed TSX HTTPS update/counter retention,
Home/resume, cold promotion and rollback test passes with the feature. Perfetto
records 990 guest turns (mean 0.198 ms, maximum 15.712 ms), three boots (maximum
24.421 ms), and 982 JNI frames. The longest guest section contains 3.017 ms
running, 3.289 ms runnable waiting and 9.406 ms blocked. These sections exclude
the native GPU presentation scope, though trace boundaries themselves sit just
outside the exact enforced window. Trace error/overrun/lost-event checks report
no positive values, and native error output is empty.

Evidence: `build/android-validation/guest-turn-trace-20261012`, including the
7,130,454-byte stopped trace, `guest-sections.csv`, `guest-scheduling.csv`,
`trace-errors.csv`, build commands and `guest-turn-acceptance.json`. The owned
emulator, app, private test keys and HTTPS server were cleaned up. The test did
not reproduce an earlier deadline failure, so sustained stability remains open.
This diagnostic instrumentation adds no DevTools UI feature; further DevTools
work stays deferred for v0.0.1.

## Integrated default-build regression checkpoint (2026-10-12)

The complete `tests/check.sh` gate passes after the Android source API fixes,
native import gates, weak-import test fixture and opt-in guest-turn tracing.
It includes 74 core tests, optimized native/replay checks, iOS availability
source checks, compiler/watch/recovery integration, SDK, signed package/store
and generated installed-host export checks. The independent Android source
API 23 check also passes and rejects its deliberate API 28 control.
Evidence: `build/validation/integration-20261012/check.log`, `android-api.log`
and `result.json`. Authorized execution was needed for local HTTPS test sockets
and generated pinned-upstream compiler caches. No mobile UI acceptance scripts
or physical-device measurements are included in this full gate.

Corrected the generated installed Android guide, which still described software
BGRA uploads and incomplete native services. It now describes the GLES2 native
draw-list presenter and implemented bounded services, and distinguishes local
HTTPS emulator evidence from production endpoints, key transition, older OS
execution and physical acceptance. No new tests were added solely for this
text correction. Existing exported artifacts retain their prior generated
text; newly generated exports receive the corrected guide.

The current default 50 ms wall-clock execution policy remains unchanged.
Deadline stability, baseline OS/runtime dependency acceptance, physical
performance/isolation and broader release work remain open. DevTools stays
deferred for v0.0.1; the goal remains active.

## Bounded native publisher-key overlap (2026-10-12)

Native Android/iOS package stores now accept at most two distinct host-provided
32-byte publisher keys through an explicit constructor; their existing single-
key constructors retain the single-key policy. Inputs are copied. For overlap,
strictly parsed signed envelope bytes select one of those keys before the full
payload hash, metadata, target/ABI and native plan admission runs. The selector
is bounded to two signature checks and does not clone/hash a payload for every
candidate key. Downloaded metadata cannot supply or replace trusted keys.

Both native cache implementations pass old-key seed → two-key overlap → new-
key stage/cold promotion → overlap rollback → old-key removal. Removing the old
key rejects an old-key pending cold start, rollback and staging while preserving
selection bytes. The currently verified running snapshot is unchanged by
staging. Tests also cover caller mutation of the key inputs, duplicate/empty/
oversized/invalid key sets and a correctly signed envelope containing forbidden
trusted-key fields. Both keys are trusted during overlap; removal is the
revocation step. No signed-envelope format or host ABI was changed.

Android app_process execution passes the complete 26-case package matrix and
two retained isolation attacks, controlled location/clipboard/container and
native downloader checks; evidence:
`build/android-validation/key-transition-20261012-fixed`. The owned read-only
emulator was cleaned up and native error output is empty. iOS uses an actual
Foundation/native verifier/cache harness on macOS, not a rendered mobile host;
`ios-native-fixed.log` records its transition receipt. iOS controlled downloader
regressions, 17 verifier interoperability/rejection cases, four export regressions,
iOS source availability, Android Java types and the validated source API gate
pass. The new Foundation transition regression is part of `tests/check.sh`.
Overall unit evidence: `build/validation/key-transition-20261012/result.json`.

The initial iOS fixture used a data allocation method on the wrong class;
corrected to NSMutableData and reran. The first Android attempt exposed a test
runner regression: macOS Bash nounset rejects an empty array expansion in the
normal mode. Source arrays now include mandatory entries and append optional
weak-import fixtures. The rerun passes; failed attempts remain retained and
the first owned emulator was also cleaned up.

Export CLI and installed entry-point provisioning still use one key. Wiring the
explicit host keyring through those paths and exercising rendered HTTPS key
handoff remain open; this unit does not claim end-to-end mobile key transition.
Deadline stability, minimum-OS and physical acceptance remain open. DevTools
stays deferred for v0.0.1; the full goal remains active.


## Installed publisher-key provisioning (2026-10-12)

Both export commands now accept `--previous-public-key <raw-key-file>` with the
primary `--public-key`. The primary key still authenticates the bundled release
before export. The optional previous key must be a distinct regular, non-symlink
file containing exactly 32 bytes, validated before output creation and before
native CLI build work. iOS project resources and Android APK assets include the
previous public key only when explicitly supplied. Installed startup passes this
host-owned bounded trust set into the native package store. Invalid optional
assets fail startup; downloaded metadata cannot add keys.

The operator ships a host upgrade with new plus previous keys before serving
new-key packages. Both keys are trusted during overlap, including rollback.
After a new-key active package is selected, a subsequent host export can omit
the previous key to revoke it. Old-key cache selections then fail closed; there
is no automatic selection reset. Publisher keys are separate from Android APK
and iOS application signing keys. README, CLI usage and the generated Android
export guide describe this sequence.

Four export regression cases pass with 131 assertions, covering new-key bundle
and previous-key assets, unchanged default single-key exports, malformed and
duplicate keys, symlink refusal and preserved output on failure. iOS availability,
Android Java compilation and the source API gate with API 28 negative control
also pass. `tests/package-key-provisioning-build.ts` builds the actual portable
Android APK and arm64 iOS simulator app and checks exact key bytes in their
finished resources. Both builds pass. The first generic iOS build attempted
x86_64 against an arm64 engine; the corrected harness specifies its engine
architecture and retains the failed attempt.

Evidence is in `build/validation/key-provisioning-20261012`: focused test/source
logs, `android-build/result.json`, and `ios-build-arm64/result.json`. These prove
export packaging and source integration, not rendered startup or HTTPS key
handoff across a host upgrade. Rendered handoff/revocation, production endpoints,
deadline stability, minimum-OS execution and physical performance/isolation
acceptance remain open. Additional DevTools stays deferred for v0.0.1; the full
goal remains active.

The complete `tests/check.sh` regression run also exits 0 after this integration,
including native publisher-key transition checks. See `full-check.log` and
`result.json` in the same evidence folder. Finished exported-resource builds
remain distinct from runtime host-upgrade acceptance.


## Rendered Android publisher-key host handoff (2026-10-12)

`PJM_UPDATE_KEY_TRANSITION=1` now exercises the installed Android UI acceptance
with two independently generated publisher pairs. The real TSX red v1 package
is signed only by A, green v2 only by B. Three host APK builds share one temporary
APK signer and package identity: initial A-only host, upgrade with B plus previous
A, and final B-only host. The upgrade uses install-replace without clearing app
data. Publisher and APK/TLS private keys stay in temporary storage and are removed.

The A-only baseline renders v1. The overlap host bundles B-signed v2 but opens
the retained A-signed cache; actual local HTTPS stages B-signed v2. It preserves
the old screen/counter through staging and background/resume, promotes green v2
on cold start, and rolls back to red v1 while A is still trusted. After selecting
v2 again, the B-only host upgrade preserves the cache and renders green v2.
Old-key rollback is rejected with an exact native state-byte comparison, and an
actual HTTPS download of A-signed v1 is rejected for publisher signature. The
next cold start still renders green v2 with no old-key pending selection.

The test-only rollback observer now reads the same bounded host asset keyring
rather than reconstructing a single-key store, and reports rejected rollback
without crashing the guest. It also clears its proof when the production host
has failed, preventing stale storage values from looking like a live screen.
No production deadline or trust mechanism was loosened, and no DevTools feature
was added. Standard update mode keeps a single publisher by default.

Both the traced run and an untraced repeat exit 0, each with six actual HTTPS
payload transfers, independently verified public signatures, rendered pixel
checks, empty native error output and an owned-emulator cleanup receipt.
Evidence: `build/android-validation/key-handoff-20261012-traced` and
`build/android-validation/key-handoff-20261012-untraced`.

The first untraced attempt remains in `key-handoff-20261012`. Its background/
resume guest frame failed at 53.623 ms elapsed with 9.474 ms thread CPU, so this
unit does not close sustained deadline stability. The passing 14,729,244-byte
trace did not reproduce that failure: 1,577 guest turns average 0.338 ms, maximum
27.645 ms; its slowest turn contains 2.082 ms running, 0.899 ms runnable and
24.663 ms uninterruptible blocked time. No positive trace loss/error/overrun
counters were found. Broader JNI draw frames include GPU/presentation work
outside the guest budget. Trace timing does not establish the cause of the
separate failed attempt.

Android rendered publisher-key handoff/revocation is covered. iOS rendered key
handoff, production endpoint/clean-release acceptance, sustained deadlines,
minimum-OS execution and physical performance/isolation remain open. Additional
DevTools stays deferred for v0.0.1; the full goal remains active.


## Rendered iOS key handoff and explicit host trust record (2026-10-14)

The installed iOS acceptance flow now builds and explicitly installs three hosts
with one app identity: A-only baseline, B-primary/A-previous overlap with a
B-signed bundled release, and B-only revocation. Each finished and installed host
is checked for the expected key resources before XCTest runs. A random marker
in private app data survives both upgrades, even when the simulator relocates
the data directory. Real TSX red/green pixels, storage counter retention through
staging and background/resume, cold promotion and old-key rollback are checked.

This flow exposed a real startup-policy weakness: the simulator retained
publisher.previous.key when installing a host whose finished bundle omitted it.
Explicit simctl installation reproduced the leftover file. File presence alone
therefore cannot represent revocation. Both export writers now always produce
publisher.trust, exactly two bytes: format 1 and key count 1 or 2. Installed
startup follows that host-owned record. Count 1 ignores a stale previous-key file;
count 2 requires a distinct valid previous key. Invalid/unreadable/oversized
records fail closed. Absence selects primary-only trust for legacy packaging,
never automatic overlap. No package response supplies the record or keys, and
no package-envelope or FFI ABI format changed. The Android test observer now
uses the production host's bounded trust-selection method.

The final iOS run passes all three UI phases. Its installed B-only host still
contains the stale old-key file, but explicitly disables it. Actual old-key HTTPS
staging and old-key rollback reject without changing native cache-state bytes;
new-key green pixels remain visible through another cold start. Six real local
HTTPS payload transfers are recorded. Distinct public signatures and cross-key
rejection are independently checked, and the owned simulator is deleted without
touching preexisting devices. Evidence:
`build/ios-validation/key-handoff-20261014-trust-record`, including each phase's
installed-trust.json, XCTest summary/attachments/state and the top-level
signature-and-cleanup-verification.json. The explicit installed-file receipt
records previousKeyFilePresent=true and previousKeyEnabled=false after revocation.

Android's complete rendered handoff/revocation is rerun with the new production
trust record and also exits 0: six HTTPS payload transfers, retained counter,
cold promotion/rollback and rejection after revocation. Its owned read-only
emulator is cleaned up. Evidence:
`build/android-validation/key-handoff-20261014-trust-record`. Export regressions
pass four cases/135 assertions and both native source type gates pass; logs are
in `build/validation/key-trust-record-20261014`.

Earlier attempts remain retained: the missing temporary compiler adapter stopped
before simulator creation (`key-handoff-20261014`); an overly strict data-directory
identity assertion stopped after successful baseline/overlap UI (`...-tools`);
the subsequent rendered revocation failed while an old key resource remained
(`...-marker`); explicit installation then independently reproduced the stale
resource before launching the revocation UI (`...-explicit-install`). The final
fix changes production trust selection, rather than deleting files or clearing
the app cache to force a passing test. System production TLS trust is unchanged;
only temporary test exports trust the local test certificate.

Both mobile rendered publisher-key handoff gates are covered. Sustained guest
wall-deadline stability, production endpoint/clean release validation, minimum-OS
execution, and physical camera/performance/isolation acceptance remain open.
Additional DevTools stays deferred for v0.0.1; the full goal remains active.

The complete regression suite exits 0 after this fix, including 74 Rust core
checks and the native publisher-key transition regression. The validated Android
API 23 source gate also exits 0 with its API 28 negative control rejected.
`build/validation/key-trust-record-20261014/result.json` links the full results.
These checks do not close older-device execution or physical performance gates.


## Exact guest deadline trace and lifecycle comparison (2026-10-14)

The Android installed update harness accepts bounded
PJM_UPDATE_LIFECYCLE_CYCLES=1..50 (default 1). It performs fresh Home/resume/UI
proofs with the same running guest/counter before the existing HTTPS cold update
and rollback checks, recording each completed cycle. Scheduler tracing now also
requests sched_blocked_reason. The owned emulator wrapper optionally accepts
PJM_PACKAGE_EMULATOR_MEMORY_MB=2048..8192, passing a temporary -memory override
without editing saved AVD settings. It records actual boot memory and attempts
optional CPU/memory pressure reads. No production budget, interrupt or failure
handling was changed; these are acceptance diagnostics, not new DevTools UI.

A 20-cycle attempt on the configured 2-GiB profile reproduced the ordinary-frame
deadline failure before the first resume cycle. Native diagnostics report a
50-ms budget, action 87 us, total 96,091 us and thread CPU 4,689 us. The exact
trace failure marker identifies guest slice 19 (96.097 ms): 5.012 ms on CPU and
91.085 ms runnable, with no blocked interval. Raw scheduler intervals show the
GL thread at intended Linux display priority 116. Other Android tasks ran in
that gap, including memory reclaim and system graphics. This establishes a
scheduling gap in this failure; it does not prove memory pressure is its sole
cause, nor that a JS optimization would fix it. The trace was stopped and the
owned emulator cleaned. Evidence: build/android-validation/lifecycle-deadline-20261014.

The controlled comparison changes only the owned emulator's memory profile to
4 GiB. Actual boot MemTotal is 4,062,880 KiB. It passes all 20 Home/resume cycles
with counter retention, followed by real HTTPS cold update/rollback and pixel
checks. There are 2,509 guest turns, mean 0.296 ms and maximum 21.760 ms, no guest
failure marker and empty native error output. The 21,451,664-byte trace is
stopped, the temporary app/server/keys are removed, and the emulator cleaned.
Evidence: build/android-validation/lifecycle-deadline-20261014-4gb.

Both traces report informational interned-data tokenizer counters (124,870 and
273,574). These are retained with severity info, not hidden or called a clean
symbol trace. No positive lost-event/overrun counters were found. Scheduler
intervals used above are directly retained; blocked-function symbol analysis
remains limited. Android denies shell reads of /proc/pressure, so pressure
metrics are explicitly unavailable. Broader JNI/presentation sections are
outside the guest-turn budget and do not establish JS execution time.

This is diagnostic progress, not closure of deadline stability: the default
profile still has a real failure, and the 4-GiB pass does not establish behavior
under load or physical-device acceptance. The guard remains unchanged. The
original proposal is also no longer present at its supplied Desktop path;
requested its current path while continuing from the recorded plan. Final
requirement-by-requirement audit still needs the original. Additional DevTools
stays deferred for v0.0.1; the full goal remains active.


## Actual Android minimum-OS execution (2026-10-14)

Installed the official Google APIs ARM64 system images for API 26 and API 23.
The preexisting API 24/25/34 SDK image directories were empty placeholders,
not usable runtimes. No saved user AVD was modified. The new manual acceptance
runner tests/minimum-os-owned-android.ts creates a uniquely named temporary AVD
with isolated ANDROID_USER_HOME and ANDROID_AVD_HOME, boots read-only with 4 GiB,
checks the actual API/ABI/fingerprint, executes the appropriate existing flow,
then shuts down the emulator and removes its AVD/home. Image installation is
an explicit prerequisite, never a silently skipped test.

The API 26 installed-host run passes on actual Android 8.0.0 ARM64
(fingerprint google/sdk_gphone_arm64/generic_arm64:8.0.0/OSR1.180418.028.A3/10734686).
It renders real signed TSX, stages three real local HTTPS payload transfers,
retains the old screen/counter through update and Home/resume, promotes green
v2 on cold start and rolls back to red v1. Public package signatures were
independently verified. Native error output contains buffer headers only.
Evidence: build/android-validation/minimum-api26-20261014, including actual
runtime.json, UI/pixel receipts, and signature-and-cleanup-verification.json.
The generated Android export guide now identifies this tested runtime scope.

The API 23 development-host run passes on actual Android 6.0 ARM64
(fingerprint Android/sdk_google_phone_arm64/generic_arm64:6.0/MASTER/8690019).
The real create/run/compiler/native host workflow executes TSX button routing,
query/counter retention, Home/resume, Android system Back, root exit and cold
reset. Evidence: build/android-validation/minimum-api23-20261014, including
runtime.json, result.json, screenshots/trees and minimum-os-result.json. This
run did not enable the optional service test modes, so it does not establish
API 23 HTTP/media/location/clipboard/network service coverage.

Both runs exit 0 and their owned-emulator receipts confirm cleanup and removed
temporary AVDs. The user's saved Pixel_2 remains the only persistent AVD.
Overall evidence: build/android-validation/minimum-os-20261014/result.json.
The Java API detector's installed class signature is also retained there: its
source/resource scanning interfaces do not establish a complete dependency
bytecode audit. Runtime coverage is limited to the flows actually exercised.

This strengthens the previous source/import-only evidence at both declared
Android minima; it does not claim all service paths, all devices/OS versions,
or physical performance. iOS 16 execution, broader dependency/service coverage,
production endpoint/clean release acceptance, deadline stability and physical
camera/performance/isolation remain open. The missing original proposal's
current path is still requested for final requirement-by-requirement audit.
Additional DevTools stays deferred for v0.0.1; the full goal remains active.


## API 23 native network and clipboard lifecycle acceptance (2026-10-14)

Extended the isolated minimum-OS runner with optional
PJM_MINIMUM_CLIPBOARD_MATRIX=1 for API 23. It runs the existing development-host
acceptance fixture in undeclared, deny and allow modes on one fresh temporary
AVD, clearing only dev.pjm.android between modes. Per-case environment overrides
keep evidence separate; the existing API 26 installed-host path is unchanged.
No production host or guest policy was changed, and no DevTools feature was added.

The first API 23 allow-mode run passes native consent and exact Unicode
clipboard text readback, writes, rejected malformed clipboard/network requests,
network transitions, retained navigation, Home/resume, cold reopen and live
reload. Its network proof changes cellular/events 0 → none/events 1 →
cellular/events 2, retains state across Home/resume, then starts fresh at events
0 after cold reopen and live reload. Evidence:
build/android-validation/minimum-api23-network-clipboard-20261014.

The full three-case run also exits 0 on actual Android 6.0/API 23 ARM64.
Undeclared and explicitly denied clipboard reads remain DENIED across initial,
cold and hot execution. Allowed reads return the exact fixture text after native
consent and remain SUCCESS across cold/hot reopening. Consent XML is present
only for declared deny/allow cases. Each mode independently passes native
clipboard writes and malformed-argument PROTOCOL rejection, actual
connected/offline/restored SDK network events, fresh cold/hot subscriptions,
button navigation, retained query/counter, Home/resume, system Back and root
exit. The legacy API 23 connectivity receiver path is therefore exercised on
its real OS branch, rather than only mocked or compiled.

Saved clipboard and network snapshots were independently decoded and checked
against all three result receipts; event counts increase during transitions
and reset to zero for the new cold/hot subscription. The owned-emulator receipt
confirms shutdown and removal of its temporary AVD/home; only the user's
preexisting Pixel_2 AVD remains. Evidence:
build/android-validation/minimum-api23-clipboard-matrix-20261014, including
acceptance-summary.json and each mode's UI/SDK snapshots and result.json.
The runner's updated source also passes Bun bundling and whitespace checks.

These are targeted API 23 development-service results on a temporary 4-GiB
emulator profile. They do not close all dependency code paths, installed-host
service parity, HTTP/media/location minimum-OS execution, iOS 16 execution,
production endpoint/clean release validation, the known default-profile wall-
deadline failure, or physical camera/performance/isolation acceptance. The
original proposal's supplied path remains missing and its current path is
still requested for final audit. Additional DevTools stays deferred for
v0.0.1; the full goal remains active.


## API 23 live HTTP and system image/JPEG resource execution (2026-10-14)

The minimum-OS runner now exercises existing HTTP and media fixture modes on
actual Android 6.0/API 23. The HTTP run passes with the production client and
unchanged system TLS trust, fetching https://example.com/ through the real SDK.
Initial, cold and live-reload generations each read all 577 bytes in bounded
resource chunks and verify the Example Domain body; undeclared-domain requests
and reads after release return DENIED. Navigation, native network changes and
lifecycle checks also pass. Independently decoded SDK snapshots show revisions
2/2/3 across these phases. Evidence:
build/android-validation/minimum-api23-http-20261014/acceptance-summary.json.

To exercise the real image picker on API 23, the separate owned-image helper
now supports pre-29 Android through an owned completed DownloadManager row and
file. Its modern MediaStore branch remains in place. The fixture app alone
requests its needed pre-29 storage grants; host permissions and production
selection are unchanged. Asset/provider reads are now explicitly capped at
64 KiB instead of using readAllBytes, which is unsuitable for older runtimes.
Legacy cleanup validates the owned path, removes its download/file and clears
its receipt. The minimum-OS runner provisions this helper only for library mode
and still shuts down/removes its emulator even if fixture cleanup fails.

The successful API 23 run uses the real DocumentsUI picker in initial, cold and
live-reload generations. Each selects the uniquely named owned 64x32 PNG and
runs the production image worker/resource registry. The guest validates JPEG
metadata and SOI header, then releases the handle and receives DENIED on a
later read. The saved picker XML, SDK results and fixture-ready/cleaned receipts
were independently checked. Evidence:
build/android-validation/minimum-api23-media-library-20261014-visible,
including acceptance-summary.json. This does not claim full decoded-pixel
comparison or physical camera execution.

The first two media setup attempts remain retained: the API 23 completed-download
provider required normal INTERNET permission even for registration of a local
file, then rejected hidden-notification visibility without privileged access.
The test app now declares its normal permission and registers a visible completed
download. Both failures occurred in fixture setup before running the host, and
their owned file/emulator cleanup receipts are preserved under the base and
-provider attempt directories. No host policy or permissions were loosened.

The updated helper also passes modern MediaStore provisioning, exact byte
readback and deletion on the owned API 37 emulator. This narrowly scoped
regression uses PJM_MEDIA_FIXTURE_ONLY=1 and explicitly does not claim another
system-picker acceptance run. Fixture cleanup errors now fail that runner after
emulator shutdown, instead of merely being logged and swallowed. Evidence:
build/android-validation/media-provider-regression-20261014. Updated TypeScript
runners bundle successfully; no production engine code changed in this unit.

All successful owned emulators and temporary AVD/provider apps/files are cleaned
up; the preexisting Pixel_2 AVD is preserved. API 23 HTTP and library/JPEG paths
are now covered at their declared OS minimum. Minimum-OS location/camera and
other service variants, installed service parity, iOS 16 execution, full pixel
and physical performance/isolation checks, production endpoint/clean release
acceptance and the known default-profile wall-deadline failure remain open.
The original proposal's new path is still requested for final audit. Additional
DevTools remains deferred for v0.0.1; the full goal stays active.


## API 23 location consent, provider and lifecycle execution (2026-10-14)

Added optional PJM_MINIMUM_LOCATION_MATRIX=1 to the isolated minimum-OS runner.
It tests undeclared, deny and allow cases on one fresh API 23 ARM64 emulator,
clearing only the test app between cases. Clipboard and location matrices are
mutually exclusive. Location is enabled only on the owned emulator, and a
bounded test feeder supplies the existing fixed coordinates to its emulator GPS
once per second. The feeder is stopped before emulator teardown. No production
permission, provider or timing policy changed.

The UI test driver now recognizes Android 6's permission_allow_button as well
as the existing modern permission_allow_foreground_only_button, preserving
modern precision selection when present. This changes test compatibility with
the real system dialog; it does not skip native or OS approval.

All cases pass on actual Android 6.0/API 23. Undeclared and explicitly denied
location requests remain DENIED across initial execution, cold reopening and
live reload. The allow case captures both native app-consent and legacy OS
permission dialogs, then obtains latitude 43.238949 and longitude 76.889709
through the production Google FusedLocation provider in all three generations.
Decoded SDK snapshots independently confirm coordinates within 0.0001 degree,
new revisions after reload and expected denial results. First-permission timeout
is false in every case. Navigation, network transitions, malformed network/
clipboard requests and lifecycle checks in the shared fixture also pass.

The synthetic GPS feed is already active during the earlier negative cases;
fresh cached positions are allowed by the request's maximumAgeMs contract.
These results do not measure a cold GPS first fix or physical positioning
accuracy, and do not close the previously observed wider first-request timing
risk on other profiles. Source/runtime guards and service quotas remain intact.

Evidence: build/android-validation/minimum-api23-location-20261014, including
runtime.json, each mode's consent/OS-dialog and SDK snapshots, result.json,
minimum-os-result.json and independently checked acceptance-summary.json. The
owned emulator and temporary AVD are removed; the user's saved Pixel_2 remains
unchanged. Both updated TypeScript runners pass Bun bundling and whitespace
checks. No new DevTools feature was introduced.

API 23 development location declaration/consent/provider paths now have runtime
evidence alongside navigation, clipboard/network, HTTP and library/JPEG checks.
Camera and wider cancellation/revocation/service stress, installed service
parity, iOS 16 execution, physical performance/isolation, production endpoint/
clean release acceptance and the known default-profile deadline failure remain
open. The original proposal's supplied path remains missing; its current path
is still requested for final audit. DevTools stays deferred for v0.0.1, and the
full goal remains active.


## API 23 media denials, cancellation and emulated capture (2026-10-14)

The isolated minimum-OS runner accepts a bounded PJM_MINIMUM_MEDIA_CASES list
of undeclared, deny, cancel, camera-cancel and camera, with no duplicates and
at most five cases. It clears only the owned test app between cases. Permission
matrices remain mutually exclusive; the existing API 26 installed-host flow
is unchanged. No production media or permission behavior was modified.

On actual Android 6.0/API 23, undeclared and explicitly denied media requests
remain DENIED through initial, cold and hot generations. Real system-picker
cancellation remains CANCELLED through all three. These completed cases are
independently verified under
build/android-validation/minimum-api23-media-consent-20261014; that whole attempt
failed later in its original camera driver, so it is not labeled an all-cases
passing run. verified-completed-cases.json identifies only the proven cases.

The older image uses com.android.camera, while the existing driver recognized
only com.android.camera2. It also uses btn_done for photo review, and its toolbox
ls does not support -A. The test now supports the two observed system camera
packages and their review controls; it uses raw ls -a output and excludes only
. and .., preserving detection of every other private capture file. Camera
focus, intended grant recipient and transient read/write mode checks remain.
The modern camera2/control names remain supported. Updated scripts bundle
successfully and whitespace checks pass.

Camera cancellation passes across initial/cold/hot generations in
build/android-validation/minimum-api23-camera-20261014-ls/camera-cancel.
Each captures one pending private JPEG, verifies sourcePkg=dev.pjm.android and
targetPkg=com.android.camera with transient mode 0x3 and no persistent grants,
then verifies CANCELLED, zero private capture files and removed URI grants.
That containing attempt later failed on unsupported photo-review controls;
its successful cancellation case is retained independently.

With the observed legacy btn_done selector, a fresh photo-capture run exits 0:
actual emulated camera shutter/review, native 64x48 JPEG normalization, SDK JPEG
header/resource checks, release followed by DENIED read, private-file deletion
and URI-grant revocation all pass on initial, cold and hot generations. The
AVD records hw.camera.back=emulated and no front camera; this used no physical
camera sensor. Evidence:
build/android-validation/minimum-api23-camera-20261014-review, including the
aggregate acceptance-summary.json with explicit per-case evidence paths and
independently decoded results. All owned emulators and temporary AVDs from
successful and failed attempts are cleaned up; the saved Pixel_2 remains.

Earlier camera-driver failures remain preserved: the base media run did not
recognize the legacy camera package; the next camera attempt hit unsupported
ls -A; the following run reached review but did not recognize btn_done. During
that review diagnosis, an overlapping UiAutomator dump caused an accessibility
helper conflict. Its logs and attempted owned-camera cancellation are recorded;
that attempt remains failed and is not treated as a spontaneous production
focus-loss failure. The final fresh capture run used no overlapping automation.

API 23 development media now has evidence for declaration/native denial, picker
and camera cancellation, image-library selection and emulated capture with
resource/URI cleanup. These independent case results do not establish physical
camera quality, full decoded-pixel equivalence, every cancellation race, or all
installed-host service paths. iOS 16 execution, sustained default-profile
deadlines, wider concurrency/isolation, production endpoint/clean release and
physical performance acceptance remain open. The original proposal's supplied
path is still missing and its current path requested for final audit. Additional
DevTools stays deferred for v0.0.1; the full goal remains active.


## Older iOS execution and reviewable physical benchmark (2026-10-14)

The available runtimes are iOS 17.5, 18.5 and 26.4. The owned UIKit runner now
accepts an explicit validated iPhone device-type override, so an older runtime
uses a compatible device instead of the default iPhone 17 Pro. The actual signed
TSX local HTTPS staging/counter retention/cold promotion/rollback flow passes on
an owned iOS 17.5 iPhone 15 Pro simulator, with three payload downloads and zero
XCTest failures. Evidence: build/ios-validation/installed-update-ios17-20261014.
The simulator is deleted; preexisting devices remain unchanged.

The native package matrix also passes there after fixing its test export:
the old exact resource-list assertion predated publisher.trust, and the new
PackageKeyTransition.h fixture dependency had not been copied. It now selects
the installed resource phase, checks required package/trust entries, preserves
its existing resources and appends its test case asset. The header is copied.
The failed pre-compilation attempt remains retained, with owned-device cleanup.
The rerun passes 26 native cases (one accept, 25 reject), two live isolation
attacks, native cache/key-transition fixtures and controlled downloader checks.
C assertions remain enabled in the Release test app. Evidence:
build/ios-validation/package-matrix-ios17-20261014-resources.

The iOS 16.4 download request is unavailable in Apple's current catalog, but an
exact iOS 16.0 request does start an official 6.28-GB Universal Simulator download.
That active download is distinct from successful import/boot/execution; none of
those iOS 16 acceptance claims is made yet. Availability/download evidence is
under build/validation/ios-minimum-availability-20261014.

A physical Pixel 8 Pro (API 36) is connected. Read-only model/display queries
were used to prepare the existing 1000-row list/form benchmark. No phone app was
installed or launched and no phone screen was captured. A fresh native bridge
and a 3x raster, 390x844 logical benchmark were exported, APK-built, temporarily
signed, verified and checked for 16-KiB alignment; temporary private signing
keys were removed and the publisher private key never saved. Review artifact:
build/validation/physical-benchmark-preparation-20261014/Benchmark-review.apk,
with its SHA-256 and scope in preparation.json. The initial 1x build is retained.
The physical-target decision is requested from the user because the connected
phone may be in personal use; actual installation/input/capture waits for that
answer. This is not a physical performance result.

Before measurement, corrected misleading timing labels: Android's existing
FrameMeasurements uses System.nanoTime around render/submission, not thread CPU.
It now reports host_submission_wall and totalWallNs/maxWallNs/wallOver33ms.
The offscreen Metal fixture similarly reports submissionWall* fields separately
from GPU timestamps. Historical CPU-labelled fields from these two producers
were elapsed wall times; core guest totalCpuUs diagnostics remain actual thread
CPU readings and are unchanged. Existing counter/pacer/touch tests, Android
source compilation and the validated API 23 source gate pass. A separately
compiled iOS offscreen Metal fixture passes 366 measured frames with advancing
rows and the corrected labels. The first Metal attempt rejected the wrong
Android-target payload; it remains retained, as does a wrong-directory CLI
benchmark build rejection. Neither is treated as a product-runtime failure.
Evidence: build/validation/measurement-clock-20261014/result.json.

The Android benchmark driver now waits for activity launch and checks that the
benchmark owns input focus before capturing/interacting, preventing input into
an unrelated foreground app. It refuses replacement of an existing benchmark
package and removes only its owned test installation. Syntax checks pass.
No extra DevTools UI was added. iOS 16 execution, physical presentation/startup/
touch/memory/isolation acceptance, sustained default-profile deadlines, production
endpoint/clean release and the missing original-proposal audit remain open.
The full goal remains active and additional DevTools stays deferred for v0.0.1.

## Executed iOS 16.0 acceptance and distinct-app resource stress (2026-10-14)

The official 6.28-GB iOS 16.0 (20A360) download completed with exit zero and
registered as available. An owned iPhone 14 Pro simulator booted that exact
runtime. The real signed TSX local HTTPS test passes running-counter retention,
background/resume, cold update pixels and cold rollback pixels with three
payload transfers. Separately, the native package matrix passes all 26 cases
(one accept, 25 reject), plus two runtime attacks with healthy retained state
and no failed effects. Both XCTest suites report one pass and zero failures.
Both owned simulators were deleted. Evidence:
`build/ios-validation/installed-update-ios16-20261014` and
`build/ios-validation/package-matrix-ios16-20261014`.

Strengthened the iOS production resource-registry fixture with a second scenario
using four distinct signed identities, preserving the original same-identity
scenario. Six authenticated controllers run 32 rounds per scenario; all 16
process slots fill, a seventeenth is refused, four slots per generation remain
the limit, and delayed producer tokens keep their slots until released after
retirement. Across 256 native generation retirements, old handles are denied and
capacity recovers. Completed resources also reject another authenticated app's
identity for read/release without changing the owner's bytes. XCTest checks the
native receipt, including four identities, two scenarios and 256 retirements.
The owned runner now selects this suite with PJM_RESOURCE_PROCESS=1 and removes
its simulator afterward. A future run also retains public signed peer fixtures
in peers.json; no private signing key is persisted.

The strengthened test passes on iOS 16.0 with one passed XCTest, zero failures
and owned-simulator cleanup. Evidence and independently checked native JSON
attachment: `build/ios-validation/resource-process-ios16-multi-identity-20261014`.
These are controlled producer tokens in the shipping registry, not 16 live
HTTP/JPEG workers or physical memory acceptance. Exact iOS 16 update/package/
controlled-resource paths are now proven; every native service on that runtime,
physical performance, default-profile deadline stability, production release
workflow and the original-proposal audit remain open. Additional DevTools
remains deferred beyond v0.0.1. The full goal stays active.

## Authenticated Android resource contention and first physical benchmark (2026-10-14)

The Android resource stress fixture now authenticates four distinct signed
packages with the shipping PackageVerifier/VerifiedPackage and native selector,
instead of inventing owner identity strings. Eight owner threads contend for
16 process resources over 64 rounds (1,024 admissions), with four resources per
generation. Foreign authenticated identities and foreign registry handles cannot
read or release a resource; rejected release leaves the owner's bytes unchanged.
Delayed producer callbacks retain their permits across controlled retirement,
then restore capacity. These are controlled registry generations, not eight
running native guest containers or actual HTTP/media workers.

The strengthened fixture passes on isolated official ARM64 Android API 23 and
API 26 emulators. Native receipts report 499 and 430 delayed-producer checks,
respectively. Both temporary AVDs were removed. API 23's four signatures were
also independently verified and four tampered signatures rejected. The driver
now checks native receipt counts and handles single- or double-quoted XML
attributes. Evidence: `build/android-validation/resource-process-api23-authenticated-20261014`
and `build/android-validation/resource-process-api26-authenticated-20261014`.

The user explicitly selected the connected Pixel 8 Pro for the prepared benchmark.
Its first run exposed a fixture bug: a hard-coded signed version 0.3.0 disagreed
with compiled plan version 0.0.1. Native admission correctly rejected it before
guest launch; the owned app was removed. Evidence remains in
`build/android-validation/physical-benchmark-pixel8pro-20261014`.
The exporter had only authenticated the envelope before writing a host project.
It now reuses installed-payload plan admission before producing either platform's
host. Tests verify signed version/identity/incompatible-presentation rejection
before output is written; five focused export tests pass with 155 assertions.
The first focused command lacked Bun on PATH and its two CLI tests failed for
that setup reason; the corrected PATH run passed. Full regression passes with the pinned local upstream configured: evidence is
`build/validation/export-plan-admission-20261014/full-check-local-upstream.log`.
The first full attempt omitted that setting and timed out waiting for the CLI
development session; its separate failed log is retained.

The Android benchmark exporter and native input fixture derive version/viewport
from the compiled plan. A corrected, verified and 16-KiB-aligned APK ran on the
approved physical Pixel 8 Pro: six swipes advanced rows from item 1 to about 61,
and the form opened. The script used that exact prepared APK, enforced benchmark
focus before each input/capture, collected only benchmark screens/app diagnostics,
and removed its owned app; a separate package query confirmed absence. Evidence:
`build/android-validation/physical-benchmark-pixel8pro-20261014-corrected/result.json`.

This first physical sample reveals remaining work. Scrolled rows visibly occlude
the header, requiring clipping investigation. Android reports COLD activity total
284 ms, which is not a first-present timestamp. Total app PSS is 126,247 KiB
(123.3 MiB), including 85,760 KiB graphics. The 907 recorded host submissions
average 3.03 ms, with max 138.18 ms, two over 33 ms, and 11 submission intervals
over 33 ms. These are elapsed host submission times, not CPU time, display
presentation, touch-to-present or sustained-scroll acceptance. No full physical
performance acceptance is claimed. The phone test is complete and cleaned up;
additional DevTools remains deferred and the full goal stays active.

The native deterministic benchmark input check also passes after deriving its
identity/version/density from the compiled plan: visible row maximum advances
17 → 69, form navigation works and newsletter state remains unchanged. A separate
CPU-rendered six-gesture diagnostic preserves the header/footer after scrolling,
whereas the physical GLES screenshot occludes them. This narrows investigation
to the GPU path but does not prove a root cause or identical-frame pixel parity.
Evidence: `build/validation/scroll-clip-diagnostic-20261014` and
`build/validation/physical-benchmark-corrected-20261014/native-input.log`.

## Reproducible GLES/CPU clipping comparisons (2026-10-14)

The existing physical scroll screenshot remains a real unresolved visual issue;
no renderer change is made from speculation. The shared GPU snapshot after six
swipes reports the expected list clip [0,64,390,736], while header/footer commands
retain the full [0,0,390,844] clip. CPU pixels preserve the header/footer.
The pinned upstream revision is fe971ebb8e14724d2a98d4df6b34c065caf11132 and
its tracked tree is clean. Rebuilt the normal Android Rust library offline and
linked a fresh JNI bridge; the prior JNI binary and fresh JNI hashes differ,
but that alone does not prove the previous archive was stale or caused this bug.
The native build succeeds; existing unused-import/toolchain warnings are retained.

Added `tests/benchmark-gles-parity-android.c` and its bounded staging/cleanup shell
driver, selected through the isolated minimum-OS wrapper with PJM_GLES_BENCHMARK.
The same native guest turn feeds GLES readback and the CPU renderer. Full-frame
raw pixels are retained; assertions target flat stationary header/footer regions,
away from text/rounded-edge filtering differences. The initial API 26 run passes
84,240 border samples after six gestures. A phone-window profile (1008x2077,
fitted viewport x=24,width=960) with 120 settling frames passes 34,560 samples.
The final run also probes three stationary border points in every frame: 487
frames, 1,461 probes, zero transient mismatches and zero final border mismatches.
All three isolated API 26 emulators were removed. These are border comparisons,
not full-frame equality, physical presentation or latency acceptance. Evidence:
`build/android-validation/gles-scroll-parity-api26-before-fix-20261014`,
`build/android-validation/gles-scroll-parity-api26-phone-window-20261014`, and
`build/android-validation/gles-scroll-parity-api26-per-frame-20261014`.

A fresh-native repeat of the approved phone benchmark stopped at its focus guard;
the benchmark had lost foreground focus before any capture/input sequence could
complete. The temporary app was removed and a separate package query confirmed
absence. No other foreground app was interacted with. The phone's availability
for another short run was requested; that answer is pending. Evidence:
`build/android-validation/physical-benchmark-pixel8pro-20261014-current-native`.
The physical clipping cause remains unproven and the issue stays open; next
physical diagnostics must reproduce the rendered mismatch with the current
native binary and, if needed, retain the exact benchmark input sequence for
same-state CPU/GLES comparison. The full goal remains active and additional
DevTools stays deferred beyond v0.0.1.

## Full-frame CPU/GPU scroll and submitted-form comparison (2026-10-14)

Added a Metal benchmark parity runner and extended the GLES runner beyond flat
border samples. Both renderers consume the same guest turn before CPU readback;
raw frames are retained. The iOS benchmark exporter now accepts a validated
PJM_BENCHMARK_DENSITY (1 through 4, default 1), enabling a true 3x iOS fixture.
An isolated archive of the exact pinned compiler generated it without writing
its shared checkout; that owned compiler copy was removed afterward. The first
compile attempted the read-only shared generated-style file, then encountered
an obsolete temporary compiler path; both setup failures remain retained. The
initial sandbox Metal attempt could not create a GPU device; authorized local
GPU execution succeeded. The runner now reports device unavailability cleanly.

On the local Mac's actual Metal device, the final scrolled frames match CPU
byte-for-byte at 1x (329,160 pixels) and 3x (2,962,440 pixels). Each 487-frame
sequence also passes 1,461 stationary border probes. A further 3x run taps Form,
selects Pro, enables the newsletter and submits; retained-tree assertions prove
Saved/Pro/enabled state. Its 499-frame sequence passes 1,497 border probes and
its final 2,962,440 pixels also match CPU exactly. The rendered form was visually
reviewed. These are offscreen Mac Metal results, not physical iPhone acceptance.
Evidence: `build/validation/metal-scroll-parity-20261014`.

The Android API 26 GLES scroll run now enforces full-frame comparison at native
3x dimensions: 1,333 pixels differ by one channel level, none exceed one, and
all border probes pass. Its emulator was deleted. Evidence:
`build/android-validation/gles-scroll-full-parity-api26-20261014`.
The submitted-form sequence executes correctly on GLES too, but its strict
one-channel-level comparison FAILS: 25 of 2,962,440 pixels differ by two levels
(809 pixels differ at all); borders remain correct. Exact differing coordinates
and colors are retained in pixels-over-one.json. The separately compiled iOS
and Android CPU form images are byte-identical (11,849,760 bytes each), so this
is a reproducible GLES discrepancy, not different application state.

Three separate experiments tested higher shader precision, Metal's normalization
operation order, and RGBA uploads for filtered coverage textures. None changed
the failing pixels or counts. Every experiment was reverted; the normal native
library was rebuilt from the restored source. Patches, native build logs,
failed comparisons and owned-emulator cleanup receipts remain retained. The
comparison threshold was not relaxed and the GLES form gate stays open. No
production renderer change is claimed. Evidence is under
`build/android-validation/gles-form-full-parity-api26-20261014` and its separately
named highp/ndc-order/linear-rgba attempts; the aggregate receipt is
`build/validation/metal-scroll-parity-20261014/result.json`.

The original physical phone header occlusion is a separate unresolved issue;
these local comparisons do not establish its cause. Phone availability is still
pending after the focus guard stopped the last attempt and removed the app.
Physical performance/isolation, default deadline stability, production release
workflow and the missing original-proposal audit also remain open. Additional
DevTools remains deferred beyond v0.0.1 and the full goal stays active.

## Real HTTPS process contention (2026-10-15)

Android API 23 and API 26 both pass 32 real default-trust HTTPS responses in two
waves across four authenticated signed identities. Passive production-client
events observed 16 concurrent calls on 16 pjm-http worker threads and 32 TLS
handshakes. Four probes reject a seventeenth resource specifically at the shared
process cap. Foreign reads/releases leave owner bytes intact; retirement and
release deny stale handles and restore capacity. Both owned emulators were
removed. Evidence: build/android-validation/live-http-process-api23-20261014
and build/android-validation/live-http-process-api26-20261014. API 23 is a direct
HTTP service/selector result, not full installed-host minimum-OS acceptance.
Mixed HTTP/media, in-flight retirement and physical memory remain unproven.

The Pixel must remain untouched until the user explicitly says it is free.
Simulator work continues; additional DevTools remains deferred beyond v0.0.1.

The equivalent iOS 16.0 (20A360) installed-controller test passes: 32 real HTTPS
200 responses, 18,464 bytes, four authenticated identities, 16 resumed production
URLSession tasks, four global cap denials and four actual native generation
retirements/reopens. Responses drain through the native verified mailbox;
foreign reads/releases and stale handles are denied, and the second wave
recovers all capacity before releasing its 16 resources. No transport or TLS
trust override is installed. This reports running task state, not worker-thread
or TLS-handshake concurrency. XCTest: 1 passed, 0 failed, 0 skipped. The receipt
and screenshot are retained at
build/ios-validation/live-http-process-ios16-20261015-typed-package; the owned
simulator cleanup is confirmed. The first test-only package type compile failure
and its cleanup evidence remain at live-http-process-ios16-20261015.

These results do not close in-flight revocation, mixed HTTP/media, concurrent
rendered guest-loop, physical performance/memory, GLES form parity, physical
clipping, default deadline stability, production release or original-proposal
audit gates. The full goal remains active.

## In-flight Android HTTPS retirement (2026-10-15)

API 23 and API 26 both pass cancellation of 16 real HTTPS calls after receiving
200 headers. A test-only event observer holds the production workers during
service generation retirement: all calls are cancelled, handles denied, pending
tasks removed, and buffer capacity remains occupied until producers exit. A
seventeenth resource is correctly denied during that interval. After releasing
the observer, all buffers are cleared, no retired reply is delivered, and the
next full wave succeeds. Each run observes 48 real TLS handshakes plus 32 normal
completed responses across the surrounding waves. Scheduling is controlled;
transport and TLS trust are unchanged. Both owned emulators were removed.
Evidence: build/android-validation/live-http-retirement-api23-20261015 and
build/android-validation/live-http-retirement-api26-20261015. Android native
guest-container retirement, mixed media and physical acceptance remain open.

The iOS 16.0 check now passes real in-flight native-container retirement too.
Sixteen genuine HTTPS 200 response headers are observed through the original
production delegate, with test-controlled response-disposition timing. All
sixteen unfinished tasks are cancelled by four native container closes/reopens,
generations advance, stale handles are denied, and weak observation proves all
cancelled resource objects are deallocated before a full new wave succeeds.
No transport/trust/response substitution is used. Total: 32 normal responses,
16 in-flight cancellations and eight native generation retirements/reopens.
XCTest: 1 passed, 0 failed, 0 skipped; native receipt assertions and owned
simulator cleanup confirmed. Evidence:
build/ios-validation/live-http-retirement-ios16-20261015. Retained Xcode logs
include a framework-copy diagnostic reporting exit code 0 and debugger-version
metadata warnings; the executed test's summary and receipt confirm success.
Mixed media, Android guest-container retirement and physical/release gates
remain open. The Pixel stays untouched until the user says it is free.

## Native guest HTTP delivery and retirement (2026-10-15)

Android API 26 now passes the HTTP test through four real native containers:
eight generation closes/reopens trigger HTTP/registry retirement from native
callbacks, eight guest unload cleanup records persist their storage effect,
and sixteen stale completion posts are denied. All 32 successful HTTPS replies
are consumed by real guest frames and echoed with exact JSON. The existing
sixteen-call in-flight cancellation, retained-buffer and capacity-recovery
checks remain intact (48 TLS handshakes total). Evidence:
build/android-validation/live-http-native-container-api26-20261015-compile-fixed.
The first Java test naming conflict and its emulator cleanup are retained in
live-http-native-container-api26-20261015. Both emulators were removed.

On iOS 16, all 32 real replies are also consumed/echoed by four native guests;
32 stale container post attempts are denied across the eight generation
retirements/reopens. XCTest: 1 passed, 0 failed, 0 skipped; receipt assertions
and owned-simulator cleanup confirmed. Evidence:
build/ios-validation/live-http-native-guest-ios16-20261015.
These are native CPU guest/frame and container checks, not simultaneous GPU
presentation, SDK-issued HTTP or Android Activity teardown. Mixed media and
physical/release acceptance remain open. The Pixel stays untouched.

API 23 now passes the same native-container/HTTP/guest frame check: eight native
retirements and persisted guest cleanup records, 32 guest-consumed replies,
sixteen stale post denials and sixteen in-flight cancellations. It observed
48 request-header events and 47 TLS handshakes (no one-handshake-per-request
assumption). Owned emulator cleanup confirmed. Evidence:
build/android-validation/live-http-native-container-api23-20261015.
This establishes that native CPU container/service path on API 23; full
installed-Activity minimum-OS and physical/release gates remain open.

## Mixed Android HTTP and image workers (2026-10-15)

API 23 and API 26 both pass a real mixed-worker test across four authenticated
native app owners: twelve shipping HTTP workers and four shipping image workers
occupy all sixteen shared resource slots. Three stages cover completion,
in-flight native retirement and full recovery. The normal/recovery stages
produce 24 real HTTPS responses and eight real resized 64x32 JPEGs; bounded reads
validate bodies, JPEG pixels/dimensions, distinct handles, foreign-access denial
and byte preservation. Six probes enforce the global cap.

Native retirement cancels twelve real HTTP calls and four media workers while
held by test scheduling gates. Buffers remain counted until those workers exit;
late replies are suppressed and the next full mixed stage succeeds. Image input
comes from a synthetic test picker callback; bounded decoding, resizing and JPEG
encoding use production code. Real picker UI, physical quality, GPU presentation
and SDK-issued traffic are not established by this test.

Evidence: build/android-validation/mixed-http-media-api23-20261015 and
build/android-validation/mixed-http-media-api26-20261015. Both owned emulators
and apps were removed. The full extended suite records 84 HTTP header events,
83/84 TLS handshakes respectively, twelve native retirements and guest cleanup
records, plus the earlier 32 replies consumed by native guest frames.

The iOS mixed test remains open and must preserve its one-active-media-operation
process policy. Physical/release and other previously listed gates remain open;
additional DevTools stays deferred and the Pixel stays untouched.

## Mixed iOS HTTP and image provider test (2026-10-15)

Actual iOS 16.0 passes the mixed test while preserving the one-active-media
process policy: fifteen real HTTPS requests plus one production image-provider
operation occupy all sixteen resource slots. Normal/recovery stages produce
thirty HTTPS responses and two real normalized 64x32 JPEGs. Body/pixel checks,
foreign-access denial, byte preservation and 32 exact native guest-consumed
replies pass.

Four native generation retirements cancel fifteen unfinished HTTP tasks and
one provider progress. The held cancelled provider retains its buffer and media
permit: fifteen new real HTTP requests fill the other slots, a seventeenth
resource is denied and another media operation stays BUSY. Once its callback
exits, full mixed capacity recovers. Six resource-cap probes and sixteen stale
container-post denials pass. Synthetic picker input/host consent and offscreen
foreground handling are explicitly test-only; codecs, provider streaming,
permission admission, resource accounting and native retirement are production.
Real picker UI, physical quality, GPU loops and SDK-issued requests are unproven.

XCTest: 1 passed, 0 failed, 0 skipped; native receipt asserted and owned simulator
removed. Evidence:
build/ios-validation/mixed-http-media-ios16-20261015-owner-timing.
The first admission failure and cleanup remain at mixed-http-media-ios16-20261015;
test startup/provider timing was corrected without changing production policy.
Physical/release and other previously listed acceptance gates remain open.

The current iOS 26.4 (23E244) diagnostic run also passes all mixed checks:
30 real HTTPS responses, two JPEGs, 32 guest-consumed replies, six cap denials,
four native retirements and the cancelled-provider capacity/media-permit checks.
XCTest: 1 passed, 0 failed, 0 skipped; native receipt and owned-simulator cleanup
confirmed. Evidence:
build/ios-validation/mixed-http-media-ios26-20261015-diagnostic.

Its preceding run timed out at the synthetic provider's 30-second gate. The
failure summary and cleanup remain at mixed-http-media-ios26-20261015. Failure
reporting now includes phase/resource counters and early HTTP errors; no time
bound, workload, quota or acceptance assertion was loosened. The later pass
does not establish the earlier timeout's cause or prove a production fix.
Current-runtime mixed timing stability remains open. All four owned simulators
from this iOS mixed unit were removed. The full goal remains active and the
Pixel remains untouched.

## Mixed-test timeout diagnostics (2026-10-15)

Added bounded state-change tracing and automatic retrieval before uninstall,
including failed XCTest result export. A fresh iOS 26.4 run passes all original
mixed checks and retains a 30-event trace ending at 2,463 ms. Cancelled HTTP
resources are gone at the first retirement sample; the media token remains
counted while fifteen new real HTTP resources fill the remaining slots, then
is gone at the next sample after its callback is released. Owned simulator
cleanup and native receipt assertions pass. Evidence:
build/ios-validation/mixed-http-media-ios26-20261015-phase-trace.
Objective-C syntax compilation, Bun bundling and whitespace checks pass.

The earlier provider timeout remains unexplained and mixed timing stability
stays open. This is test-phase wall timing, not device startup/frame acceptance;
no production policy or acceptance assertion was relaxed. Physical/release gates
remain open, the goal stays active, and the Pixel stays untouched.

## GLES dither diagnosis and test-runner correction (2026-10-15)

Corrected a new diagnostic-runner false success: an empty Bash argument array
aborted before native execution while cleanup obscured the error. The invalid
baseline metadata is preserved and explicitly invalidated at
gles-form-dither-baseline-api26-20261015. Success now requires fresh, parsed
native GLES proof and all comparison assertions; invalid-mode/missing-compiler
fault probes fail with cleanup and no adb calls.

The corrected API 26 baseline and diagnostic with dithering disabled both fail
identically: 25 pixels exceed one level, maximum delta 2. Dithering is therefore
ruled out for this reproduction. Both owned emulators were removed. Evidence:
build/android-validation/gles-form-dither-baseline-api26-20261015-runner-fixed
and build/android-validation/gles-form-no-dither-api26-20261015.

A new sample diagnostic reproduces the exact Android CPU frame and finds exact
texel-center samples at six failing coordinates. It narrows the next step to
actual GLES interpolation/sampling/blending; it does not prove the cause or fix
parity. Evidence: build/validation/gles-sample-diagnostic-20261015.
Production renderer/shaders remain unchanged. The form gate and other physical,
stability/release gates stay open. The Pixel remains untouched.

## GLES form parity correction (2026-10-15)

Retained a production GLES fix after real fragment probes showed that six
coverage samples were wrong before blending despite correct vertex colors.
Quantizing linear-image coordinates to an eight-bit subtexel grid restored all
nine sampled text triangles. High-precision fragment hardware uses this path;
nearest textures and the original low-precision fallback are preserved. Texture
grid metadata is bounded and removed with cache entries. FFI/input/clip/viewport,
blending and the strict comparison threshold remain unchanged.

The full 2,962,440-pixel form now passes on API 23 and API 26: zero pixels exceed
one level (previously 25), with only 59 one-level differences. Form state and
border probes pass. The full API 26 scrolled frame passes too (999 one-level
differences, zero beyond one). Native GLES context/pool loss, recreation,
retirement and teardown pass on both APIs. All owned emulators were removed;
74 core tests and the Android release build pass. Aggregate evidence:
build/validation/gles-coordinate-quantization-20261015/result.json. Raw runs:
build/android-validation/gles-form-quantized-api23-20261015,
build/android-validation/gles-form-quantized-api26-20261015 and
build/android-validation/gles-scroll-quantized-api26-20261015.

This resolves the measured emulator form parity gate, not physical header
occlusion or performance. The old prepared phone APK predates the fix and needs
rebuilding before later use. Low-precision hardware has not been measured here.
Other previously listed stability/physical/release gates remain open. The Pixel
stays untouched and the full goal remains active.

## Updated benchmark APK ready for later phone test (2026-10-15)

Built and verified the updated temporary benchmark APK with fresh JNI containing
the GLES fix. Exact payload/JNI embedding, APK signature, alignment and minSdk 26
checks pass; the temporary APK signing key was removed. Artifact:
build/validation/physical-benchmark-gles-quantized-20261015/Benchmark-quantized.apk.
APK SHA256: f5d0b32c492383889a523a77a4ad656149f11cf86dc199cef42f0bff2389f014.

The exact APK passes an installed API 26 emulator smoke: six real swipes move
Item 1 to Item 55, Form opens, and the whole header/footer regions remain
byte-identical while the list changes. App removal and owned-emulator cleanup
are confirmed. Evidence:
build/android-validation/installed-benchmark-quantized-api26-20261015-input-fixed.

The first smoke revealed API 26's generic-view accessibility class and swallowed
coordinate/input errors; it is not accepted as a gesture run. The helper now
requires a unique authenticated ready surface, validates numeric coordinates,
propagates failures and rejects input usage/error output. Regression tests pass
(2 tests, 11 assertions). Failed evidence and emulator cleanup are retained at
installed-benchmark-quantized-api26-20261015.

The Pixel remains untouched until the user says it is free. The APK is prepared,
not physically validated; clipping, performance and other stability/release/audit
gates remain open. The full goal stays active and extra DevTools stays deferred.

The full standard local regression suite also passes after these changes
(exit 0, 54.586 seconds). It used an isolated checkout of the pinned compiler,
preserved the shared compiler's tracked state and removed its temporary checkout.
Evidence: build/validation/release-regression-20261015/result.json and
full-check.log. No physical device was used; the pending acceptance gates above
remain open.

## Empty-project-cache release CLI check (2026-10-15)

The opt-in tests/release-fresh-cache.ts run passes all eleven public CLI steps:
create, fresh pinned compiler/dependency setup, checks and signed builds for both
targets, verified publication dry runs, wrong-target publication rejection, pin
verification and source-preserving clean. Retained evidence and public signed
outputs: build/validation/release-fresh-cache-20261015/result.json and adjacent
logs/packages. The temporary project and private key were removed; there was no
upload or device access. This used Bun 1.4.2 and installed tools. Doctor's Bun
1.3.11, clean-machine/native-export execution and production endpoint acceptance
remain unverified by this run. The full goal remains active.

## Documented Bun 1.3.11 checks (2026-10-15)

The fresh-cache workflow was subsequently rerun with official Bun 1.3.11: all
eleven steps pass for the two signed targets. Evidence:
build/validation/release-fresh-cache-bun1311-20261015/result.json. The complete
standard regression suite also passes with this runtime (exit 0, 64.924 seconds):
build/validation/release-regression-bun1311-20261015/result.json and full-check.log.
Owned temporary projects/compiler/runtime and private signing key were removed;
the shared compiler tracked state was preserved. No upload or device access.

The earlier documented-runtime verification gap is closed for these checks.
Compared with 1.4.2, this template has identical manifest, identity, plan and
asset sections but different emitted JavaScript; cross-runtime byte equality or
general behavioral equivalence is not claimed. Keep the documented 1.3.11 build
runtime. Native-export/clean-machine, production endpoint, physical, stability
and original-proposal audit gates remain open; the full goal stays active.

## Public native export/build check (2026-10-15)

The new opt-in tests/release-native-export.ts exposed a public iOS simulator
export bug: generic Xcode builds requested x86_64 as well as arm64, despite the
single-architecture Rust archive. The exporter now sets generated ARCHS to the
architecture of its chosen Rust target. The initial failed build is retained at
build/validation/release-native-export-20261015.

The corrected public exports build an iOS Release simulator app and Android
unsigned APK, with exact signed/trust resource embedding, exact Android JNI
embedding and passing 16 KiB zip alignment. Evidence:
build/validation/release-native-export-20261015-architecture-fixed/result.json.
Five focused export tests pass (155 assertions); Bun 1.3.11 and actual installed
toolchains were used. No app was installed/launched, no simulator was booted and
no upload or physical-device access occurred. Temporary tool executables were
removed. This proves the measured arm64 native export/build path; clean-machine,
Intel, iOS distribution signing, runtime, production endpoint and remaining
physical/stability/audit acceptance are still open. The full goal stays active.

## Three current-iOS mixed-worker repetitions (2026-10-15)

Three iOS 26.4 owned-simulator runs pass the same mixed HTTP/image, native
retirement, isolation and recovery assertions, with no relaxed timeouts/quotas.
All report one passed XCTest and zero failures/skips; all owned simulators were
removed. Totals: 90 successful default-trust HTTPS replies, six validated JPEGs
and 96 exact guest replies. Evidence:
build/ios-validation/mixed-http-media-ios26-repeat-20261015/aggregate.json and
repeat-result.json, with separate per-run traces/receipts/summaries.

An outer trace-filename collection error after the first native pass was fixed;
the first successful native result and cleanup were verified and reused, not
rerun. Its original collector failure remains in result.json. Phase wall times
vary from 1,808 to 16,584 ms and are not device performance measurements. The
earlier provider timeout did not reproduce; its cause and broader timing
stability remain unresolved. Synthetic picker input/consent and offscreen
foreground overrides remain explicit. No physical-device access occurred;
other physical/release/audit gates and the full goal remain open.

## Signed service-flood native isolation (2026-10-15)

Both native package matrices now execute three signed runtime attacks. The new
guest attempts 256 storage requests, verifies exactly 32 mailbox admissions and
224 BUSY denials, then deliberately throws. The failed turn dispatches no stored
write; the attack becomes terminal and a healthy guest resumes with its original
generation/state. Actual iOS 26.4 UIKit and API 26 Android app_process runs pass
this scenario, the existing loop/heap attacks and the 26 package cases. All owned
devices were removed. Aggregate evidence:
build/validation/signed-service-flood-20261015/result.json.

Initial API 26 attempts failed in the test launcher: its java.library.path hid
the system crypto library. Scoped diagnostics identify javacrypto loading during
cleanup, and restoring the system/vendor paths allows the unchanged attacks to
pass. Both failed runs and cleanup receipts are retained; successful Android
evidence is package-flood-api26-20261015-system-libraries under android-validation.
iOS evidence is package-flood-ios26-20261015 under ios-validation. No production
quota/time budget changed and no physical device was accessed. Sustained flood,
wider malicious workloads, physical memory/isolation and prior stability/
release/audit acceptance remain open. The full goal stays active.

## Signed repeated queue recovery (2026-10-15)

Both native suites now also pass 64 rounds with a signed guest that handles BUSY
and remains live: 16,384 attempted storage requests, 2,048 verified successful
native replies and 14,336 denials per platform. The final persisted value and
both guests' generation/state after switching are verified. Actual UIKit iOS
26.4 and API 26 Android native runs pass, alongside the three failure attacks
and all 26 package cases; all owned devices were removed. Evidence:
build/validation/signed-flood-recovery-20261015/result.json and its raw-run links.

This uses real native storage and explicit CPU/container turns, with unchanged
production limits. It does not measure display cadence, physical performance or
long-duration stability. The Pixel remains untouched and the wider physical,
timing, release and original-proposal audit gates remain open.

## Doctor and complete local regression (2026-10-15)

Android doctor now checks the same build-tools 36.0.0 used by run/export,
including all four packaging executables, plus missing JDK/NDK helpers. A public
CLI test with temporary tool fixtures verifies incomplete installations and
rejects directories as required files (19 assertions); discovery is mocked and
does not query a physical device. It is part of the standard gate.

The complete tests/check.sh suite passes on documented Bun 1.3.11 after this fix
and the latest native fixture changes (exit 0, 73.171 seconds). Evidence:
build/validation/doctor-regression-bun1311-20261015/result.json and full-check.log.
Owned compiler/runtime cleanup and preserved shared compiler state are confirmed.
No physical device was used. Clean-machine, physical, stability, release and
original-proposal audit gates remain open; the full goal stays active.

## Fresh SDK native dependency bootstrap (2026-10-15)

Fixed public run/export's reliance on the SDK example's engine cache. Native
builds now use generated source snapshots and Cargo manifests bound to a verified
checkout: the active project's checkout for interactive hosts, and an SDK-local
pinned cache for standalone export. SDK source files are preserved; pin/dirty
checks remain enforced, source edits invalidate snapshots and modified cached
bytes are rejected. All four public native build paths use this preparation.

An actual relocated SDK with no examples or native/source caches now bootstraps
the pinned engine and passes both public exports, library builds, generated
simulator-app/APK builds, resource embedding and Android alignment. Its original
source manifest reproduced the missing-example dependency before the generated
manifest was used. Evidence:
build/validation/native-engine-fresh-sdk-20261015-complete-inputs/result.json and
exports/result.json. An initial incomplete SDK-copy harness failed before native
bootstrap and is retained at native-engine-fresh-sdk-20261015.

Preparation tests pass 15 assertions and export contract tests pass 155. The
complete standard suite subsequently passes on Bun 1.3.11 (exit 0, 75.526 seconds):
build/validation/native-engine-regression-bun1311-20261015/result.json. Owned SDK,
tools and compiler were removed; shared tracked engine source was unchanged.
Fresh-project interactive native UI, bare-OS setup, physical/runtime acceptance
and the previous timing/production endpoint/audit gates remain open. The Pixel
was untouched and the full goal remains active.

## Fresh-project public iOS native run (2026-10-15)

Public create/run in native acceptance mode now passes from a relocated SDK and
empty fresh-counter project on an owned iOS 26.4 simulator with Bun 1.3.11.
There were no SDK examples, engine source caches, native targets or preseeded
project dependencies. The public CLI bootstraps the project and native engine;
generated manifest metadata binds all engine crates to the active project's
verified checkout. SDK source manifest preservation and cache selection pass.

All six shipped input/layout/rotation, reload/error recovery, service/storage
and lifecycle UI tests pass, with zero failures/skips and CLI exit zero.
Portrait/landscape/services screenshots were reviewed. Evidence:
build/validation/fresh-native-project-ios-20261015/run/result.json and adjacent
summary, manifest/source-resolution files, logs and screenshots. App uninstall,
owned simulator deletion and temporary SDK/project/tool cleanup are confirmed.
An already terminated app returned exit 3 on the optional terminate attempt.

This closes the measured fresh iOS test-mode workflow, not normal interactive
attachment, fresh Android launch, bare-OS setup or physical performance. Those
and the prior timing/production endpoint/original-proposal audit gates remain
open. The Pixel was untouched and the full goal stays active.
