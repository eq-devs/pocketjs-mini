# PocketJS Mini

Write TypeScript/JSX, run it inside Flutter, and save to reload. PocketJS
executes the guest in **native QuickJS** and renders the pixels; Flutter
presents those pixels and forwards touch. Upstream is never patched.

## Install and run

Install [Bun 1.3.11](https://bun.sh), [Flutter 3.41.5](https://docs.flutter.dev/install),
Git and a stable [Rust/Cargo toolchain](https://rustup.rs). Flutter's normal
platform requirements apply: Xcode for macOS/iOS, GTK build tools for Linux.

```sh
git clone https://github.com/eq-devs/pocketjs-mini.git
export PATH="$PWD/pocketjs-mini/bin:$PATH"
pjm create hello
cd hello
pjm run
```

On macOS this opens the Flutter desktop host. On Linux it opens the Linux host.
Edit `app/main.tsx` and save: compilation and app reload happen automatically.
Tap/click the example to increment its counter. Compile and guest errors appear
in the Flutter window; fix the source and save to recover. Reload creates a
fresh guest realm, so application state resets. This is automatic reload, not
state-preserving hot reload.

There are only three public commands: `create`, `run`, and `clean`. Compilation
is part of `run`; **there is no public `build` command**.

## Run on an iPhone simulator

Install an iOS simulator runtime in Xcode and the matching Rust target:

```sh
rustup target add --toolchain stable aarch64-apple-ios-sim
flutter devices
pjm run -d <simulator-id>
```

Intel Macs use `x86_64-apple-ios`. The host connects to the local development
server, loads the app, and runs it natively inside the simulator. Validation
includes boot, two taps changing the guest framebuffer, saved-source reload,
visible compile/runtime errors, and recovery. A physical iPhone has different
network/signing requirements and is not covered by simulator evidence.

This version supports macOS, Linux and iOS simulator development. Android and
Windows are not wired up yet. Neither production mobile packaging nor App Store
submission is part of this development workflow.

## Small projects

```text
hello/
  app/main.tsx
  assets/
  mini.json
  tsconfig.json
```

`mini.json` contains the app name. Names start with a lowercase letter and
contain lowercase letters, digits or hyphens, at most 48 characters. Existing
destinations are refused. Place resources in `assets/` and reference image
paths relative to the entry, such as `../assets/logo.png`. Extend the small
TypeScript import map when using additional framework modules.

First run downloads the pinned upstream and installs its dependencies in
`.pjm/pocketjs`, then generates a disposable Flutter host in `.pjm/flutter`.
It also builds the native bridge and installs missing stable Rust target components
(macOS Flutter builds can request both arm64 and x64). This requires internet access and can take a
few minutes. Subsequent runs reuse these caches. You do not edit Flutter's
platform projects to develop the TSX app.

The current embedded profile is `ios-dev`, with a fixed 480×272 logical viewport
and density 1. Desktop preview uses the same contract. Software framebuffer
presentation proves the integration; GPU textures, responsive phone viewports,
multitouch and native phone services are future work. Input currently forwards
one contact, including cancellation; the engine receives touches in logical
coordinates after Flutter scales the displayed surface.

`run` checks types, resolves the official profile, invokes `tools/build.ts`, and
uses official packaging/validation APIs. It writes `build/<name>.pocket` and
immutable revision artifacts. A loopback-only development server delivers
validated JS/PAK sections to the Flutter host through a per-session random URL.
Compilation is serialized and changed snapshots are discarded before publication.
Source and asset contents are checked every 300ms. Invalid edits preserve the
last running application and expose the error. There is no browser/WebView in
this execution path.

Quit the Flutter session or press Ctrl+C to stop. Then:

```sh
pjm clean
```

`clean` removes `build/`, preserves source and refuses symlinked output.
`.pjm/` holds downloaded dependencies and Flutter/native caches; delete it
manually to reclaim space. Generated files and caches are ignored by Git.

## Development and validation

The executable `bin/pjm` supports macOS Bash 3.2 and Linux Bash.
`bin/runtime.ts` is an internal compiler/watcher/launcher, and `host/` contains
the small Flutter/native adapter. PocketJS is fixed at
`fe971ebb8e14724d2a98d4df6b34c065caf11132`. Its tracked files are untouched;
its official tools create ignored caches/styles. Rust dependencies start from
the pinned upstream lockfile, and Flutter dependencies have a committed lockfile.

```sh
bash tests/check.sh
bash tests/flutter.sh macos
# Or, with a simulator already booted:
bash tests/flutter.sh <simulator-id>
```

Test scripts use disposable projects. Native tests verify QuickJS boot, pixels,
touch changes, error reporting and disposal. Flutter integration tests exercise
pointer forwarding, source reload and visible error recovery. GitHub Actions
runs command checks plus native/interactive checks on Linux and macOS and a
separate iPhone simulator job. See [PLAN.md](PLAN.md) for the acceptance audit.
