#import "DirectMetalRenderer.h"
#include <math.h>
#import "GpuResourceBudget.h"
static BOOL gpuError(NSError **error,NSString *message){if(error)*error=[NSError errorWithDomain:@"MiniMetal" code:1 userInfo:@{NSLocalizedDescriptionKey:message}];return NO;}
@implementation MiniDirectMetalRenderer {
  id<MTLDevice> _device;
  id<MTLRenderPipelineState> _pipeline;
  id<MTLSamplerState> _nearest,_linear;
  id<MTLTexture> _white;
  NSMutableDictionary<NSNumber *,NSDictionary *> *_images;
  NSThread *_owner;
  MiniGpuResourceBudget *_budget;MiniGpuReservation *_whiteLease;
}
- (instancetype)initWithDevice:(id<MTLDevice>)device error:(NSError **)error {
  if(!(self=[super init]))return nil;
  _owner=NSThread.currentThread;_budget=MiniGpuResourceBudget.sharedBudget;_whiteLease=[_budget reserve:4];if(!_whiteLease){gpuError(error,@"Process GPU resource budget exceeded");return nil;}_device=device;_images=[NSMutableDictionary new];
  if(!device){gpuError(error,@"Metal unavailable");return nil;}
  NSString *source=@"#include <metal_stdlib>\nusing namespace metal;\nstruct V {packed_float2 position;packed_float2 uv;uint color;};\nstruct O {float4 position [[position]];float2 uv;float4 color;};\nvertex O mini_vertex(uint id [[vertex_id]],const device V *v [[buffer(0)]],constant float2 &size [[buffer(1)]]){V a=v[id];O o;o.position=float4(float2(a.position)/size*float2(2,-2)+float2(-1,1),0,1);o.uv=float2(a.uv);o.color=float4(a.color&255,(a.color>>8)&255,(a.color>>16)&255,(a.color>>24)&255)/255.0;return o;}\nfragment float4 mini_fragment(O o [[stage_in]],texture2d<float> image [[texture(0)]],sampler filter [[sampler(0)]]){return image.sample(filter,o.uv)*o.color;}";
  id<MTLLibrary> library=[device newLibraryWithSource:source options:nil error:error];if(!library)return nil;
  MTLRenderPipelineDescriptor *pipeline=[MTLRenderPipelineDescriptor new];pipeline.vertexFunction=[library newFunctionWithName:@"mini_vertex"];pipeline.fragmentFunction=[library newFunctionWithName:@"mini_fragment"];
  MTLRenderPipelineColorAttachmentDescriptor *color=pipeline.colorAttachments[0];color.pixelFormat=MTLPixelFormatBGRA8Unorm;color.blendingEnabled=YES;color.sourceRGBBlendFactor=MTLBlendFactorSourceAlpha;color.destinationRGBBlendFactor=MTLBlendFactorOneMinusSourceAlpha;color.sourceAlphaBlendFactor=MTLBlendFactorOne;color.destinationAlphaBlendFactor=MTLBlendFactorOneMinusSourceAlpha;
  _pipeline=[device newRenderPipelineStateWithDescriptor:pipeline error:error];if(!_pipeline)return nil;
  MTLSamplerDescriptor *sampler=[MTLSamplerDescriptor new];sampler.sAddressMode=MTLSamplerAddressModeClampToEdge;sampler.tAddressMode=MTLSamplerAddressModeClampToEdge;sampler.minFilter=MTLSamplerMinMagFilterNearest;sampler.magFilter=MTLSamplerMinMagFilterNearest;_nearest=[device newSamplerStateWithDescriptor:sampler];sampler.minFilter=MTLSamplerMinMagFilterLinear;sampler.magFilter=MTLSamplerMinMagFilterLinear;_linear=[device newSamplerStateWithDescriptor:sampler];
  MTLTextureDescriptor *white=[MTLTextureDescriptor texture2DDescriptorWithPixelFormat:MTLPixelFormatRGBA8Unorm width:1 height:1 mipmapped:NO];white.usage=MTLTextureUsageShaderRead;white.storageMode=MTLStorageModeShared;_white=[device newTextureWithDescriptor:white];uint8_t pixel[4]={255,255,255,255};if(!_white||!_nearest||!_linear){gpuError(error,@"Metal resource allocation failed");return nil;}[_white replaceRegion:MTLRegionMake2D(0,0,1,1) mipmapLevel:0 withBytes:pixel bytesPerRow:4];return self;
}
- (void)reset {NSAssert(NSThread.currentThread==_owner,@"Metal owner thread");[_images removeAllObjects];}
- (BOOL)encodeSnapshot:(const MpGpuSnapshot *)frame target:(id<MTLTexture>)target viewport:(MTLViewport)viewport commandBuffer:(id<MTLCommandBuffer>)buffer error:(NSError **)error {
  if(NSThread.currentThread!=_owner)return gpuError(error,@"Metal owner thread mismatch");
  if(!frame||frame->size!=sizeof(*frame)||!target||!buffer||!buffer.retainedReferences||target.device!=_device||buffer.commandQueue.device!=_device||target.pixelFormat!=MTLPixelFormatBGRA8Unorm)return gpuError(error,@"Invalid Metal frame target");
  if(!isfinite(frame->width)||!isfinite(frame->height)||frame->width<=0||frame->height<=0||frame->vertex_count>262144||frame->command_count>87381||frame->texture_count>512||(frame->vertex_count&&!frame->vertices)||(frame->command_count&&!frame->commands)||(frame->texture_count&&!frame->textures))return gpuError(error,@"Invalid Metal frame slices");
  if(!isfinite(viewport.originX)||!isfinite(viewport.originY)||!isfinite(viewport.width)||!isfinite(viewport.height)||viewport.originX<0||viewport.originY<0||viewport.width<=0||viewport.height<=0||viewport.originX+viewport.width>target.width||viewport.originY+viewport.height>target.height)return gpuError(error,@"Invalid Metal viewport");
  NSMutableDictionary *next=[NSMutableDictionary new];size_t bytes=4;
  for(size_t i=0;i<frame->texture_count;i++){
    const MpGpuTexture *image=&frame->textures[i];NSNumber *key=@(image->handle);
    if(image->handle==UINT32_MAX||next[key]||!image->width||!image->height||image->width>16384||image->height>16384||image->linear>1||!image->pixels)return gpuError(error,@"Invalid Metal texture descriptor");
    uint64_t length=(uint64_t)image->width*image->height*4;
    if(length>16*1024*1024||length!=image->length||length>64*1024*1024-bytes)return gpuError(error,@"Metal texture budget exceeded");bytes+=(size_t)length;
    NSDictionary *old=_images[key];id<MTLTexture> texture=old[@"texture"];MiniGpuReservation *lease=old[@"lease"];
    if(!texture||[old[@"revision"] unsignedLongLongValue]!=image->revision||texture.width!=image->width||texture.height!=image->height){
      lease=[_budget reserve:(NSUInteger)length];if(!lease)return gpuError(error,@"Process GPU resource budget exceeded");
      MTLTextureDescriptor *descriptor=[MTLTextureDescriptor texture2DDescriptorWithPixelFormat:MTLPixelFormatRGBA8Unorm width:image->width height:image->height mipmapped:NO];descriptor.storageMode=MTLStorageModeShared;descriptor.usage=MTLTextureUsageShaderRead;
      texture=[_device newTextureWithDescriptor:descriptor];if(!texture)return gpuError(error,@"Metal texture allocation failed");[texture replaceRegion:MTLRegionMake2D(0,0,image->width,image->height) mipmapLevel:0 withBytes:image->pixels bytesPerRow:image->width*4];
    }
    next[key]=@{@"texture":texture,@"revision":@(image->revision),@"linear":@(image->linear),@"lease":lease};
  }
  for(size_t i=0;i<frame->command_count;i++){const MpGpuCommand *command=&frame->commands[i];if(command->first<0||command->count<0||command->count%3||((uint64_t)command->first+command->count)>frame->vertex_count||(command->texture!=UINT32_MAX&&!next[@(command->texture)]))return gpuError(error,@"Invalid Metal draw range");}
  MiniGpuReservation *vertexLease=nil;id<MTLBuffer> vertices=nil;if(frame->vertex_count){vertexLease=[_budget reserve:frame->vertex_count*sizeof(MpGpuVertex)];if(!vertexLease)return gpuError(error,@"Process GPU resource budget exceeded");vertices=[_device newBufferWithBytes:frame->vertices length:frame->vertex_count*sizeof(MpGpuVertex) options:MTLResourceStorageModeShared];if(!vertices)return gpuError(error,@"Metal vertex allocation failed");}
  MTLRenderPassDescriptor *pass=[MTLRenderPassDescriptor renderPassDescriptor];pass.colorAttachments[0].texture=target;pass.colorAttachments[0].loadAction=MTLLoadActionClear;pass.colorAttachments[0].storeAction=MTLStoreActionStore;pass.colorAttachments[0].clearColor=MTLClearColorMake(0,0,0,1);
  id<MTLRenderCommandEncoder> encoder=[buffer renderCommandEncoderWithDescriptor:pass];if(!encoder)return gpuError(error,@"Metal encoder unavailable");
  [encoder setRenderPipelineState:_pipeline];[encoder setViewport:viewport];[encoder setCullMode:MTLCullModeNone];[encoder setVertexBuffer:vertices offset:0 atIndex:0];float dimensions[2]={frame->width,frame->height};[encoder setVertexBytes:dimensions length:sizeof(dimensions) atIndex:1];
  for(size_t i=0;i<frame->command_count;i++){
    const MpGpuCommand *command=&frame->commands[i];double sx=viewport.width/frame->width,sy=viewport.height/frame->height;
    double left=MAX(viewport.originX,viewport.originX+command->x*sx),top=MAX(viewport.originY,viewport.originY+command->y*sy);
    double right=MIN(viewport.originX+viewport.width,viewport.originX+((double)command->x+command->width)*sx),bottom=MIN(viewport.originY+viewport.height,viewport.originY+((double)command->y+command->height)*sy);
    if(right<=left||bottom<=top||!command->count)continue;
    MTLScissorRect clip={(NSUInteger)floor(left),(NSUInteger)floor(top),(NSUInteger)ceil(right)-(NSUInteger)floor(left),(NSUInteger)ceil(bottom)-(NSUInteger)floor(top)};[encoder setScissorRect:clip];
    NSDictionary *image=next[@(command->texture)];[encoder setFragmentTexture:command->texture==UINT32_MAX?_white:image[@"texture"] atIndex:0];[encoder setFragmentSamplerState:[image[@"linear"] boolValue]?_linear:_nearest atIndex:0];[encoder drawPrimitives:MTLPrimitiveTypeTriangle vertexStart:(NSUInteger)command->first vertexCount:(NSUInteger)command->count];
  }
  [encoder endEncoding];
  NSArray *retainedLeases=vertexLease?@[[next copy],_whiteLease,vertexLease]:@[[next copy],_whiteLease];
  [buffer addCompletedHandler:^(id<MTLCommandBuffer> completed){(void)completed;(void)retainedLeases.count;}];
  _images=next;return YES;
}
@end
