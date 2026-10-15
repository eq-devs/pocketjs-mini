#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
: "${ANDROID_SDK_ROOT:=$HOME/Library/Android/sdk}"
: "${PJM_ANDROID_SERIAL:?Select the owned emulator}"
: "${PJM_MEDIA_EVIDENCE:?Set evidence directory}"
payload=${1:?Compiled 3x Android benchmark required}
library=core-ffi/target/aarch64-linux-android/release/libmini_core_ffi.so
temporary=$(mktemp -d /private/tmp/pjm-benchmark-parity.XXXXXX)
remote=/data/local/tmp/$(basename "$temporary")
adb="$ANDROID_SDK_ROOT/platform-tools/adb"
created=0
cleanup(){ if [ "$created" = 1 ];then "$adb" -s "$PJM_ANDROID_SERIAL" shell rm -rf "$remote";fi;rm -rf "$temporary"; }
trap 'original_status=$?; trap - EXIT; cleanup_status=0; cleanup || cleanup_status=$?; if [ "$original_status" -ne 0 ];then exit "$original_status";else exit "$cleanup_status";fi' EXIT
sample_mode=${PJM_GLES_FRAGMENT_SAMPLES:-0}
case "$sample_mode" in 0|1) ;; *) echo "Invalid fragment sample mode" >&2;exit 1;; esac
driver_source=tests/benchmark-gles-parity-android.c
if [ "$sample_mode" = 1 ];then driver_source=tests/benchmark-gpu-samples.c;fi
diagnostic=(-DPJM_SAMPLE_GLES=1 -DPJM_GLES_DIAGNOSTIC_NO_DITHER=0)
case "${PJM_GLES_DIAGNOSTIC_NO_DITHER:-}" in ""|0) ;; 1) diagnostic=(-DPJM_SAMPLE_GLES=1 -DPJM_GLES_DIAGNOSTIC_NO_DITHER=1);; *) echo "Invalid dither diagnostic mode" >&2;exit 1;; esac
"$ANDROID_SDK_ROOT/ndk/28.2.13676358/toolchains/llvm/prebuilt/darwin-x86_64/bin/aarch64-linux-android23-clang" -O2 -Wall -Wextra -Werror "${diagnostic[@]}" "$driver_source" -Icore-ffi/include -Lcore-ffi/target/aarch64-linux-android/release -lmini_core_ffi -lEGL -lGLESv2 -lm -o "$temporary/driver"
"$adb" -s "$PJM_ANDROID_SERIAL" shell mkdir "$remote"
created=1
"$adb" -s "$PJM_ANDROID_SERIAL" push "$temporary/driver" "$library" "$payload" "$remote/" >/dev/null
"$adb" -s "$PJM_ANDROID_SERIAL" shell chmod 700 "$remote/driver"
profile=${PJM_GLES_BENCHMARK_WINDOW:-}
case "$profile" in ""|native|phone) ;; *) echo "Invalid benchmark window profile" >&2;exit 1;; esac
scene=${PJM_GLES_BENCHMARK_SCENE:-}
case "$scene" in ""|form) ;; *) echo "Invalid benchmark scene" >&2;exit 1;; esac
if [ -n "$scene" ] && [ -z "$profile" ];then profile=native;fi
status=0
if [ "$sample_mode" = 1 ];then
 [ "$profile" = native ] && [ "$scene" = form ] || { echo "Fragment samples require native form scene" >&2;exit 1; }
 "$adb" -s "$PJM_ANDROID_SERIAL" shell "LD_LIBRARY_PATH=$remote $remote/driver $remote/$(basename "$payload") $remote/scroll" > "$PJM_MEDIA_EVIDENCE/native-parity.log" 2>&1 || status=$?
 outputs=(scroll-samples.json scroll-cpu.bgra)
else
 "$adb" -s "$PJM_ANDROID_SERIAL" shell "LD_LIBRARY_PATH=$remote $remote/driver $remote/$(basename "$payload") $remote/scroll $profile $scene" > "$PJM_MEDIA_EVIDENCE/native-parity.log" 2>&1 || status=$?
 outputs=(scroll-gles.rgba scroll-cpu.bgra)
 if [ "$scene" = form ];then outputs+=(scroll-tree.json);fi
fi
for name in "${outputs[@]}";do "$adb" -s "$PJM_ANDROID_SERIAL" pull "$remote/$name" "$PJM_MEDIA_EVIDENCE/$name" >/dev/null || true;done
exit "$status"
