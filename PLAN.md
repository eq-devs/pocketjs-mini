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

- [x] Public `build` is rejected; `run` compiles without a preceding command.
- [x] A newly created project boots in an interactive Flutter host.
- [x] Pixels come from the PocketJS engine executing the TSX guest.
- [x] Flutter pointer input reaches the guest; a tap updates counter text/pixels.
- [x] Saving source rebuilds/reloads; stale builds cannot replace newer changes.
- [x] Compile/runtime failures are visible and a valid edit recovers.
- [x] Host shutdown stops watchers/server/child processes.
- [x] `clean` preserves source and safely removes generated output.
- [x] Mobile host builds and runs on an explicitly identified target; real-device
      evidence is reported separately from emulator/simulator evidence.
- [x] Upstream tracked files are unchanged.
- [x] README, example, changelog and CI match the final behavior.
- [x] Relevant tests and remote CI pass; changes are committed and published.

## Constraints and tradeoffs

Prefer a small native bridge using upstream C ABI and QuickJS. First prove
correctness with software framebuffer presentation; GPU texture optimization
can follow measured need. Do not substitute browser-only preview or a Dart
reimplementation for the Flutter/PocketJS integration. SDK/device availability
may affect what can be proven locally; incomplete criteria stay open.

## Acceptance evidence

Validated on 2026-10-02. The public workflow creates a disposable TSX project,
compiles automatically and launches Flutter. Command regression tests passed
31 assertions, including rejected `build`, duplicate sessions, rapid edits,
asset edits, error recovery, shutdown and safe/idempotent cleanup.

Native tests passed both cases: upstream QuickJS execution with a nonempty
framebuffer and two input-driven framebuffer changes; invalid guest rejection
followed by successful recovery. Flutter analysis reported no issues.

Interactive Flutter acceptance passed locally on iPhone 17 Pro, iOS 26.4,
simulator `69A9330F-92B1-4192-B44E-035E41272064`. It verified boot, two taps,
saved-source reload, visible TypeScript errors retaining the last revision,
visible guest runtime errors, and recovery after each error. Public `pjm run -d`
also launched that simulator; the genuine rendered screen is captured in
`../iphone-pocketjs.png`. No physical-phone or Android result is claimed.
The default public `pjm run` also launched the macOS host.

[GitHub Actions run 36995430231](https://github.com/eq-devs/pocketjs-mini/actions/runs/36995430231)
passed all Linux, macOS and iPhone simulator jobs, including the interactive
reload/error acceptance. Later changes add automatic missing Rust target setup
and bounded simulator launch/retry; the release gate is a successful validation
run on the final published commit. Assertions are never retried after failure.

The untouched upstream clone passed `git diff --exit-code` and had no tracked
changes. README, template/example, changelog and workflow describe the same
three-command implementation. Changes are committed and published to `main`.

The moving `macos-latest` iPhone environment intermittently stalled after a
successful Xcode build, before any assertion (run 36998991688 exhausted both
bounded attempts). Mobile CI now pins macOS 15, Xcode 16.4 and iOS 18.5 iPhone
16 Pro. Local iOS 26.4 coverage remains separate. Verbose mobile CI logs retain
launch diagnostics. The complete acceptance assertions are unchanged.
