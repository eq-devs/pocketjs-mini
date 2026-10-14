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
cleanup(){ if [ -n "${TLS_PORT:-}" ]; then "$ADB" -s "$SERIAL" reverse --remove "tcp:$TLS_PORT" >/dev/null 2>&1 || true;fi; "$ADB" -s "$SERIAL" shell rm -rf "/data/local/tmp/$TOKEN" >/dev/null 2>&1 || true;rm -rf "$TEMP"; }
trap cleanup EXIT
PJM_PACKAGE_TARGET=android PJM_PACKAGE_LOCATION_TEST=1 PJM_PACKAGE_REAL= bun "$ROOT/tests/package-load-fixtures.ts" "$TEMP/cases.json"
if [ -n "${PJM_PACKAGE_LOAD_EVIDENCE:-}" ]; then mkdir -p "$PJM_PACKAGE_LOAD_EVIDENCE";cp "$TEMP/cases.json" "$PJM_PACKAGE_LOAD_EVIDENCE/cases.json";fi
export RUSTC=$(rustup which --toolchain stable rustc)
export CARGO_TARGET_AARCH64_LINUX_ANDROID_LINKER="$NDK/aarch64-linux-android23-clang"
export RUSTFLAGS="${RUSTFLAGS:-} -C link-arg=-Wl,-z,max-page-size=16384"
export CC_aarch64_linux_android="$NDK/aarch64-linux-android23-clang" AR_aarch64_linux_android="$NDK/llvm-ar"
export BINDGEN_EXTRA_CLANG_ARGS_aarch64_linux_android="--target=aarch64-linux-android23 --sysroot=$NDK/../sysroot"
export LIBCLANG_PATH=/Applications/Xcode.app/Contents/Developer/Toolchains/XcodeDefault.xctoolchain/usr/lib
rustup run stable cargo build --offline --locked --release --manifest-path "$ROOT/core-ffi/Cargo.toml" --target aarch64-linux-android
LOAD_C_SOURCES=("$ROOT/host/android/package_bridge.c")
LOAD_JAVA_SOURCES=("$ROOT/tests/NativePackageLoadTest.java")
TEST_MAIN=dev.pjm.android.NativePackageLoadTest
if [ "${PJM_TEST_MISSING_WEAK_IMPORTS:-0}" = 1 ]; then
  LOAD_C_SOURCES+=("$ROOT/tests/native-weak-imports.c")
  LOAD_JAVA_SOURCES+=("$ROOT/tests/NativeWeakImportsTest.java")
  TEST_MAIN=dev.pjm.android.NativeWeakImportsTest
fi
"$NDK/aarch64-linux-android23-clang" -Wall -Wextra -Werror -fPIC -shared -Wl,--gc-sections -Wl,--exclude-libs,ALL -Wl,--no-undefined -Wl,-z,max-page-size=16384 -I "$ROOT/core-ffi/include" "${LOAD_C_SOURCES[@]}" "$ROOT/host/android/pool_bridge.c" "$ROOT/host/android/store_bridge.c" "$ROOT/core-ffi/target/aarch64-linux-android/release/libmini_core_ffi.a" -lEGL -lGLESv2 -ldl -lm -llog -o "$TEMP/libpocketjs.so"
if [ "${PJM_TEST_MISSING_WEAK_IMPORTS:-0}" = 1 ]; then
  bun "$ROOT/tests/missing-weak-imports.ts" "$TEMP/libpocketjs.so"
  if [ -n "${PJM_PACKAGE_LOAD_EVIDENCE:-}" ]; then cp "$TEMP/libpocketjs.so" "$PJM_PACKAGE_LOAD_EVIDENCE/weak-missing.so";fi
fi
"$JAVA/bin/javac" -source 8 -target 8 -classpath "$SDK/platforms/android-34/android.jar:$ROOT/vendor/android-http/*" -d "$TEMP/classes" "$ROOT/host/android/PackageVerifier.java" "$ROOT/host/android/BoundedJson.java" "$ROOT/tests/NativeJsonTest.java" "$ROOT/host/android/VerifiedPackage.java" "$ROOT/host/android/VerifiedContainer.java" "$ROOT/host/android/AppStorage.java" "$ROOT/host/android/PackageStore.java" "$ROOT/host/android/PackageFiles.java" "$ROOT/tests/NativePackageStoreTest.java" "$ROOT/host/android/PackageDownload.java" "$ROOT/tests/NativePackageDownloadTest.java" "$ROOT/tests/NativePackageDownloadTlsTest.java" "${LOAD_JAVA_SOURCES[@]}" "$ROOT/tests/NativeGpuCloseTest.java" "$ROOT/host/android/VerifiedClipboard.java" "$ROOT/host/android/PermissionGate.java" "$ROOT/tests/NativeClipboardTest.java" "$ROOT/tests/NativeLocationTest.java" "$ROOT/host/android/VerifiedLocation.java" "$ROOT/host/android/LocationContract.java" "$ROOT/host/android/LocationMailbox.java" "$ROOT/host/android/LocationRate.java" "$ROOT/host/android/LocationStops.java"
"$JAVA/bin/jar" cf "$TEMP/check.jar" -C "$TEMP/classes" .
JAVA_HOME="$JAVA" "$SDK/build-tools/35.0.0/d8" --min-api 26 --lib "$SDK/platforms/android-34/android.jar" --output "$TEMP/check.zip" "$TEMP/check.jar" "$ROOT"/vendor/android-http/*.jar
"$ADB" -s "$SERIAL" shell mkdir "/data/local/tmp/$TOKEN"
for file in libpocketjs.so check.zip cases.json; do "$ADB" -s "$SERIAL" push "$TEMP/$file" "/data/local/tmp/$TOKEN/$file"; done
"$ADB" -s "$SERIAL" shell chmod 444 "/data/local/tmp/$TOKEN/check.zip"
"$ADB" -s "$SERIAL" shell "CLASSPATH=/data/local/tmp/$TOKEN/check.zip" /system/bin/app_process "-Djava.library.path=/data/local/tmp/$TOKEN" /system/bin "$TEST_MAIN" "/data/local/tmp/$TOKEN/cases.json"

if [ -n "${PJM_DOWNLOAD_TLS_URL:-}" ]; then
  [[ "$PJM_DOWNLOAD_TLS_URL" =~ ^https://127\.0\.0\.1:([0-9]{1,5})$ ]] || { echo 'TLS fixture must use an owned loopback port' >&2; exit 1; }
  TLS_PORT=${BASH_REMATCH[1]}
  [ "$TLS_PORT" -ge 1 ] && [ "$TLS_PORT" -le 65535 ] || exit 1
  [ -f "${PJM_DOWNLOAD_TLS_CERT:-}" ] || { echo 'TLS fixture certificate required' >&2; exit 1; }
  "$ADB" -s "$SERIAL" reverse "tcp:$TLS_PORT" "tcp:$TLS_PORT"
  "$ADB" -s "$SERIAL" push "$PJM_DOWNLOAD_TLS_CERT" "/data/local/tmp/$TOKEN/server-cert.pem"
  "$ADB" -s "$SERIAL" shell "CLASSPATH=/data/local/tmp/$TOKEN/check.zip" /system/bin/app_process "-Djava.library.path=/data/local/tmp/$TOKEN" /system/bin dev.pjm.android.NativePackageDownloadTlsTest "/data/local/tmp/$TOKEN/cases.json" "$PJM_DOWNLOAD_TLS_URL" "/data/local/tmp/$TOKEN/server-cert.pem"
  "$ADB" -s "$SERIAL" reverse --remove "tcp:$TLS_PORT"
fi
