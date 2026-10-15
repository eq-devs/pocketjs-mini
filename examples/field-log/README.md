# Field Log example

A four-page TSX app that exercises every SDK service in one guest. Run `pjm run`
in this folder for iOS, or `pjm run --device android -d <serial>` for Android.

| Page | What it shows |
| --- | --- |
| `/` | `deviceInfo()`, live `network.watch()` chip, quick-log buttons, entry stats |
| `/log` | `VirtualList` of saved entries, newest first; tap a row to open it |
| `/entry?id=N` | Route query, `location.get()`, `media.select()` → `resources.read/release`, `clipboard.write()`, delete |
| `/lab` | Inline HTTPS (`api.github.com/zen`), streamed HTTPS resource (`example.com`, 1536-byte chunks), `clipboard.read()`, cancellation |

Entries persist under one `storage` key. Storage values are limited to 2 KiB of
JSON, so the oldest entries are dropped when the log no longer fits. Unlike the
navigation example, entries survive source reload and cold reopen; the current
page does not.

`mini.json` declares the pages, the `location`, `media` and `clipboard.read`
permissions, and the two exact HTTPS domains. Remove a declaration to see the
matching service reject with `DENIED`. Each service failure (denied, cancelled,
timed out, unsupported) is reported as a short toast instead of crashing the app.

Only one native operation runs at a time; the lab's Cancel button cancels it.
Going to the background cancels any operation still in flight.

## Standalone APK (no Mac needed)

Measure the phone's logical viewport with a `pjm run` session first; the
release bakes it in (`build/revisions/<n>/plan.json`, `"logical"`). For a
Pixel 8 Pro at default display size it is 336x692 at density 3.

```sh
pjm build --device android --release --key <ed25519-private.pem> --width 336 --height 692 --density 3
pjm export-android --package build/field-log-android.release \
  --public-key <raw-32-byte-public.key> --output build/android-host --bundle dev.pjm.fieldlog
ANDROID_SDK_ROOT=... JAVA_HOME=... build/android-host/build-apk.sh
apksigner sign --ks <keystore.jks> --out build/field-log.apk build/android-host/build/Mini-unsigned.apk
adb -s <serial> install build/field-log.apk
```

The publisher key signs the TSX package, and the host trusts only that key. The
APK keystore signs the Android app. Keep both to ship updates. `pjm clean`
deletes `build/`, so store real keys elsewhere.

## Evidence

`pjm check` passes for both platforms. On 2026-10-15 the app ran in the iOS 26.4
simulator with hot reload, rendered in the Android emulator, and launched on a
physical Pixel 8 Pro (Android 16) with no guest errors logged. The standalone
signed APK also installed and cold-launched on that Pixel (354 ms). The phone
disconnected before its screen or logs could be inspected. Under heavy
post-boot emulator load (load average about 20 on 4 vCPUs), two of three
emulator launches hit the host's 50 ms wall-clock turn limit while using only
7-24 ms of CPU. Location, photo, clipboard and HTTPS actions have not been
exercised with this example.
