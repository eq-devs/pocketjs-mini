# PocketJS Mini

Write TSX, run it in a native phone container, and save to reload.
PocketJS owns QuickJS, layout and rendering. Native hosts own the window, safe
area, frame timing and touch. No Flutter, Dart, NativeScript or WebView is required.
PocketJS upstream is pinned and never patched.

## First run

Install Git, [Bun 1.3.11](https://bun.sh), a stable
[Rust toolchain](https://rustup.rs), and Xcode with an available iPhone simulator.
The interactive host runs on macOS with an iPhone simulator or a connected iPhone.

```sh
git clone https://github.com/eq-devs/pocketjs-mini.git
export PATH="$PWD/pocketjs-mini/bin:$PATH"
pjm create hello
cd hello
pjm run
```

`run` selects a single connected iPhone first, otherwise a booted/available
iPhone simulator. With more than one connected phone, select explicitly:

```sh
xcrun simctl list devices available
pjm run -d <simulator-id-or-name>
```

### Physical iPhone

Connect/unlock the phone, trust the Mac and enable Developer Mode. Sign in to
your Apple Account in Xcode. Keep the Mac and phone on the same private Wi-Fi/LAN
and allow the app's Local Network prompt. Set your signing **Team ID** (not the
certificate's personal identifier):

```sh
export PJM_TEAM=<your-10-character-Xcode-Team-ID>
# If the Mac has multiple LAN/VPN interfaces, choose its Wi-Fi/LAN IPv4 address:
export PJM_HOST=<your-Mac-LAN-IPv4-address>
pjm run
```

To select a particular phone, inspect `xcrun devicectl list devices` and use
`pjm run -d <identifier-or-UDID>`. The launcher builds the `aarch64-apple-ios`
engine, signs the UIKit container, installs it and attaches its console. Xcode
manages development provisioning; the selected Team may need device registration.
USB is used for installation/control; application reload currently uses LAN.
There is no USB-only reload tunnel or offline standalone app in this version.

### Android development host

The Android host uses QuickJS, the Rust core and GLES2 in a native surface.
Install JDK 17, Android SDK platform 34, build-tools 36.0.0, NDK 28.2.13676358,
and stable Rust with the Android target:

```sh
rustup toolchain install stable --profile minimal --target aarch64-linux-android
export ANDROID_HOME=<your-Android-SDK-directory>
export JAVA_HOME=<your-JDK-17-directory>
pjm run --device android -d emulator-5554
```

Use a serial reported by `adb devices -l`; a single connected device can be
selected by omitting `-d`. The first host supports arm64 phones/emulators.
USB debugging must be authorized. Reload uses `adb reverse`, so the Android
device does not need the development computer's Wi-Fi network. Stop the session
to close the app and remove its forwarding rule. iOS remains the default.

Android emulator inspection verified actual guest pixels, taps, source restart,
compile-error display/recovery, landscape negotiation and session cleanup.
Physical Android acceptance and performance budgets remain pending.

`doctor`, `create`, `check`, `run`, `build`, and `clean` are public commands. `mp` is an alias for
`pjm`. Run `pjm doctor --device android` or `pjm doctor --device ios` to inspect
the selected toolchain and connections. Interactive compilation is automatic.
Tap the example to increment
its counter. Save `app/main.tsx` to rebuild/reload. Errors appear over the last
running application; a valid edit recovers. Ctrl+C stops the session and closes
its app. Quit the native app to end the attached session.

`pjm check --device android` validates types, manifests, styles, assets and
container declarations without publishing an artifact. `pjm build --device android`
produces a development `.pocket` package. Both accept `--width`, `--height` and
`--density` for an explicit device snapshot.

```sh
pjm build --device android --release --key /path/to/ed25519-private-key.pem
```

The release directory contains `main.pocket` and `manifest.json`. Its Ed25519
signature covers the payload hash, identity, version, target, ABI, pages,
permissions and domains. Declare pages, permissions and exact HTTPS domains in
`container.json`; the default is only `/` with no permissions or network domains.
Existing release directories are refused. Native verified release loading is
still pending; signing alone does not make the development host a production
container.

First run downloads the pinned upstream, installs its Bun dependencies, adds a
missing stable Rust simulator target, builds PocketJS, and generates a disposable
UIKit Xcode project. Subsequent runs reuse native build caches. You never edit
that generated native project to develop the TSX app.

## Phone layout

The host takes over the phone window. Its background fills the screen; the
PocketJS content fills the actual safe content area. UIKit measures that area
in logical points, reports its width/height, safe insets and raster density, and
Mini resolves a matching **Mini-owned `pjm-ios` host contract** through official
PocketJS APIs. It does not pretend to use the upstream fixed `ios-dev` profile.

The template's `w-full h-full` layout uses the measured viewport. There is no
480×272 tile and no stretch-to-fill simulation. Font assets bake at the same
1..4 raster density used by the native view. Physical pixels and logical layout
units stay separate.

Rotation reports new metrics and compiles/recreates the guest for the new
viewport. **Rotation and source reload reset application state in this version.**
This is negotiated rebuild/reload, not live engine resize or stateful hot reload.
The current touch contract limits each logical dimension to 1024; larger surfaces
are rejected rather than silently truncating coordinates. Tablet support is not
claimed. Native `CADisplayLink` requests 60 ticks/s, matching the compiler;
actual presentation cadence remains subject to the device/OS. Input is collected
by upstream and delivered at frame boundaries, including multiple contacts.

## Tiny application

```text
hello/
  app/main.tsx
  assets/
  mini.json
  tsconfig.json
```

`mini.json` currently holds the application name. `tsconfig.json` provides normal
TypeScript/editor module resolution. Keep application resources in `assets/`.
Names start with a lowercase letter and contain lowercase letters, digits or
hyphens, at most 48 characters. Existing destinations are refused.

The compiler installs the generated `@pocketjs/mini` SDK dependency without
rewriting your TypeScript configuration. Connect its frame pump after mounting:

```tsx
import { connectMiniApp } from "@pocketjs/mini";

mount(() => <App />);
const mini = connectMiniApp({ pages: ["/", "/detail"] });
mini.deviceInfo().promise.then(info => console.log(info.width, info.height));
mini.after(60, () => console.log("60 guest frames elapsed"));
mini.navigation.push("/detail", { id: "example" });
```

The iOS and Android development and installed hosts implement `device.info.v1`.
The SDK validates its platform, model, logical viewport, density and four safe-area
fields before resolving the request. Installed hosts fit their fixed logical
viewport inside the platform's safe surface, so those logical safe-area fields
are zero. Invalid or incomplete replies reject with `PROTOCOL`.
Both hosts also implement `storage.get.v1`, `storage.set.v1` and
`storage.remove.v1`, exposed as `mini.storage.get/set/remove(...).promise`.
Values are JSON; a missing key returns `null`. Limits are 256 keys, 128 UTF-8
bytes per key, 2 KiB per encoded value and 1 MiB per snapshot. Atomic writes
preserve the prior snapshot on failure. Per-app file locks coordinate separate
providers; contention returns `BUSY`. Each guest binds to the app identity
in its committed development metadata; service arguments cannot choose a data
directory. This local development identity is unsigned. Verified release
identity and full native multi-instance isolation remain pending. Android
acceptance also switches app identities and verifies a guest-supplied identity
cannot select another data directory. iOS currently verifies persistence,
quotas, removal and failed-boot effects; its native identity isolation acceptance
still needs expansion.
The installed iOS and Android hosts additionally implement `request.v1`, exposed as
`mini.http({url: "https://example.com/"}).promise`. The SDK exports `HttpRequest`
and `HttpResponse` types, validates inline request bounds and canonical base64,
and validates the reply before returning a frozen response. Its handle includes
`cancel()`. The generic `mini.request("request.v1", args)` remains available.
The domain must appear in the authenticated package. Optional arguments are
`method` (GET/HEAD/POST/PUT/PATCH/DELETE), `headers` with printable ASCII values,
and canonical `bodyBase64`.
Successful data contains `status` and `bodyBase64`. Request and response bodies
are limited to 1536 bytes in inline mode. Both installed hosts also support
`responseMode: "resource"` for responses up to 1 MiB, returning
`{status, resource: {handle, size}}`. Use `mini.resources.read({handle, offset,
count})` for chunks of at most 1536 bytes, and `mini.resources.release(handle)`
when finished. Reads return canonical `bodyBase64`, `offset`, `nextOffset`, total
`size`, and `eof`. Handles belong to their original app and guest generation;
retirement releases them. There are four slots per generation and sixteen
fixed 1 MiB slots per process, including cancelled workers until they exit.
Native Android execution and iOS main-queue delegate tests cover resource
production, chunk ranges, release and retirement; signed guest resource round
trips remain to be verified.
Each guest may have four requests pending, eight across the controller. Requests
also have a process-wide limit of 32 admissions per app in a rolling 60 seconds;
cancelled work still counts. Retiring guests, opening new controllers or updating
an app's version does not reset that limit. The rate table holds at most 64 app
identities with recent admissions; excess admission returns `BUSY` until expiry.
The hosts disable cookie, credential and HTTP caches and enforce a 15-second native deadline.
iOS uses per-request ephemeral sessions; Android uses cookie-free OkHttp. Every redirect
is checked against package policy, with at most five redirects; authorization
and cookie headers are stripped on redirects. Cancellation and guest retirement
release their tasks. Both hosts keep completed replies in their bounded task set
until the guest mailbox accepts them at a frame boundary. Development-host HTTP support remains pending.
Other service kinds return `UNSUPPORTED`.
Run `PJM_HTTP_SURFACE_TEST=1 bash tests/package-surface-android.sh <serial>` for
signed guest HTTP round trips using a test-only controlled transport. The guest
turns green only after validating six replies; the test also checks touch,
warm resume and cold reopen. This does not establish live TLS acceptance.
Set `PJM_HTTP_SURFACE_TEST=live` on the Android or iOS surface script to test
`https://example.com/` through the default native transport with normal TLS trust.
This opt-in test requires internet access and the endpoint's response to fit the
inline body limit. Set `PJM_HTTP_SURFACE_TEST=resource` for live resource reads,
or `PJM_HTTP_SURFACE_TEST=sdk-resource` for a controlled 4097-byte signed guest
using the actual SDK read/release wrappers on either host.
Simulator evidence does not establish physical-device performance.
Requests, replies and timers belong to the guest's frame pump. Disposing and
reconnecting keeps the native frame callback stable and prevents old request
IDs from completing new work. The connector bounds records to 4 KiB and pending
requests to 32. Explicit cancellation, frame timeout and disposal each send a
best-effort native cancel record for outstanding work. Mailbox failure does not
prevent local teardown; native guest retirement must also release its tasks.
Android's native mailbox has 32 records per direction and
preserves whole UTF-8 JSON lines. Both shared-engine mailboxes reject excess
requests with coded BUSY errors and cap completions at 32 entries. iOS posts
replies after the guest turn and rejects replies for replaced guests. Total
resource caps, remaining network/permission services and release policy
enforcement remain work.

```sh
pjm clean
```

`clean` removes generated `build/`, preserves source, and refuses active sessions
and symlinked output. `.pjm/` holds downloaded SDK/native caches; delete it
manually to reclaim space. Old `.pjm/flutter` caches from 0.2 are unused and can
also be deleted. Generated files are ignored by Git.

## Boundaries

Linux/macOS desktop windows,
native production release loading, keyboard/IME and accessible guest semantics are not
implemented in this native-phone version. iOS development requires macOS/Xcode.
Android's build path supports macOS/Linux SDK layouts; only macOS with an arm64
emulator has runtime evidence so far. The former Flutter
desktop preview was deliberately removed with the Flutter dependency.

This is a development container for trusted local code, not a hardened public
mini-program distribution service. Simulator transport binds to loopback;
physical transport binds only to the selected private LAN address. Both use a
random session URL. LAN traffic is development HTTP on a trusted network.
The container's bundle identity is `dev.pjm.host` on simulators and
`dev.pjm.host.<team-id>` on physical phones, with one session per device protected
by a session lock. Application package identities remain
separate. See [ECOSYSTEM.md](ECOSYSTEM.md) for what we borrow from mini-programs.

The current iOS development view composites upstream's software framebuffer.
The attached technical plan's Swift/Metal host and production container are
tracked as remaining work in [PLAN.md](PLAN.md).

## Validation

PocketJS is pinned to `fe971ebb8e14724d2a98d4df6b34c065caf11132`.
The shell entrypoint is compatible with Bash 3.2 and Linux Bash. Internal Bun
scripts use official manifest resolution, compiler and `.pocket` packaging APIs.
`build/<name>.pocket` records a resolved device snapshot; the development host
receives its JS/PAK sections. Native rendering/input reuses upstream
the Mini-owned `PocketSurfaceView` adaptation and pinned `pocket-apple` C ABI.

The complete UIKit and SDK suites passed on iPhone 16 / iOS 18.5 Simulator.
On iPhone 17 Pro / iOS 26.4 Simulator, service/protocol/SDK acceptance passed,
while repeated rotation acceptance timed out. That issue remains open; the
iOS 18.5 pass does not establish iOS 26 rotation support or physical performance.

Both native hosts now compose the pinned Rust Guest/UiSurface through Mini's
shared C interface. Installed Android renders retained DrawLists directly through
instance-owned GLES2; the development host still presents software frames.
iOS uploads them through a Swift CAMetalLayer presenter. The shared rasterizer
retains pixels and reports damage; Android uploads changed regions and Swift
accumulates damage per texture, skipping unchanged presentations. Direct
Metal DrawList rendering and broader GPU acceptance remain unfinished.
Upstream tracked files stay unchanged.

Both hosts limit each QuickJS heap to 24 MiB and release stack to 256 KiB.
Startup execution has a two-second deadline; frame execution and its Promise
jobs share a 50 ms deadline. Exhaustion reports a guest error and valid source
can restart in a fresh instance. These bounds do not cover Rust textures,
downloaded assets or total process memory, and do not establish physical
frame-rate/performance budgets. Native release capability gates remain pending.

```sh
bash tests/check.sh
bash tests/native.sh <simulator-id>
bun tests/android-smoke.ts <adb-serial>
```

Command tests verify create, automatic build, negotiated viewport/density,
reload/error recovery, stale-build rejection, shutdown, and safe cleanup.
XCTest uses actual UIKit taps and checks engine pixels, safe-area bounds,
portrait/landscape rebuilds and actual screen pixel coverage, saved-source reload, compile/runtime errors and
recovery. Pixel receipts and source-mutation routes exist only in the internal
acceptance mode. Screenshots are attached to the XCTest result bundle.
CI runs command checks on Linux/macOS and native iPhone acceptance on a fixed
macOS 15 / Xcode 16.4 / iOS 18.5 simulator. See [PLAN.md](PLAN.md).

Documentation-only pushes do not rebuild the simulator acceptance suite.

Signed iOS surface integration can be checked with
`bash tests/package-surface-ios.sh <booted-simulator-uuid>`. It requires Bun,
Rustup with the iOS simulator target, the pinned upstream checkout and Xcode.
The test rebuilds the shared engine, runs a temporary UIKit/Metal app, checks
warm guest state and unload cleanup, then removes that test app. Logs are kept
under `build/ios-validation/signed-surface-*`; it leaves simulator boot state
unchanged. This covers the signed surface adapter and installed controller;
distribution downloads and physical acceptance remain pending.

The iOS `MiniPackageStore` stages admitted signed packages in a host-owned
private directory, applies updates on cold opens, and supports deferred rollback.
`PocketSurfaceView` can open installed identities while preserving the original
package for warm guests. `tests/package-load-ios.sh` checks native installation,
reopening, rollback, tamper detection, symlink rejection and store locking; the
simulator surface test also checks that an installed update waits for a cold open.
Distribution downloads and publisher-key rotation remain pending.

`bin/installed-project.ts` provides `writeInstalledProject` for a signed-only iOS
host project from a signed payload, envelope, and separately supplied raw
32-byte Ed25519 public key. The resulting host opens installed guests through
`MiniInstalledController`; its development loader is compiled out. A bundled
seed never replaces a current or pending update. Native startup repeats package
and build-plan admission. The export includes its engine archive, uses relative
project paths, a Release build configuration and an archive-enabled scheme.

`bash tests/package-entry-ios.sh <booted-simulator-uuid>` checks the real
signed-only app entry, relaunch, and an ignored development URL override. It
keeps the simulator running and saves results under
`build/ios-validation/installed-entry-*`.

Generate a signed-only iOS host from a release directory:

```sh
pjm export-ios --package build/hello-ios.release --public-key publisher.key --output build/ios-host --target simulator
```

The public key must be the publisher's separately trusted raw 32-byte Ed25519
key. The command verifies the package, builds the shared engine and writes a
new Xcode project with its engine archive. Use `--target device` (the default)
for an iPhone project and optionally `--bundle your.company.host`. The output
folder must be new; signing and distribution are handled through Xcode.

`bash tests/package-load-android.sh <android-serial>` checks Android native
signed-package selection and plan admission, including rejection cases, policy
binding and copied guest inputs. It requires the configured Android SDK/NDK,
JDK, Bun and Rust Android target, and cleans its remote test files. Execution is
currently verified on the API 37 emulator; older Ed25519 provider compatibility
remain pending.

The Android package-loading test now also exercises `VerifiedContainer` through
JNI: signed guest execution, retained state/completions, owner checks, isolated
instances, LRU/pressure eviction, cleanup ordering and callback failure handling.
Automatic per-app storage dispatch and cleanup writes are covered too.

`bash tests/package-surface-android.sh <android-serial>` builds a temporary
signed-only Activity with bundled authenticated bytes, then checks GLES color
presentation, touch delivery, retained background/resume and a fresh launch
following close using screenshot pixel assertions. It removes its temporary
app and saves evidence under `build/android-validation/signed-surface-*`.
`InstalledActivity` uses copied software frames and a fixed viewport fitted
inside the platform surface. Android cold loading now uses a signed cache with staged updates, rollback,
reverification and cleanup of unused slots. Package file operations use native
no-follow directory traversal; adversarial parent replacement is covered by the
store test. Global cache quotas, release export, older signature-provider support and direct GPU draw-list
rendering remain pending. Current evidence uses the API 37 emulator.

Android app-data snapshots now use the same native no-follow file operations,
with per-app locks, bounded atomic writes and legacy backup recovery. Run
`bash tests/native-storage.sh <android-serial>` for native isolation, quota,
corruption and migration checks; the script cleans its temporary device files.

Export a signed-only Android host from an Android release directory:

```sh
pjm export-android --package build/hello-android.release --public-key publisher.key --output build/android-host
```

Set `ANDROID_SDK_ROOT` and `JAVA_HOME` (JDK 17), then run
`build/android-host/build-apk.sh` to produce `build/Mini-unsigned.apk` inside the
exported folder. Installed exports require SDK platform 34 and build-tools
36.0.0. The folder includes the pinned offline OkHttp Android dependency closure
and public-suffix asset, with source URLs, checksums and the Apache license.
The installed host initializes OkHttp explicitly and dispatches bounded HTTP
requests through its frame loop. The folder includes the arm64 engine, signed Activity sources,
verified package bytes and separately trusted raw 32-byte publisher public key.
It can be moved away from this checkout. Use `--bundle your.company.host` to
choose the host package identity. Sign the APK with your own Android distribution
keystore before installing; package publisher keys and APK signing keys are
separate. The export command does not sign, install or publish an app.

`bash tests/export-android.sh <booted-android-serial>` checks the real CLI export,
folder relocation (including spaces), unsigned APK build, 16 KiB alignment,
temporary APK signing and authenticated launch with an ignored development URL.
It removes its temporary app and saves an unsigned APK and evidence under
`build/android-validation/exported-host-*`. Current launch evidence uses API 37;
older signature-provider support and store submission compatibility remain open.

Android publisher signatures now use a bundled, pinned native Ed25519 verifier.
The signature test removes all system Ed25519 providers before running its
interoperability/rejection fixtures. This removes the JCA provider dependency;
older-device runtime and performance acceptance still require measurements.

Android signed inputs, service requests and stored snapshots use strict UTF-8
JSON validation before parsing. Duplicate keys and JSON extensions are rejected;
limits include depth 32, 262144 syntax tokens and 128 characters per numeric
literal, alongside existing byte quotas. Native storage/package tests cover
these limits and verify malformed service requests cannot write app data.

Run `pjm devtools` from a project with an active `pjm run` session to open the
development panel. `pjm devtools --no-open` prints its URL. The panel
shows live build status, failures, console activity, and the last 32 build outcomes
with bounded diagnostics and compiler duration. Filter activity by severity or
active revision, or pause polling to inspect a stable view. These timings do not measure save-to-device presentation. Native inspection, stepping and replay are pending.

Development console messages are forwarded to the panel as bounded records.
Messages are truncated to 512 UTF-8 bytes; hosts allow eight pending uploads,
and the panel retains the latest 32 device events. Release builds omit capture.
Startup and first-frame logs have been verified on iOS and Android simulators
through initial launch and hot restart. Physical-device acceptance remains pending.

Publish an existing signed release with a separately trusted raw 32-byte public key:

```sh
pjm publish --package build/hello-ios.release --public-key publisher.key --device ios --dry-run
pjm publish --package build/hello-ios.release --public-key publisher.key --device ios --endpoint https://distribution.example/upload
```

Set `PJM_PUBLISH_TOKEN` in the environment for uploads. The command verifies the
signed envelope, SHA-256, ABI and selected target before any network request.
It also checks internal package structure, embedded application identity and
the build plan's hash, version, viewport limits and supported capabilities.
A dry run reports identity, version, hash and size without uploading. Publishing
uses HTTPS, a 30-second deadline and no redirects. The private signing key and
trusted public key are never sent.

The distribution service contract is a multipart POST with `manifest`
(`manifest.json`, application/json) and `package` (`main.pocket`,
application/octet-stream). Authentication uses a bearer token; the
`Idempotency-Key` is `appId:version:sha256`. The service must independently
verify publisher trust and package structure, keep versions immutable, and reject
conflicting uploads (for example HTTP 409). A successful HTTP 200 or 201 response
contains exactly `{appId, version, sha256, url}` matching the upload, with a HTTPS
release URL. Receipts are limited to 16 KiB. The client rejects mismatched receipts.
No production distribution service is configured in this repository; remote
publishing and host-side distribution downloads still need integration acceptance.

The JavaScript package store, export commands and publish command parse signed
manifest bytes with strict UTF-8 JSON validation before signature verification.
Duplicate keys (including escaped equivalents), unpaired surrogates, non-finite
numbers, byte-order marks and JSON extensions are rejected. Parsing is bounded
by depth 32, 262144 value/string tokens and 128 characters per numeric literal.
Native iOS signed manifests and build plans also use strict byte validation
before Foundation parsing. Installed and development iOS service requests use
the same strict parser before dispatch, so duplicate fields cannot admit a network
operation. Native iOS and JavaScript storage snapshots also use strict byte parsing;
malformed snapshots are preserved when operations fail. Complete canonical-number
parity and client-side internal package/build-plan admission before publication
remain pending.

Expanded Android signature and authenticated package admission checks also pass
on a physical Pixel 8 Pro (API 36), including correctly signed malformed build
plans, retained engine execution and store rollback/ownership. The current installed
Activity also passes physical square-viewport rendering, letterbox input rejection,
in-viewport touch, warm resume and cold restart checks through the production
exporter. The latest run uses direct GLES DrawList rendering with per-guest
resource retirement and pause/rebind epochs. Evidence is in
`build/android-validation/signed-surface-20261005T115029Z`. Complex-page graphics,
forced Activity context-loss, performance and memory acceptance remain pending.

The replay command has a validation-only mode that checks tape syntax, package
byte identity, and optional saved comparisons without loading native code:

```sh
pjm replay --package build/hello.pocket --tape recording.json --app-id dev.pjm.hello --version 1.0.0 --validate-only
```

Validation-only output explicitly reports that native admission was not run.
The execution path uses the shared native core release library and supports
`--assert golden.json` and `--output new-golden.json`. Output creation is atomic
and refuses to overwrite existing files. Native execution of this command now
passes an end-to-end headless regression against the current release core:
three matching software frames, input/completion/lifecycle tape, PNG output,
literal tree inspection and changed-golden rejection. Run it after building the
release core with `bun tests/replay-native-cli.ts`. This does not establish mobile
hardware acceptance; host recording hooks and the replay interface are pending.

Replay has a 60-second total execution deadline, adjustable with
`--timeout-ms 1..300000`. The monotonic deadline is checked between turns and
after frame execution; it does not interrupt a synchronous native call. Native
guest turn limits remain responsible for bounding that call. Timeout closes the
engine and does not publish a successful golden.

Replay source also supports `--png-frame N --png-output new.png` to export a
selected framebuffer, including a divergent frame. PNG output preserves native
BGRA colour/alpha and refuses existing paths. Encoder and orchestration tests
pass; actual native frame capture through the command remains unverified.

Replay tree export uses `--tree-frame N --tree-output new-tree.json`. The native
inspector entry point is loaded only when tree export is requested. Snapshots
are strictly validated before exclusive persistence, preserving original node
IDs, parent/child order, text and layout. Tree capture orchestration and argument
checks pass; actual native inspector execution is still unverified.

The native SDK caps active frame timers and total service-event listeners at 256 each. Applications can configure lower `maxTimers` and `maxListeners` limits. Exceeding capacity returns `BUSY`; cancelling a timer, firing it, or removing a listener releases its slot. These SDK bounds do not establish a process-wide native memory budget.

Lifecycle hooks have a separate listener pool with the same configured `maxListeners` ceiling. Disposing the SDK stops the remaining lifecycle and service-event callbacks in the current delivery batch.

Run `bash tests/reference-check.sh` with Bun on PATH and pinned upstream dependencies installed to check SDK, reference container, publication and devtools/replay TypeScript and regressions together. This gate does not invoke native builds or devices; it cannot substitute for `tests/check.sh`, compiler integration checks or physical acceptance measurements.

`mini.location.get({timeoutMs, maximumAgeMs, highAccuracy})` defines the versioned SDK location contract. Replies contain latitude, longitude, accuracy in meters, and a Unix timestamp in milliseconds. The SDK contract is tested and the installed Android host wires native app/OS consent and FusedLocation with the original request ownership and frame-delivered replies. Android provider execution and device acceptance remain unverified; the iOS location adapter is still pending.

`bash tests/fused-location-types.sh` checks the Android location provider against checksum-pinned cached Google API AARs. It requires those exact artifacts in the Gradle cache (or `GRADLE_USER_HOME`), Android API 34 and a JDK. This separate compile-only check does not replace the bundled runtime lock, APK packaging check or pending device acceptance.

Android `LocationApproval` supplies native app consent and coarse/fine OS permission requests. It separates saved app approval from current OS grants, retires cancelled callbacks and uses non-reused OS request codes. It is wired into `InstalledActivity` and source-compiled by the Android service gate. OS results received while paused wait for foreground resume; an actual stop cancels pending work. Dialogs, permission callbacks and provider execution remain untested on a device.

`bun tests/android-location-apk.ts` builds a relocated installed export with the pinned offline Google/AndroidX runtime, resources and generated resource classes. It verifies Java compilation, dex generation and unsigned APK packaging using a deliberately non-executable engine fixture; it does not run a native engine, install an app or test location. The runtime includes compatible shared Kotlin/annotation versions and checks every extracted dependency file before export. Distribution still needs review of the original dependency metadata and licenses retained under `vendor/android-location/metadata`.

`tests/package-load-android.sh <serial>` runs signed package, retained-engine and location-wrapper checks in Android's framework runner. Current checks pass on a physical Pixel 8 Pro (API 36), including a separately authenticated location fixture with a controlled provider. The wrapper checks protocol rejection, cancellation/retirement, consent persistence guards, original reply ownership/backpressure, authorization revocation, suspend and close. They do not access the sensor, show OS/native consent dialogs or test timer expiry; those platform checks remain pending.
