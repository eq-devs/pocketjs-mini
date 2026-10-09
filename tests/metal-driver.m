#import "DirectMetalRenderer.h"
#import "GpuResourceBudget.h"
#include <assert.h>
struct Driver { __unsafe_unretained MiniDirectMetalRenderer *renderer; __unsafe_unretained id<MTLTexture> target; __unsafe_unretained id<MTLCommandBuffer> buffer; BOOL failed; };
static int32_t draw(void *context,const MpGpuSnapshot *frame){
  struct Driver *driver=context;NSError *error=nil;
  BOOL ok=[driver->renderer encodeSnapshot:frame target:driver->target viewport:(MTLViewport){8,8,16,16,0,1} commandBuffer:driver->buffer error:&error];
  driver->failed=!ok;if(!ok)NSLog(@"Driver: %@",error.localizedDescription);return ok?0:-1;
}
int main(void){@autoreleasepool{
  id<MTLDevice> device=MTLCreateSystemDefaultDevice();if(!device){fprintf(stderr,"Metal device unavailable\n");return 2;}
  NSError *error=nil;MiniDirectMetalRenderer *renderer=[[MiniDirectMetalRenderer alloc] initWithDevice:device error:&error];if(!renderer){NSLog(@"%@",error);return 1;}
  id<MTLCommandQueue> queue=[device newCommandQueue];
  MTLTextureDescriptor *descriptor=[MTLTextureDescriptor texture2DDescriptorWithPixelFormat:MTLPixelFormatBGRA8Unorm width:32 height:32 mipmapped:NO];descriptor.storageMode=MTLStorageModeShared;descriptor.usage=MTLTextureUsageRenderTarget;
  id<MTLTexture> target=[device newTextureWithDescriptor:descriptor];assert(target);
  MpConfig config={sizeof(config),1,64,64,1,24*1024*1024,1};MpInstance *engine=mp_create(&config);assert(engine);
  const char *js="ui.setProp(1,64,0xff00ff00);globalThis.frame=()=>{}";
  assert(mp_boot(engine,(const uint8_t *)js,strlen(js),NULL,0)==0);assert(mp_frame(engine,NULL,0)==0);
  id<MTLCommandBuffer> buffer=[queue commandBuffer];struct Driver driver={renderer,target,buffer,NO};
  assert(mp_gpu_snapshot(engine,16384,draw,&driver)==0);[buffer commit];[buffer waitUntilCompleted];assert(buffer.status==MTLCommandBufferStatusCompleted);
  uint8_t pixels[32*32*4];[target getBytes:pixels bytesPerRow:32*4 fromRegion:MTLRegionMake2D(0,0,32,32) mipmapLevel:0];
  for(int y=0;y<32;y++)for(int x=0;x<32;x++){uint8_t *pixel=pixels+(y*32+x)*4;BOOL inside=x>=8&&x<24&&y>=8&&y<24;assert(pixel[0]==0&&pixel[1]==(inside?255:0)&&pixel[2]==0&&pixel[3]==255);}
  descriptor.pixelFormat=MTLPixelFormatRGBA8Unorm;id<MTLTexture> wrong=[device newTextureWithDescriptor:descriptor];buffer=[queue commandBuffer];driver.target=wrong;driver.buffer=buffer;
  assert(mp_gpu_snapshot(engine,16384,draw,&driver)==-1);assert(driver.failed);assert(mp_frame(engine,NULL,0)==0);
  buffer=[queue commandBuffer];driver.target=target;driver.buffer=buffer;assert(mp_gpu_snapshot(engine,16384,draw,&driver)==0);[buffer commit];[buffer waitUntilCompleted];assert(buffer.status==MTLCommandBufferStatusCompleted);
  // Two outstanding frames must keep different texture revisions alive.
  MpGpuVertex quad[6]={{{0,0},{0,0},UINT32_MAX},{{64,0},{1,0},UINT32_MAX},{{64,64},{1,1},UINT32_MAX},{{0,0},{0,0},UINT32_MAX},{{64,64},{1,1},UINT32_MAX},{{0,64},{0,1},UINT32_MAX}};
  MpGpuCommand command={42,0,6,0,0,32,64};uint8_t image[4]={255,0,0,128};
  MpGpuTexture texture={42,1,1,1,0,image,4};
  MpGpuSnapshot snapshot={sizeof(snapshot),64,64,quad,6,&command,1,&texture,1};
  descriptor.pixelFormat=MTLPixelFormatBGRA8Unorm;id<MTLTexture> second=[device newTextureWithDescriptor:descriptor];assert(second);
  id<MTLCommandBuffer> first=[queue commandBuffer];driver.target=target;driver.buffer=first;assert(draw(&driver,&snapshot)==0);
  texture.revision=2;image[0]=0;image[2]=255;command.width=64;
  id<MTLCommandBuffer> next=[queue commandBuffer];driver.target=second;driver.buffer=next;assert(draw(&driver,&snapshot)==0);
  [renderer reset];assert(MiniGpuResourceBudget.sharedBudget.usedBytes>=252);
  memset(image,0,sizeof(image)); // Callback source memory is no longer needed.
  [first commit];[next commit];[first waitUntilCompleted];[next waitUntilCompleted];assert(first.status==MTLCommandBufferStatusCompleted&&next.status==MTLCommandBufferStatusCompleted);
  [target getBytes:pixels bytesPerRow:128 fromRegion:MTLRegionMake2D(0,0,32,32) mipmapLevel:0];
  for(int y=0;y<32;y++)for(int x=0;x<32;x++){uint8_t *pixel=pixels+(y*32+x)*4;BOOL inside=x>=8&&x<16&&y>=8&&y<24;assert(pixel[0]==0&&pixel[1]==0&&pixel[2]==(inside?128:0)&&pixel[3]==255);}
  [second getBytes:pixels bytesPerRow:128 fromRegion:MTLRegionMake2D(0,0,32,32) mipmapLevel:0];
  for(int y=0;y<32;y++)for(int x=0;x<32;x++){uint8_t *pixel=pixels+(y*32+x)*4;BOOL inside=x>=8&&x<24&&y>=8&&y<24;assert(pixel[0]==(inside?128:0)&&pixel[1]==0&&pixel[2]==0&&pixel[3]==255);}
  [renderer reset];assert(mp_destroy(engine)==0);puts("Actual Metal guest triangles, textures, alpha, clipping, in-flight revisions and rejection recovery passed");
}}
