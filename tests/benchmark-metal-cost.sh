#!/bin/bash
set -eu
ROOT=$(cd "$(dirname "$0")/.." && pwd)
PAYLOAD=${1:?Compiled iOS benchmark package required}
LIBRARY=${2:-$ROOT/core-ffi/target/release}
TEMP=$(mktemp -d /private/tmp/pjm-metal-cost.XXXXXX)
trap 'rm -rf "$TEMP"' EXIT
xcrun clang -O2 -fobjc-arc -I "$ROOT/core-ffi/include" -I "$ROOT/host/ios" "$ROOT/host/ios/DirectMetalRenderer.m" "$ROOT/host/ios/GpuResourceBudget.m" "$ROOT/tests/benchmark-metal-cost.m" -L "$LIBRARY" -lmini_core_ffi -Wl,-rpath,"$LIBRARY" -framework Foundation -framework Metal -o "$TEMP/check"
"$TEMP/check" "$PAYLOAD"
