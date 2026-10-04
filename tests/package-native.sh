#!/bin/bash
set -eu
ROOT=$(cd "$(dirname "$0")/.." && pwd)
TEMP=$(mktemp -d /private/tmp/pjm-package-native.XXXXXX)
trap 'rm -rf "$TEMP"' EXIT
bun "$ROOT/tests/package-native-fixtures.ts" "$TEMP/cases.json"
xcrun swiftc -module-cache-path "$TEMP/modules" "$ROOT/host/ios/PackageVerifier.swift" "$ROOT/tests/package-native.swift" -o "$TEMP/check"
"$TEMP/check" "$TEMP/cases.json"
