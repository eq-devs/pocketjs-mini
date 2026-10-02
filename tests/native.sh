#!/bin/bash
set -eu
ROOT=$(cd "$(dirname "$0")/.." && pwd)
TEMP=$(mktemp -d)
cleanup() { rm -rf -- "$TEMP"; }
trap cleanup EXIT
cd "$TEMP"
"$ROOT/bin/pjm" create hello
cd hello
if [ -n "${PJM_TEST_UPSTREAM:-}" ]; then
  mkdir -p .pjm
  ln -s "$PJM_TEST_UPSTREAM" .pjm/pocketjs
fi
PJM_NATIVE_TEST=1 "$ROOT/bin/pjm" run -d "${1:?provide an iPhone simulator ID}"
