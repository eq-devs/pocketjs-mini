#!/bin/bash
set -eu
ROOT=$(cd "$(dirname "$0")/.." && pwd)
SDK=${ANDROID_HOME:-${ANDROID_SDK_ROOT:-$HOME/Library/Android/sdk}}
JAVA=${JAVA_HOME:-/Library/Java/JavaVirtualMachines/jdk-17.jdk/Contents/Home}
[ -f "$SDK/platforms/android-34/android.jar" ] || { echo 'Android API 34 SDK is required for service type checks' >&2; exit 1; }
[ -x "$JAVA/bin/javac" ] || { echo 'Set JAVA_HOME to an installed JDK' >&2; exit 1; }
TEMP=$(mktemp -d "${TMPDIR:-/private/tmp}/pjm-android-service-types.XXXXXX")
trap 'rm -rf "$TEMP"' EXIT
"$JAVA/bin/javac" -source 8 -target 8 -classpath "$SDK/platforms/android-34/android.jar:$ROOT/vendor/android-http/*" -d "$TEMP" \
  "$ROOT/host/android/VerifiedClipboard.java" "$ROOT/host/android/VerifiedPackage.java" \
  "$ROOT/host/android/PackageVerifier.java" "$ROOT/host/android/BoundedJson.java" \
  "$ROOT/host/android/PackageStore.java" "$ROOT/host/android/PackageFiles.java" \
  "$ROOT/host/android/PermissionGate.java" "$ROOT/host/android/LocationApproval.java" \
  "$ROOT/host/android/LocationContract.java" "$ROOT/host/android/LocationMailbox.java" "$ROOT/host/android/LocationRate.java" "$ROOT/host/android/LocationStops.java" "$ROOT/host/android/VerifiedLocation.java" \
  "$ROOT/host/android/InstalledActivity.java" "$ROOT/host/android/VerifiedContainer.java" \
  "$ROOT/host/android/VerifiedPresenter.java" "$ROOT/host/android/VerifiedHttp.java" \
  "$ROOT/host/android/ManagedResources.java" "$ROOT/host/android/AppStorage.java" \
  "$ROOT/tests/NativeClipboardTest.java" "$ROOT/tests/NativePackageStoreTest.java"
echo 'Android installed host, clipboard and permission Java sources compile; runtime tests were not executed.'
