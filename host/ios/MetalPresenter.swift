import UIKit
import Metal
import QuartzCore

/// Main-thread presentation; each GPU submission owns a texture slot until completion.
@objc(MiniMetalPresenter)
public final class MetalPresenter: UIView {
    public override class var layerClass: AnyClass { CAMetalLayer.self }
    @objc public var captureEnabled = false
    @objc public private(set) var presentedHash: UInt32 = 0
    @objc public private(set) var lastError: String?
    private let device = MTLCreateSystemDefaultDevice()
    private var queue: MTLCommandQueue?
    private var lastSubmission: MTLCommandBuffer?
    private var pipeline: MTLRenderPipelineState?
    private var textures: [MTLTexture] = []
    private var occupied = [false, false, false]
    private let lock = NSLock()
    private var generation = 0
    private var dimensions = CGSize.zero
    private var dirty: [CGRect?] = [nil, nil, nil]
    private var needsPresentation = true
    private var metalLayer: CAMetalLayer { layer as! CAMetalLayer }

    public override init(frame: CGRect) {
        super.init(frame: frame)
        isUserInteractionEnabled = false
        guard let device else { lastError = "Metal is unavailable"; return }
        metalLayer.device = device
        metalLayer.pixelFormat = .bgra8Unorm
        metalLayer.framebufferOnly = false // Acceptance may read the submitted drawable.
        metalLayer.maximumDrawableCount = 3
        queue = device.makeCommandQueue()
        do {
            let library = try device.makeLibrary(source: """
                #include <metal_stdlib>
                using namespace metal;
                struct V { float4 position [[position]]; float2 uv; };
                vertex V miniVertex(uint id [[vertex_id]]) {
                    const float2 p[4] = {float2(-1,-1),float2(1,-1),float2(-1,1),float2(1,1)};
                    V v;v.position=float4(p[id],0,1);v.uv=float2((p[id].x+1)*.5,(1-p[id].y)*.5);return v;
                }
                fragment float4 miniFragment(V v [[stage_in]],texture2d<float> image [[texture(0)]]) {
                    constexpr sampler s(filter::linear,address::clamp_to_edge);return image.sample(s,v.uv);
                }
                """, options: nil)
            let descriptor = MTLRenderPipelineDescriptor()
            descriptor.vertexFunction = library.makeFunction(name: "miniVertex")
            descriptor.fragmentFunction = library.makeFunction(name: "miniFragment")
            descriptor.colorAttachments[0].pixelFormat = .bgra8Unorm
            pipeline = try device.makeRenderPipelineState(descriptor: descriptor)
        } catch { lastError = "Metal pipeline: \(error.localizedDescription)" }
    }
    public required init?(coder: NSCoder) { fatalError("Use init(frame:)") }
    public override func layoutSubviews() {
        super.layoutSubviews()
        let scale = window?.screen.scale ?? UIScreen.main.scale
        metalLayer.contentsScale = scale
        let size = CGSize(width: bounds.width * scale, height: bounds.height * scale)
        if metalLayer.drawableSize != size { needsPresentation = true;metalLayer.drawableSize = size }
    }
    @objc public func invalidatePresentation() { needsPresentation = true }
    @objc(presentPixels:width:height:stride:regions:)
    public func present(pixels: UnsafeRawPointer, width: UInt32, height: UInt32, stride: UInt32, regions: NSData) -> Bool {
        precondition(Thread.isMainThread)
        guard width > 0, height > 0, width <= 4096, height <= 4096, stride == width * 4,
              let device, let queue, let pipeline else { return false }
        let size = CGSize(width: Int(width), height: Int(height))
        if size != dimensions {
            let descriptor = MTLTextureDescriptor.texture2DDescriptor(pixelFormat: .bgra8Unorm,
                width: Int(width), height: Int(height), mipmapped: false)
            descriptor.storageMode = .shared
            descriptor.usage = .shaderRead
            let next = (0..<3).compactMap { _ in device.makeTexture(descriptor: descriptor) }
            guard next.count == 3 else { lastError = "Metal texture allocation failed"; return false }
            lock.lock();generation += 1;occupied = [false, false, false];lock.unlock()
            textures = next;dimensions = size
            dirty = Array(repeating: CGRect(origin: .zero,size: size), count: 3);needsPresentation = true
        }
        guard regions.length <= 8 * 16, regions.length % 16 == 0 else { lastError = "Invalid damage records";return false }
        let damage = Data(referencing: regions)
        var rectangles: [CGRect] = []
        for offset in Swift.stride(from: 0,to: damage.count,by: 16) {
            let values: [UInt32] = damage.withUnsafeBytes { raw in (0..<4).map { raw.loadUnaligned(fromByteOffset: offset + $0 * 4,as: UInt32.self) } }
            guard values[0] <= width, values[1] <= height, values[2] <= width-values[0], values[3] <= height-values[1] else { lastError = "Damage exceeds framebuffer";return false }
            if values[2] > 0 && values[3] > 0 { rectangles.append(CGRect(x: Int(values[0]),y: Int(values[1]),width: Int(values[2]),height: Int(values[3]))) }
        }
        for rect in rectangles {
            for index in 0..<3 { dirty[index] = dirty[index]?.union(rect) ?? rect }
            needsPresentation = true
        }
        guard needsPresentation else { return true }
        // No main-thread wait when the compositor or GPU is busy.
        guard bounds.width > 0, bounds.height > 0 else { return true }
        lock.lock()
        guard let slot = occupied.firstIndex(of: false) else { lock.unlock();return true }
        occupied[slot] = true
        let submittedGeneration = generation
        lock.unlock()
        guard let drawable = metalLayer.nextDrawable(), let command = queue.makeCommandBuffer() else {
            lock.lock();occupied[slot] = false;lock.unlock();return true
        }
        let texture = textures[slot]
        if let rect = dirty[slot] {
            let x=Int(rect.minX),y=Int(rect.minY),w=Int(rect.width),h=Int(rect.height)
            texture.replace(region: MTLRegionMake2D(x,y,w,h),mipmapLevel: 0,
                withBytes: pixels.advanced(by: y * Int(stride) + x * 4),bytesPerRow: Int(stride))
            dirty[slot] = nil
        }
        let pass = MTLRenderPassDescriptor()
        pass.colorAttachments[0].texture = drawable.texture
        pass.colorAttachments[0].loadAction = .clear
        pass.colorAttachments[0].storeAction = .store
        pass.colorAttachments[0].clearColor = MTLClearColorMake(0, 0, 0, 1)
        guard let encoder = command.makeRenderCommandEncoder(descriptor: pass) else {
            lock.lock();occupied[slot] = false;lock.unlock();lastError = "Metal encoder allocation failed";return false
        }
        let dw = Double(drawable.texture.width), dh = Double(drawable.texture.height)
        let scale = min(dw / Double(width), dh / Double(height))
        let fw = Double(width) * scale, fh = Double(height) * scale
        encoder.setViewport(MTLViewport(originX: (dw-fw)/2, originY: (dh-fh)/2, width: fw, height: fh, znear: 0, zfar: 1))
        encoder.setRenderPipelineState(pipeline)
        encoder.setFragmentTexture(texture, index: 0)
        encoder.drawPrimitives(type: .triangleStrip, vertexStart: 0, vertexCount: 4)
        encoder.endEncoding()
        let row = (drawable.texture.width * 4 + 255) & ~255
        let capture = captureEnabled
        let readback = capture ? device.makeBuffer(length: row * drawable.texture.height, options: .storageModeShared) : nil
        if capture && readback == nil {
            lock.lock();occupied[slot] = false;lock.unlock();lastError = "Metal receipt allocation failed";return false
        }
        if let readback {
            guard let blit = command.makeBlitCommandEncoder() else {
                lock.lock();occupied[slot] = false;lock.unlock();lastError = "Metal receipt encoder failed";return false
            }
            blit.copy(from: drawable.texture, sourceSlice: 0, sourceLevel: 0, sourceOrigin: MTLOrigin(x: 0,y: 0,z: 0),
                sourceSize: MTLSize(width: drawable.texture.width,height: drawable.texture.height,depth: 1),
                to: readback,destinationOffset: 0,destinationBytesPerRow: row,destinationBytesPerImage: row * drawable.texture.height)
            blit.endEncoding()
        }
        let pixelWidth = drawable.texture.width, pixelHeight = drawable.texture.height
        command.addCompletedHandler { [weak self, texture] completed in
            _ = texture // Keep borrowed texture storage alive until GPU completion.
            var hash: UInt32?
            if completed.status == .completed, let readback {
                let bytes = readback.contents().assumingMemoryBound(to: UInt8.self)
                var value: UInt32 = 2166136261
                for y in 0..<pixelHeight { for x in 0..<(pixelWidth * 4) { value = (value ^ UInt32(bytes[y * row + x])) &* 16777619 } }
                hash = value
            }
            guard let self else { return }
            self.lock.lock()
            if self.generation == submittedGeneration { self.occupied[slot] = false }
            self.lock.unlock()
            let completedHash = hash
            DispatchQueue.main.async { [weak self] in
                guard let self, self.generation == submittedGeneration else { return }
                if let completedHash { self.presentedHash = completedHash }
                if completed.status == .error { self.lastError = completed.error?.localizedDescription ?? "Metal submission failed" }
            }
        }
        command.present(drawable)
        lastSubmission = command
        command.commit()
        needsPresentation = false
        return true
    }
    /// Owner-thread teardown only. Completion handlers never wait on main.
    @objc public func finishAndRelease() {
        lastSubmission?.waitUntilCompleted()
        lastSubmission = nil
        lock.lock()
        generation += 1
        textures.removeAll()
        occupied = [false, false, false]
        lock.unlock()
        dirty = [nil, nil, nil]
        dimensions = .zero
        needsPresentation = true
    }
}
