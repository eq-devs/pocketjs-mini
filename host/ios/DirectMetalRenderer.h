#import <Foundation/Foundation.h>
#import <Metal/Metal.h>
#import "mini_core.h"
/** Owner-thread direct DrawList rasterizer; caller owns submission/presentation.
 * Command buffers must retain referenced resources through GPU completion. */
@interface MiniDirectMetalRenderer : NSObject
- (instancetype)initWithDevice:(id<MTLDevice>)device error:(NSError **)error;
- (BOOL)encodeSnapshot:(const MpGpuSnapshot *)frame target:(id<MTLTexture>)target viewport:(MTLViewport)viewport commandBuffer:(id<MTLCommandBuffer>)buffer error:(NSError **)error;
- (void)reset;
@end
