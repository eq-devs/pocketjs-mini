#!/bin/bash
set -eu
ROOT=$(cd "$(dirname "$0")/.." && pwd)
SDK=$(xcrun --sdk iphonesimulator --show-sdk-path)
TEMP=$(mktemp -d "${TMPDIR:-/private/tmp}/pjm-ios-service-types.XXXXXX")
trap 'rm -rf "$TEMP"' EXIT
xcrun clang -std=c11 -Wall -Wextra -Werror -I "$ROOT/host/ios" "$ROOT/tests/touch-sampling-ios.c" -o "$TEMP/touch-check"
"$TEMP/touch-check"
xcrun swiftc -typecheck -module-name Mini -sdk "$SDK" -target arm64-apple-ios15.0-simulator \
  -module-cache-path "$TEMP/modules" -emit-objc-header -emit-objc-header-path "$TEMP/Mini-Swift.h" \
  "$ROOT/host/ios/PackageVerifier.swift" "$ROOT/host/ios/MetalPresenter.swift"
printf '#define PJM_TEST_MODE 0\n#define PJM_DEVELOPMENT_MODE 1\n#define PJM_DEFAULT_URL "http://127.0.0.1:1/"\n' > "$TEMP/Config.h"
xcrun --sdk iphonesimulator clang -fsyntax-only -fobjc-arc -target arm64-apple-ios15.0-simulator \
  -include UIKit/UIKit.h \
  -isysroot "$SDK" -I "$TEMP" -I "$ROOT/host/ios" -I "$ROOT/core-ffi/include" \
  "$ROOT/host/ios/PackageStore.m" "$ROOT/host/ios/InstalledController.m" \
  "$ROOT/host/ios/VerifiedContainer.m" \
  "$ROOT/host/ios/PocketSurfaceView.m" \
  "$ROOT/host/ios/main.m" \
  "$ROOT/host/ios/DirectMetalRenderer.m" "$ROOT/host/ios/GpuResourceBudget.m" "$ROOT/host/ios/VerifiedLocation.m" "$ROOT/host/ios/VerifiedNetwork.m" "$ROOT/host/ios/MediaImage.m" "$ROOT/host/ios/VerifiedMedia.m" \
  "$ROOT/tests/native-clipboard-ios.m" "$ROOT/tests/package-load-ios.m"
echo 'iOS permission/clipboard host and fixture syntax checks passed; runtime tests were not executed.'
