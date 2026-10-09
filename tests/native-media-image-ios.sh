#!/bin/bash
set -eu
ROOT=$(cd "$(dirname "$0")/.." && pwd)
TEMP=$(mktemp -d /private/tmp/pjm-native-media-image.XXXXXX)
trap 'rm -rf "$TEMP"' EXIT
xcrun clang -fobjc-arc -Wall -Wextra -Werror -I "$ROOT/host/ios" -framework Foundation -framework ImageIO -framework CoreGraphics "$ROOT/host/ios/MediaImage.m" "$ROOT/tests/native-media-image-ios.m" -o "$TEMP/check"
"$TEMP/check"
