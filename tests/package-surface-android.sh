#!/bin/bash
set -eu
ROOT=$(cd "$(dirname "$0")/.." && pwd)
SERIAL=${1:?Android serial required}
case "$SERIAL" in *[!a-zA-Z0-9_.:-]*) exit 2;; esac
TEMP=$(mktemp -d /private/tmp/pjm-signed-android.XXXXXX)
TOKEN=$(basename "$TEMP")
BUNDLE=""
SDK=${ANDROID_SDK_ROOT:-${ANDROID_HOME:-$HOME/Library/Android/sdk}}
JAVA=${JAVA_HOME:-/Library/Java/JavaVirtualMachines/jdk-17.jdk/Contents/Home}
NDK="$SDK/ndk/28.2.13676358/toolchains/llvm/prebuilt/darwin-x86_64/bin"
ADB="$SDK/platform-tools/adb"
cleanup(){ if [ -n "$BUNDLE" ]; then "$ADB" -s "$SERIAL" uninstall "$BUNDLE" >/dev/null 2>&1 || true;fi;"$ADB" -s "$SERIAL" shell rm -f "/data/local/tmp/$TOKEN.xml" "/data/local/tmp/$TOKEN.png" >/dev/null 2>&1 || true; "$ADB" -s "$SERIAL" shell rm -rf "/data/local/tmp/$TOKEN" >/dev/null 2>&1 || true;rm -rf "$TEMP"; }
trap cleanup EXIT
PJM_PACKAGE_VISUAL=1 PJM_PACKAGE_TARGET=android PJM_PACKAGE_REAL= bun "$ROOT/tests/package-load-fixtures.ts" "$TEMP/cases.json"
export RUSTC=$(rustup which --toolchain stable rustc)
export CARGO_TARGET_AARCH64_LINUX_ANDROID_LINKER="$NDK/aarch64-linux-android23-clang"
export RUSTFLAGS="${RUSTFLAGS:-} -C link-arg=-Wl,-z,max-page-size=16384"
export CC_aarch64_linux_android="$NDK/aarch64-linux-android23-clang" AR_aarch64_linux_android="$NDK/llvm-ar"
export BINDGEN_EXTRA_CLANG_ARGS_aarch64_linux_android="--target=aarch64-linux-android23 --sysroot=$NDK/../sysroot"
export LIBCLANG_PATH=/Applications/Xcode.app/Contents/Developer/Toolchains/XcodeDefault.xctoolchain/usr/lib
rustup run stable cargo build --offline --locked --release --manifest-path "$ROOT/core-ffi/Cargo.toml" --target aarch64-linux-android
"$NDK/aarch64-linux-android23-clang" -Wall -Wextra -Werror -fPIC -shared -Wl,--gc-sections -Wl,--exclude-libs,ALL -Wl,--no-undefined -Wl,-z,max-page-size=16384 -I "$ROOT/core-ffi/include" "$ROOT/host/android/package_bridge.c" "$ROOT/host/android/pool_bridge.c" "$ROOT/host/android/store_bridge.c" "$ROOT/core-ffi/target/aarch64-linux-android/release/libmini_core_ffi.a" -ldl -lm -llog -o "$TEMP/libpocketjs.so"
mkdir -p "$TEMP/assets" "$TEMP/staging/lib/arm64-v8a" "$TEMP/dex"
export PJM_SIGNED_TEST_TEMP="$TEMP"
bun -e 'import {readFileSync,writeFileSync} from "node:fs";const root=process.env.PJM_SIGNED_TEST_TEMP!;const value=JSON.parse(readFileSync(root+"/cases.json","utf8")).find((entry:any)=>entry.valid);writeFileSync(root+"/assets/main.pocket",Buffer.from(value.payload,"base64"));writeFileSync(root+"/assets/manifest.json",JSON.stringify(value.manifest));writeFileSync(root+"/assets/publisher.key",Buffer.from(value.key,"base64"));'
"$JAVA/bin/javac" -source 8 -target 8 -classpath "$SDK/platforms/android-34/android.jar" -d "$TEMP/classes" "$ROOT/host/android/PackageVerifier.java" "$ROOT/host/android/VerifiedPackage.java" "$ROOT/host/android/VerifiedContainer.java" "$ROOT/host/android/AppStorage.java" "$ROOT/host/android/VerifiedPresenter.java" "$ROOT/host/android/InstalledActivity.java" "$ROOT/host/android/PackageStore.java" "$ROOT/host/android/PackageFiles.java"
"$JAVA/bin/jar" cf "$TEMP/check.jar" -C "$TEMP/classes" .
JAVA_HOME="$JAVA" "$SDK/build-tools/35.0.0/d8" --min-api 26 --lib "$SDK/platforms/android-34/android.jar" --output "$TEMP/dex" "$TEMP/check.jar"
BUNDLE="dev.pjm.signed.surface.$(basename "$TEMP" | tr '[:upper:]' '[:lower:]' | tr -cd 'a-z0-9')"
cat > "$TEMP/AndroidManifest.xml" <<EOF
<manifest xmlns:android="http://schemas.android.com/apk/res/android" package="$BUNDLE"><uses-sdk android:minSdkVersion="26" android:targetSdkVersion="34"/><uses-feature android:glEsVersion="0x00020000" android:required="true"/><application android:label="Signed PocketJS Test" android:allowBackup="false" android:theme="@android:style/Theme.Material.NoActionBar"><activity android:name="dev.pjm.android.InstalledActivity" android:exported="true" android:configChanges="orientation|screenSize|keyboardHidden"><intent-filter><action android:name="android.intent.action.MAIN"/><category android:name="android.intent.category.LAUNCHER"/></intent-filter></activity></application></manifest>
EOF
"$SDK/build-tools/35.0.0/aapt2" link -o "$TEMP/unsigned.apk" --manifest "$TEMP/AndroidManifest.xml" -I "$SDK/platforms/android-34/android.jar" -A "$TEMP/assets"
cp "$TEMP/libpocketjs.so" "$TEMP/staging/lib/arm64-v8a/"
cp "$TEMP/dex/classes.dex" "$TEMP/staging/"
(cd "$TEMP/staging" && zip -q -r "$TEMP/unsigned.apk" classes.dex lib)
"$SDK/build-tools/35.0.0/zipalign" -f -P 16 4 "$TEMP/unsigned.apk" "$TEMP/aligned.apk"
"$JAVA/bin/keytool" -genkeypair -keystore "$TEMP/test.jks" -storepass android -keypass android -alias test -keyalg RSA -validity 1 -dname 'CN=Temporary PocketJS Test' >/dev/null 2>&1
JAVA_HOME="$JAVA" "$SDK/build-tools/35.0.0/apksigner" sign --ks "$TEMP/test.jks" --ks-pass pass:android --out "$TEMP/test.apk" "$TEMP/aligned.apk"
"$ADB" -s "$SERIAL" install "$TEMP/test.apk"
"$ADB" -s "$SERIAL" shell am start -n "$BUNDLE/dev.pjm.android.InstalledActivity" --es pjm-url http://127.0.0.1:1/ > "$TEMP/launch.log"
FOUND=0
for ((attempt=0;attempt<30;attempt++)); do
  "$ADB" -s "$SERIAL" shell uiautomator dump "/data/local/tmp/$TOKEN.xml" >/dev/null 2>&1 || { sleep 1;continue; }
  "$ADB" -s "$SERIAL" pull "/data/local/tmp/$TOKEN.xml" "$TEMP/screen.xml" >/dev/null 2>&1
  if rg -q 'signed=dev.pjm.fixture version=1.0.0 frames=[1-9]' "$TEMP/screen.xml"; then FOUND=1;break;fi
  if rg -q "Cannot open installed mini app" "$TEMP/screen.xml"; then break;fi
  sleep 1
