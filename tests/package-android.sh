#!/bin/bash
set -eu
ROOT=$(cd "$(dirname "$0")/.." && pwd)
SERIAL=${1:?Android serial required}
case "$SERIAL" in *[!a-zA-Z0-9_.:-]*) exit 2;; esac
TEMP=$(mktemp -d /private/tmp/pjm-package-android.XXXXXX)
TOKEN=$(basename "$TEMP")
SDK=${ANDROID_SDK_ROOT:-${ANDROID_HOME:-$HOME/Library/Android/sdk}}
JAVA=${JAVA_HOME:-/Library/Java/JavaVirtualMachines/jdk-17.jdk/Contents/Home}
ADB="$SDK/platform-tools/adb"
cleanup(){ "$ADB" -s "$SERIAL" shell rm -f "/data/local/tmp/$TOKEN.zip" "/data/local/tmp/$TOKEN.json" >/dev/null 2>&1 || true; rm -rf "$TEMP"; }
trap cleanup EXIT
bun "$ROOT/tests/package-native-fixtures.ts" "$TEMP/cases.json"
"$JAVA/bin/javac" -source 8 -target 8 -classpath "$SDK/platforms/android-34/android.jar" -d "$TEMP/classes" "$ROOT/host/android/PackageVerifier.java" "$ROOT/tests/NativePackageTest.java"
"$JAVA/bin/jar" cf "$TEMP/check.jar" -C "$TEMP/classes" .
JAVA_HOME="$JAVA" "$SDK/build-tools/35.0.0/d8" --min-api 26 --lib "$SDK/platforms/android-34/android.jar" --output "$TEMP/check.zip" "$TEMP/check.jar"
"$ADB" -s "$SERIAL" push "$TEMP/check.zip" "/data/local/tmp/$TOKEN.zip"
"$ADB" -s "$SERIAL" push "$TEMP/cases.json" "/data/local/tmp/$TOKEN.json"
"$ADB" -s "$SERIAL" shell chmod 444 "/data/local/tmp/$TOKEN.zip"
"$ADB" -s "$SERIAL" shell dalvikvm -cp "/data/local/tmp/$TOKEN.zip" dev.pjm.android.NativePackageTest "/data/local/tmp/$TOKEN.json"
