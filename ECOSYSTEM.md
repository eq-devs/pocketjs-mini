# First-day direction: a small native mini-program development container

We borrow the separation of application, host and development tooling. A
mini-program ecosystem includes far more than rendering: stable APIs,
lifecycle, package compatibility, permissions, distribution and diagnostics.
Those are incremental product responsibilities, not a reason to reproduce an
entire vendor platform on day one.

## Principles applied now

- Applications contain TSX/assets/config; they do not contain a Flutter project.
- The host owns phone window geometry, safe areas, display scheduling and input.
- The compiler and host agree on an explicit versioned contract. Changing phone
  geometry changes that contract snapshot and triggers a negotiated rebuild.
- Logical layout size, render density and screen pixels are distinct values.
- `pjm run` owns development setup, compilation, errors, reload and shutdown.
- Template layout fills the safe viewport; it does not guess a particular phone
  resolution or scale an old fixed canvas to cover a new screen.

WeChat's official API declarations expose `getWindowInfo`, `onWindowResize`,
application lifecycle callbacks, and base-library information. Alipay's window
API explicitly distinguishes logical window dimensions, pixel ratio and safe
area. These interfaces inform the boundaries above; we do not claim to implement
vendor APIs or their full runtime architecture.

Primary references:

- [WeChat official API declarations](https://github.com/wechat-miniprogram/api-typings/blob/master/types/wx/lib.wx.api.d.ts)
- [Alipay window information](https://miniprogram.alipay.com/docs/miniprogram/mpdev/api_device_getwindowinfo)
- [PocketJS native view](https://github.com/pocket-nexus/pocketjs/blob/fe971ebb8e14724d2a98d4df6b34c065caf11132/engine/ios/uikit/PocketSurfaceView.h)

## Later, after the current phone loop is reliable

1. Define a small public window/lifecycle API. Internal `__pjmWindow` is not a
   promised application API; its current measurements are diagnostic only.
2. Unify application configuration around the upstream manifest, while retaining
   TypeScript's standard `tsconfig.json`. Choose JSON/YAML for authoring based on
   tooling needs rather than treating file format as architecture.
3. Preserve state across viewport changes only after proving a real resize path.
   Today's rebuild-on-rotation explicitly resets the guest.
4. Add Android's native container and real-device development transport.
5. Add permission-scoped services, keyboard/IME and accessibility before claiming
   a general production application framework.
6. Define package compatibility, update/rollback and distribution when there is
   a concrete deployment target. Payments, accounts, app marketplaces and a large
   custom IDE are outside the first-day scope.

Current evidence proves a local trusted-code development container. It does not
prove security isolation, production distribution or parity with WeChat.
