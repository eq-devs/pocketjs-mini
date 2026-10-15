#!/bin/bash
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/.." && pwd)
payload=${1:?Compiled iOS benchmark required}
prefix=${2:?Evidence filename prefix required}
density=${3:?Density 1 or 3 required}
case "$density" in 1|3) ;; *) echo 'Use density 1 or 3' >&2;exit 1;; esac
library=${4:-$ROOT/core-ffi/target/release}
scene=${5:-}
case "$scene" in ""|form) ;; *) echo "Use the scroll default or form scene" >&2;exit 1;; esac
temporary=$(mktemp -d /private/tmp/pjm-metal-parity.XXXXXX)
trap 'rm -rf "$temporary"' EXIT
xcrun clang -O2 -fobjc-arc -I "$ROOT/core-ffi/include" -I "$ROOT/host/ios" "$ROOT/host/ios/DirectMetalRenderer.m" "$ROOT/host/ios/GpuResourceBudget.m" "$ROOT/tests/benchmark-metal-parity.m" -L "$library" -lmini_core_ffi -Wl,-rpath,"$library" -framework Foundation -framework Metal -o "$temporary/check"
if [ "$scene" = form ];then "$temporary/check" "$payload" "$prefix" "$density" form;else "$temporary/check" "$payload" "$prefix" "$density";fi
