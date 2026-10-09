#!/bin/bash
set -eu
ROOT=$(cd "$(dirname "$0")/.." && pwd)
bash -n "$ROOT/bin/pjm"
if [ "$(uname -s)" = Darwin ]; then bash "$ROOT/tests/ios-service-types.sh"; fi
if [ "$(uname -s)" = Darwin ]; then bash "$ROOT/tests/location-contract-java.sh"; fi
if [ "$(uname -s)" = Darwin ]; then bash "$ROOT/tests/media-contract-java.sh"; fi
if [ "$(uname -s)" = Darwin ]; then bash "$ROOT/tests/native-media-image-ios.sh"; fi
if [ "$(uname -s)" = Darwin ]; then bash "$ROOT/tests/frame-pacer-java.sh"; fi
if [ "$(uname -s)" = Darwin ]; then bash "$ROOT/tests/contact-latch.sh"; fi
if [ "$(uname -s)" = Darwin ]; then bash "$ROOT/tests/gpu-budget.sh"; fi
bun "$ROOT/tests/replay-typecheck.ts"
bun "$ROOT/tests/sdk-typecheck.ts"
bun test "$ROOT/tests/replay-cleanup.test.ts"
bun test "$ROOT/tests/recording-input.test.ts"
bun test "$ROOT/tests/inspection.test.ts"
bun test "$ROOT/tests/pocket-inputs.test.ts"
bash "$ROOT/tests/service-wire.sh"
if [ "$(uname -s)" = Darwin ]; then bash "$ROOT/tests/native-storage.sh"; fi
if [ "$(uname -s)" = Darwin ]; then bash "$ROOT/tests/package-native.sh"; fi
if [ "$(uname -s)" = Darwin ]; then bash "$ROOT/tests/native-core.sh"; fi
bun test "$ROOT/tests/replay-tree.test.ts" "$ROOT/tests/replay-png.test.ts" "$ROOT/tests/replay-cli.test.ts" "$ROOT/tests/replay-plan.test.ts" "$ROOT/tests/golden.test.ts" "$ROOT/tests/recorder.test.ts" "$ROOT/tests/replay.test.ts" "$ROOT/tests/tape.test.ts" "$ROOT/tests/strict-json.test.ts" "$ROOT/tests/bounded-file.test.ts" "$ROOT/tests/atomic-file.test.ts" "$ROOT/tests/publish.test.ts" "$ROOT/tests/devtools-panel.test.ts" "$ROOT/tests/build-history.test.ts" "$ROOT/tests/device-events.test.ts" "$ROOT/tests/package-hash.test.ts" "$ROOT/tests/development-console.test.ts" "$ROOT/tests/android-launch.test.ts"
if [ "$(uname -s)" = Darwin ]; then
  PJM_TEST_NATIVE_REPLAY=1 bun test "$ROOT/tests/dev.test.ts" "$ROOT/tests/devices.test.ts"
else
  bun test "$ROOT/tests/dev.test.ts" "$ROOT/tests/devices.test.ts"
fi
bun test "$ROOT/tests/sdk.node.test.ts"
bun test "$ROOT/tests/native-sdk.node.test.ts"
bun test "$ROOT/tests/clipboard-sdk.test.ts"
bun test "$ROOT/tests/location-sdk.test.ts"
bun test "$ROOT/tests/network-sdk.test.ts"
bun test "$ROOT/tests/media-sdk.test.ts"
bun test "$ROOT/tests/sdk-install.node.test.ts"
bun test "$ROOT/tests/package.node.test.ts"
bun test "$ROOT/tests/store.node.test.ts"
bun test "$ROOT/tests/permissions.node.test.ts"
bun test "$ROOT/tests/storage.node.test.ts"
bun test "$ROOT/tests/build.test.ts"
bun test "$ROOT/tests/installed-project.test.ts"
bun test "$ROOT/tests/installed-android-project.test.ts"
bun test "$ROOT/tests/android-http.node.test.ts"
bun test "$ROOT/tests/android-location-runtime.test.ts"