done
EVIDENCE=${2:-$ROOT/build/android-validation/signed-surface-$(date -u +%Y%m%dT%H%M%SZ)}
mkdir -p "$EVIDENCE"
cp "$TEMP/launch.log" "$TEMP/screen.xml" "$EVIDENCE/"
"$ADB" -s "$SERIAL" logcat -d -s PocketJS AndroidRuntime > "$EVIDENCE/runtime.log"
"$ADB" -s "$SERIAL" shell screencap -p "/data/local/tmp/$TOKEN.png"
"$ADB" -s "$SERIAL" pull "/data/local/tmp/$TOKEN.png" "$EVIDENCE/screen.png" >/dev/null 2>&1
CENTER=$(bun -e 'import {readFileSync} from "node:fs";const png=readFileSync(process.argv[1]);console.log(Math.floor(png.readUInt32BE(16)/2)+" "+Math.floor(png.readUInt32BE(20)/2))' "$EVIDENCE/screen.png")
read -r CENTER_X CENTER_Y <<< "$CENTER"
"$ADB" -s "$SERIAL" shell input tap "$CENTER_X" "$CENTER_Y"
sleep 1
"$ADB" -s "$SERIAL" shell screencap -p "/data/local/tmp/$TOKEN.png"
"$ADB" -s "$SERIAL" pull "/data/local/tmp/$TOKEN.png" "$EVIDENCE/touch.png" >/dev/null 2>&1
"$ADB" -s "$SERIAL" shell input keyevent KEYCODE_HOME
sleep 1
"$ADB" -s "$SERIAL" shell am start -n "$BUNDLE/dev.pjm.android.InstalledActivity" >/dev/null
sleep 1
"$ADB" -s "$SERIAL" shell screencap -p "/data/local/tmp/$TOKEN.png"
"$ADB" -s "$SERIAL" pull "/data/local/tmp/$TOKEN.png" "$EVIDENCE/resumed.png" >/dev/null 2>&1
bun "$ROOT/tests/assert-frame-png.ts" "$EVIDENCE/screen.png" 255,0,0
bun "$ROOT/tests/assert-frame-png.ts" "$EVIDENCE/touch.png" 0,0,255
bun "$ROOT/tests/assert-frame-png.ts" "$EVIDENCE/resumed.png" 0,0,255
"$ADB" -s "$SERIAL" shell input keyevent KEYCODE_BACK
sleep 1
"$ADB" -s "$SERIAL" shell am start -n "$BUNDLE/dev.pjm.android.InstalledActivity" >/dev/null
sleep 1
"$ADB" -s "$SERIAL" shell screencap -p "/data/local/tmp/$TOKEN.png"
"$ADB" -s "$SERIAL" pull "/data/local/tmp/$TOKEN.png" "$EVIDENCE/cold.png" >/dev/null 2>&1
bun "$ROOT/tests/assert-frame-png.ts" "$EVIDENCE/cold.png" 255,0,0
"$ADB" -s "$SERIAL" shell input keyevent KEYCODE_BACK
sleep 1
"$ADB" -s "$SERIAL" logcat -d -s PocketJS AndroidRuntime > "$EVIDENCE/runtime.log"
if [ "$FOUND" != 1 ]; then cat "$EVIDENCE/runtime.log";exit 1;fi
printf 'Android authenticated installed Activity and GLES presentation passed\n'
