#!/bin/bash
set -eu
ROOT=$(cd "$(dirname "$0")/.." && pwd)
LIBRARY=${1:-$ROOT/core-ffi/target/debug}
TEMP=$(mktemp -d /private/tmp/pjm-metal-driver.XXXXXX)
trap 'rm -rf "$TEMP"' EXIT
xcrun clang -fobjc-arc -I "$ROOT/core-ffi/include" -I "$ROOT/host/ios" "$ROOT/host/ios/DirectMetalRenderer.m" "$ROOT/host/ios/GpuResourceBudget.m" "$ROOT/tests/metal-driver.m" -L "$LIBRARY" -lmini_core_ffi -Wl,-rpath,"$LIBRARY" -framework Foundation -framework Metal -o "$TEMP/check"
"$TEMP/check"
