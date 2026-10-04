#!/bin/bash
set -eu
ROOT=$(cd "$(dirname "$0")/.." && pwd)
TEMP=$(mktemp -d /private/tmp/pjm-package-load.XXXXXX)
trap 'rm -rf "$TEMP"' EXIT
bun "$ROOT/tests/package-load-fixtures.ts" "$TEMP/cases.json"
export RUSTC=$(rustup which --toolchain stable rustc)
rustup run stable cargo build --offline --locked --manifest-path "$ROOT/core-ffi/Cargo.toml"
xcrun swiftc -module-cache-path "$TEMP/modules" -emit-library -emit-module -module-name Mini -emit-module-path "$TEMP/Mini.swiftmodule" -emit-objc-header -emit-objc-header-path "$TEMP/Mini-Swift.h" "$ROOT/host/ios/PackageVerifier.swift" -o "$TEMP/libMini.dylib"
xcrun clang -fobjc-arc -fmodules -fmodules-cache-path="$TEMP/clang" -I "$TEMP" -I "$ROOT/core-ffi/include" -I "$ROOT/host/ios" "$ROOT/host/ios/VerifiedPackage.m" "$ROOT/host/ios/VerifiedContainer.m" "$ROOT/host/ios/PackageStore.m" "$ROOT/host/ios/AppStorage.m" "$ROOT/tests/package-load-ios.m" -L "$TEMP" -lMini -L "$ROOT/core-ffi/target/debug" -lmini_core_ffi -Wl,-rpath,"$TEMP" -Wl,-rpath,"$ROOT/core-ffi/target/debug" -framework Foundation -o "$TEMP/check"
"$TEMP/check" "$TEMP/cases.json"
