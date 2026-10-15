#import "DirectMetalRenderer.h"
#include <assert.h>
#include <math.h>
#include <stdlib.h>
struct Driver {__unsafe_unretained MiniDirectMetalRenderer *renderer;__unsafe_unretained id<MTLTexture> target;__unsafe_unretained id<MTLCommandBuffer> buffer;};
static int32_t draw(void *context,const MpGpuSnapshot *frame){
  struct Driver *driver=context;NSError *error=nil;
  BOOL ok=[driver->renderer encodeSnapshot:frame target:driver->target viewport:(MTLViewport){0,0,driver->target.width,driver->target.height,0,1} commandBuffer:driver->buffer error:&error];
  if(!ok)NSLog(@"%@",error);return ok?0:-1;
}
static unsigned probe(id<MTLTexture> target,unsigned density){
  unsigned errors=0;const unsigned rows[]={8,32,822};
  for(unsigned i=0;i<3;i++){uint8_t bgra[4]={0};[target getBytes:bgra bytesPerRow:4 fromRegion:MTLRegionMake2D(8*density,rows[i]*density,1,1) mipmapLevel:0];if(abs((int)bgra[0]-42)>1||abs((int)bgra[1]-23)>1||abs((int)bgra[2]-15)>1||bgra[3]!=255)errors++;}
  return errors;
}
static void render(MpInstance *engine,MiniDirectMetalRenderer *renderer,id<MTLTexture> target,id<MTLCommandQueue> queue){
  id<MTLCommandBuffer> buffer=[queue commandBuffer];struct Driver driver={renderer,target,buffer};assert(mp_gpu_snapshot(engine,16384,draw,&driver)==0);[buffer commit];[buffer waitUntilCompleted];assert(buffer.status==MTLCommandBufferStatusCompleted);
}
int main(int argc,char **argv){@autoreleasepool{
  assert(argc==4||(argc==5&&strcmp(argv[4],"form")==0));BOOL form=argc==5;unsigned density=(unsigned)atoi(argv[3]);assert(density==1||density==3);
  NSString *prefix=[NSString stringWithUTF8String:argv[2]];NSData *payload=[NSData dataWithContentsOfFile:[NSString stringWithUTF8String:argv[1]]];assert(payload);
  MpPackageInputs inputs={0};inputs.size=sizeof(inputs);const char *identity="dev.pjm.benchmark";assert(mp_package_select(payload.bytes,payload.length,1,(const uint8_t*)identity,strlen(identity),&inputs)==0);
  MpConfig config={sizeof(config),1,390,844,density,32*1024*1024,1};MpInstance *engine=mp_create(&config);assert(engine);assert(mp_boot(engine,inputs.js,inputs.js_len,inputs.pak,inputs.pak_len)==0);assert(mp_launch(engine,(const uint8_t*)"{}",2)==0);assert(mp_lifecycle(engine,MP_SHOW)==0);
  id<MTLDevice> device=MTLCreateSystemDefaultDevice();if(!device){fprintf(stderr,"Metal device unavailable\n");assert(mp_destroy(engine)==0);return 2;}NSError *error=nil;MiniDirectMetalRenderer *renderer=[[MiniDirectMetalRenderer alloc] initWithDevice:device error:&error];assert(renderer);id<MTLCommandQueue> queue=[device newCommandQueue];assert(queue);
  unsigned width=390*density,height=844*density;MTLTextureDescriptor *descriptor=[MTLTextureDescriptor texture2DDescriptorWithPixelFormat:MTLPixelFormatBGRA8Unorm width:width height:height mipmapped:NO];descriptor.storageMode=MTLStorageModeShared;descriptor.usage=MTLTextureUsageRenderTarget;id<MTLTexture> target=[device newTextureWithDescriptor:descriptor];assert(target);
  unsigned frames=0,transient=0;MpInput input={0};input.size=sizeof(input);assert(mp_frame_input(engine,&input)==0);render(engine,renderer,target,queue);frames++;transient+=probe(target,density);
  for(unsigned swipe=0;swipe<6;swipe++){
    int32_t hit=0;assert(mp_hit_test(engine,195,650,&hit)==0&&hit!=0);
    for(unsigned sample=0;sample<60;sample++){@autoreleasepool{
      unsigned y=(unsigned)lround(650.-450.*sample/59.),identifier=swipe+2;input.count=1;input.contacts[0]=y>511?0x80000000u|(identifier<<20)|(y<<10)|195:(identifier<<18)|(y<<9)|195;input.hits[0]=hit;
      assert(mp_frame_input(engine,&input)==0);render(engine,renderer,target,queue);frames++;transient+=probe(target,density);
    }}
    input.count=0;assert(mp_frame_input(engine,&input)==0);render(engine,renderer,target,queue);frames++;transient+=probe(target,density);
  }
  for(unsigned idle=0;idle<120;idle++){@autoreleasepool{assert(mp_frame_input(engine,&input)==0);render(engine,renderer,target,queue);frames++;transient+=probe(target,density);}}
  if(form){
    const unsigned points[][2]={{340,32},{195,140},{195,208},{195,276}};
    for(unsigned index=0;index<4;index++){
      int32_t hit=0;unsigned x=points[index][0],y=points[index][1];assert(mp_hit_test(engine,x,y,&hit)==0&&hit!=0);input.count=1;input.contacts[0]=((40+index)<<18)|(y<<9)|x;input.hits[0]=hit;
      for(unsigned step=0;step<3;step++){@autoreleasepool{if(step)input.count=0;assert(mp_frame_input(engine,&input)==0);render(engine,renderer,target,queue);frames++;transient+=probe(target,density);}}
    }
    NSMutableData *storage=[NSMutableData dataWithLength:4*1024*1024];ptrdiff_t length=mp_debug_tree(engine,storage.mutableBytes,storage.length);assert(length>0);storage.length=(NSUInteger)length;
    NSDictionary *tree=[NSJSONSerialization JSONObjectWithData:storage options:0 error:nil];NSMutableSet *texts=[NSMutableSet new];for(NSDictionary *node in tree[@"nodes"])if([node[@"text"] isKindOfClass:NSString.class])[texts addObject:node[@"text"]];
    assert([texts containsObject:@"Latin form fixture"]&&[texts containsObject:@"Pro"]&&[texts containsObject:@"Yes"]&&[texts containsObject:@"Saved: "]&&[texts containsObject:@"enabled"]);
    assert([storage writeToFile:[prefix stringByAppendingString:@"-tree.json"] atomically:YES]);
  }
  size_t bytes=(size_t)width*height*4;NSMutableData *gpu=[NSMutableData dataWithLength:bytes];[target getBytes:gpu.mutableBytes bytesPerRow:width*4 fromRegion:MTLRegionMake2D(0,0,width,height) mipmapLevel:0];assert([gpu writeToFile:[prefix stringByAppendingString:@"-metal.bgra"] atomically:YES]);
  MpFrame cpu={0};assert(mp_render(engine,&cpu)==0&&cpu.width==width&&cpu.height==height&&cpu.length==bytes);assert([[NSData dataWithBytes:cpu.pixels length:bytes] writeToFile:[prefix stringByAppendingString:@"-cpu.bgra"] atomically:YES]);
  const uint8_t *a=gpu.bytes,*b=cpu.pixels;size_t different=0,overOne=0,border=0,borderSamples=0;unsigned maximum=0;uint64_t sum=0;
  for(unsigned y=0;y<height;y++)for(unsigned x=0;x<width;x++){
    unsigned delta=0;size_t offset=((size_t)y*width+x)*4;
    for(unsigned channel=0;channel<4;channel++){unsigned value=(unsigned)abs((int)a[offset+channel]-b[offset+channel]);delta=MAX(delta,value);sum+=value;}
    maximum=MAX(maximum,delta);if(delta)different++;if(delta>1)overOne++;
    if(y<16*density||y>=height-8*density){borderSamples++;if(delta>1)border++;}
  }
  NSDictionary *result=@{@"scene":form?@"form":@"scroll",@"formControlsVerified":form?@YES:@NO,@"sameGuestTurn":@YES,@"density":@(density),@"width":@(width),@"height":@(height),@"frames":@(frames),@"transientBorderProbes":@(frames*3),@"transientBorderMismatches":@(transient),@"borderSamples":@(borderSamples),@"borderMismatches":@(border),@"fullFramePixels":@((size_t)width*height),@"differentPixels":@(different),@"pixelsOverOneChannelLevel":@(overOne),@"maxChannelDelta":@(maximum),@"absoluteChannelDeltaSum":@(sum),@"fullFrameParityWithinOneLevel":overOne==0?@YES:@NO,@"physicalDeviceAcceptance":@NO};
  NSData *json=[NSJSONSerialization dataWithJSONObject:result options:NSJSONWritingPrettyPrinted|NSJSONWritingSortedKeys error:nil];assert(json&&[json writeToFile:[prefix stringByAppendingString:@"-result.json"] atomically:YES]);puts([[NSString alloc] initWithData:json encoding:NSUTF8StringEncoding].UTF8String);
  [renderer reset];assert(mp_destroy(engine)==0);return border==0&&transient==0&&overOne==0?0:1;
}}
