#!/bin/bash
set -eu
ROOT=$(cd "$(dirname "$0")/.." && pwd)
SDK=${ANDROID_HOME:-${ANDROID_SDK_ROOT:-$HOME/Library/Android/sdk}}
JAVA=${JAVA_HOME:-/Library/Java/JavaVirtualMachines/jdk-17.jdk/Contents/Home}
CACHE=${GRADLE_USER_HOME:-$HOME/.gradle}/caches/modules-2/files-2.1/com.google.android.gms
TEMP=$(mktemp -d "${TMPDIR:-/private/tmp}/pjm-fused-types.XXXXXX")
trap 'rm -rf "$TEMP"' EXIT
python3 - "$ROOT/vendor/android-location/compile-lock.json" "$CACHE" "$TEMP" <<'PY'
import sys,json,pathlib,hashlib,zipfile
lock=json.loads(pathlib.Path(sys.argv[1]).read_text());assert lock['schema']==1
for item in lock['artifacts']:
 paths=list((pathlib.Path(sys.argv[2])/item['name']/item['version']).glob('*/*.aar'))
 if len(paths)!=1:raise SystemExit('Install the pinned cached FusedLocation API artifact: '+item['name']+' '+item['version'])
 data=paths[0].read_bytes()
 if len(data)!=item['bytes'] or hashlib.sha256(data).hexdigest()!=item['sha256']:raise SystemExit('FusedLocation compile artifact checksum mismatch: '+item['name'])
 with zipfile.ZipFile(paths[0]) as archive:(pathlib.Path(sys.argv[3])/(item['name']+'.jar')).write_bytes(archive.read('classes.jar'))
PY
"$JAVA/bin/javac" -source 8 -target 8 -classpath "$SDK/platforms/android-34/android.jar:$ROOT/vendor/android-http/*:$TEMP/*" -d "$TEMP/out" \
 "$ROOT/host/android/FusedLocationProvider.java" "$ROOT/host/android/VerifiedLocation.java" \
 "$ROOT/host/android/LocationContract.java" "$ROOT/host/android/LocationMailbox.java" \
 "$ROOT/host/android/LocationRate.java" "$ROOT/host/android/LocationStops.java" \
 "$ROOT/host/android/VerifiedPackage.java" "$ROOT/host/android/PackageVerifier.java" "$ROOT/host/android/BoundedJson.java"
echo 'Pinned FusedLocation API source compilation passed; APK dependency closure and device execution are not verified.'
