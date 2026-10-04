`PocketSurfaceView.h` and `PocketSurfaceView.m` derive from
`engine/ios/uikit/` at PocketJS commit
`fe971ebb8e14724d2a98d4df6b34c065caf11132`.
The original MIT notice is retained in `LICENSE.PocketJS`.

Mini owns this adapter so it can configure the exact service allowlist before
guest evaluation through the public C ABI. The pinned upstream checkout remains
unchanged. Compare changes against that revision when upgrading.

This remains the software-framebuffer development view. The planned Swift/Metal
production renderer remains a separate requirement.

The embedded guest adapter now uses Mini's `core-ffi` instead of pocket-apple.
The copied external-guest API has been removed from this Mini-only view; Mini
does not expose a NativeScript or desktop host. Display-link/letterbox logic
retains its upstream provenance. The host latches initial touch hits, assigns
contact lifetime IDs, preserves quick taps, and sends explicit cancellations
on UIKit cancellation/backgrounding. Service effects drain after the guest
turn rather than reentering the engine during a callback.

The development renderer still copies full software frames into CALayer.
Swift/Metal and incremental presentation remain unfinished. Shared-engine
limits now apply to this source path, but the earlier native acceptance results
prove the previous engine. Fresh shared-engine acceptance passes all three
tests on iPhone 16 / iOS 18.5 Simulator; physical-device and other-OS evidence
remain separate requirements.

Swift Metal presentation continuation:

The view now embeds `MetalPresenter.swift`, a CAMetalLayer-backed presenter
with three texture slots protected until GPU completion. It uploads the shared
engine's software BGRA pixels and renders an aspect-fitted textured quad.
Acceptance hashes come from the rendered drawable using a test-only GPU blit
and CPU readback on the first submission and every 30 submissions.

`metal-ios18-2-1791045400.xcresult` passes all three native tests on iPhone 16 /
iOS 18.5 Simulator, including coverage, taps/rotation, services and storage.
Direct DrawList GPU rendering, incremental damage, Swift-owned engine/input
lifecycle, global resource caps and physical performance remain unfinished.
