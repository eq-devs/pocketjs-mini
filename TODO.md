# PocketJS Mini SDK — complete acceptance scope

User resumed and expanded development authorization after reviewing this list.
Keep upstream sources untouched, no Flutter/JS CLI framework, public commands
create/run/clean, preserve user edits. Documentation serves this project, with
no requirement to onboard third-party integrators. Every unchecked requirement
remains in scope; compilation alone never proves execution.

## SDK and development experience
- [ ] Study official Flutter SDK architecture/workflows; record applicable decisions.
- [ ] One-time install, explicit SDK/upstream/dependency versions and reproducibility.
- [ ] Shared dependency/engine caches, upgrades with project version compatibility.
- [ ] Actionable dependency/toolchain/signing diagnostics and minimal project config.
- [ ] Editor completion/type-check/navigation and no app-maintained native projects.
- [ ] Unified iOS/Android real/simulated device discovery/selection/deployment.
- [ ] Compile/install/start/attach; container/native rebuild caching.
- [ ] USB Android transport, iOS transport, authorization/disconnection/reconnection.
- [ ] Latest-valid save reload, state-retaining update vs restart/rebuild semantics.
- [ ] Source mapping, stack traces, logs/network/native-call diagnostics.
- [ ] Accurate safe viewport/density/rotation, input and foreground/background lifecycle.
- [ ] Clean shutdown releases processes/ports/device sessions.

## Core protocol and modules
- [ ] JS-native registration/versioned protocol, strings/binary/errors/size limits.
- [ ] Async results/cancellation/timeouts/events, thread scheduling and ownership.
- [ ] Distinguish unavailable capability, denied permission and operation failure.
- [ ] HTTP/HTTPS, upload/download, WebSocket, proxy/TLS/Cookie/auth/retry policy.
- [ ] Large-transfer memory control, offline/disconnect/timeout/TLS-failure tests.
- [ ] Files, key-value storage/database, per-app directories and persistence.
- [ ] Migration/cache invalidation/corruption/no-space/recovery tests.
- [ ] App declarations, host authorization and OS permissions as separate gates.
- [ ] Permission request/denial/permanent denial/revocation/settings transitions.
- [ ] Platform/system/window/network information and capability queries.
- [ ] Links/clipboard/share services.
- [ ] Camera/photos/location/microphone/notifications with scoped permission tests.
- [ ] Bluetooth/NFC/biometrics/secure credentials/background task paths and tests.
- [ ] Hardware-dependent capabilities retain explicit hardware evidence requirements.

## Isolation, compatibility and delivery
- [ ] App identity, development/production separation and multi-project isolation.
- [ ] Document and test host trust boundaries, never claim unproven sandbox security.
- [ ] Replaceable test adapters and reproducible injected failures.
- [ ] Lowest OS and macOS/Linux/Windows development support matrix.
- [ ] System-killed process/connection recovery and SDK/module compatibility.
- [ ] Startup/reload/memory/background-energy measurements and acceptance budgets.
- [ ] Standalone offline apps, development/release signing, packaging/update paths.
- [ ] Core API/module documentation, examples, dependency/deprecation/release policy.
- [ ] Clean-environment install plus iOS/Android automated CI.
- [ ] Actual guest frame/tap/reload/error recovery/cleanup end-to-end evidence.
- [ ] Physical/emulated evidence recorded independently; unsupported OS constraints
      require authoritative documentation and are never represented as tested support.
- [ ] Commit/push, resolve CI failures and audit every explicit item before completion.
