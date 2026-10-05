#!/bin/bash
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/.." && pwd)
SERIAL=${1:?Pass a booted Android serial}
LIBRARY=${2:?Pass a compiled libpocketjs.so}
case "$SERIAL" in *[!a-zA-Z0-9_.:-]*) exit 2;; esac
SDK=${ANDROID_SDK_ROOT:-${ANDROID_HOME:-$HOME/Library/Android/sdk}}
JAVA=${JAVA_HOME:-/Library/Java/JavaVirtualMachines/jdk-17.jdk/Contents/Home}
TEMP=$(mktemp -d /private/tmp/pjm-native-http.XXXXXX)
TOKEN=$(basename "$TEMP")
ADB="$SDK/platform-tools/adb"
cleanup(){ "$ADB" -s "$SERIAL" shell rm -rf "/data/local/tmp/$TOKEN" >/dev/null 2>&1 || true;rm -rf "$TEMP"; }
trap cleanup EXIT
PJM_PACKAGE_TARGET=android PJM_PACKAGE_REAL= bun "$ROOT/tests/package-load-fixtures.ts" "$TEMP/cases.json"
"$JAVA/bin/javac" -source 8 -target 8 -classpath "$SDK/platforms/android-34/android.jar:$ROOT/vendor/android-http/*" -d "$TEMP/classes" "$ROOT/host/android/PackageVerifier.java" "$ROOT/host/android/BoundedJson.java" "$ROOT/host/android/VerifiedPackage.java" "$ROOT/host/android/VerifiedHttp.java" "$ROOT/host/android/ManagedResources.java" "$ROOT/tests/NativeHttpTest.java"
"$JAVA/bin/jar" cf "$TEMP/test.jar" -C "$TEMP/classes" .
mkdir "$TEMP/dex"
JAVA_HOME="$JAVA" "$SDK/build-tools/36.0.0/d8" --min-api 26 --lib "$SDK/platforms/android-34/android.jar" --output "$TEMP/dex" "$TEMP/test.jar" "$ROOT"/vendor/android-http/*.jar
(cd "$TEMP/dex" && zip -q "$TEMP/test.zip" classes*.dex)
cp "$LIBRARY" "$TEMP/libpocketjs.so"
"$ADB" -s "$SERIAL" shell mkdir "/data/local/tmp/$TOKEN"
for name in test.zip libpocketjs.so cases.json; do "$ADB" -s "$SERIAL" push "$TEMP/$name" "/data/local/tmp/$TOKEN/$name";done
"$ADB" -s "$SERIAL" shell chmod 444 "/data/local/tmp/$TOKEN/test.zip"
"$ADB" -s "$SERIAL" shell env "CLASSPATH=/data/local/tmp/$TOKEN/test.zip" app_process "-Djava.library.path=/data/local/tmp/$TOKEN" /system/bin dev.pjm.android.NativeHttpTest "/data/local/tmp/$TOKEN/cases.json" | tee "$TEMP/run.log"
rg -q 'Native Android HTTP: .* passed' "$TEMP/run.log"
