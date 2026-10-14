#!/bin/bash
# Offline API analysis of host sources, with compiled classes for resolution.
set -eu
ROOT=$(cd "$(dirname "$0")/.." && pwd)
SDK=${ANDROID_HOME:-${ANDROID_SDK_ROOT:-$HOME/Library/Android/sdk}}
JAVA=${JAVA_HOME:-/Library/Java/JavaVirtualMachines/jdk-17.jdk/Contents/Home}
LINT="$SDK/cmdline-tools/latest/bin/lint"
[ -x "$LINT" ] || { echo 'Android command-line lint is required' >&2; exit 1; }
TEMP=$(mktemp -d "${TMPDIR:-/private/tmp}/pjm-android-api.XXXXXX")
trap 'rm -rf "$TEMP"' EXIT
mkdir -p "$TEMP/project/src/dev/pjm/android" "$TEMP/project/bin/classes" "$TEMP/android-user" "$TEMP/lint-cache"
cp "$ROOT/host/android/AndroidManifest.xml" "$TEMP/project/AndroidManifest.xml"
cp "$ROOT"/host/android/*.java "$TEMP/project/src/dev/pjm/android/"
write_project() {
cat > "$TEMP/project.xml" <<XML
<project android="true">
  <sdk dir="$SDK"/>
  <jdk dir="$JAVA"/>
  <cache dir="$TEMP/lint-cache"/>
  <module name="host" android="true" compile-sdk-version="android-34" javaLanguage="1.8">
    <manifest file="$TEMP/project/AndroidManifest.xml"/>
    <classes dir="$TEMP/project/bin/classes"/>
    <classpath file="$SDK/platforms/android-34/android.jar"/>
XML
for SOURCE in "$TEMP"/project/src/dev/pjm/android/*.java; do
  # The manual project descriptor takes individual source files, not source roots.
  printf '    <src file="%s"/>\n' "$SOURCE" >> "$TEMP/project.xml"
done
for LIBRARY in "$ROOT"/vendor/android-http/*.jar "$ROOT"/vendor/android-location/jars/*.jar "$ROOT"/vendor/android-media/*.jar; do
  printf '    <classpath file="%s"/>\n' "$LIBRARY" >> "$TEMP/project.xml"
done
printf '  </module>\n</project>\n' >> "$TEMP/project.xml"
}
write_project
"$JAVA/bin/javac" -source 8 -target 8 -classpath "$SDK/platforms/android-34/android.jar:$ROOT/vendor/android-http/*:$ROOT/vendor/android-location/jars/*:$ROOT/vendor/android-media/*" -d "$TEMP/project/bin/classes" "$TEMP"/project/src/dev/pjm/android/*.java
JAVA_HOME="$JAVA" ANDROID_SDK_ROOT="$SDK" ANDROID_USER_HOME="$TEMP/android-user" \
  "$LINT" --offline --check NewApi,InlinedApi --project "$TEMP/project.xml" --text stdout --exitcode
# Verify that the analyzer is resolving Android APIs and honoring this minimum.
cat > "$TEMP/project/src/dev/pjm/android/ApiProbe.java" <<'JAVA'
package dev.pjm.android;
final class ApiProbe {
  void probe() { android.graphics.ImageDecoder.createSource(new java.io.File("probe")); }
}
JAVA
"$JAVA/bin/javac" -source 8 -target 8 -classpath "$SDK/platforms/android-34/android.jar" -d "$TEMP/project/bin/classes" "$TEMP/project/src/dev/pjm/android/ApiProbe.java"
write_project
set +e
JAVA_HOME="$JAVA" ANDROID_SDK_ROOT="$SDK" ANDROID_USER_HOME="$TEMP/android-user" \
  "$LINT" --offline --check NewApi,InlinedApi --project "$TEMP/project.xml" --text "$TEMP/probe.txt" --exitcode
PROBE_STATUS=$?
set -e
[ "$PROBE_STATUS" -eq 1 ] && grep -q 'ApiProbe.java' "$TEMP/probe.txt" && grep -Fq 'API level 28 (current min is 23)' "$TEMP/probe.txt" && grep -q '\[NewApi\]' "$TEMP/probe.txt" || {
  cat "$TEMP/probe.txt" >&2
  echo 'API analyzer failed to reject the API 28 negative control' >&2
  exit 1
}
cat "$TEMP/probe.txt"
echo 'API 28 negative control correctly rejected at the API 23 minimum.'
echo 'Android host API 23 source checks passed; dependency runtime and device execution remain separate gates.'
