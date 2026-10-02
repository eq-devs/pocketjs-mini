#!/bin/bash
set -eu
ROOT=$(cd "$(dirname "$0")/.." && pwd)
PJM="$ROOT/bin/pjm"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
cd "$tmp"
must_fail() { if "$@" >failure.log 2>&1; then echo "unexpected success: $*" >&2; exit 1; fi; }
must_fail "$PJM"
must_fail "$PJM" dev
must_fail "$PJM" create ../escape
must_fail "$PJM" create -hello
must_fail "$PJM" create hello extra
must_fail "$PJM" clean
"$PJM" create hello
must_fail "$PJM" create hello
test -f hello/app/main.tsx
test -d hello/assets
cd hello
must_fail "$PJM" build extra
"$PJM" build
test -s build/hello.pocket
PJM_EXPECT_TEXT='Hello PocketJS Mini' "$PJM" run
# A process returning zero is insufficient: prove the tree assertion can fail.
must_fail env PJM_EXPECT_TEXT='text that does not exist' "$PJM" run
# Broken app sources must fail compilation, without silently running old output.
cp app/main.tsx "$tmp/main.tsx"
echo 'this is not valid TypeScript' > app/main.tsx
must_fail "$PJM" build
must_fail "$PJM" run
cp "$tmp/main.tsx" app/main.tsx
"$PJM" clean
test ! -e build
test -f app/main.tsx
test -f mini.json
test -d assets
"$PJM" clean
mkdir "$tmp/keep"
ln -s "$tmp/keep" build
must_fail "$PJM" clean
test -d "$tmp/keep"
rm build
echo 'All Mini checks passed'
