#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
serial=${1:?Device serial required}
project=${2:?Exported benchmark project required}
evidence=${3:?New evidence directory required}
test ! -e "$evidence"
SDK=${ANDROID_SDK_ROOT:-$HOME/Library/Android/sdk}
JAVA=${JAVA_HOME:-/Library/Java/JavaVirtualMachines/jdk-17.jdk/Contents/Home}
adb="$SDK/platform-tools/adb";bundle=dev.pjm.benchmark.validation
test "$("$adb" -s "$serial" get-state)" = device || { echo 'Selected device unavailable' >&2;exit 1; }
if "$adb" -s "$serial" shell pm path "$bundle" | rg -q '^package:';then echo 'Benchmark bundle already installed; refusing replacement' >&2;exit 1;fi
temporary=$(mktemp -d /private/tmp/pjm-benchmark-device.XXXXXX)
remote=/data/local/tmp/$(basename "$temporary")
installed=0
cleanup(){ if [ "$installed" = 1 ];then "$adb" -s "$serial" uninstall "$bundle" >/dev/null;fi;"$adb" -s "$serial" shell rm -rf "$remote";rm -rf "$temporary"; }
trap cleanup EXIT
mkdir -p "$evidence"
"$JAVA/bin/keytool" -genkeypair -keystore "$temporary/test.jks" -storepass android -keypass android -alias test -keyalg RSA -validity 1 -dname 'CN=Temporary Benchmark Test' >/dev/null 2>&1
JAVA_HOME="$JAVA" "$SDK/build-tools/36.0.0/apksigner" sign --ks "$temporary/test.jks" --ks-pass pass:android --out "$temporary/app.apk" "$project/build/Mini-unsigned.apk"
"$adb" -s "$serial" install "$temporary/app.apk"
installed=1
"$adb" -s "$serial" shell mkdir "$remote"
"$adb" -s "$serial" shell am start -n "$bundle/dev.pjm.android.InstalledActivity" --ez pjm-measure true > "$evidence/launch.log"
found=0
for ((attempt=0;attempt<20;attempt++));do
  "$adb" -s "$serial" shell uiautomator dump "$remote/screen.xml" >/dev/null 2>&1 || continue
  "$adb" -s "$serial" pull "$remote/screen.xml" "$evidence/screen.xml" >/dev/null
  if rg -q 'signed=dev.pjm.benchmark version=0.3.0 frames=[1-9]' "$evidence/screen.xml";then found=1;break;fi
  if rg -q 'Cannot open installed mini app' "$evidence/screen.xml";then break;fi
done
pid=$("$adb" -s "$serial" shell pidof "$bundle" | tr -d '\r')
case "$pid" in ''|*[!0-9]*) echo 'Owned process missing or ambiguous' >&2;exit 1;; esac
"$adb" -s "$serial" logcat -d --pid="$pid" -s PocketJS AndroidRuntime > "$evidence/runtime.log"
"$adb" -s "$serial" shell screencap -p "$remote/screen.png"
"$adb" -s "$serial" pull "$remote/screen.png" "$evidence/screen.png" >/dev/null
test "$found" = 1
read -r sx sy ex ey tx ty <<< "$(bun tests/benchmark-input-points.ts "$evidence/screen.xml")"
swipes=${PJM_BENCHMARK_SWIPES:-6}
case "$swipes" in 0|1|2|3|4|5|6) ;; *) echo 'Use 0 through 6 swipes' >&2;exit 1;; esac
for ((swipe=0;swipe<swipes;swipe++));do "$adb" -s "$serial" shell input swipe "$sx" "$sy" "$ex" "$ey" 1000;done
"$adb" -s "$serial" shell screencap -p "$remote/scroll.png"
"$adb" -s "$serial" pull "$remote/scroll.png" "$evidence/scroll.png" >/dev/null
"$adb" -s "$serial" shell input tap "$tx" "$ty"
sleep 1
"$adb" -s "$serial" shell screencap -p "$remote/form.png"
"$adb" -s "$serial" pull "$remote/form.png" "$evidence/form.png" >/dev/null
"$adb" -s "$serial" shell dumpsys meminfo "$bundle" > "$evidence/memory.log"
"$adb" -s "$serial" shell input keyevent 3
for ((attempt=0;attempt<20;attempt++));do
  "$adb" -s "$serial" logcat -d --pid="$pid" -s PocketJS AndroidRuntime > "$evidence/runtime.log"
  if rg -q 'host_cpu_submission' "$evidence/runtime.log";then break;fi
  sleep 0.2
done
echo 'Actual authenticated benchmark rendered; evidence retained, owned app removed on exit'
