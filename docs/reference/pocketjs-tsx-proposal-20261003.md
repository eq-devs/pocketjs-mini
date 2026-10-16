# 基于 PocketJS 的 TSX 小程序引擎技术方案

Oct 3, 2026 · @e

## 概述与结论

结论：以 PocketJS 的 Rust 核心和 QuickJS guest 作为渲染与逻辑底座，在 iOS 和安卓上各写一个原生薄宿主（不用 Flutter），开发者用 TSX 写小程序，工具链仿照 Flutter 的体验来做。

**目标**

- 一个全新的小程序引擎，不兼容微信或其他现有小程序生态。
- 只支持 iOS 和安卓两个平台。
- 开发者用 TSX（建议 Solid）编写小程序，编译成包后下发到宿主运行。
- 开发体验对标 Flutter：一个 CLI 完成创建、运行、构建，支持真机热重启，有可视化调试工具。

**本期不做**

- 中文文本与输入法（第一阶段只做拉丁字符，后续再接运行时字体和系统输入法）。
- 桌面、Web、掌机等其他宿主。
- 原生控件（地图、视频、WebView）的同层渲染。

**核心决策**

| 决策点 | 选择 | 主要理由 |
| --- | --- | --- |
| 渲染与布局 | 复用 PocketJS Rust 核心（pocketjs-core） | no\_std 单一核心，两端同一份代码，布局、动画、绘制列表全部现成 |
| JS 引擎 | QuickJS | PocketJS 默认引擎，体积小、可嵌入、iOS 上不依赖 JIT |
| 开发框架 | Solid TSX | PocketJS 一等公民，无虚拟 DOM，PSP 上实测帧耗时最低之一 |
| 宿主技术 | 原生薄宿主（Swift + Metal，Kotlin + JNI + GLES/Vulkan） | PocketJS 自己画每一个像素，Flutter 会造成双引擎、双合成 |
| 渲染载体 | iOS：CAMetalLayer；安卓：SurfaceView | 系统合成器直接合成该图层，无二次渲染 |
| 输入 | 宿主采集原始触点，按帧投递给核心 | 与 PocketJS 的帧确定性模型一致 |
| 原生能力 | 通过 svc 服务通道做 JSBridge | PocketJS 已有 guest↔宿主 JSON 行协议 |
| 版本策略 | 锁定版本，fork engine/core 与 framework | 上游迭代快、破坏性改动多 |

需要提前说明：PocketJS 现有的 iOS 和安卓宿主都是开发级配置，生产级宿主需要自己写。本文第 5 至第 9 节就是这部分的设计。

## PocketJS 原理

