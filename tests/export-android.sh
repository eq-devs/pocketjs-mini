#!/bin/bash
# Validate an actual CLI export after moving it, against an already booted device.
set -eu
ROOT=$(cd "$(dirname "$0")/.." && pwd)
SERIAL=${1:?Pass a booted Android serial}
case "$SERIAL" in *[!a-zA-Z0-9_.:-]*) exit 2;; esac
TEMP=$(mktemp -d /private/tmp/pjm-exported-android.XXXXXX)
TOKEN=$(basename "$TEMP")
BUNDLE="dev.pjm.exported.a$(basename "$TEMP" | tr '[:upper:]' '[:lower:]' | tr -cd 'a-z0-9')"
SDK=${ANDROID_SDK_ROOT:-${ANDROID_HOME:-$HOME/Library/Android/sdk}}
JAVA=${JAVA_HOME:-/Library/Java/JavaVirtualMachines/jdk-17.jdk/Contents/Home}
ADB="$SDK/platform-tools/adb"
EVIDENCE=${2:-$ROOT/build/android-validation/exported-host-$(date -u +%Y%m%dT%H%M%SZ)}
cleanup(){ "$ADB" -s "$SERIAL" uninstall "$BUNDLE" >/dev/null 2>&1 || true;"$ADB" -s "$SERIAL" shell rm -f "/data/local/tmp/$TOKEN.xml" "/data/local/tmp/$TOKEN.png" >/dev/null 2>&1 || true;rm -rf "$TEMP"; }
trap cleanup EXIT
export ANDROID_SDK_ROOT="$SDK" JAVA_HOME="$JAVA" PJM_EXPORT_TEST_ROOT="$TEMP"
PJM_PACKAGE_VISUAL=1 PJM_PACKAGE_TARGET=android PJM_PACKAGE_REAL= bun "$ROOT/tests/package-load-fixtures.ts" "$TEMP/cases.json"
bun -e 'import {readFileSync,writeFileSync} from "node:fs";const root=process.env.PJM_EXPORT_TEST_ROOT!;const value=JSON.parse(readFileSync(root+"/cases.json","utf8")).find((entry:any)=>entry.valid);writeFileSync(root+"/main.pocket",Buffer.from(value.payload,"base64"));writeFileSync(root+"/manifest.json",JSON.stringify(value.manifest));writeFileSync(root+"/publisher.key",Buffer.from(value.key,"base64"));'
"$ROOT/bin/pjm" export-android --package "$TEMP" --public-key "$TEMP/publisher.key" --output "$TEMP/original host" --bundle "$BUNDLE" > "$TEMP/export.log" 2>&1 || { cat "$TEMP/export.log";exit 1; }
mv "$TEMP/original host" "$TEMP/moved host"
"$TEMP/moved host/build-apk.sh" > "$TEMP/build.log" 2>&1 || { cat "$TEMP/build.log";exit 1; }
"$JAVA/bin/keytool" -genkeypair -keystore "$TEMP/test.jks" -storepass android -keypass android -alias test -keyalg RSA -validity 1 -dname 'CN=Temporary Export Test' >/dev/null 2>&1
"$SDK/build-tools/35.0.0/apksigner" sign --ks "$TEMP/test.jks" --ks-pass pass:android --out "$TEMP/test.apk" "$TEMP/moved host/build/Mini-unsigned.apk"
"$SDK/build-tools/35.0.0/apksigner" verify "$TEMP/test.apk"
"$SDK/build-tools/35.0.0/zipalign" -c -P 16 4 "$TEMP/test.apk"
"$ADB" -s "$SERIAL" install "$TEMP/test.apk"
"$ADB" -s "$SERIAL" shell am start -n "$BUNDLE/dev.pjm.android.InstalledActivity" --es pjm-url http://127.0.0.1:1/ > "$TEMP/launch.log"
FOUND=0
for ((attempt=0;attempt<20;attempt++)); do
  "$ADB" -s "$SERIAL" shell uiautomator dump "/data/local/tmp/$TOKEN.xml" >/dev/null 2>&1 || { sleep 1;continue; }
  "$ADB" -s "$SERIAL" pull "/data/local/tmp/$TOKEN.xml" "$TEMP/screen.xml" >/dev/null 2>&1
  if rg -q 'signed=dev.pjm.fixture version=1.0.0 frames=[1-9]' "$TEMP/screen.xml"; then FOUND=1;break;fi
  if rg -q 'Cannot open installed mini app' "$TEMP/screen.xml"; then break;fi
  sleep 1
done
mkdir -p "$EVIDENCE"
cp "$TEMP/export.log" "$TEMP/build.log" "$TEMP/launch.log" "$TEMP/screen.xml" "$TEMP/moved host/AndroidManifest.xml" "$EVIDENCE/"
"$ADB" -s "$SERIAL" logcat -d -s PocketJS AndroidRuntime > "$EVIDENCE/runtime.log"
[ "$FOUND" = 1 ] || { cat "$EVIDENCE/runtime.log";exit 1; }
"$ADB" -s "$SERIAL" shell screencap -p "/data/local/tmp/$TOKEN.png"
"$ADB" -s "$SERIAL" pull "/data/local/tmp/$TOKEN.png" "$EVIDENCE/screen.png" >/dev/null 2>&1
bun "$ROOT/tests/assert-frame-png.ts" "$EVIDENCE/screen.png" 255,0,0
cp "$TEMP/moved host/build/Mini-unsigned.apk" "$EVIDENCE/Mini-unsigned.apk"
printf 'Android CLI export, moved-project APK build and authenticated signed-only launch passed\n'
