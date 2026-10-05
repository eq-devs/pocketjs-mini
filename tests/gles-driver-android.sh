#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
: "${ANDROID_SDK_ROOT:=$HOME/Library/Android/sdk}"
: "${ANDROID_NDK_ROOT:=$ANDROID_SDK_ROOT/ndk/28.2.13676358}"
: "${PJM_ANDROID_SERIAL:?Set PJM_ANDROID_SERIAL to the intended device}"
library=core-ffi/target/aarch64-linux-android/release/libmini_core_ffi.so
test -f "$library"
test_root=$(mktemp -d /private/tmp/pjm-gles.XXXXXX)
remote=/data/local/tmp/$(basename "$test_root")
adb="$ANDROID_SDK_ROOT/platform-tools/adb"
device_created=0
cleanup() {
  if [ "$device_created" = 1 ]; then "$adb" -s "$PJM_ANDROID_SERIAL" shell rm -rf "$remote"; fi
  rm -rf "$test_root"
}
trap cleanup EXIT
"$ANDROID_NDK_ROOT/toolchains/llvm/prebuilt/darwin-x86_64/bin/aarch64-linux-android23-clang" \
  tests/gles-driver-android.c -Icore-ffi/include \
  -Lcore-ffi/target/aarch64-linux-android/release -lmini_core_ffi -lEGL -lGLESv2 -o "$test_root/driver"
"$adb" -s "$PJM_ANDROID_SERIAL" shell mkdir "$remote"
device_created=1
"$adb" -s "$PJM_ANDROID_SERIAL" push "$test_root/driver" "$remote/driver"
"$adb" -s "$PJM_ANDROID_SERIAL" push "$library" "$remote/libmini_core_ffi.so"
"$adb" -s "$PJM_ANDROID_SERIAL" shell chmod 700 "$remote/driver"
"$adb" -s "$PJM_ANDROID_SERIAL" shell "LD_LIBRARY_PATH=$remote $remote/driver"
