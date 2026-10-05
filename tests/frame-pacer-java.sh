#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
JAVA=${JAVA_HOME:-/Library/Java/JavaVirtualMachines/jdk-17.jdk/Contents/Home}
test_root=$(mktemp -d /private/tmp/pjm-pacer.XXXXXX)
trap 'rm -rf "$test_root"' EXIT
"$JAVA/bin/javac" -d "$test_root" host/android/FramePacer.java host/android/FrameMeasurements.java tests/FramePacerTest.java
"$JAVA/bin/java" -cp "$test_root" dev.pjm.android.FramePacerTest
