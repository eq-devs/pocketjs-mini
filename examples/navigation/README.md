# Navigation example

Run `pjm run` in this folder for iOS, or `pjm run --device android -d <serial>`
for Android. The launcher installs the pinned dependencies and generated SDK.

Increment the counter, open the detail page, and return with its button. On
Android, the system Back button also returns home; another Back exits the
native host. The route query displays item 42. Both routes share one guest and
the counter survives page changes and background/resume. A source reload or
cold reopen creates a fresh guest and resets the counter.

This example uses the SDK page stack and a Solid signal to render the current
route. It does not spawn one engine per page or persist state to storage.

Native acceptance runners are `tests/navigation-native-ios.ts <simulator UUID>`
and `tests/navigation-native-android.ts <adb serial>`, executed with Bun from the
repository root and the platform's existing toolchain. They create temporary
projects, drive real touches, retain screenshots and clean up owned sessions.
iOS simulator and Android emulator runs passed on 2026-10-09; this is not a
physical-device performance claim.

Signed installed-host runners are `tests/navigation-signed-ios.ts <simulator UUID>`
and `tests/navigation-signed-android.ts <adb serial>`. They compile the example
with a test-only observer that writes route/query/counter proof through normal
SDK storage, sign it with a temporary publisher key, and exercise inherited
production authentication, services, rendering and input. The private key is
not saved. A test-only native subclass exposes storage proof for assertions;
the shipping example does not include this observer. These runners use local
signed assets rather than a development server and remove their temporary app.


Signed acceptance also appends a test-only network watcher and stores its
validated native snapshot for assertions. This does not change the example's
visible UI. `PJM_NETWORK_TOGGLE=1` enables Android offline/restored event checks;
use it only with a disposable emulator. The runner preserves its original
Wi-Fi/mobile-data settings and restores them before cleanup. This option is
rejected for physical serials.
