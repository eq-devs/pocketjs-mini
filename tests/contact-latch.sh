#!/bin/bash
set -eu
ROOT=$(cd "$(dirname "$0")/.." && pwd)
UPSTREAM=${PJM_UPSTREAM:-$ROOT/examples/hello/.pjm/pocketjs}
TEMP=$(mktemp -d /private/tmp/pjm-contact.XXXXXX)
trap 'rm -rf "$TEMP"' EXIT
clang -std=c11 -Wall -Wextra -Werror -I "$ROOT/host/android" -I "$UPSTREAM/engine/quickjs-c" -I "$UPSTREAM/hosts/blackberry-classic" "$ROOT/tests/contact-latch.c" -o "$TEMP/check"
"$TEMP/check"