PocketJS 用 QuickJS 运行 TSX 应用，用一个 Rust 核心完成布局和绘制，全部在一个进程的一个线程里，没有 DOM、CSS 引擎和 WebView（[README](https://github.com/pocket-nexus/pocketjs)）。

### 三层结构

1. **JS 层（guest）**：Solid、Vue Vapor 或 Octane 的适配器在 JS 侧维护一棵镜像树 `{ id, parent, children[], … }`，框架读取树结构时不跨 FFI，只有变更操作才进入原生层。`setProperty` 走分派表：`className` 映射到样式 id，`on*` 进入输入注册表，`src` 进入纹理注册表，`style={{…}}` 按属性 id 做前值比较。无法识别的属性在开发期直接报错。Solid 走 universal renderer，只调用 `createNode`、`insertBefore`、`setProperty`、`replaceText` 等少量节点操作，由 PocketJS 映射到原生 `ui.*` 接口（[Architecture](https://pocketjs.pocket.nexus/docs/architecture/)）。
2. **Rust 核心（pocketjs-core）**：`#![no_std]` + `alloc` 的平台无关库，不含 I/O、图形 API 和计时。它负责节点树（带代际计数器的 arena，过期句柄是安全的空操作）、taffy 0.11 flexbox 布局、样式表解析与 base/focus/active 变体、文字测量、动画、2D 物理，最后把树遍历成一份扁平的 DrawList。CPU 裁剪阶段保证不会有负数或超大坐标传给后端。
3. **后端**：只消费 DrawList。现有后端包括 PSP 的 sceGu、Vita 的 GXM、桌面的 gpui、调试宿主的 wgpu、wasm 的软件光栅化，以及 macOS 的 Metal 宿主。

### 构建期产物

`pocket build` 按目标解析 `pocket.json`，运行 JSX 转换，把 class 字符串编译成二进制样式表 `styles.bin`，按目标密度烘焙字形图集和图片资源，打包成 `app.pak`；JS 打包成 `bundle.js`，内嵌目标与 ABI 常量。运行时样式按表查找，设备上没有 CSS 解析、层叠和重排。样式词汇是固定的 Tailwind 子集。关键帧和弹簧曲线也在构建期烘焙进样式表，由 Rust 核心按自己的时钟推进，动画期间不需要每帧执行 JS。

对小程序引擎来说这一点是优势：小程序包本来就是开发者编译后上传，样式在构建期定型正好匹配这个流程。

### 帧模型

宿主每帧调用一次 `frame(...)`，时间就是帧计数器。一帧是不可打断的事务，外部效果（例如网络回包）在帧中途到达时会排队，到下一帧开始、任何应用钩子运行前按 FIFO 投递；用 `after()` 代替 `setTimeout`，期限按帧计算。

```
state n+1 = F(state n, input n)
pixels n  = G(state n)
```

这个模型带来两个直接好处：测试可以不等真实时间地快速重放；所有输入都录成“磁带”，可以逐字节重放和时间旅行调试。

动画在 Rust 内以 `dt = 1/hz` 的固定步长推进，`hz` 默认 60、上限 240，构建时烘焙，宿主上报的 `ui.__tickHz` 不一致时拒绝挂载。

### QuickJS 的约束

QuickJS 大致是 ES2023，现代语法可用，但缺少以下能力，直接影响 API 设计：

| QuickJS 缺失 | PocketJS 的处理 | 对小程序 API 的影响 |
| --- | --- | --- |
| `queueMicrotask` | 用 `Promise.resolve().then` 补齐，宿主每帧清空一次 promise 队列 | Promise 结果在帧边界生效 |
| `setTimeout` / `clearTimeout` | 补丁版 `setTimeout` 降级为微任务并忽略延迟，`clearTimeout` 为空操作 | 小程序 SDK 必须提供按帧计时的 `after()` 或宿主计时器，并在文档里禁止依赖 `setTimeout` 延迟 |
| `MessageChannel`、`performance` | 不提供，时间以帧序号为准 | 计时类 API 以帧为单位 |

此外，Solid 的 `createResource`、`useTransition`、`startTransition` 在编译期被禁用，构建会直接失败，而不是在设备上出错。节点生命周期不依赖 GC：镜像树在帧末显式清扫，游离子树用 `retain` / `release` 管理。

## 安卓与 iOS 现状

PocketJS 在两个平台上都已经跑起来过，但都是开发级配置，没有生产级目标；可复用的是核心、构建链和宿主代码结构，不是可以直接上线的宿主。

| 平台 | 现有宿主 | 成熟度 | 可复用的部分 | 来源 |
| --- | --- | --- | --- | --- |
| 安卓 | Moto G Play 配置（`moto-g-play-dev`），arm64、API 23+、GLES2，逻辑 360×800、物理 720×1600、密度 2，`bun android build` 产出约 1 MB 的 APK | 开发配置，绑定单一机型参数 | 宿主入口、GLES2 后端、APK 打包与 v1/v2 签名、触点锁存器 | [PR #463](https://github.com/pocket-nexus/pocketjs/pull/463)、[PR #396](https://github.com/pocket-stack/pocketjs/pull/396) |
| iOS（当前系统） | NativeScript 宿主 + `PocketApple.xcframework`，提供 PocketView（独立 QuickJS realm，JSON 行服务通道）和 PocketHostView（NativeScript 运行时作 guest 引擎）两种模式 | 明确标注为开发用 guest 宿主，验证过模拟器启动、渲染、触摸和双向通信，不是生产目标 | xcframework 构建脚本（`engine/apple/build-xcframework.sh`）、原生侧渲染的 surface view、服务通道 | [NativeScript/pocketjs](https://github.com/NativeScript/pocketjs)、[PR #257](https://github.com/pocket-stack/pocketjs/pull/257/files) |
| iOS（旧系统） | iOS 12.5.8 arm64、iOS 6.1.3 ARMv7、iPhone OS 3.1.3 的独立宿主 | 实机启动过，面向老设备 | UIKit 触摸处理、旧版 UIKit 与安卓共用的触点锁存器 | [README](https://github.com/pocket-nexus/pocketjs) |
| macOS | Metal 窗口与组件宿主 | 已合并 | Metal 后端，iOS 宿主可直接参考 | [README](https://github.com/pocket-nexus/pocketjs) |

**几点值得注意的细节**

- NativeScript 插件发布的是过渡配置 `ios-dev / hostAbi 7`，而安卓 Moto 配置是 host ABI 9。guest 包在构建时烘焙目标身份，宿主身份不一致时拒绝挂载。自研宿主需要定义自己的目标配置。
- NativeScript 插件提醒：字形图集在构建期按密度烘焙，surface 密度与构建密度不一致时文字会发虚。iOS 设备有 @2x 和 @3x 两种密度，第一阶段应按两种密度分别构建资源，或者尽早接入运行时字体。
- 中文输入目前依赖配对的 Mac 伴随程序（Rime、词库、字形光栅化都在 Mac 上），这正是本期暂缓中文的原因之一。
- 运行时 TTF 字体已经合并（FreeType 光栅化在原生线程，测量、绘制、换行、光标、选区、命中检测共用同一套字形数据），后续做中文时直接可用（[PR #442](https://github.com/pocket-stack/pocketjs/pull/442)）。
- 项目迭代很快：0.13.0 删除了 BlackBerry 的 Android Runtime 宿主，旧的 vapor 编译器实验也移到了独立仓库（[v0.13.0](https://github.com/pocket-nexus/pocketjs/releases/tag/v0.13.0)）。

## 引擎总体架构

引擎分成两半：左边的共享代码（小程序包、JS 层、Rust 核心、渲染后端）两端完全相同；右边的原生宿主每个平台写一份，只负责容器、帧循环、原生能力、输入和渲染载体五件事。

&#91;embedded content: 引擎分层 · 共享代码 4 层，原生宿主 5 个部件\]

宿主的容器把包加载进 guest；帧循环每帧带着触点调用 `frame()`；guest 通过 svc 与原生能力双向通信；Rust 核心产出的 DrawList 由后端画到宿主提供的图层上。

### 各层职责

| 层 | 语言 | 职责 | 两端共享 |
| --- | --- | --- | --- |
| 小程序包 | TypeScript（TSX） | 页面、组件、业务逻辑，调用 `@yourco/mp` SDK | 是 |
| SDK | TypeScript | 封装 svc 命令为 Promise API，提供路由、帧计时、生命周期钩子 | 是 |
| JS 层 guest | TypeScript → JS，运行于 QuickJS | Solid 运行时 + PocketJS framework，维护镜像树，发出 `ui.*` 变更 | 是 |
| Rust 核心 | Rust（no\_std） | 节点树、布局、样式表、动画、文字、命中检测，产出 DrawList | 是 |
| FFI 封装 | Rust | 把核心与 QuickJS 包成 C ABI：创建/销毁实例、`frame()`、svc 收发、载体绑定 | 是 |
| 渲染后端 | Rust | iOS 用 Metal；安卓用 GLES2（现有）或 Vulkan | 按平台各一份，同仓库 |
| 原生宿主 | Swift / Kotlin | 渲染载体、帧循环、输入采集、原生能力、容器 | 否 |

### 仓库结构建议

```
mp-engine/
├─ upstream/pocketjs/   # fork 的 PocketJS，锁定版本
├─ core-ffi/            # Rust：pocketjs-core + QuickJS 的 C ABI 封装
├─ sdk/                 # @yourco/mp TypeScript SDK
├─ cli/                 # mp 命令行
├─ devserver/           # 热重启、日志、DevTools 中转
├─ host-ios/            # Swift 宿主，产出 MpEngine.xcframework
├─ host-android/        # Kotlin 宿主 + JNI，产出 AAR
├─ templates/           # mp create 模板
└─ apps/                # 示例小程序与基准测试
```

`core-ffi` 是关键：它让两个宿主只面对一组稳定的 C 函数，上游 PocketJS 内部怎么变都被挡在这一层之后。PocketJS 官方也建议自定义原生宿主使用 `@pocketjs/framework/manifest` 的 `extractHostBuildInputs()` 与 `hostBuildEnvironment()`，完整构建计划只是内部 IR（[README](https://github.com/bojieli/pocketjs)）。

## 宿主选型

选原生薄宿主。PocketJS 和 Flutter 是同一类技术，都自己绘制每一个像素；用 Flutter 当宿主等于跑两套引擎，而换不来任何能力。

| 维度 | 原生薄宿主 | Flutter 宿主 |
| --- | --- | --- |
| 运行时 | QuickJS + Rust 核心 | Dart VM + Impeller + QuickJS + Rust 核心 |
| 渲染路径 | 核心直接画到系统图层，由系统合成器合成 | 核心先画进纹理，再由 Flutter 合成一次，最后交给系统合成器 |
| 触摸路径 | 系统事件 → 宿主缓冲 → `frame()` | 系统事件 → Flutter 手势系统 → 平台通道或 FFI → `frame()` |
| 包体与内存 | 只有 PocketJS 自身的开销 | 额外增加 Flutter 引擎和 Dart 运行时 |
| 平台代码量 | Swift、Kotlin 各一层，估计各几百到一两千行 | Dart 一层 + 仍需原生插件做纹理和 JNI/FFI 绑定 |
| 共享代码 | Rust 核心和 JS 层两端共用 | 同左，Dart 层并不增加可共享的东西 |
| 适用场景 | 独立小程序宿主，或嵌入任意原生 App | 主 App 本来就是 Flutter，小程序作为其中一个页面 |

**唯一的例外**：如果你的主 App 已经是 Flutter 写的，就把原生宿主封装成插件，通过 Flutter 的外接纹理（Texture）接入。那时 Flutter 只是“容器的容器”，小程序引擎本身仍然是原生宿主。所以无论哪种情况，先做原生宿主都不会浪费。

**“类似 Flutter 的开发体验”指的是工具链**（一个 CLI、热重载、调试器、脚手架），和宿主用什么技术写无关，见第 10 节。

**宿主的职责边界**：宿主只做五件事——提供绘制图层、驱动帧循环、采集输入、实现原生能力（JSBridge）、管理小程序包与生命周期。布局、样式、动画、命中检测、手势识别都留在共享的 Rust 核心和 JS 层，两端行为天然一致。

## 渲染载体与帧循环

宿主给每个小程序实例提供一块系统图层（iOS 的 CAMetalLayer，安卓的 SurfaceView），由系统 vsync 驱动帧循环。PocketJS 就是唯一的渲染器，系统合成器只是把这块图层和其他界面合在一起，不存在“再渲染一遍”。

&#91;embedded content: 一帧的执行顺序 · 5 个步骤，2 个异步来源\]

触摸和原生能力的回包随时发生，但只写进缓冲；每次 vsync 时宿主把它们打包，调用一次 `frame()`，再由核心布局、生成 DrawList，最后画到图层并 present。这与 PocketJS“效果只在帧边界生效”的模型一致。

### iOS：CAMetalLayer

- **载体**：自定义 `UIView`，覆写 `layerClass` 返回 `CAMetalLayer`（也可以用 `MTKView`，但自定义 View 对帧节奏的控制更直接）。把 layer 指针传给 Rust 侧，由后端从中取 drawable 并提交 command buffer。
- **尺寸**：`contentsScale` 设为屏幕的 `scale`（@2x 或 @3x），`drawableSize` = 视图尺寸 × scale。在 `layoutSubviews` 中检测尺寸变化并通知核心。
- **帧驱动**：`CADisplayLink`。ProMotion 机型可以用 `preferredFrameRateRange` 申请 120 Hz，但动画步长在构建期烘焙（见下文“帧率策略”）。
- **线程**：第一版把 `CADisplayLink` 加到主线程 runloop，触摸回调也在主线程，缓冲区无需加锁。若后续发现 JS 耗时影响宿主 App 的其他界面，再把实例移到独立线程的 runloop，并给触摸缓冲加锁。
- **前后台**：进入后台时暂停 `CADisplayLink` 并停止提交 GPU 命令（iOS 不允许后台提交 GPU 工作），回到前台后恢复。

### 安卓：SurfaceView

- **载体**：`SurfaceView` + `SurfaceHolder.Callback`。`surfaceCreated` 时用 JNI 把 `Surface` 转成 `ANativeWindow`（`ANativeWindow_fromSurface`）交给 Rust，在其上创建 EGL（GLES2）或 Vulkan surface。PocketJS 现有安卓宿主用的是 arm64 + GLES2。
- **尺寸**：`surfaceChanged` 给出像素尺寸，除以 `displayMetrics.density` 得到逻辑尺寸。
- **销毁**：`surfaceDestroyed` 返回前必须同步完成 detach（释放 EGL surface 和 `ANativeWindow`），否则会在已销毁的 Surface 上绘制。
- **帧驱动**：在一个带 Looper 的专用线程（`HandlerThread`）上用 `Choreographer.postFrameCallback`，JS、核心和 GLES 都在这个线程上运行；EGL context 与线程绑定，不要跨线程使用。
- **线程**：`onTouchEvent` 在 UI 线程触发，而帧在专用线程运行，触摸缓冲必须线程安全。
- **前后台**：`onPause` 时移除帧回调，`onResume` 时重新注册。

### 线程模型原则

PocketJS 是单线程设计：一个实例的 JS、核心、后端都在同一个线程里。宿主保持这一点，不要把 JS 和渲染拆到两个线程，否则会破坏帧确定性。多个小程序实例之间可以各用各的线程，但只有前台实例跑帧循环。原生能力（网络、文件）在各自的线程池完成，结果只写进 svc 队列。

### 帧率策略

- 动画在 Rust 内以固定步长推进，`hz` 在构建时烘焙（1 到 240），宿主上报的 tick 频率不一致时 bundle 拒绝挂载。
- PocketJS 允许宿主采用与屏幕刷新率不同的帧节奏：Launcher 在 PSP 上用 20 Hz 策略，每个虚拟帧推进 3 个核心 tick、每 3 个 vsync present 一次（[LAUNCHER.md](https://github.com/pocket-nexus/pocketjs/blob/main/docs/LAUNCHER.md)）。
- 建议第一版统一用 60 Hz 构建。120 Hz 屏幕上可以每 2 个 vsync 跑一帧；确认性能余量后，再考虑按 120 Hz 构建或为高刷机型单独出包。
- 空闲省电：界面没有变化时应跳过 present。PocketJS 桌面版在无输入时大约每秒只重绘两次（用于闪烁的光标），说明核心已具备识别“无变化”的能力，接入方式需在代码中确认。

### 尺寸、旋转与安全区

- 载体尺寸变化时，宿主更新后端的绘制尺寸，并把新的逻辑视口告诉 guest。PocketJS framework 导出了 `resizeViewport`，桌面宿主用它处理窗口缩放（[PR #234](https://github.com/pocket-stack/pocketjs/pull/234/files)）。
- 小程序清单需要声明视口类型。PocketJS 的掌机应用是固定 480×272，E7 宿主只接收声明了动态视口的应用；手机小程序应该一律使用动态视口。
- 安全区（刘海、底部手势条）由宿主读取，通过 `device` 事件推给 guest，由小程序的布局自行留白。

### core-ffi 接口草案

下面是自研 `core-ffi` 层的 C 接口草案。这些函数名是本方案自定义的，不是 PocketJS 现有 API，实现时要映射到所锁定版本的 HostOps 与帧入口。

```c
typedef struct MpInstance MpInstance;
typedef struct { uint8_t slot, phase; float x, y; uint32_t t_ms; } MpTouch;

MpInstance* mp_create(const uint8_t* bundle, size_t bundle_len,
                      const uint8_t* pak, size_t pak_len,
                      const MpConfig* cfg);          // 堆上限等配置
int    mp_attach_surface(MpInstance*, void* native,   // CAMetalLayer* 或 ANativeWindow*
                         uint32_t w_px, uint32_t h_px, float scale);
void   mp_resize(MpInstance*, uint32_t w_px, uint32_t h_px, float scale);
int    mp_frame(MpInstance*, const MpTouch* touches, size_t n); // 执行一帧
size_t mp_svc_take(MpInstance*, char* buf, size_t cap);         // guest → 宿主
int    mp_svc_post(MpInstance*, const char* json, size_t len);  // 宿主 → guest
void   mp_detach_surface(MpInstance*);
void   mp_destroy(MpInstance*);
```

### iOS 宿主骨架（Swift，示意）

```swift
final class MpView: UIView {
  override class var layerClass: AnyClass { CAMetalLayer.self }
  private var inst: OpaquePointer?
  private var link: CADisplayLink?
  private let touches = TouchBuffer()          // 主线程写、主线程读

  func start(bundle: Data, pak: Data) {
    inst = createInstance(bundle, pak)        // 封装 mp_create
    let metal = layer as! CAMetalLayer
    metal.contentsScale = window?.screen.scale ?? 2
    mp_attach_surface(inst, Unmanaged.passUnretained(metal).toOpaque(),
                      pixelWidth, pixelHeight, Float(metal.contentsScale))
    isMultipleTouchEnabled = true
    link = CADisplayLink(target: self, selector: #selector(tick))
    link?.add(to: .main, forMode: .common)
  }

  @objc private func tick() {
    let batch = touches.drain()
    batch.withUnsafeBufferPointer { mp_frame(inst, $0.baseAddress, $0.count) }
    pumpServices()                             // mp_svc_take → 原生能力 → mp_svc_post
  }

  override func touchesBegan(_ t: Set<UITouch>, with e: UIEvent?) { touches.add(t, .down, in: self) }
  override func touchesMoved(_ t: Set<UITouch>, with e: UIEvent?) { touches.add(t, .move, in: self) }
  override func touchesEnded(_ t: Set<UITouch>, with e: UIEvent?) { touches.add(t, .up, in: self) }
  override func touchesCancelled(_ t: Set<UITouch>, with e: UIEvent?) { touches.add(t, .cancel, in: self) }

  override func layoutSubviews() {
    super.layoutSubviews()
    mp_resize(inst, pixelWidth, pixelHeight, Float(contentScaleFactor))
  }
}
```

### 安卓宿主骨架（Kotlin，示意）

```kotlin
class MpSurfaceView(ctx: Context) : SurfaceView(ctx), SurfaceHolder.Callback {
  private val frameThread = HandlerThread("mp-frame").apply { start() }
  private val handler = Handler(frameThread.looper)
  private val touches = TouchBuffer()          // UI 线程写、帧线程读，内部加锁
  private val density = resources.displayMetrics.density
  private var inst = 0L

  private val frameCb = object : Choreographer.FrameCallback {
    override fun doFrame(frameTimeNanos: Long) {
      Native.frame(inst, touches.drain())
      pumpServices()
      Choreographer.getInstance().postFrameCallback(this)  // 在 mp-frame 线程上继续注册
    }
  }

  init { holder.addCallback(this) }

  override fun surfaceCreated(h: SurfaceHolder) {
    handler.post {
      Native.attachSurface(inst, h.surface, width, height, density)
      Choreographer.getInstance().postFrameCallback(frameCb)
    }
  }

  override fun surfaceChanged(h: SurfaceHolder, format: Int, w: Int, hh: Int) {
    handler.post { Native.resize(inst, w, hh, density) }
  }

  override fun surfaceDestroyed(h: SurfaceHolder) {
    val done = CountDownLatch(1)
    handler.post {
      Choreographer.getInstance().removeFrameCallback(frameCb)
      Native.detachSurface(inst)
      done.countDown()
    }
    done.await()                               // 必须同步等 detach 完成再返回
  }

  override fun onTouchEvent(e: MotionEvent): Boolean {
    touches.add(e, density)                    // 除以 density 换算为逻辑坐标
    return true
  }
}
```

两段骨架的共同点：触摸只进缓冲、每帧调用一次 `frame`、帧后处理 svc、载体变化时同步通知核心。`TouchBuffer`、`pumpServices`、`createInstance`、`pixelWidth / pixelHeight` 都是待实现的辅助部分。

## 触控输入

宿主只采集原始触点，按帧一次性交给核心；命中检测和手势识别由 PocketJS 完成。帧入口的形式是 `frame(buttons, analog?, touches?)`，触摸数据作为帧参数传入（[PR #172](https://github.com/pocket-stack/pocketjs/pull/172)），当前主干上第 4 个帧参数携带的是宿主解析后的触摸命中数据（[PR #229](https://github.com/pocket-stack/pocketjs/pull/229)）。

### 处理步骤

1. **采集**
   - iOS：在承载图层的 UIView 上实现 `touchesBegan / touchesMoved / touchesEnded / touchesCancelled`，打开 `isMultipleTouchEnabled`。
   - 安卓：在 SurfaceView 上覆写 `onTouchEvent`，处理 `ACTION_DOWN / ACTION_POINTER_DOWN / ACTION_MOVE / ACTION_POINTER_UP / ACTION_UP / ACTION_CANCEL`；`ACTION_MOVE` 需要遍历 `pointerCount` 读出所有触点，并读取 `getHistorical*` 中的历史点以免丢失快速滑动的中间位置。
2. **换算**：物理坐标除以缩放得到逻辑坐标。iOS 的 `UITouch.location(in:)` 已经是 point 单位，与逻辑坐标一致；安卓的 `MotionEvent.getX()` 是像素，需要除以 `displayMetrics.density`。坐标原点统一为图层左上角，并扣除安全区偏移（如果小程序画布不覆盖刘海区域）。
3. **归一化触点 id**：平台的触点 id 会被复用（安卓 pointerId、iOS 的 UITouch 对象地址），宿主要映射成在一次按压期间稳定的槽位。PocketJS 的安卓宿主和旧版 UIKit 宿主共用一个有界的“触点锁存器”，按 DOWN 的先后顺序保序，不依赖可复用的存储槽位和平台 id（[PR #396](https://github.com/pocket-stack/pocketjs/pull/396)）。建议直接移植这段实现。
4. **缓冲**：事件回调里只往一个环形缓冲区写入 `(slot, phase, x, y, timestamp)`，不调用任何 JS。缓冲区由“事件线程写、帧线程读”，若两者不在同一线程需要加锁或用无锁队列。
5. **帧边界投递**：下一次 vsync 回调时，宿主把这一帧内累计的触点快照打包，作为 `frame()` 的触摸参数传入，然后清空缓冲。同一帧内一个触点的 DOWN 和 UP 都要保留，否则快速轻点会丢失。
6. **识别**：PocketJS 的触摸系统负责逐触点快照、命中检测和带物理的手势（[Touch & gestures](https://pocketjs.pocket.nexus/docs/touch-gestures/)）。小程序开发者在 TSX 里使用 `onPress` 等事件和手势 API，不接触原始触点。

### 触点快照建议结构

下面是宿主侧缓冲区的建议结构，最终打包格式以所锁定版本的帧输入契约为准：

```
struct TouchSample {
  slot: u8        // 锁存器分配的稳定槽位，0..MAX_CONTACTS
  phase: u8       // 0=down 1=move 2=up 3=cancel
  x: f32          // 逻辑坐标
  y: f32
  t_ms: u32       // 宿主时间戳，仅用于调试和速度估计
}
```

### 边界情况清单

- **系统手势冲突**：iOS 的边缘返回手势、安卓的手势导航都会抢走靠近屏幕边缘的触点并发出 cancel；宿主必须把 cancel 如实传给核心，让按下态正确复位。
- **触点上限**：锁存器是有界的，超出上限的触点直接丢弃，并在调试日志中计数。
- **前后台切换**：进入后台时为所有活动触点补发 cancel，避免回到前台后出现“卡住的按压”。
- **确定性**：触摸数据与按键一样会被录进输入磁带，宿主不要在投递前做任何依赖实时时间的过滤（例如去抖），否则重放结果会和真机不一致。
- **键盘与文本输入**：本期不做输入法；需要文本输入时，后续方案是放一个隐藏的原生输入框，把提交的文本经由服务通道送入 guest。

## JSBridge 与 API 层

小程序调用原生能力，统一走 PocketJS 已有的服务通道（svc）：guest 发命令，宿主异步回结果，结果在下一个帧边界送达。在此之上封装一层 Promise 风格的 SDK，权限与配额全部在宿主侧控制。

### 现有协议

- 通道由 HostOps 的 `svcOpen / svcPoll / svcSend` 三个操作组成（ops 30..32），按约定每帧轮询一次（[PR #234](https://github.com/pocket-stack/pocketjs/pull/234/files)）。
- guest → 宿主：`{t:"cmd", id, kind, payload}`；宿主 → guest：`{t:"result", id, result}` 或 `{t:"event", …}`（[PR #257](https://github.com/pocket-stack/pocketjs/pull/257/files)）。
- 宿主的回复在 guest 的下一个帧边界、由 svc 轮询泵送达（[NativeScript/pocketjs](https://github.com/NativeScript/pocketjs)）。
- 宿主没有服务通道时，命令被丢弃，应用保持纯函数式运行。框架侧用 `installEffectDriver`（`@pocketjs/framework/effects`）接入。

### SDK 设计（建议）

命名空间暂定为 `mp`，开发者从 `@yourco/mp` 导入：

```ts
// 开发者写法
import { request, storage, nav, device } from "@yourco/mp";

const res = await request({ url: "https://api.example.com/items", method: "GET" });
await storage.set("token", res.data.token);
nav.push("/detail", { id: 42 });
```

SDK 内部实现：

```ts
// SDK 内部（示意）
let seq = 0;
const pending = new Map<number, { resolve: Function; reject: Function; deadline: number }>();

export function call<T>(kind: string, payload: unknown, timeoutFrames = 600): Promise<T> {
  const id = ++seq;
  svcSend(JSON.stringify({ t: "cmd", id, kind, payload }));
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject, deadline: currentFrame() + timeoutFrames });
  });
}

// 每帧由效果驱动调用
export function pump(lines: string[]) {
  for (const line of lines) {
    const msg = JSON.parse(line);
    if (msg.t === "result") settle(msg.id, msg.result);
    else if (msg.t === "event") dispatchEvent(msg);
  }
  expireByFrame(currentFrame()); // 超时按帧计算，不依赖 setTimeout
}
```

### 第一批 API 清单

| 模块 | 能力 | 宿主实现 | 是否需要用户授权 |
| --- | --- | --- | --- |
| `request` | HTTP 请求 | iOS `URLSession`，安卓 OkHttp；域名白名单在宿主校验 | 否（白名单控制） |
| `storage` | 键值存储 | 按小程序隔离的目录；也可复用 PocketJS 的 db 模块 | 否 |
| `nav` | 页面栈 push / pop / replace | JS 层路由为主，宿主只处理系统返回键 | 否 |
| `app` | 生命周期事件、退出、获取启动参数 | 宿主转发 `onShow / onHide` 事件 | 否 |
| `device` | 系统信息、安全区、网络状态 | 宿主读取后通过 event 推送 | 否 |
| `ui` | Toast、对话框、ActionSheet | 优先用 PocketJS 的 Modal、Portal 自绘，保持两端一致 | 否 |
| `clipboard` | 读写剪贴板 | 系统剪贴板 | 读取需要 |
| `media` | 选图、拍照 | 系统相册与相机选择器，返回文件句柄 | 需要 |
| `location` | 定位 | CoreLocation / FusedLocation | 需要 |

### 权限模型

PocketJS 的 `pocket.json` 里的 `requires / enhances` 描述的是“宿主支持哪些 API”，不是权限，也不反映设备实时状态（[README](https://github.com/bojieli/pocketjs)）。所以权限要单独设计：

1. 小程序在清单里声明要用的权限（例如 `"permissions": ["location", "media"]`），未声明的调用在宿主侧直接返回错误码。
2. 首次调用需要授权的 API 时，宿主弹出原生授权框，结果按小程序 id 持久化。
3. 宿主对每个小程序记录调用频率，超出配额返回限流错误。

### 协议约定

- **错误格式**：`{t:"result", id, result:{ok:false, code:"PERMISSION_DENIED", message}}`，错误码用固定枚举，SDK 将其转成 reject。
- **大数据**：图片、文件不走 JSON，宿主返回文件句柄或资源 id，guest 再通过纹理注册表或文件 API 读取。
- **限额**：PocketJS 的离线卸载（offload）契约对掌机设置了很紧的上限，例如单条记录 4,096 字节、同时最多 8 个未完成请求、请求期限 600 个 guest 帧（[PR #362](https://github.com/pocket-stack/pocketjs/pull/362/files)）。手机宿主可以放宽，但仍应保留“单条消息上限 + 并发上限 + 帧计期限”这三类约束，防止单个小程序拖垮宿主。
- **版本**：每条命令带 `kind` 的版本后缀或在握手时协商 SDK 版本，宿主不支持的 `kind` 返回 `UNSUPPORTED`。

## 小程序容器

容器负责小程序的“包从哪来、怎么运行、何时销毁”。PocketJS 的 Launcher 已经实现了单设备多应用的雏形，但它同一时间只允许一个 guest 存活、恢复即重启；手机内存充裕，应改为多运行时并存。

### 包格式

- 沿用 PocketJS 的产物：JS bundle + `app.pak`（样式表、字形图集、图片），可封装成 `.pocket` 包（[PLATFORM.md](https://github.com/pocket-nexus/pocketjs/blob/main/docs/PLATFORM.md)）。
- bundle 内嵌目标身份与 HostOps ABI，启动时校验，不匹配直接拒绝（[README](https://github.com/bojieli/pocketjs)）。自研宿主应定义自己的目标配置，例如 `mp-ios` 与 `mp-android`，并让 ABI 版本随宿主发布递增。
- 在 PocketJS 包之外再套一层容器清单，建议字段：

```json
{
  "appId": "com.example.todo",
  "version": "1.4.0",
  "minHostAbi": 9,
  "entry": "main.pocket",
  "pages": ["/", "/detail", "/settings"],
  "permissions": ["media"],
  "domains": ["api.example.com"],
  "sha256": "…",
  "signature": "…"
}
```

### 下载、校验与缓存

1. 宿主向你的分发服务查询最新版本，下载包到 `<沙盒>/mp/<appId>/<version>/`。
2. 校验 `sha256` 与发布者签名（例如 Ed25519，公钥内置在宿主），失败则删除并上报。
3. 校验 `minHostAbi`，宿主过旧时提示升级而不是尝试运行。
4. 保留当前版本和上一个版本，便于回滚；更新在下次冷启动时生效，避免运行中替换代码。

PocketJS 的 Web 端 Stage 已经实现了“拉取 → 执行 → 切换”的流程（`enableAppSwitching()`），Symbian 宿主在启动前校验每个包的尾部信息、目标、ABI 和身份（[LAUNCHER.md](https://github.com/pocket-nexus/pocketjs/blob/main/docs/LAUNCHER.md)），都可以作为参考实现。

### 运行时实例

每个运行中的小程序占用一个独立实例：一个 QuickJS runtime、一个 `Ui` 核心、一套纹理句柄和一块绘制图层。

- **启动**：创建实例 → 加载 pak → 新建 JS realm → 执行 bundle → 挂载首页。
- **销毁**：PocketJS 的切换流程是“完成当前帧 → 释放 QuickJS runtime、丢弃 `Ui` 核心 → 从头启动下一个包”（[LAUNCHER.md](https://github.com/pocket-nexus/pocketjs/blob/main/docs/LAUNCHER.md)）。Vita 宿主在切换前会等 GPU 空闲、回收纹理句柄和字体图集，安卓/iOS 宿主同样要在 GPU 空闲后再释放资源。
- **保活**：同时保留 N 个实例（建议初值 3，按设备内存调整），超出时按 LRU 销毁最久未用的实例。被保活但不在前台的实例停止帧循环，不消耗 CPU。
- **冻结截图**：Launcher 在切走应用时会把最后一帧缩小保存为纹理，用作切换动画的占位画面，这个机制可以直接用于“最近使用”列表。

### 页面栈与路由

建议页面栈完全在 JS 层实现：一个小程序是一个 guest，页面是 guest 内的组件，`nav.push / pop` 只操作 JS 侧的路由状态。原因是跨页面共享状态最简单，且不需要为每页创建新运行时。可以基于 PocketJS 的 `Screen`、`Portal`、`Modal` 等应用壳组件来做转场和弹层。宿主只负责把安卓系统返回键和 iOS 边缘返回手势转成 `nav.back` 事件，guest 栈为空时再交给宿主关闭小程序。

### 生命周期

| 小程序事件 | 触发时机 | 宿主动作 |
| --- | --- | --- |
| `onLaunch` | 实例首次挂载 | 传入启动参数（来源、路径、query） |
| `onShow` | 进入前台，或从保活状态恢复 | 恢复帧循环 |
| `onHide` | 宿主 App 进入后台，或切到其他小程序 | 补发触摸 cancel，停止帧循环 |
| `onUnload` | 被 LRU 回收或用户关闭 | 预留一帧执行清理，然后销毁实例 |
| `onMemoryWarning` | 系统内存告警 | 先回收后台实例，再通知前台实例 |

### 存储隔离

PocketJS 的 db 模块规范规定：宿主把数据库名映射到该应用自己数据根目录下的真实文件，映射规则对 guest 不可见（[PR #231](https://github.com/pocket-stack/pocketjs/pull/231/files)）。容器按 `appId` 划分数据根目录即可得到天然隔离；键值存储、缓存文件、临时文件都放在该根目录下，卸载小程序时整体删除。

### 安全

- **内存上限**：每个实例的 QuickJS 堆设置上限。PocketJS 的 ESP-IDF 组件已经提供 `CONFIG_POCKETJS_GUEST_HEAP_LIMIT`，默认 4 MiB（[v0.13.0](https://github.com/pocket-nexus/pocketjs/releases/tag/v0.13.0)）；手机上可设 32 至 64 MiB 起步，按测试调整。
- **执行时间**：单帧 JS 执行超过阈值（例如连续数帧超过 100 ms）时，用 QuickJS 的中断回调打断脚本并标记小程序无响应。
- **代码来源**：只执行签名校验通过的包，禁止 guest 内 `eval` 远程代码（在构建期检查，并在宿主侧移除或禁用相关全局）。
- **能力收口**：guest 没有任何直接系统访问，所有能力都经过服务通道，由宿主做权限、域名白名单和频控。
- **多实例隔离**：各实例的 QuickJS runtime 相互独立、不共享对象。它们在同一进程内，属于语言级隔离而非进程级隔离；如需更强隔离，后续可把小程序运行在独立进程（安卓的独立进程 Activity，iOS 无此选项）。

## 开发体验

目标是让开发者感觉像在用 Flutter：一个 CLI 管完环境检查、创建、真机运行、构建发布，保存代码后很快在真机上看到结果（目标见第 12 节的热重启指标），出问题时能在桌面调试面板里回放。PocketJS 已经有 flutter 风格的 `doctor / setup` 和 `create` 脚手架（[v0.2.1](https://github.com/pocket-stack/pocketjs/releases/tag/v0.2.1)），以及时间旅行 DevTools，这些都可以包一层直接用。

### CLI 命令设计

| 命令 | 作用 | 基于 PocketJS 的什么 |
| --- | --- | --- |
| `mp doctor` | 检查 Bun、Rust、Xcode、Android SDK/NDK、真机连接 | `pocket doctor` |
| `mp create <name>` | 生成 TSX 小程序模板（Solid + 示例页面 + 清单） | `pocket create` |
| `mp run --device ios\|android` | 构建 debug 包，推送到真机上的开发版宿主，开启热重启 | `pocket build` + 自研推送通道 |
| `mp check` | 类型检查、样式词汇检查、权限与 API 清单校验 | `pocket check` |
| `mp build --release` | 产出签名的小程序包和容器清单 | `pocket build` + 自研签名 |
| `mp devtools` | 打开桌面调试面板 | Pocket DevTools |
| `mp publish` | 上传到分发服务 | 自研 |

### 开发版宿主（类似 Expo Go）

提供一个开发版宿主 App，装在测试机上：

1. 启动后显示扫码页，`mp run` 在终端打印二维码，内含开发机地址。
2. 宿主通过 WebSocket 连上开发服务器，拉取 bundle 和 pak 后运行。
3. 同一条连接承载日志（`console.log` 回传到终端）、热重启指令和 DevTools 数据。
4. 发布版宿主不包含这个入口，避免执行未签名代码。

### 热重启

1. 开发服务器监听源码变化，增量重新打包。
2. 通过 WebSocket 把新 bundle（和变化了的 pak）推到真机。
3. 宿主在当前帧结束后销毁旧实例，用新 bundle 重新启动，这正是 Launcher 已经实现的整体切换流程。
4. 状态会丢失，页面回到首页或清单指定的开发起始页。

### 热重载（保留状态，实验性）

PocketJS 的确定性为热重载提供了一条独特的路：每一帧的输入都被录进磁带，并且可以逐字节重放（[README](https://github.com/pocket-nexus/pocketjs)）。思路是：新代码加载后，用旧会话的输入磁带快速重放，到达改代码前的界面状态。

需要说明的风险：这是基于架构提出的想法，官方没有现成实现；如果改动影响了布局或命中区域，重放的触点可能落到不同元素上，导致状态分叉。实现时应提供“重放到第 N 帧”和“只重放到当前页面入口”两种模式，并在分叉时自动退回热重启。

### DevTools

Pocket DevTools 已经提供（[v0.3.0](https://github.com/pocket-stack/pocketjs/releases/tag/v0.3.0)）：

- **组件检查器**：桌面面板显示带语义名称的组件树，悬停时在设备屏幕上画出高亮框（由核心写入 DrawList，所以在真机上也能显示）。
- **时间旅行**：常开的输入记录，暂停、单步、拖动时间轴跳转（重新加载后确定性快进）。
- **无头回放**：`bun run tape` 输出每帧哈希、首个分叉帧断言、任意帧的 PNG 和组件树 JSON，可用于 CI 回归测试。

在手机上，原本走 PSPLINK USB 的调试通道改为走开发版宿主的 WebSocket 即可。

### 测试

- **单元与交互测试**：用无头 sim 宿主跑小程序，按帧注入触摸，断言组件树或截图哈希。因为时间是帧计数器，六秒的用户操作在 CI 里只是几十帧。
- **真机冒烟**：每个宿主版本在 iOS、安卓各一台基准机上跑固定的输入磁带，比对关键帧截图。

## 缺口与风险

最大的三个风险是：上游迭代过快、生产级宿主要从零写、长列表与复杂页面在 QuickJS 解释器上的性能未经手机验证。前两个靠 fork 和分阶段控制，第三个必须在第一阶段用真机数据回答。

| 风险或缺口 | 影响 | 应对 |
| --- | --- | --- |
| 上游频繁破坏性改动（0.13 仍在删宿主、迁移目录） | 跟进成本高，升级可能打断宿主 | 锁定版本，fork `engine/core` 与 `framework`，只按需挑选上游修复 |
| 无生产级安卓/iOS 宿主 | 第 5 至第 9 节全部要自己实现 | 先做 iOS（有 Metal 宿主可参考），安卓照同一结构复刻 |
| QuickJS 没有 JIT | 重计算逻辑和大量数据处理变慢；桌面测试中编辑器每次按键都通过 QuickJS 重排整篇文档，文档越长 CPU 越高（[README](https://github.com/pocket-nexus/pocketjs)） | 把重计算下沉到宿主 API；评估 MicroTS 把视图和模型编译成 Rust 的路线 |
| 长列表、复杂滚动的手机端表现未知 | 小程序最常见的页面类型 | 第一阶段专门压测长列表，必要时在核心实现虚拟列表 |
| 样式只有固定的 Tailwind 子集 | 设计稿还原受限 | 把子集作为引擎的样式规范写进文档；缺的词汇在 fork 的样式编译器里补 |
| 字形图集按密度烘焙 | iOS @2x、@3x 与安卓多种密度下文字可能发虚 | 按密度分别构建资源，或提前接入运行时 TTF |
| 无原生控件同层渲染 | 地图、视频、相机预览、WebView 暂不可用 | 本期不做；后续评估叠加原生 View 或纹理桥接 |
| 没有真实定时器，`setTimeout` 延迟被忽略 | 部分 npm 包行为异常 | SDK 提供帧计时 API，`mp check` 扫描并警告依赖 |
| 同进程多实例只有语言级隔离 | 恶意小程序可能耗尽进程资源 | 堆上限、执行时间中断、API 频控；安卓可选独立进程 |
| 中文与输入法暂缓 | 面向国内用户前必须补齐 | 已有运行时 TTF；输入法用隐藏原生输入框方案 |
| 帧输入契约仍在演进（触摸参数位置、版本） | 宿主与核心升级时可能不兼容 | 宿主与核心之间增加一层自有的版本化输入结构，升级时只改适配层 |

## 路线图与验收指标

先用大约两周做 P0 技术验证，用真机数据决定是否继续；之后按 iOS 宿主 → 安卓宿主 → 容器与 API → 工具链的顺序推进。P3 与 P4 可以部分并行，因为工具链主要依赖 PocketJS 自身的构建链。

&#91;embedded content: 路线图 · 5 个阶段，各带 1 个出口条件\]

P0 不写生产代码：直接用现有的安卓 APK 配置和 iOS xcframework，在两台中档真机上跑官方示例和一个自写的长列表页，采集下表的指标。

### 验收指标

下表的目标值是建议初值，用于 P0 时对照，应根据实测结果校准。参照数据：PocketJS 桌面版在 Apple M3 Max 上冷启动到首帧 149 ms、空闲内存 83 MB（整个桌面应用），在 PSP 上完整应用占用 8 MB 内存。

| 指标 | 建议目标 | 测量方法 | 阶段 |
| --- | --- | --- | --- |
| 冷启动到首帧（包已在本地） | ≤ 400 ms | 从创建实例到首次 present 的时间戳差 | P0 测量，P1/P2 验收 |
| 长列表滚动帧率（1,000 条） | 持续 ≥ 55 fps，无单帧 > 33 ms | 宿主记录每帧耗时，叠加 Instruments / Perfetto | P0 测量，P2 验收 |
| 单实例内存增量 | ≤ 40 MB | 创建前后的进程内存差 | P0 测量，P3 验收 |
| 两端渲染一致性 | 同一磁带下关键帧截图一致 | 重放固定输入磁带，比对截图哈希 | P2 |
| 触摸到画面响应 | ≤ 2 帧 | 高速摄像或系统触摸时间戳对比 present 时间 | P1/P2 |
| 热重启耗时 | ≤ 2 s（从保存到真机显示） | devserver 日志时间戳 | P4 |
| 恶意包隔离 | 超堆上限、死循环、未声明权限调用都被拦下，宿主不崩溃 | 专门的攻击样例包 | P3 |

### P0 具体任务

- [ ] 锁定 PocketJS 版本并 fork 仓库
- [ ] 用 `bun android build` 构建并安装到安卓测试机，记录与 Moto G Play 参数不同带来的适配问题
- [ ] 用 `engine/apple/build-xcframework.sh` 构建 xcframework，在一个空白 iOS 工程里挂上 surface view 跑示例
- [ ] 用 Solid TSX 写一个 1,000 条的长列表页和一个表单页
- [ ] 采集上表前三项指标，写成 P0 报告，决定是否进入 P1

## 自审记录

通读全文后修正了 3 处问题；另有 7 条假设没有在源码层面验证，需要在 P0 期间逐条确认，其中第 1、2、3 条会直接影响宿主设计。

### 已修正

| 位置 | 问题 | 修正 |
| --- | --- | --- |
| 渲染载体与帧循环 · 尺寸、旋转与安全区 | 错别字“探小应用” | 改为“掌机应用” |
| 开发体验 · 开头 | 写了“几百毫秒内看到结果”，与路线图中热重启 ≤ 2 s 的目标矛盾 | 改为引用第 12 节的指标 |
| 参考资料 | PLATFORM.md 和 Touch & gestures 在正文中引用，但没有出现在参考列表 | 补入“引用但未阅读”分组 |

### 待验证的假设

1. **帧入口与触摸参数的确切格式**：文档中触摸作为帧参数传入的结论来自 PR 描述；当前主干上第 4 个帧参数携带触摸命中数据，另有提交把指针的松开、离开、取消边沿放在版本化的第 5 个参数里。锁定版本后要读 `framework/src/frame.ts` 和宿主实现确认，再定 `core-ffi` 的 `mp_frame` 签名。
2. **xcframework 能否脱离 NativeScript 使用**：`PocketApple.xcframework` 由 `engine/apple/build-xcframework.sh` 构建，NativeScript 插件只是使用方。需要确认其中的 surface view 能否在纯 Swift 工程里直接挂载，以及它发布的是不是仍为 `ios-dev / hostAbi 7` 配置。
3. **安卓宿主的可移植性**：现有 Moto G Play 配置写死了逻辑尺寸 360×800 和密度 2。需要确认改成动态视口、任意密度的工作量。
4. **多实例并存**：Launcher 的契约是同一时间只有一个 guest。核心是否存在全局状态，导致同一进程内无法同时创建多个 `Ui` 和 QuickJS runtime，要在源码中确认。
5. **无变化时跳过 present**：桌面版空闲时约每秒重绘两次，推断核心有损伤跟踪，但接口没有核实。
6. **热重载依靠磁带重放**：这是基于架构提出的思路，官方没有实现，分叉处理也未验证。在 P4 之前不要对外承诺“保留状态的热重载”。
7. **svc 通道在手机上的吞吐**：文中引用的 4 KB 记录、8 个并发等限额出自 offload 契约，svc 通道本身的限额尚未确认。如果 svc 也有类似上限，`request` 的大响应体需要走文件句柄。

### 写作上的取舍

- 第 6、8 节中的 C、Swift、Kotlin 和 TypeScript 代码都是示意骨架，函数名（`mp_create`、`svcSend`、`currentFrame` 等）是本方案自定义或占位的，不是 PocketJS 的现有 API。
- 第 12 节的指标数值是建议初值，没有任何来源支撑，必须用 P0 实测校准。
- 下列结论来自 PR 和 Release 的搜索摘要而非完整阅读：安卓配置参数、iOS 宿主成熟度、运行时 TTF、db 规范、offload 限额。参考资料一节已按“完整阅读”和“仅读摘要”分组。

## 参考资料

完整阅读过的页面：

- [PocketJS README（pocket-nexus/pocketjs）](https://github.com/pocket-nexus/pocketjs)
- [Architecture · PocketJS 官方文档](https://pocketjs.pocket.nexus/docs/architecture/)
- [LAUNCHER.md：设备内应用切换契约](https://github.com/pocket-nexus/pocketjs/blob/main/docs/LAUNCHER.md)

仅读过搜索摘要的页面（细节以原文为准）：

- [PR #463：移除 BlackBerry Android Runtime 宿主，安卓改用 Moto G Play 配置](https://github.com/pocket-nexus/pocketjs/pull/463)
- [PR #396：伴随输入与 Moto G Play 支持](https://github.com/pocket-stack/pocketjs/pull/396)
- [PR #442：运行时 TTF 字体](https://github.com/pocket-stack/pocketjs/pull/442)
- [NativeScript/pocketjs：iOS 宿主插件](https://github.com/NativeScript/pocketjs)
- [PR #257：NativeScript 宿主与服务通道](https://github.com/pocket-stack/pocketjs/pull/257/files)
- [PR #234：桌面宿主、指针输入与 svc 操作](https://github.com/pocket-stack/pocketjs/pull/234/files)
- [PR #229：指针帧参数提案](https://github.com/pocket-stack/pocketjs/pull/229)
- [PR #172：PocketBook 宿主与触摸帧参数](https://github.com/pocket-stack/pocketjs/pull/172)
- [PR #231：db 模块规范](https://github.com/pocket-stack/pocketjs/pull/231/files)
- [PR #362：offload 帧契约与限额](https://github.com/pocket-stack/pocketjs/pull/362/files)
- [Release v0.2.1：npm 发布与 CLI](https://github.com/pocket-stack/pocketjs/releases/tag/v0.2.1)
- [Release v0.3.0：Pocket DevTools](https://github.com/pocket-stack/pocketjs/releases/tag/v0.3.0)
- [Release v0.13.0：MicroTS 与破坏性改动](https://github.com/pocket-nexus/pocketjs/releases/tag/v0.13.0)
- [README 镜像（bojieli/pocketjs）：能力声明说明](https://github.com/bojieli/pocketjs)

文中引用但未打开阅读的链接（来自上述页面的导航或正文）：

- [PLATFORM.md：.pocket 包格式](https://github.com/pocket-nexus/pocketjs/blob/main/docs/PLATFORM.md)
- [Touch & gestures · PocketJS 官方文档](https://pocketjs.pocket.nexus/docs/touch-gestures/)
