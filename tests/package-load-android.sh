#!/bin/bash
set -eu
ROOT=$(cd "$(dirname "$0")/.." && pwd)
SERIAL=${1:?Android serial required}
case "$SERIAL" in *[!a-zA-Z0-9_.:-]*) exit 2;; esac
TEMP=$(mktemp -d /private/tmp/pjm-package-load-android.XXXXXX)
TOKEN=$(basename "$TEMP")
SDK=${ANDROID_SDK_ROOT:-${ANDROID_HOME:-$HOME/Library/Android/sdk}}
JAVA=${JAVA_HOME:-/Library/Java/JavaVirtualMachines/jdk-17.jdk/Contents/Home}
NDK="$SDK/ndk/28.2.13676358/toolchains/llvm/prebuilt/darwin-x86_64/bin"
ADB="$SDK/platform-tools/adb"
cleanup(){ "$ADB" -s "$SERIAL" shell rm -rf "/data/local/tmp/$TOKEN" >/dev/null 2>&1 || true;rm -rf "$TEMP"; }
trap cleanup EXIT
PJM_PACKAGE_TARGET=android PJM_PACKAGE_REAL= bun "$ROOT/tests/package-load-fixtures.ts" "$TEMP/cases.json"
export RUSTC=$(rustup which --toolchain stable rustc)
export CARGO_TARGET_AARCH64_LINUX_ANDROID_LINKER="$NDK/aarch64-linux-android23-clang"
export RUSTFLAGS="${RUSTFLAGS:-} -C link-arg=-Wl,-z,max-page-size=16384"
export CC_aarch64_linux_android="$NDK/aarch64-linux-android23-clang" AR_aarch64_linux_android="$NDK/llvm-ar"
export BINDGEN_EXTRA_CLANG_ARGS_aarch64_linux_android="--target=aarch64-linux-android23 --sysroot=$NDK/../sysroot"
export LIBCLANG_PATH=/Applications/Xcode.app/Contents/Developer/Toolchains/XcodeDefault.xctoolchain/usr/lib
rustup run stable cargo build --offline --locked --release --manifest-path "$ROOT/core-ffi/Cargo.toml" --target aarch64-linux-android
"$NDK/aarch64-linux-android23-clang" -Wall -Wextra -Werror -fPIC -shared -Wl,--gc-sections -Wl,--exclude-libs,ALL -Wl,--no-undefined -Wl,-z,max-page-size=16384 -I "$ROOT/core-ffi/include" "$ROOT/host/android/package_bridge.c" "$ROOT/host/android/pool_bridge.c" "$ROOT/host/android/store_bridge.c" "$ROOT/core-ffi/target/aarch64-linux-android/release/libmini_core_ffi.a" -ldl -lm -llog -o "$TEMP/libpocketjs.so"
"$JAVA/bin/javac" -source 8 -target 8 -classpath "$SDK/platforms/android-34/android.jar" -d "$TEMP/classes" "$ROOT/host/android/PackageVerifier.java" "$ROOT/host/android/BoundedJson.java" "$ROOT/tests/NativeJsonTest.java" "$ROOT/host/android/VerifiedPackage.java" "$ROOT/host/android/VerifiedContainer.java" "$ROOT/host/android/AppStorage.java" "$ROOT/host/android/PackageStore.java" "$ROOT/host/android/PackageFiles.java" "$ROOT/tests/NativePackageStoreTest.java" "$ROOT/tests/NativePackageLoadTest.java" "$ROOT/host/android/VerifiedClipboard.java" "$ROOT/host/android/PermissionGate.java" "$ROOT/tests/NativeClipboardTest.java"
"$JAVA/bin/jar" cf "$TEMP/check.jar" -C "$TEMP/classes" .
JAVA_HOME="$JAVA" "$SDK/build-tools/35.0.0/d8" --min-api 26 --lib "$SDK/platforms/android-34/android.jar" --output "$TEMP/check.zip" "$TEMP/check.jar"
"$ADB" -s "$SERIAL" shell mkdir "/data/local/tmp/$TOKEN"
for file in libpocketjs.so check.zip cases.json; do "$ADB" -s "$SERIAL" push "$TEMP/$file" "/data/local/tmp/$TOKEN/$file"; done
"$ADB" -s "$SERIAL" shell chmod 444 "/data/local/tmp/$TOKEN/check.zip"
"$ADB" -s "$SERIAL" shell dalvikvm "-Djava.library.path=/data/local/tmp/$TOKEN" -cp "/data/local/tmp/$TOKEN/check.zip" dev.pjm.android.NativePackageLoadTest "/data/local/tmp/$TOKEN/cases.json"
