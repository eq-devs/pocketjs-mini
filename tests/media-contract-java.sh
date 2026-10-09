#!/bin/bash
set -eu
ROOT=$(cd "$(dirname "$0")/.." && pwd)
JAVA=${JAVA_HOME:-/Library/Java/JavaVirtualMachines/jdk-17.jdk/Contents/Home}
TEMP=$(mktemp -d /private/tmp/pjm-media-contract.XXXXXX)
trap 'rm -rf "$TEMP"' EXIT
"$JAVA/bin/javac" --release 8 -d "$TEMP" "$ROOT/host/android/MediaContract.java" "$ROOT/tests/MediaContractTest.java" "$ROOT/host/android/MediaInput.java" "$ROOT/tests/MediaInputTest.java"
"$JAVA/bin/java" -cp "$TEMP" dev.pjm.android.MediaContractTest

"$JAVA/bin/java" -cp "$TEMP" dev.pjm.android.MediaInputTest
