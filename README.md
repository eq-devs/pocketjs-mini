# PocketJS Mini

Write TSX, run it in a native phone container, and save to reload.
PocketJS owns QuickJS, layout and rendering. UIKit owns the window, safe area,
display link and touch. No Flutter, Dart, NativeScript or WebView is required.
PocketJS upstream is pinned and never patched.

## First run

Install Git, [Bun 1.3.11](https://bun.sh), a stable
[Rust toolchain](https://rustup.rs), and Xcode with an available iPhone simulator.
The interactive host currently runs on macOS with an iOS simulator.

```sh
git clone https://github.com/eq-devs/pocketjs-mini.git
export PATH="$PWD/pocketjs-mini/bin:$PATH"
pjm create hello
cd hello
pjm run
```

`run` selects a booted iPhone simulator, or an available one. To select explicitly:

```sh
xcrun simctl list devices available
pjm run -d <simulator-id-or-name>
```

Only `create`, `run`, and `clean` are public commands. Compilation is automatic;
there is no public `build`, `serve` or `dev` command. Tap the example to increment
its counter. Save `app/main.tsx` to rebuild/reload. Errors appear over the last
running application; a valid edit recovers. Ctrl+C stops the session and closes
its app. Quit the native app to end the attached session.

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

```sh
pjm clean
```

`clean` removes generated `build/`, preserves source, and refuses active sessions
and symlinked output. `.pjm/` holds downloaded SDK/native caches; delete it
manually to reclaim space. Old `.pjm/flutter` caches from 0.2 are unused and can
also be deleted. Generated files are ignored by Git.

## Boundaries

Android, physical iPhones (network routing/signing), Linux/macOS desktop windows,
production packaging, keyboard/IME and accessible guest semantics are not
implemented in this native-phone version. Linux can run command/compiler
validation, but `pjm run` needs the current macOS/iPhone host. The former Flutter
desktop preview was deliberately removed with the Flutter dependency.

This is a development container for trusted local code, not a hardened public
mini-program distribution service. Development transport binds to loopback and
uses a random session URL. The simulator can reach that host; physical-device
transport needs a separate design. The development app's bundle identity is
`dev.pjm.host` (one session per simulator, protected by a per-device session lock). Application package identities remain
separate. See [ECOSYSTEM.md](ECOSYSTEM.md) for what we borrow from mini-programs.

## Validation

PocketJS is pinned to `fe971ebb8e14724d2a98d4df6b34c065caf11132`.
The shell entrypoint is compatible with Bash 3.2 and Linux Bash. Internal Bun
scripts use official manifest resolution, compiler and `.pocket` packaging APIs.
`build/<name>.pocket` records a resolved device snapshot; the development host
receives its JS/PAK sections. Native rendering/input reuses upstream
`PocketSurfaceView` and `pocket-apple` directly.

```sh
bash tests/check.sh
bash tests/native.sh <simulator-id>
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
