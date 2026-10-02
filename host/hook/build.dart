import 'dart:convert';
import 'dart:io';
import 'package:code_assets/code_assets.dart';
import 'package:hooks/hooks.dart';

void main(List<String> arguments) async {
  await build(arguments, (input, output) async {
    if (!input.config.buildCodeAssets) return;
    final code = input.config.code;
    final arch = switch (code.targetArchitecture) {
      Architecture.arm64 => 'aarch64',
      Architecture.x64 => 'x86_64',
      _ => throw UnsupportedError(
        'Native host requires an arm64 or x64 target',
      ),
    };
    final target = switch (code.targetOS) {
      OS.macOS => '$arch-apple-darwin',
      OS.iOS =>
        code.iOS.targetSdk == IOSSdk.iPhoneSimulator
            ? (arch == 'aarch64' ? 'aarch64-apple-ios-sim' : 'x86_64-apple-ios')
            : 'aarch64-apple-ios',
      OS.linux => '$arch-unknown-linux-gnu',
      _ => throw UnsupportedError(
        'Native host currently supports macOS, Linux and iOS',
      ),
    };
    final upstreamFile = File.fromUri(
      input.packageRoot.resolve('upstream.txt'),
    );
    final upstream = (await upstreamFile.readAsString()).trim();
    final toolchainFile = File.fromUri(
      input.packageRoot.resolve('toolchain.json'),
    );
    final toolchain = await toolchainFile.exists()
        ? jsonDecode(await toolchainFile.readAsString()) as Map<String, dynamic>
        : <String, dynamic>{};
    final native = Directory.fromUri(input.outputDirectory.resolve('rust/'));
    await native.create(recursive: true);
    final source = input.packageRoot.resolve('native/src/lib.rs').toFilePath();
    await File('${native.path}/Cargo.toml').writeAsString('''
[package]
name = "pjm_native"
version = "0.2.0"
edition = "2024"
[lib]
crate-type = ["cdylib"]
path = ${jsonEncode(source)}
[dependencies]
pocket-apple = { path = ${jsonEncode('$upstream/engine/ios')} }
[profile.release]
opt-level = "s"
''');
    final lock = File('${native.path}/Cargo.lock');
    if (!await lock.exists())
      await File('$upstream/engine/Cargo.lock').copy(lock.path);
    final environment = (toolchain['environment'] as Map<String, dynamic>?)
        ?.cast<String, String>();
    final installed = await Process.run('rustup', [
      'target',
      'list',
      '--installed',
      '--toolchain',
      'stable',
    ], environment: environment);
    if (installed.exitCode != 0)
      throw StateError('A rustup-managed stable toolchain is required');
    if (!(installed.stdout as String).split('\n').contains(target)) {
      final add = await Process.start('rustup', [
        'target',
        'add',
        '--toolchain',
        'stable',
        target,
      ], environment: environment);
      await stdout.addStream(add.stdout);
      await stderr.addStream(add.stderr);
      if (await add.exitCode != 0)
        throw StateError('Could not install Rust target $target');
    }
    final cargo =
        await Process.start(toolchain['cargo'] as String? ?? 'cargo', [
          '+stable',
          'build',
          '--release',
          '--manifest-path',
          '${native.path}/Cargo.toml',
          '--target',
          target,
        ], environment: environment);
    await stdout.addStream(cargo.stdout);
    await stderr.addStream(cargo.stderr);
    if (await cargo.exitCode != 0)
      throw StateError('PocketJS native build failed for $target');
    final extension = code.targetOS == OS.linux ? 'so' : 'dylib';
    output.assets.code.add(
      CodeAsset(
        package: input.packageName,
        name: 'native.dart',
        linkMode: DynamicLoadingBundled(),
        file: Uri.file(
          '${native.path}/target/$target/release/libpjm_native.$extension',
        ),
      ),
    );
    output.dependencies.addAll([
      upstreamFile.uri,
      if (await toolchainFile.exists()) toolchainFile.uri,
      Uri.file(source),
      Uri.file('$upstream/engine/ios/Cargo.toml'),
      Uri.file('$upstream/engine/Cargo.lock'),
    ]);
  });
}
