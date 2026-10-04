#!/bin/bash
set -eu
ROOT=$(cd "$(dirname "$0")/.." && pwd)
TEMP=$(mktemp -d /private/tmp/pjm-core-ffi.XXXXXX)
trap 'rm -rf "$TEMP"' EXIT
RUSTC=$(rustup which --toolchain stable rustc)
export RUSTC
rustup run stable cargo test --offline --locked --manifest-path "$ROOT/core-ffi/Cargo.toml"
rustup run stable cargo build --offline --locked --manifest-path "$ROOT/core-ffi/Cargo.toml"
xcrun clang -std=c11 -I "$ROOT/core-ffi/include" "$ROOT/tests/core-ffi.c" \
  -L "$ROOT/core-ffi/target/debug" -lmini_core_ffi -Wl,-rpath,"$ROOT/core-ffi/target/debug" -o "$TEMP/core-ffi-test"
"$TEMP/core-ffi-test" "$@"
