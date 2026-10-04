#!/bin/bash
set -eu
ROOT=$(cd "$(dirname "$0")/.." && pwd)
TEMP=$(mktemp -d /private/tmp/pjm-native-storage.XXXXXX)
ADB="";TOKEN=$(basename "$TEMP")
cleanup() {
  if [ -n "$ADB" ]; then
    "$ADB" -s "$1" shell run-as dev.pjm.android rm -f "files/$TOKEN.zip" >/dev/null 2>&1 || true
    "$ADB" -s "$1" shell rm -f "/data/local/tmp/$TOKEN.zip" >/dev/null 2>&1 || true
  fi
  rm -rf "$TEMP"
}
SERIAL=${1:-}
trap 'cleanup "$SERIAL"' EXIT
xcrun clang -fobjc-arc -fmodules -fmodules-cache-path="$TEMP/modules" -I "$ROOT/host/ios" -framework Foundation \
  "$ROOT/host/ios/AppStorage.m" "$ROOT/tests/native-storage.m" -o "$TEMP/ios-storage"
"$TEMP/ios-storage"
if [ -z "$SERIAL" ]; then exit 0; fi
case "$SERIAL" in *[!a-zA-Z0-9_.:-]*) echo "Invalid Android serial" >&2;exit 1;; esac
SDK=${ANDROID_SDK_ROOT:-${ANDROID_HOME:-$HOME/Library/Android/sdk}}
JAVA=${JAVA_HOME:-/Library/Java/JavaVirtualMachines/jdk-17.jdk/Contents/Home}
TOOLS=${PJM_ANDROID_BUILD_TOOLS:-35.0.0}
PLATFORM=${PJM_ANDROID_PLATFORM:-android-34}
ADB="$SDK/platform-tools/adb"
"$JAVA/bin/javac" -encoding UTF-8 -source 8 -target 8 -classpath "$SDK/platforms/$PLATFORM/android.jar" \
  -d "$TEMP/classes" "$ROOT/host/android/AppStorage.java" "$ROOT/tests/NativeStorageTest.java"
"$JAVA/bin/jar" cf "$TEMP/storage.jar" -C "$TEMP/classes" .
JAVA_HOME="$JAVA" "$SDK/build-tools/$TOOLS/d8" --min-api 26 --lib "$SDK/platforms/$PLATFORM/android.jar" --output "$TEMP/storage.zip" "$TEMP/storage.jar"
"$ADB" -s "$SERIAL" push "$TEMP/storage.zip" "/data/local/tmp/$TOKEN.zip"
"$ADB" -s "$SERIAL" shell run-as dev.pjm.android cp "/data/local/tmp/$TOKEN.zip" "files/$TOKEN.zip"
"$ADB" -s "$SERIAL" shell run-as dev.pjm.android chmod 444 "files/$TOKEN.zip"
"$ADB" -s "$SERIAL" shell run-as dev.pjm.android dalvikvm -cp "files/$TOKEN.zip" dev.pjm.android.NativeStorageTest "files/$TOKEN-data"
