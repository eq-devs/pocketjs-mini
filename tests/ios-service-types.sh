#!/bin/bash
set -eu
ROOT=$(cd "$(dirname "$0")/.." && pwd)
SDK=$(xcrun --sdk iphonesimulator --show-sdk-path)
TEMP=$(mktemp -d "${TMPDIR:-/private/tmp}/pjm-ios-service-types.XXXXXX")
trap 'rm -rf "$TEMP"' EXIT
xcrun swiftc -typecheck -module-name Mini -sdk "$SDK" -target arm64-apple-ios15.0-simulator \
  -module-cache-path "$TEMP/modules" -emit-objc-header -emit-objc-header-path "$TEMP/Mini-Swift.h" \
  "$ROOT/host/ios/PackageVerifier.swift"
xcrun --sdk iphonesimulator clang -fsyntax-only -fobjc-arc -target arm64-apple-ios15.0-simulator \
  -isysroot "$SDK" -I "$TEMP" -I "$ROOT/host/ios" -I "$ROOT/core-ffi/include" \
  "$ROOT/host/ios/PackageStore.m" "$ROOT/host/ios/InstalledController.m" \
  "$ROOT/tests/native-clipboard-ios.m" "$ROOT/tests/package-load-ios.m"
echo 'iOS permission/clipboard host and fixture syntax checks passed; runtime tests were not executed.'
