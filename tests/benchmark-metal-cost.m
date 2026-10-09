#import "DirectMetalRenderer.h"
#include <assert.h>
#include <time.h>
#include <math.h>
static uint64_t now(void){struct timespec value;clock_gettime(CLOCK_MONOTONIC,&value);return (uint64_t)value.tv_sec*1000000000+value.tv_nsec;}
static int rowMax(MpInstance *engine){
  NSMutableData *storage=[NSMutableData dataWithLength:4*1024*1024];ptrdiff_t length=mp_debug_tree(engine,storage.mutableBytes,storage.length);assert(length>0);storage.length=(NSUInteger)length;
  NSDictionary *tree=[NSJSONSerialization JSONObjectWithData:storage options:0 error:nil];assert([tree isKindOfClass:NSDictionary.class]);int maximum=0;
  for(NSDictionary *node in tree[@"nodes"]){NSString *text=node[@"text"];if([text hasPrefix:@"Item "])text=[text substringFromIndex:5];NSScanner *scanner=[NSScanner scannerWithString:text];int number=0;if([scanner scanInt:&number]&&scanner.isAtEnd&&number>maximum)maximum=number;}
  return maximum;
}
struct Driver {__unsafe_unretained MiniDirectMetalRenderer *renderer;__unsafe_unretained id<MTLTexture> target;__unsafe_unretained id<MTLCommandBuffer> buffer;uint64_t bytes;};
static int32_t draw(void *context,const MpGpuSnapshot *frame){struct Driver *driver=context;driver->bytes=0;for(size_t i=0;i<frame->texture_count;i++)driver->bytes+=frame->textures[i].length;NSError *error=nil;BOOL ok=[driver->renderer encodeSnapshot:frame target:driver->target viewport:(MTLViewport){0,0,390,844,0,1} commandBuffer:driver->buffer error:&error];if(!ok)NSLog(@"%@",error);return ok?0:-1;}
int main(int argc,char **argv){@autoreleasepool{
  assert(argc==2);NSData *payload=[NSData dataWithContentsOfFile:[NSString stringWithUTF8String:argv[1]]];assert(payload);
  MpPackageInputs inputs={0};inputs.size=sizeof(inputs);const char *identity="dev.pjm.benchmark";assert(mp_package_select(payload.bytes,payload.length,1,(const uint8_t *)identity,strlen(identity),&inputs)==0);
  MpConfig config={sizeof(config),1,390,844,1,32*1024*1024,1};MpInstance *engine=mp_create(&config);assert(engine);assert(mp_boot(engine,inputs.js,inputs.js_len,inputs.pak,inputs.pak_len)==0);assert(mp_launch(engine,(const uint8_t *)"{}",2)==0);assert(mp_lifecycle(engine,MP_SHOW)==0);
  id<MTLDevice> device=MTLCreateSystemDefaultDevice();assert(device);NSError *error=nil;MiniDirectMetalRenderer *renderer=[[MiniDirectMetalRenderer alloc] initWithDevice:device error:&error];assert(renderer);
  id<MTLCommandQueue> queue=[device newCommandQueue];MTLTextureDescriptor *descriptor=[MTLTextureDescriptor texture2DDescriptorWithPixelFormat:MTLPixelFormatBGRA8Unorm width:390 height:844 mipmapped:NO];descriptor.storageMode=MTLStorageModeShared;descriptor.usage=MTLTextureUsageRenderTarget;id<MTLTexture> target=[device newTextureWithDescriptor:descriptor];assert(target);
  uint64_t total=0,maximum=0,over33=0,maxBytes=0;double gpuTotal=0,gpuMax=0;unsigned measured=0,gpuSamples=0;int32_t hit=0;int before=0;
  // Thirty warm frames, then six sixty-sample gestures with one release each.
  for(unsigned turn=0;turn<396;turn++){@autoreleasepool{
    MpInput input={0};input.size=sizeof(input);
    if(turn>=30){unsigned step=turn-30,phase=step%61,id=step/61+1;if(phase==0)assert(mp_hit_test(engine,195,650,&hit)==0);if(phase<60){unsigned y=(unsigned)lround(650.0-450.0*phase/59.0);input.count=1;input.contacts[0]=y>511?0x80000000u|(id<<20)|(y<<10)|195:(id<<18)|(y<<9)|195;input.hits[0]=hit;}}
    id<MTLCommandBuffer> buffer=[queue commandBuffer];struct Driver driver={renderer,target,buffer,0};uint64_t start=now();
    assert(mp_frame_input(engine,&input)==0);assert(mp_gpu_snapshot(engine,16384,draw,&driver)==0);[buffer commit];uint64_t duration=now()-start;[buffer waitUntilCompleted];assert(buffer.status==MTLCommandBufferStatusCompleted);
    if(turn==29)before=rowMax(engine);
    if(turn>=30){measured++;total+=duration;if(duration>maximum)maximum=duration;if(duration>33000000)over33++;if(driver.bytes>maxBytes)maxBytes=driver.bytes;double gpu=buffer.GPUEndTime-buffer.GPUStartTime;if(buffer.GPUStartTime>0&&gpu>0){gpuSamples++;gpuTotal+=gpu;if(gpu>gpuMax)gpuMax=gpu;}}
  }}
  int after=rowMax(engine);assert(after>before);
  printf("{\"kind\":\"host_metal_offscreen_cost\",\"frames\":%u,\"visibleRowBefore\":%d,\"visibleRowAfter\":%d,\"cpuTotalNs\":%llu,\"cpuMaxNs\":%llu,\"cpuOver33ms\":%llu,\"gpuSamples\":%u,\"gpuTotalSeconds\":%.9f,\"gpuMaxSeconds\":%.9f,\"maxCopiedTextureBytes\":%llu}\n",measured,before,after,(unsigned long long)total,(unsigned long long)maximum,(unsigned long long)over33,gpuSamples,gpuTotal,gpuMax,(unsigned long long)maxBytes);
  [renderer reset];assert(mp_destroy(engine)==0);
}}
