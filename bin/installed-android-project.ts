import {cpSync,mkdirSync,writeFileSync} from "node:fs";
import {join,resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {canonical} from "../container/package.ts";
import {verifyInstalledInputs} from "./installed-project.ts";
import {androidHttpFiles,copyAndroidHttp} from "./android-http.ts";
import {androidLocationFiles,copyAndroidLocation} from "./android-location.ts";

/** Portable signed-only host; APK signing remains owned by the distributor. */
export function writeInstalledAndroidProject(options:{directory:string;library:string;payload:string;envelope:string;publicKey:string;bundle?:string}){
  const {payload,key,manifest}=verifyInstalledInputs(options,"pjm-android"),bundle=options.bundle??"dev.pjm.installed";
  androidHttpFiles();androidLocationFiles();
  if(!/^[a-zA-Z][a-zA-Z0-9_]*(?:\.[a-zA-Z][a-zA-Z0-9_]*)+$/.test(bundle))throw new Error("Invalid Android host package identity");
  const root=fileURLToPath(new URL("../",import.meta.url)),directory=resolve(options.directory);
  for(const part of ["src","assets","lib/arm64-v8a"])mkdirSync(join(directory,part),{recursive:true});
  copyAndroidHttp(directory);
  copyAndroidLocation(directory);
  for(const name of ["FrameMeasurements","FramePacer","AppStorage","PackageVerifier","VerifiedPackage","VerifiedContainer","VerifiedPresenter","InstalledActivity","PackageStore","PackageFiles","BoundedJson","VerifiedHttp","ManagedResources","VerifiedClipboard","PermissionGate","VerifiedLocation","LocationApproval","LocationContract","LocationMailbox","LocationRate","LocationStops","FusedLocationProvider"])cpSync(join(root,"host/android",name+".java"),join(directory,"src",name+".java"));
  writeFileSync(join(directory,"assets/main.pocket"),payload);writeFileSync(join(directory,"assets/manifest.json"),canonical(manifest));writeFileSync(join(directory,"assets/publisher.key"),key);
  cpSync(resolve(options.library),join(directory,"lib/arm64-v8a/libpocketjs.so"));
  writeFileSync(join(directory,"AndroidManifest.xml"),`<manifest xmlns:android="http://schemas.android.com/apk/res/android" package="${bundle}" android:versionCode="1" android:versionName="1.0">
<uses-sdk android:minSdkVersion="26" android:targetSdkVersion="34"/>
<uses-permission android:name="android.permission.INTERNET"/>
<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION"/>
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION"/>
<uses-feature android:glEsVersion="0x00020000" android:required="true"/>
<application android:label="PocketJS Mini" android:debuggable="false" android:allowBackup="false" android:usesCleartextTraffic="false" android:theme="@android:style/Theme.Material.NoActionBar" android:appComponentFactory="androidx.core.app.CoreComponentFactory">
<meta-data android:name="com.google.android.gms.version" android:value="@integer/google_play_services_version"/>
<activity android:name="com.google.android.gms.common.api.GoogleApiActivity" android:theme="@android:style/Theme.Translucent.NoTitleBar" android:exported="false"/>
<activity android:name="dev.pjm.android.InstalledActivity" android:exported="true" android:configChanges="orientation|screenSize|keyboardHidden">
<intent-filter><action android:name="android.intent.action.MAIN"/><category android:name="android.intent.category.LAUNCHER"/></intent-filter>
</activity></application></manifest>
`);
  writeFileSync(join(directory,"build-apk.sh"),`#!/bin/bash
set -eu
PROJECT_ROOT=$(cd "$(dirname "$0")" && pwd)
SDK_ROOT=\${ANDROID_SDK_ROOT:-\${ANDROID_HOME:-}}
[ -n "$SDK_ROOT" ] || { echo 'Set ANDROID_SDK_ROOT to your Android SDK directory' >&2;exit 1; }
TOOLS="$SDK_ROOT/build-tools/36.0.0"
ANDROID_JAR="$SDK_ROOT/platforms/android-34/android.jar"
JAVA_BIN=\${JAVA_HOME:+$JAVA_HOME/bin/}
for TOOL in "$TOOLS/aapt2" "$TOOLS/d8" "$TOOLS/zipalign" "$ANDROID_JAR"; do [ -f "$TOOL" ] || { echo "Missing SDK file: $TOOL" >&2;exit 1; }; done
BUILD_ROOT=$(mktemp -d "\${TMPDIR:-/tmp}/pjm-installed-apk.XXXXXX")
trap 'rm -rf "$BUILD_ROOT"' EXIT
mkdir -p "$BUILD_ROOT/classes" "$BUILD_ROOT/dex" "$BUILD_ROOT/staging" "$BUILD_ROOT/generated" "$BUILD_ROOT/resources"
RESOURCE_ARGS=()
for RESOURCE_DIR in "$PROJECT_ROOT"/resources/*/res; do
  [ -d "$RESOURCE_DIR" ] || continue
  RESOURCE_NAME=$(basename "$(dirname "$RESOURCE_DIR")")
  "$TOOLS/aapt2" compile --dir "$RESOURCE_DIR" -o "$BUILD_ROOT/resources/$RESOURCE_NAME.zip"
  RESOURCE_ARGS+=(-R "$BUILD_ROOT/resources/$RESOURCE_NAME.zip")
done
"$TOOLS/aapt2" link -o "$BUILD_ROOT/unsigned.apk" --manifest "$PROJECT_ROOT/AndroidManifest.xml" -I "$ANDROID_JAR" -A "$PROJECT_ROOT/assets" --auto-add-overlay --java "$BUILD_ROOT/generated" --extra-packages "$(cat "$PROJECT_ROOT/packages.txt")" "\${RESOURCE_ARGS[@]}"
SOURCE_ARGS=()
while IFS= read -r -d '' JAVA_SOURCE; do SOURCE_ARGS+=("$JAVA_SOURCE"); done < <(find "$PROJECT_ROOT/src" "$BUILD_ROOT/generated" -name '*.java' -print0)
"\${JAVA_BIN}javac" -encoding UTF-8 -source 8 -target 8 -classpath "$ANDROID_JAR:$PROJECT_ROOT/deps/*" -d "$BUILD_ROOT/classes" "\${SOURCE_ARGS[@]}"
"\${JAVA_BIN}jar" cf "$BUILD_ROOT/classes.jar" -C "$BUILD_ROOT/classes" .
"$TOOLS/d8" --min-api 26 --lib "$ANDROID_JAR" --output "$BUILD_ROOT/dex" "$BUILD_ROOT/classes.jar" "$PROJECT_ROOT"/deps/*.jar
cp "$BUILD_ROOT"/dex/classes*.dex "$BUILD_ROOT/staging/"
cp -R "$PROJECT_ROOT/lib" "$BUILD_ROOT/staging/"
(cd "$BUILD_ROOT/staging" && zip -q -r "$BUILD_ROOT/unsigned.apk" classes*.dex lib)
mkdir -p "$PROJECT_ROOT/build"
"$TOOLS/zipalign" -f -P 16 4 "$BUILD_ROOT/unsigned.apk" "$PROJECT_ROOT/build/Mini-unsigned.apk"
echo "Built $PROJECT_ROOT/build/Mini-unsigned.apk. Sign with your Android distribution key before installing."
`,{mode:0o755});
  writeFileSync(join(directory,"README.md"),`# Installed Android host

App: ${manifest.appId} ${manifest.version}. Host package: ${bundle}.

This folder contains authenticated package bytes, a separately supplied publisher
public key, the signed-only Activity sources and the prebuilt arm64 engine. It can
be moved without the original checkout. The publisher private key is not bundled.

Set ANDROID_SDK_ROOT and JAVA_HOME (JDK 17), install Android platform 34 and
build-tools 36.0.0, then run ./build-apk.sh. Sign build/Mini-unsigned.apk with your
own Android distribution keystore using apksigner. Publisher package signatures
and Android APK signatures are separate. This export does not create or use a
distribution private key, install an app, or submit a store release.

The native engine targets arm64 with 16 KiB library page alignment. Signed
startup and lifecycle have been tested on API 37. Signature verification uses
the bundled native Ed25519 verifier independently of Android JCA providers. Older
Android runtime compatibility remains unverified; the manifest API 26 minimum
does not establish compatibility across all those devices.
Target API/store submission requirements must be reviewed for distribution.
The current presenter uploads software BGRA frames; direct GPU draw lists and
full native services are still incomplete.

Location uses the bundled checksum-pinned Google FusedLocation runtime, AndroidX
resources and native app/OS permission dialogs. It requires compatible Google Play
services on the device. The builder includes the inspected Google manifest entries
and generated resource classes; location device acceptance remains pending.
`);
  return {directory,bundle,appId:manifest.appId,version:manifest.version};
}
