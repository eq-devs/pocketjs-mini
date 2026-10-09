#!/bin/bash
set -eu
ROOT=$(cd "$(dirname "$0")/.." && pwd)
BUN=${PJM_BUN:-bun}
RUSTUP=${PJM_RUSTUP:-rustup}
export RUSTC=${RUSTC:-$("$RUSTUP" which --toolchain stable rustc)}
"$RUSTUP" run stable cargo test --lib --offline --locked --manifest-path "$ROOT/core-ffi/Cargo.toml"
"$RUSTUP" run stable cargo build --release --offline --locked --manifest-path "$ROOT/core-ffi/Cargo.toml"
"$BUN" "$ROOT/tests/replay-native-cli.ts"
