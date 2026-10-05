#!/bin/bash
set -eu
ROOT=$(cd "$(dirname "$0")/.." && pwd)
TEMP=$(mktemp -d /private/tmp/pjm-native-storage.XXXXXX)
ADB="";TOKEN=$(basename "$TEMP")
cleanup() {
  if [ -n "$ADB" ]; then
    "$ADB" -s "$1" shell rm -rf "/data/local/tmp/$TOKEN" >/dev/null 2>&1 || true
  fi
  rm -rf "$TEMP"
}
SERIAL=${1:-}
trap 'cleanup "$SERIAL"' EXIT
xcrun swiftc -module-cache-path "$TEMP/swift-modules" -emit-library -emit-module -module-name Mini -emit-module-path "$TEMP/Mini.swiftmodule" -emit-objc-header -emit-objc-header-path "$TEMP/Mini-Swift.h" "$ROOT/host/ios/PackageVerifier.swift" -o "$TEMP/libMini.dylib"
xcrun clang -fobjc-arc -fmodules -fmodules-cache-path="$TEMP/modules" -I "$ROOT/host/ios" -I "$TEMP" -L "$TEMP" -lMini -Wl,-rpath,"$TEMP" -framework Foundation \
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
  -d "$TEMP/classes" "$ROOT/host/android/AppStorage.java" "$ROOT/host/android/BoundedJson.java" "$ROOT/tests/NativeJsonTest.java" "$ROOT/host/android/PackageFiles.java" "$ROOT/tests/NativeStorageTest.java"
"$JAVA/bin/jar" cf "$TEMP/storage.jar" -C "$TEMP/classes" .
JAVA_HOME="$JAVA" "$SDK/build-tools/$TOOLS/d8" --min-api 26 --lib "$SDK/platforms/$PLATFORM/android.jar" --output "$TEMP/storage.zip" "$TEMP/storage.jar"
NDK="$SDK/ndk/28.2.13676358/toolchains/llvm/prebuilt/darwin-x86_64/bin"
"$NDK/aarch64-linux-android23-clang" -Wall -Wextra -Werror -fPIC -shared -Wl,-z,max-page-size=16384 "$ROOT/host/android/store_bridge.c" -o "$TEMP/libpocketjs.so"
"$ADB" -s "$SERIAL" shell mkdir "/data/local/tmp/$TOKEN"
"$ADB" -s "$SERIAL" push "$TEMP/storage.zip" "$TEMP/libpocketjs.so" "/data/local/tmp/$TOKEN/"
"$ADB" -s "$SERIAL" shell chmod 444 "/data/local/tmp/$TOKEN/storage.zip"
"$ADB" -s "$SERIAL" shell dalvikvm "-Djava.library.path=/data/local/tmp/$TOKEN" -cp "/data/local/tmp/$TOKEN/storage.zip" dev.pjm.android.NativeStorageTest "/data/local/tmp/$TOKEN/data"
