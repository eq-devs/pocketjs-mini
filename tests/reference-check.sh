#!/bin/bash
set -eu
ROOT=$(cd "$(dirname "$0")/.." && pwd)
echo 'Checking reference/SDK/devtools sources only; native runtime and device acceptance are excluded.'
bun "$ROOT/tests/sdk-typecheck.ts"
bun "$ROOT/tests/replay-typecheck.ts"
bun test \
 "$ROOT/tests/sdk.node.test.ts" "$ROOT/tests/native-sdk.node.test.ts" \
 "$ROOT/tests/clipboard-sdk.test.ts" "$ROOT/tests/location-sdk.test.ts" "$ROOT/tests/sdk-install.node.test.ts" \
 "$ROOT/tests/package.node.test.ts" "$ROOT/tests/store.node.test.ts" \
 "$ROOT/tests/storage.node.test.ts" "$ROOT/tests/permissions.node.test.ts" \
 "$ROOT/tests/strict-json.test.ts" "$ROOT/tests/bounded-file.test.ts" "$ROOT/tests/atomic-file.test.ts" \
 "$ROOT/tests/pocket-inputs.test.ts" "$ROOT/tests/package-hash.test.ts" "$ROOT/tests/publish.test.ts" \
 "$ROOT/tests/installed-project.test.ts" "$ROOT/tests/installed-android-project.test.ts" "$ROOT/tests/android-location-runtime.test.ts" \
 "$ROOT/tests/replay.test.ts" "$ROOT/tests/replay-cleanup.test.ts" "$ROOT/tests/replay-cli.test.ts" \
 "$ROOT/tests/replay-plan.test.ts" "$ROOT/tests/replay-tree.test.ts" "$ROOT/tests/replay-png.test.ts" \
 "$ROOT/tests/tape.test.ts" "$ROOT/tests/golden.test.ts" "$ROOT/tests/recorder.test.ts" \
 "$ROOT/tests/development-console.test.ts" "$ROOT/tests/devtools-panel.test.ts" \
 "$ROOT/tests/build-history.test.ts" "$ROOT/tests/device-events.test.ts" "$ROOT/tests/android-launch.test.ts"
echo 'Reference checks passed. Native builds, service execution, compiler integration and physical acceptance still require their own checks.'
