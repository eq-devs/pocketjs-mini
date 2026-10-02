#!/bin/bash
set -eu
ROOT=$(cd "$(dirname "$0")/.." && pwd)
tmp=$(mktemp -d)
server=''
controller=''
cleanup() {
  [ -z "$controller" ] || kill "$controller" 2>/dev/null || true
  [ -z "$server" ] || kill "$server" 2>/dev/null || true
  [ -z "$controller" ] || wait "$controller" 2>/dev/null || true
  [ -z "$server" ] || wait "$server" 2>/dev/null || true
  rm -rf "$tmp"
}
trap cleanup EXIT
cd "$tmp"
"$ROOT/bin/pjm" create hello
cd hello
if [ -n "${PJM_TEST_UPSTREAM:-}" ]; then
  mkdir .pjm
  ln -s "$PJM_TEST_UPSTREAM" .pjm/pocketjs
fi
PJM_TEST_SERVER=1 "$ROOT/bin/pjm" run > "$tmp/run.log" 2>&1 &
server=$!
for attempt in $(seq 1 180); do
  if [ -f build/session.json ]; then
    url=$(bun -e 'console.log((await Bun.file("build/session.json").json()).url)')
    if bun -e 'const s=await(await fetch(Bun.argv[1]+"state")).json();process.exit(s.revision>0&&!s.error?0:1)' "$url"; then break; fi
  fi
  kill -0 "$server" 2>/dev/null || { cat "$tmp/run.log"; exit 1; }
  sleep 1
done
test -s build/revisions/1/app.js || { cat "$tmp/run.log"; exit 1; }
flutter create --empty --no-pub --platforms=macos,ios,linux --project-name=pjm_host .pjm/flutter
cp -R "$ROOT/host/." .pjm/flutter/
printf '%s\n' "$PWD/.pjm/pocketjs" > .pjm/flutter/upstream.txt
bun -e 'await Bun.write(".pjm/flutter/toolchain.json",JSON.stringify({cargo:Bun.which("cargo"),environment:Object.fromEntries(["PATH","CARGO_HOME","RUSTUP_HOME","LIBCLANG_PATH"].flatMap(k=>process.env[k]?[[k,process.env[k]]]:[]))}))'
PJM_BUNDLE_DIR="$PWD/build/revisions/1"
export PJM_BUNDLE_DIR
bun "$ROOT/tests/controller.ts" "$PWD" &
controller=$!
for attempt in $(seq 1 30); do
  [ ! -f .pjm/control.json ] || break
  sleep 1
done
control=$(bun -e 'console.log((await Bun.file(".pjm/control.json").json()).url)')
cd .pjm/flutter
flutter pub get
flutter analyze
flutter test test/native_test.dart
if [ "$#" -gt 0 ]; then
  bun "$ROOT/tests/run-flutter.ts" integration_test/boot_test.dart -d "$1" --dart-define="PJM_URL=$url" --dart-define="PJM_TEST_CONTROL=$control"
fi
cat "$tmp/run.log"
