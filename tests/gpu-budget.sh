#!/bin/bash
set -eu
ROOT=$(cd "$(dirname "$0")/.." && pwd)
TEMP=$(mktemp -d /private/tmp/pjm-gpu-budget.XXXXXX)
trap 'rm -rf "$TEMP"' EXIT
xcrun clang -fobjc-arc -I "$ROOT/host/ios" "$ROOT/host/ios/GpuResourceBudget.m" "$ROOT/tests/gpu-budget.m" -framework Foundation -o "$TEMP/check"
"$TEMP/check"
