import 'dart:io';
import 'package:flutter_test/flutter_test.dart';
import 'package:pjm_host/native.dart';

void main() {
  final directory = Platform.environment['PJM_BUNDLE_DIR'];
  if (directory == null)
    throw StateError('PJM_BUNDLE_DIR must identify a compiled hello revision');
  final js = File('$directory/app.js').readAsBytesSync();
  final pak = File('$directory/app.pak').readAsBytesSync();
  test(
    'QuickJS boots, renders and processes touch without any Dart UI implementation',
    () {
      final engine = PocketEngine(js, pak);
      try {
        engine.tick();
        final initial = engine.pixels();
        expect(initial.length, 480 * 272 * 4);
        expect(initial.toSet().length, greaterThan(2));
        engine.tick((136 << 9) | 240);
        engine.tick();
        final first = engine.pixels();
        expect(first, isNot(orderedEquals(initial)));
        engine.tick((136 << 9) | 240);
        engine.tick();
        expect(engine.pixels(), isNot(orderedEquals(first)));
      } finally {
        engine.dispose();
      }
      expect(() => engine.tick(), throwsStateError);
      engine.dispose();
    },
  );
  test(
    'native guest errors are reported, and a subsequent valid boot recovers',
    () {
      expect(
        () => PocketEngine(
          File('$directory/app.js').readAsBytesSync().sublist(0, 30),
          pak,
        ),
        throwsStateError,
      );
      final engine = PocketEngine(js, pak);
      engine.tick();
      expect(engine.pixels().length, 480 * 272 * 4);
      engine.dispose();
    },
  );
}
