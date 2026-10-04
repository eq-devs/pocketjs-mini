#!/bin/bash
set -eu
ROOT=$(cd "$(dirname "$0")/.." && pwd)
bash -n "$ROOT/bin/pjm"
bash "$ROOT/tests/service-wire.sh"
if [ "$(uname -s)" = Darwin ]; then bash "$ROOT/tests/native-storage.sh"; fi
if [ "$(uname -s)" = Darwin ]; then bash "$ROOT/tests/package-native.sh"; fi
bun test "$ROOT/tests/dev.test.ts" "$ROOT/tests/devices.test.ts"
bun test "$ROOT/tests/sdk.node.test.ts"
bun test "$ROOT/tests/native-sdk.node.test.ts"
bun test "$ROOT/tests/sdk-install.node.test.ts"
bun test "$ROOT/tests/package.node.test.ts"
bun test "$ROOT/tests/store.node.test.ts"
bun test "$ROOT/tests/storage.node.test.ts"
bun test "$ROOT/tests/build.test.ts"
bun test "$ROOT/tests/installed-project.test.ts"
