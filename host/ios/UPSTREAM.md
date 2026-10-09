`PocketSurfaceView.h` and `PocketSurfaceView.m` derive from
`engine/ios/uikit/` at PocketJS commit
`fe971ebb8e14724d2a98d4df6b34c065caf11132`.
The original MIT notice is retained in `LICENSE.PocketJS`.

Mini owns this adapter so it can configure the exact service allowlist before
guest evaluation through the public C ABI. The pinned upstream checkout remains
unchanged. Compare changes against that revision when upgrading.

The embedded guest adapter uses Mini's `core-ffi` over the pinned Guest/UiSurface.
The copied external-guest API has been removed; Mini does not expose a
NativeScript or desktop host. Display-link/letterbox logic retains upstream
provenance. The host latches initial touch hits, assigns contact lifetime IDs,
preserves initial/final samples and sends explicit cancellation on UIKit
cancellation/backgrounding. Effects drain after the guest turn.

Current rendering uses `DirectMetalRenderer.m` with native owned GPU snapshots,
triangle batches, glyph-page/image resources and logical clipping.
`MetalPresenter.swift` supplies the CAMetalLayer view; its software pixel upload
adapter remains available but PocketSurfaceView's normal path uses direct Metal.
The surface limits outstanding submissions to three and fences prior work on
activation, backgrounding, retirement and shutdown. Test-mode hashes come from
actual GPU output through a blit/readback.

The earlier iOS 18.5 suites exercised the software-frame upload implementation.
Current direct Metal evidence includes actual offscreen GPU rendering plus iOS
26.4 simulator signed surface/lifecycle/services and production red/letterbox
rejection/center-touch blue/warm blue/cold red screenshot tests. Evidence is in
build/ios-validation/direct-metal-surface-20261005 and
direct-metal-touch-20261005. Complex graphics, iOS 26 rotation, physical-device
performance and process-wide resource accounting remain separate requirements.
