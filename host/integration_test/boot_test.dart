import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:pjm_host/main.dart';

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();
  testWidgets(
    'real PocketJS guest boots and Flutter taps change engine pixels',
    (tester) async {
      await tester.pumpWidget(const MiniApp());
      final surface = find.byType(PocketSurface);
      final state = tester.state<PocketSurfaceState>(surface);
      for (var i = 0; i < 150 && state.frameHash == 0; i++) {
        await tester.pump(const Duration(milliseconds: 100));
      }
      expect(state.revision, greaterThan(0));
      expect(state.presentedFrames, greaterThan(0));
      expect(find.byKey(const Key('error')), findsNothing);
      final initial = state.frameHash;
      await tester.tap(find.byKey(const Key('pocket-surface')));
      for (var i = 0; i < 30 && state.frameHash == initial; i++) {
        await tester.pump(const Duration(milliseconds: 100));
      }
      final firstTap = state.frameHash;
      expect(
        firstTap,
        isNot(initial),
        reason: 'Touch must update the actual native guest framebuffer',
      );
      await tester.tap(find.byKey(const Key('pocket-surface')));
      for (var i = 0; i < 30 && state.frameHash == firstTap; i++) {
        await tester.pump(const Duration(milliseconds: 100));
      }
      expect(state.frameHash, isNot(firstTap));
      expect(state.frameHash, isNot(initial));
      expect(find.byKey(const Key('error')), findsNothing);
      const control = String.fromEnvironment('PJM_TEST_CONTROL');
      if (control.isNotEmpty) {
        Future<void> edit(String action) async {
          final client = HttpClient();
          try {
            final request = await client.postUrl(
              Uri.parse(control).resolve(action),
            );
            final response = await request.close();
            expect(response.statusCode, 200);
            await response.drain<void>();
          } finally {
            client.close(force: true);
          }
        }

        Future<void> until(bool Function() done) async {
          for (var i = 0; i < 300 && !done(); i++) {
            await tester.pump(const Duration(milliseconds: 100));
          }
          expect(done(), isTrue);
        }

        final beforeSave = state.revision;
        final beforePixels = state.frameHash;
        await edit('saved');
        await until(
          () => state.revision > beforeSave && state.frameHash != beforePixels,
        );
        expect(find.byKey(const Key('error')), findsNothing);
        final saved = state.revision;
        await edit('compile-error');
        await until(() => find.byKey(const Key('error')).evaluate().isNotEmpty);
        expect(find.textContaining('TS'), findsOneWidget);
        expect(state.revision, saved);
        await edit('restore');
        await until(
          () =>
              state.revision > saved &&
              find.byKey(const Key('error')).evaluate().isEmpty,
        );
        final restored = state.revision;
        await edit('runtime-error');
        await until(
          () => find
              .textContaining('Intentional guest failure')
              .evaluate()
              .isNotEmpty,
        );
        expect(state.revision, restored);
        await edit('restore');
        await until(
          () =>
              state.revision > restored &&
              find.byKey(const Key('error')).evaluate().isEmpty,
        );
      }
      await tester.pumpWidget(const SizedBox());
      await tester.pump();
    },
  );
}
