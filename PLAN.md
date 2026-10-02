# Flutter development experience — plan and acceptance

## Objective

Keep PocketJS upstream untouched. Make `pjm create`, `pjm run`, and `pjm clean`
the public commands; remove public `build`. `run` owns compilation, an
interactive Flutter host, source watching, reload, logs, and shutdown.
Connect the actual PocketJS runtime/rendering engine to Flutter, with an
interactive counter, rather than recreating the UI in Dart.

## Work sequence

1. Inspect upstream native ABI, guest execution, framebuffer and input APIs;
   inspect available Flutter SDK and devices. Choose the smallest usable bridge.
2. Prove native engine + guest boot + framebuffer + touch through a narrow API.
3. Display that framebuffer in Flutter, forward pointer events, and verify a
   TSX counter changes text and pixels after a tap.
4. Wire `pjm run` to compile automatically, launch Flutter, watch app/assets,
   reload on valid changes, show errors on invalid changes, and recover.
5. Validate mobile integration on an available Android/iOS simulator or device;
   record exact scope. Provide documented install/run instructions.
6. Add meaningful regression/CI coverage, run checks, commit and push changes,
   inspect CI and fix failures. Audit all acceptance criteria before completion.

## Acceptance checklist

- [ ] Public `build` is rejected; `run` compiles without a preceding command.
- [ ] A newly created project boots in an interactive Flutter host.
- [ ] Pixels come from the PocketJS engine executing the TSX guest.
- [ ] Flutter pointer input reaches the guest; a tap updates counter text/pixels.
- [ ] Saving source rebuilds/reloads; stale builds cannot replace newer changes.
- [ ] Compile/runtime failures are visible and a valid edit recovers.
- [ ] Host shutdown stops watchers/server/child processes.
- [ ] `clean` preserves source and safely removes generated output.
- [ ] Mobile host builds and runs on an explicitly identified target; real-device
      evidence is reported separately from emulator/simulator evidence.
- [ ] Upstream tracked files are unchanged.
- [ ] README, example, changelog and CI match the final behavior.
- [ ] Relevant tests and remote CI pass; changes are committed and published.

## Constraints and tradeoffs

Prefer a small native bridge using upstream C ABI and QuickJS. First prove
correctness with software framebuffer presentation; GPU texture optimization
can follow measured need. Do not substitute browser-only preview or a Dart
reimplementation for the Flutter/PocketJS integration. SDK/device availability
may affect what can be proven locally; incomplete criteria stay open.
