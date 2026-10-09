#!/bin/bash
# Run against an already booted, explicitly selected simulator. No device boot.
set -eu
ROOT=$(cd "$(dirname "$0")/.." && pwd)
SERIAL=${1:?Pass a booted iOS simulator UUID}
EVIDENCE=${2:-$ROOT/build/ios-validation/signed-surface-$(date -u +%Y%m%dT%H%M%SZ)}
cd "$ROOT"
unset PJM_PACKAGE_REAL
export RUSTC=$(rustup which --toolchain stable rustc)
export IPHONEOS_DEPLOYMENT_TARGET=16.0
TEMP=$(mktemp -d /private/tmp/pjm-signed-surface.XXXXXX)
BUNDLE="dev.pjm.signed.surface.$(basename "$TEMP" | tr '[:upper:]' '[:lower:]')"
cleanup() {
  xcrun simctl terminate "$SERIAL" "$BUNDLE" >/dev/null 2>&1 || true
  xcrun simctl uninstall "$SERIAL" "$BUNDLE" >/dev/null 2>&1 || true
  xcrun simctl location "$SERIAL" clear >/dev/null 2>&1 || true
  rm -rf "$TEMP"
}
trap cleanup EXIT
cp "$ROOT"/host/ios/* "$TEMP/"
cp "$ROOT/core-ffi/include/mini_core.h" "$TEMP/"
cp "$ROOT/tests/SignedSurfaceApp.m" "$TEMP/main.m"
if [ "${PJM_HTTP_SURFACE_TEST:-}" = live ] || [ "${PJM_HTTP_SURFACE_TEST:-}" = resource ] || [ "${PJM_HTTP_SURFACE_TEST:-}" = resource-large ] || [ "${PJM_HTTP_SURFACE_TEST:-}" = sdk-resource ]; then
  cp "$ROOT/tests/LiveHttpApp.m" "$TEMP/main.m"
  if [ "$PJM_HTTP_SURFACE_TEST" = resource-large ] || [ "$PJM_HTTP_SURFACE_TEST" = sdk-resource ]; then cp "$ROOT/tests/ResourceHttpApp.m" "$TEMP/main.m";fi
  PJM_PACKAGE_TARGET=ios PJM_PACKAGE_HTTP_TEST="$PJM_HTTP_SURFACE_TEST" PJM_PACKAGE_VISUAL=1 bun "$ROOT/tests/package-load-fixtures.ts" "$TEMP/cases.json"
else
  PJM_PACKAGE_TARGET=ios PJM_PACKAGE_HTTP_TEST= PJM_PACKAGE_LOCATION_TEST=1 PJM_PACKAGE_LOCATION_SDK_TEST=1 bun "$ROOT/tests/package-load-fixtures.ts" "$TEMP/cases.json"
fi
export PJM_SURFACE_TEST_DIR="$TEMP" PJM_SURFACE_TEST_ROOT="$ROOT" PJM_SURFACE_TEST_BUNDLE="$BUNDLE"
bun -e 'import {writeNativeProject} from "./bin/native-project.ts";writeNativeProject(process.env.PJM_SURFACE_TEST_DIR!,"",process.env.PJM_SURFACE_TEST_ROOT!+"/core-ffi/target/aarch64-apple-ios-sim/release/libmini_core_ffi.a","http://127.0.0.1:1/",true,process.env.PJM_SURFACE_TEST_BUNDLE!)'
rustup run stable cargo build --offline --locked --release --target aarch64-apple-ios-sim --manifest-path "$ROOT/core-ffi/Cargo.toml" > "$TEMP/core-build.log" 2>&1 || { tail -60 "$TEMP/core-build.log"; exit 1; }
xcodebuild -project "$TEMP/Mini.xcodeproj" -scheme Mini -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' -derivedDataPath "$TEMP/derived" build CODE_SIGNING_ALLOWED=NO ARCHS=arm64 > "$TEMP/build.log" 2>&1 || { rg -n 'error:|warning:|BUILD FAILED' "$TEMP/build.log"; exit 1; }
APP="$TEMP/derived/Build/Products/Debug-iphonesimulator/Mini.app"
cp "$TEMP/cases.json" "$APP/cases.json"
xcrun simctl install "$SERIAL" "$APP"
xcrun simctl privacy "$SERIAL" grant location "$BUNDLE"
xcrun simctl location "$SERIAL" set 43.238949,76.889709
xcrun simctl launch --console "$SERIAL" "$BUNDLE" > "$TEMP/run.log" 2>&1 &
LAUNCH_PID=$!
for ((attempt=0;attempt<45;attempt++)); do
  if ! kill -0 "$LAUNCH_PID" 2>/dev/null; then break; fi
  sleep 1
done
if kill -0 "$LAUNCH_PID" 2>/dev/null; then kill "$LAUNCH_PID"; fi
wait "$LAUNCH_PID" || true
cat "$TEMP/run.log"
rg -q 'PJM_SIGNED_SURFACE_PASS' "$TEMP/run.log"
mkdir -p "$EVIDENCE"
cp "$TEMP/run.log" "$TEMP/build.log" "$TEMP/core-build.log" "$EVIDENCE/"
printf '%s\n' "$SERIAL" > "$EVIDENCE/simulator.txt"
