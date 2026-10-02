#!/bin/bash
set -eu
ROOT=$(cd "$(dirname "$0")/.." && pwd)
bash -n "$ROOT/bin/pjm"
bun test "$ROOT/tests/dev.test.ts" "$ROOT/tests/devices.test.ts"
