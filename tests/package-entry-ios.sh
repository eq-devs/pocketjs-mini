#!/bin/bash
set -eu
ROOT=$(cd "$(dirname "$0")/.." && pwd)
SERIAL=${1:?Pass a booted iOS simulator UUID}
EVIDENCE=${2:-$ROOT/build/ios-validation/installed-entry-$(date -u +%Y%m%dT%H%M%SZ)}
TEMP=$(mktemp -d /private/tmp/pjm-installed-entry.XXXXXX)
BUNDLE="dev.pjm.installed.$(basename "$TEMP" | tr '[:upper:]' '[:lower:]')"
cleanup(){
  xcrun simctl terminate "$SERIAL" "$BUNDLE" >/dev/null 2>&1 || true
  xcrun simctl uninstall "$SERIAL" "$BUNDLE" >/dev/null 2>&1 || true
  rm -rf "$TEMP"
}
trap cleanup EXIT
cd "$ROOT"
unset PJM_PACKAGE_REAL
mkdir -p "$EVIDENCE"
PJM_PACKAGE_VISUAL=1 bun "$ROOT/tests/package-load-fixtures.ts" "$TEMP/cases.json"
export RUSTC=$(rustup which --toolchain stable rustc)
export IPHONEOS_DEPLOYMENT_TARGET=16.0
rustup run stable cargo build --offline --locked --release --target aarch64-apple-ios-sim --manifest-path "$ROOT/core-ffi/Cargo.toml" > "$EVIDENCE/core-build.log" 2>&1
export PJM_ENTRY_TEMP="$TEMP" PJM_ENTRY_BUNDLE="$BUNDLE" PJM_ENTRY_ROOT="$ROOT"
bun -e 'import {readFileSync,writeFileSync}from"node:fs";import{writeInstalledProject}from"./bin/installed-project.ts";const root=process.env.PJM_ENTRY_TEMP!,item=JSON.parse(readFileSync(root+"/cases.json","utf8"))[0];for(const[name,bytes]of[["main.pocket",Buffer.from(item.payload,"base64")],["manifest.json",JSON.stringify(item.manifest)],["publisher.key",Buffer.from(item.key,"base64")]])writeFileSync(root+"/"+name,bytes);writeInstalledProject({directory:root+"/host",library:process.env.PJM_ENTRY_ROOT!+"/core-ffi/target/aarch64-apple-ios-sim/release/libmini_core_ffi.a",payload:root+"/main.pocket",envelope:root+"/manifest.json",publicKey:root+"/publisher.key",bundle:process.env.PJM_ENTRY_BUNDLE!})'
cp "$ROOT/tests/InstalledEntryTests.swift" "$TEMP/host/Tests.swift"
xcodebuild -project "$TEMP/host/Mini.xcodeproj" -scheme Mini -destination "platform=iOS Simulator,id=$SERIAL" -derivedDataPath "$TEMP/derived" -resultBundlePath "$EVIDENCE/Tests.xcresult" -parallel-testing-enabled NO test CODE_SIGNING_ALLOWED=NO ARCHS=arm64 > "$EVIDENCE/test.log" 2>&1 || { tail -60 "$EVIDENCE/test.log"; exit 1; }
APP="$TEMP/derived/Build/Products/Release-iphonesimulator/Mini.app"
if strings "$APP/Mini" | rg -q -- '--pjm-url|Starting PocketJS|revision='; then echo 'Development loader leaked into installed host'; exit 1; fi
rg 'Test Case.*passed|TEST SUCCEEDED' "$EVIDENCE/test.log"
printf '%s\n' "$SERIAL" > "$EVIDENCE/simulator.txt"
