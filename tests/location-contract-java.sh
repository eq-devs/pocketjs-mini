#!/bin/bash
set -eu
ROOT=$(cd "$(dirname "$0")/.." && pwd)
JAVA=${JAVA_HOME:-/Library/Java/JavaVirtualMachines/jdk-17.jdk/Contents/Home}
TEMP=$(mktemp -d "${TMPDIR:-/private/tmp}/pjm-location-contract.XXXXXX")
trap 'rm -rf "$TEMP"' EXIT
"$JAVA/bin/javac" --release 8 -d "$TEMP" "$ROOT/host/android/LocationContract.java" "$ROOT/host/android/LocationMailbox.java" "$ROOT/host/android/LocationRate.java" "$ROOT/host/android/LocationStops.java" "$ROOT/tests/LocationContractTest.java" "$ROOT/tests/LocationMailboxTest.java" "$ROOT/tests/LocationRateTest.java" "$ROOT/tests/LocationStopsTest.java"
"$JAVA/bin/java" -cp "$TEMP" dev.pjm.android.LocationContractTest
"$JAVA/bin/java" -cp "$TEMP" dev.pjm.android.LocationMailboxTest
"$JAVA/bin/java" -cp "$TEMP" dev.pjm.android.LocationRateTest

"$JAVA/bin/java" -cp "$TEMP" dev.pjm.android.LocationStopsTest
