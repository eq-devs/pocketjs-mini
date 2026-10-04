#!/bin/bash
set -eu
ROOT=$(cd "$(dirname "$0")/.." && pwd)
TEST_DIR=$(mktemp -d)
trap 'rm -rf "$TEST_DIR"' EXIT
cc -std=c11 -Wall -Wextra -Werror -pthread -I"$ROOT/host/android" "$ROOT/host/android/svcwire.c" "$ROOT/tests/service-wire.c" -o "$TEST_DIR/service-wire"
"$TEST_DIR/service-wire"
