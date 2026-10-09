// Mini-owned shared-engine UIKit adapter. Main thread owns every C ABI call.
#import "PocketSurfaceView.h"
#import "mini_core.h"
#import "Mini-Swift.h"
#import "Config.h"
#import <QuartzCore/QuartzCore.h>
#import "TouchSampling.h"
#import "DirectMetalRenderer.h"

@interface PocketSurfaceView (DirectGPU)
- (int32_t)encodeGpuSnapshot:(const MpGpuSnapshot *)frame;
@end
static int32_t deliverGpu(void *context,const MpGpuSnapshot *frame){return [(__bridge PocketSurfaceView *)context encodeGpuSnapshot:frame];}

@interface MiniTouch : NSObject
@property(nonatomic,weak) UITouch *touch;
@property CGPoint point;
@property CGPoint initialPoint;
@property uint8_t identifier;
@property int32_t hit;
@property BOOL live,cancelled;
@property MiniTouchSampling sampling;
@end
@implementation MiniTouch
@end
@implementation PocketSurfaceView {
  MpInstance *_handle;
  MiniVerifiedContainer *_container;
  NSData *_pak;
  NSMutableData *_serviceBuffer;
  CADisplayLink *_displayLink;
  NSTimer *_frameTimer;
  MiniMetalPresenter *_presenter;
  MiniDirectMetalRenderer *_direct;
  id<MTLCommandQueue> _gpuQueue;
  id<MTLCommandBuffer> _gpuBuffer;
  id<CAMetalDrawable> _gpuDrawable;
  NSMutableArray<NSDictionary *> *_gpuPending;
  NSError *_gpuError;
  uint32_t _gpuHash;
  NSMutableArray<MiniTouch *> *_contacts;
  uint8_t _nextId;
  uint64_t _frameNumber;
  BOOL _running;
  BOOL _backgrounded,_pendingMemoryWarning,_hostHidden;
  NSMutableArray<NSDictionary *> *_recordedSteps;
  NSDictionary *_recordingHeader;
  NSUInteger _recordingBytes;
  NSUInteger _recordingFrames;
  BOOL _recordingStopped;
  BOOL _booted;
  NSDictionary *_inspectionTree;
  uint64_t _inspectionFrame;
  CAShapeLayer *_inspectionHighlight;
  int32_t _highlightedInspectionNode;
}
static const uint32_t kPocketSurfaceDefaultTickRate=60;
+ (instancetype)surfaceWithLogicalWidth:(uint32_t)width logicalHeight:(uint32_t)height density:(uint32_t)density hostId:(NSString *)hostId hostAbi:(uint32_t)abi {
  PocketSurfaceView *view=[[self alloc] initWithFrame:CGRectZero logicalWidth:width logicalHeight:height density:density];
  if (![hostId isEqualToString:@"pjm-ios"] || abi!=7) { [view fail:@"Unsupported host identity"];mp_destroy(view->_handle);view->_handle=NULL; }
  return view;
}
+ (instancetype)surfaceWithLogicalWidth:(uint32_t)width logicalHeight:(uint32_t)height density:(uint32_t)density {
  return [self surfaceWithLogicalWidth:width logicalHeight:height density:density hostId:@"pjm-ios" hostAbi:7];
}
- (instancetype)initWithFrame:(CGRect)frame logicalWidth:(uint32_t)width logicalHeight:(uint32_t)height density:(uint32_t)density {
  return [self initWithFrame:frame logicalWidth:width logicalHeight:height density:density createEngine:YES];
}
- (instancetype)initWithFrame:(CGRect)frame logicalWidth:(uint32_t)width logicalHeight:(uint32_t)height density:(uint32_t)density createEngine:(BOOL)createEngine {
  if((self=[super initWithFrame:frame])) {
    _logicalWidth=width;_logicalHeight=height;_contacts=[NSMutableArray array];
    MpConfig config={sizeof(config),1,width,height,density,24*1024*1024,1};if(createEngine){_handle=mp_create(&config);_serviceBuffer=[NSMutableData dataWithLength:32*4097];}
    if(createEngine && !_handle)[self fail:@"Invalid engine configuration or engine allocation failed"];
    _presenter=[[MiniMetalPresenter alloc] initWithFrame:self.bounds];
    _presenter.captureEnabled=PJM_TEST_MODE;_presenter.autoresizingMask=UIViewAutoresizingFlexibleWidth|UIViewAutoresizingFlexibleHeight;[self addSubview:_presenter];
    if(_presenter.lastError)[self fail:_presenter.lastError];
    CAMetalLayer *metal=(CAMetalLayer *)_presenter.layer;NSError *gpuError=nil;
    _direct=[[MiniDirectMetalRenderer alloc] initWithDevice:metal.device error:&gpuError];_gpuQueue=[metal.device newCommandQueue];_gpuPending=[NSMutableArray new];
    if(!_direct||!_gpuQueue)[self fail:gpuError.localizedDescription?:@"Metal queue unavailable"];
    self.multipleTouchEnabled=YES;
    self.layer.contentsGravity=kCAGravityResizeAspect;self.backgroundColor=UIColor.blackColor;
    [[NSNotificationCenter defaultCenter] addObserver:self selector:@selector(appDidEnterBackground) name:UIApplicationDidEnterBackgroundNotification object:nil];
    [[NSNotificationCenter defaultCenter] addObserver:self selector:@selector(appWillEnterForeground) name:UIApplicationWillEnterForegroundNotification object:nil];
    [[NSNotificationCenter defaultCenter] addObserver:self selector:@selector(appMemoryWarning) name:UIApplicationDidReceiveMemoryWarningNotification object:nil];
  }return self;
}
- (instancetype)initWithInstalledIdentity:(NSString *)identity store:(MiniPackageStore *)store storageRoot:(NSString *)root launchData:(NSData *)launch error:(NSError **)error {
  MiniVerifiedPackage *package=[store coldStart:identity error:error];
  return package?[self initWithVerifiedPackage:package storageRoot:root launchData:launch error:error]:nil;
}
- (BOOL)activateInstalledIdentity:(NSString *)identity store:(MiniPackageStore *)store launchData:(NSData *)launch error:(NSError **)error {
  if(!NSThread.isMainThread || !_container || _backgrounded){if(error)*error=[NSError errorWithDomain:@"MiniSurface" code:1 userInfo:@{NSLocalizedDescriptionKey:@"Installed activation requires a foreground main-thread container"}];return NO;}
  NSData *bytes=[identity dataUsingEncoding:NSUTF8StringEncoding];
  uint64_t generation=mp_pool_generation(_container.pool,bytes.bytes,bytes.length);
  MiniVerifiedPackage *package=generation?[_container packageForIdentity:identity generation:generation]:[store coldStart:identity error:error];
  return package && [self activateVerifiedPackage:package launchData:launch error:error];
}
- (instancetype)initWithVerifiedPackage:(MiniVerifiedPackage *)package storageRoot:(NSString *)root launchData:(NSData *)launch error:(NSError **)error {
  if(!NSThread.isMainThread || !package)return nil;
  MpConfig config=package.config;
  self=[self initWithFrame:CGRectZero logicalWidth:config.width logicalHeight:config.height density:config.density createEngine:NO];
  if(!self)return nil;
  _container=[[MiniVerifiedContainer alloc] initWithStorageRoot:root];
  if(!_container || _lastError){if(error)*error=[NSError errorWithDomain:@"MiniSurface" code:1 userInfo:@{NSLocalizedDescriptionKey:_lastError?:@"Container allocation failed"}];return nil;}
  __weak PocketSurfaceView *weakSelf=self;
  _container.onCleanup=^(MiniVerifiedPackage *bound,uint64_t generation,NSData *record){
    PocketSurfaceView *surface=weakSelf;NSString *line=[[NSString alloc] initWithData:record encoding:NSUTF8StringEncoding];
    if(line && surface.onVerifiedCleanup)surface.onVerifiedCleanup(bound,generation,line);
  };
  _container.onRetirement=^(MiniVerifiedPackage *retired,uint64_t generation){
    PocketSurfaceView *surface=weakSelf;
    if(surface){
      [surface finishGpu];[surface->_presenter finishAndRelease];
      if(surface.onVerifiedRetirement)surface.onVerifiedRetirement(retired,generation);
    }
  };
  if(![self activateVerifiedPackage:package launchData:launch error:error])return nil;
  return self;
}
- (BOOL)activateVerifiedPackage:(MiniVerifiedPackage *)package launchData:(NSData *)launch error:(NSError **)error {
  if(!NSThread.isMainThread || !_container || _backgrounded){if(error)*error=[NSError errorWithDomain:@"MiniSurface" code:1 userInfo:@{NSLocalizedDescriptionKey:@"Signed activation requires a foreground main-thread container"}];return NO;}
  // Fence prior submissions before a successful activation may evict a guest.
  [self finishGpu];[_presenter finishAndRelease];
  if(![_container activatePackage:package launchData:launch error:error])return NO;
  MiniVerifiedPackage *bound=[_container packageForIdentity:_container.activeIdentity generation:_container.activeGeneration];
  _logicalWidth=bound.config.width;_logicalHeight=bound.config.height;
  [_contacts removeAllObjects];_frameNumber=0;[_presenter invalidatePresentation];return YES;
}
- (BOOL)postVerifiedEvent:(NSString *)line identity:(NSString *)identity generation:(uint64_t)generation error:(NSError **)error {
  return _container && [_container postCompletion:[line dataUsingEncoding:NSUTF8StringEncoding] identity:identity generation:generation error:error];
}
- (void)dealloc {
  [[NSNotificationCenter defaultCenter] removeObserver:self];[_displayLink invalidate];[_frameTimer invalidate];
  [self shutdown];
}
- (void)shutdown {
  [self stop];
  if(_container){[self finishGpu];[_presenter finishAndRelease];[_container shutdown];_container=nil;[_contacts removeAllObjects];return;}
  if(!_handle)return;
  if(mp_resume(_handle)==0 && mp_lifecycle(_handle,MP_UNLOAD)==0 && mp_frame(_handle,NULL,0)==0){
    uint8_t *records=_serviceBuffer.mutableBytes;ptrdiff_t count=mp_svc_take(_handle,records,_serviceBuffer.length);
    if(count>0 && self.onCleanupEffect){
      NSString *batch=[[NSString alloc] initWithBytes:records length:(NSUInteger)count encoding:NSUTF8StringEncoding];
      for(NSString *line in [batch componentsSeparatedByString:@"\n"])if(line.length)self.onCleanupEffect(line);
    }
  }
  [self finishGpu];[_presenter finishAndRelease];
  if(mp_destroy(_handle)==0)_handle=NULL;
  [_contacts removeAllObjects];
}
- (NSString *)verifiedActiveIdentity {return _container.activeIdentity;}
- (uint64_t)verifiedActiveGeneration {return _container.activeGeneration;}
- (void)fail:(NSString *)message { _lastError=message;if(self.onError)self.onError(message); }
- (uint32_t)presentedHash { return _gpuHash; }
- (void)captureError { const char *message=_container?mp_pool_last_error(_container.pool):mp_last_error(_handle);[self fail:message ? @(message):@"Shared engine failed"]; }
- (BOOL)setServiceNamespaces:(NSArray<NSString *> *)names { return (_handle || _container) && [names isEqualToArray:@[@"mini"]]; }
- (BOOL)loadPak:(NSData *)pak {
  if(!_handle || !pak.length || pak.length>64*1024*1024)return NO;
  _pak=[pak copy];return YES;
}
- (BOOL)evalBundle:(NSString *)source label:(NSString *)label {
  if(_booted)_recordingStopped=YES;
  (void)label;NSData *js=[source dataUsingEncoding:NSUTF8StringEncoding];
  if(!_handle || !_pak || !js.length)return NO;
  int32_t status=mp_boot(_handle,js.bytes,js.length,_pak.bytes,_pak.length);_pak=nil;
  const char *launch="{\"source\":\"development\",\"query\":{}}";
  if(!status)status=mp_launch(_handle,(const uint8_t*)launch,strlen(launch));
  if(!status)status=mp_lifecycle(_handle,MP_SHOW);
  if(status){_recordingStopped=YES;[self captureError];return NO;}_booted=YES;return YES;
}
- (BOOL)beginRecordingPackageHash:(NSString *)hash density:(uint32_t)density {
  if(!NSThread.isMainThread || _container || !_handle || _booted || _frameNumber || _running || _recordingHeader || density<1 || density>4)return NO;
  NSRegularExpression *pattern=[NSRegularExpression regularExpressionWithPattern:@"^[a-f0-9]{64}$" options:0 error:nil];
  if(![hash isKindOfClass:NSString.class] || [pattern numberOfMatchesInString:hash options:0 range:NSMakeRange(0,hash.length)]!=1)return NO;
  _recordingHeader=@{@"format":@1,@"packageSha256":hash,@"target":@"pjm-ios",@"launchData":@"{\"source\":\"development\",\"query\":{}}",@"window":@{@"width":@(_logicalWidth),@"height":@(_logicalHeight),@"density":@(density)}};
  _recordedSteps=[NSMutableArray new];_recordingBytes=512;_recordingFrames=0;_recordingStopped=NO;return YES;
}
- (void)recordStep:(NSDictionary *)step {
  if(!_recordedSteps || _recordingStopped)return;
  NSData *encoded=[NSJSONSerialization dataWithJSONObject:step options:0 error:nil];
  if(!encoded || _recordedSteps.count>=36000 || encoded.length+1>8*1024*1024-_recordingBytes){_recordingStopped=YES;return;}
  [_recordedSteps addObject:[step copy]];_recordingBytes+=encoded.length+1;
  if([step[@"kind"] isEqual:@"frame"])_recordingFrames++;
}
- (void)recordInput:(const MpInput *)input {
  if(!_recordedSteps || _recordingStopped)return;
  NSMutableArray *contacts=[NSMutableArray new],*hits=[NSMutableArray new],*cancelled=[NSMutableArray new];
  for(uint32_t i=0;i<input->count;i++){[contacts addObject:@(input->contacts[i])];[hits addObject:@(input->hits[i])];}
  for(uint32_t i=0;i<input->cancelled_count;i++)[cancelled addObject:@(input->cancelled[i])];
  [self recordStep:@{@"kind":@"frame",@"contacts":[contacts copy],@"hits":[hits copy],@"cancelled":[cancelled copy]}];
}
- (NSData *)finishRecording {
  if(!NSThread.isMainThread || !_recordingFrames)return nil;
  _recordingStopped=YES;NSMutableDictionary *tape=[_recordingHeader mutableCopy];tape[@"steps"]=[_recordedSteps copy];
  NSData *bytes=[NSJSONSerialization dataWithJSONObject:tape options:0 error:nil];_recordedSteps=nil;_recordingHeader=nil;
  return bytes.length<=8*1024*1024?bytes:nil;
}
- (NSData *)debugTree {
  if(!NSThread.isMainThread || !_handle || _container || !_frameNumber || !_running)return nil;
  NSMutableData *buffer=[NSMutableData dataWithLength:4*1024*1024];
  ptrdiff_t length=mp_debug_tree(_handle,buffer.mutableBytes,buffer.length);
  if(length<=0 || (NSUInteger)length>buffer.length)return nil;
  buffer.length=(NSUInteger)length;
  _inspectionTree=[NSJSONSerialization JSONObjectWithData:buffer options:0 error:nil];_inspectionFrame=_frameNumber;
  [self highlightInspectionNode:0 frame:0];return buffer;
}
- (void)highlightInspectionNode:(int32_t)nodeId frame:(uint64_t)frame {
  if(!NSThread.isMainThread)return;
  [_inspectionHighlight removeFromSuperlayer];_inspectionHighlight=nil;_highlightedInspectionNode=0;
  if(!nodeId || _container || !_running || _backgrounded || frame!=_inspectionFrame || !_inspectionTree)return;
  NSArray *nodes=_inspectionTree[@"nodes"];if(![nodes isKindOfClass:NSArray.class])return;
  for(NSDictionary *node in nodes){
    if([node[@"id"] intValue]!=nodeId)continue;
    NSArray *layout=node[@"bounds"];if(![layout isKindOfClass:NSArray.class] || layout.count!=4)return;
    CGFloat values[4];for(NSUInteger i=0;i<4;i++){if(![layout[i] isKindOfClass:NSNumber.class])return;values[i]=[layout[i] doubleValue];if(!isfinite(values[i]))return;}
    if(values[2]<=0 || values[3]<=0 || !isfinite(values[0]+values[2]) || !isfinite(values[1]+values[3]))return;
    CGRect logical=CGRectIntersection(CGRectMake(values[0],values[1],values[2],values[3]),CGRectMake(0,0,_logicalWidth,_logicalHeight));if(CGRectIsEmpty(logical))return;
    CGRect fitted=[self fittedContentRect];if(CGRectIsEmpty(fitted))return;
    CGFloat scale=fitted.size.width/_logicalWidth;
    CGRect rect=CGRectMake(fitted.origin.x+logical.origin.x*scale,fitted.origin.y+logical.origin.y*scale,logical.size.width*scale,logical.size.height*scale);
    _inspectionHighlight=[CAShapeLayer layer];_inspectionHighlight.name=@"pjm-inspection-highlight";_inspectionHighlight.frame=self.bounds;
    _inspectionHighlight.strokeColor=UIColor.systemCyanColor.CGColor;_inspectionHighlight.fillColor=[UIColor.systemCyanColor colorWithAlphaComponent:0.15].CGColor;_inspectionHighlight.lineWidth=2;
    CGPathRef path=CGPathCreateWithRect(CGRectInset(rect,1,1),NULL);_inspectionHighlight.path=path;CGPathRelease(path);[self.layer addSublayer:_inspectionHighlight];_highlightedInspectionNode=nodeId;return;
  }
}
- (int32_t)highlightedInspectionNode {return _inspectionHighlight.superlayer?_highlightedInspectionNode:0;}
- (void)postEvent:(NSString *)line {
  if(_container){[self fail:@"Signed services require their originating identity and generation"];return;}
  NSData *data=[line dataUsingEncoding:NSUTF8StringEncoding];
  if(_handle){if(mp_svc_post(_handle,data.bytes,data.length)!=0)[self captureError];else [self recordStep:@{@"kind":@"completion",@"record":line}];}
}
- (void)setTickRate:(uint32_t)rate {
  if(rate!=0 && rate!=60){[self fail:@"Shared engine currently requires 60 Hz"];return;}_tickRate=rate;
}
- (void)start {
  if (_running || (_handle == NULL && !_container)) {
    return;
  }
  _running = YES;
  // The realm's rate was declared through setTickRate before the bundle
  // evaluated; the display link is pinned to the same cadence here.
  uint32_t rate = _tickRate > 0 ? _tickRate : kPocketSurfaceDefaultTickRate;
  _displayLink = [CADisplayLink displayLinkWithTarget:self selector:@selector(handleDisplayTick:)];
  if (@available(iOS 15.0, *)) {
    // The core advances in exact 1/rate s steps; pin the link to match.
    _displayLink.preferredFrameRateRange = CAFrameRateRangeMake(rate, rate, rate);
  }
  [_displayLink addToRunLoop:[NSRunLoop mainRunLoop] forMode:NSRunLoopCommonModes];
}

- (void)startWithFixedFrameTimer {
  if (_running || (_handle == NULL && !_container)) {
    return;
  }
  _running = YES;
  _frameTimer = [NSTimer timerWithTimeInterval:(1.0 / 60.0)
                                        target:self
                                      selector:@selector(handleFixedTimerTick:)
                                      userInfo:nil
                                       repeats:YES];
  [[NSRunLoop mainRunLoop] addTimer:_frameTimer forMode:NSRunLoopCommonModes];
}

- (void)stop {
  [self highlightInspectionNode:0 frame:0];_inspectionTree=nil;_inspectionFrame=0;
  _running = NO;
  [_displayLink invalidate];
  _displayLink = nil;
  [_frameTimer invalidate];
  _frameTimer = nil;
}

- (void)suspendForHost {_hostHidden=YES;[self appDidEnterBackground];}
- (void)resumeForHost {_hostHidden=NO;if(UIApplication.sharedApplication.applicationState!=UIApplicationStateBackground)[self appWillEnterForeground];}
- (void)appWillEnterForeground {
  if(_hostHidden || !_backgrounded)return;
  if(_container){NSError *error=nil;if(![_container resume:&error]){[self fail:error.localizedDescription];[self stop];return;}}
  if(_handle && mp_resume(_handle)!=0){[self captureError];[self stop];return;}
  if(_handle && mp_lifecycle(_handle,MP_SHOW)!=0){[self captureError];[self stop];return;}
  if(_handle)[self recordStep:@{@"kind":@"lifecycle",@"event":@"show"}];
  _backgrounded=NO;
  if(_pendingMemoryWarning){_pendingMemoryWarning=NO;[self appMemoryWarning];}
  [_presenter invalidatePresentation];
  if (_running) {
    _displayLink.paused = NO;
    _frameTimer.fireDate = [NSDate date];
  }
}

- (void)handleFixedTimerTick:(NSTimer *)timer {
  (void)timer;
  [self handleDisplayTick:nil];
}

- (CGRect)fittedContentRect {
  CGSize bounds = self.bounds.size;
  if (bounds.width <= 0 || bounds.height <= 0 || _logicalWidth == 0 || _logicalHeight == 0) {
    return CGRectZero;
  }
  CGFloat scale = MIN(bounds.width / _logicalWidth, bounds.height / _logicalHeight);
  CGFloat width = _logicalWidth * scale;
  CGFloat height = _logicalHeight * scale;
  return CGRectMake((bounds.width - width) / 2, (bounds.height - height) / 2, width, height);
}

- (BOOL)logicalPointForPoint:(CGPoint)point outX:(uint32_t *)outX outY:(uint32_t *)outY {
  CGRect content = [self fittedContentRect];
  if (CGRectIsEmpty(content)) {
    return NO;
  }
  CGFloat x = (point.x - content.origin.x) / content.size.width * _logicalWidth;
  CGFloat y = (point.y - content.origin.y) / content.size.height * _logicalHeight;
  if (x < 0 || y < 0 || x >= _logicalWidth || y >= _logicalHeight) {
    return NO;
  }
  // Preserve legacy words for compact surfaces. A viewport whose axis exceeds
  // 512 logical pixels uses the append-only 10-bit wire form.
  BOOL wide = _logicalWidth > 512 || _logicalHeight > 512;
  CGFloat maxCoordinate = wide ? 1023.0 : 511.0;
  *outX = (uint32_t)MIN(x, maxCoordinate);
  *outY = (uint32_t)MIN(y, maxCoordinate);
  return YES;
}


- (MiniTouch *)contactFor:(UITouch *)touch {
  for(MiniTouch *contact in _contacts)if(contact.live && contact.touch==touch)return contact;return nil;
}
- (void)touchesBegan:(NSSet<UITouch *> *)touches withEvent:(UIEvent *)event {
  (void)event;
  for(UITouch *touch in touches){
    if(_contacts.count>=8 || [self contactFor:touch])continue;
    CGPoint point=[touch locationInView:self];uint32_t x,y;
    if(![self logicalPointForPoint:point outX:&x outY:&y])continue;
    MiniTouch *contact=[MiniTouch new];contact.touch=touch;contact.point=point;contact.initialPoint=point;contact.live=YES;
    BOOL reserved;
    do{contact.identifier=_nextId++;reserved=NO;for(MiniTouch *other in _contacts)if(other.identifier==contact.identifier)reserved=YES;}while(reserved);
    int32_t hit=0;if((_container?mp_pool_hit_test(_container.pool,x,y,&hit):mp_hit_test(_handle,x,y,&hit))!=0)continue;contact.hit=hit;
    [_contacts addObject:contact];
  }
}
- (void)touchesMoved:(NSSet<UITouch *> *)touches withEvent:(UIEvent *)event {
  (void)event;for(UITouch *touch in touches){MiniTouch *contact=[self contactFor:touch];contact.point=[touch locationInView:self];}
}
- (void)touchesEnded:(NSSet<UITouch *> *)touches withEvent:(UIEvent *)event {
  (void)event;for(UITouch *touch in touches){MiniTouch *contact=[self contactFor:touch];contact.point=[touch locationInView:self];contact.live=NO;}
}
- (void)touchesCancelled:(NSSet<UITouch *> *)touches withEvent:(UIEvent *)event {
  (void)event;for(UITouch *touch in touches){MiniTouch *contact=[self contactFor:touch];contact.live=NO;contact.cancelled=YES;}
}
- (void)appDidEnterBackground {
  [self highlightInspectionNode:0 frame:0];_inspectionTree=nil;_inspectionFrame=0;
  if(_backgrounded)return;
  _backgrounded=YES;[self finishGpu];
  MpInput cancelled={0};cancelled.size=sizeof(cancelled);
  for(MiniTouch *contact in _contacts)if(contact.sampling.reported)cancelled.cancelled[cancelled.cancelled_count++]=contact.identifier;
  [_contacts removeAllObjects];
  int status=0;
  if(_container){NSError *error=nil;if(![_container background:&error]){[self fail:error.localizedDescription];[self stop];}}
  if(_handle && cancelled.cancelled_count){status=mp_frame_input(_handle,&cancelled);if(!status)[self recordInput:&cancelled];}
  if(_handle && !status){status=mp_lifecycle(_handle,MP_HIDE);if(!status)[self recordStep:@{@"kind":@"lifecycle",@"event":@"hide"}];}
  if(_handle && !status)status=mp_suspend(_handle);
  if(status){[self captureError];[self stop];}
  _displayLink.paused=YES;_frameTimer.fireDate=[NSDate distantFuture];
}
- (void)appMemoryWarning {
  if(_backgrounded){_pendingMemoryWarning=YES;return;}
  if(_container && _running){NSError *error=nil;if(![_container memoryWarning:&error]){[self fail:error.localizedDescription];[self stop];}}
  if(_handle && _running){if(mp_lifecycle(_handle,MP_MEMORY_WARNING)!=0){[self captureError];[self stop];}else [self recordStep:@{@"kind":@"lifecycle",@"event":@"memoryWarning"}];}
}
- (void)handleDisplayTick:(CADisplayLink *)link {
  (void)link;if(!_handle && !_container)return;
  if(_container && self.onVerifiedFrameStart)self.onVerifiedFrameStart();
  if(!_handle && !_container)return;
  [self collectGpu];if(_lastError||_gpuPending.count>=3)return;
  CAMetalLayer *layer=(CAMetalLayer *)_presenter.layer;
  _gpuDrawable=[layer nextDrawable];if(!_gpuDrawable)return;
  _gpuBuffer=[_gpuQueue commandBuffer];_gpuError=nil;if(!_gpuBuffer){_gpuDrawable=nil;[self fail:@"Metal command buffer unavailable"];[self stop];return;}
  MpInput input={0};input.size=sizeof(input);
  for(MiniTouch *contact in [_contacts copy]){
    if(contact.cancelled){if(contact.sampling.reported)input.cancelled[input.cancelled_count++]=contact.identifier;[_contacts removeObject:contact];continue;}
    if(mini_touch_drained(contact.sampling,contact.live)){[_contacts removeObject:contact];continue;}
    CGRect rect=[self fittedContentRect];if(CGRectIsEmpty(rect))continue;
    CGPoint point=mini_touch_initial(contact.sampling)?contact.initialPoint:contact.point;
    uint32_t x=(uint32_t)MAX(0,MIN(1023,(point.x-rect.origin.x)/rect.size.width*_logicalWidth));
    uint32_t y=(uint32_t)MAX(0,MIN(1023,(point.y-rect.origin.y)/rect.size.height*_logicalHeight));
    uint32_t word=x>511 || y>511 ? 0x80000000u|((uint32_t)contact.identifier<<20)|(y<<10)|x : ((uint32_t)contact.identifier<<18)|(y<<9)|x;
    input.contacts[input.count]=word;input.hits[input.count++]=contact.hit;
    contact.sampling=mini_touch_sampled(contact.sampling,contact.live);
  }
  NSArray<NSData *> *effects=nil;MiniVerifiedPackage *origin=nil;uint64_t generation=0;
  if(_container){
    generation=_container.activeGeneration;origin=[_container packageForIdentity:_container.activeIdentity generation:generation];
    NSError *error=nil;if(![_container advanceGpuInput:&input maxSide:16384 callback:deliverGpu context:(__bridge void *)self effects:&effects error:&error]){[self fail:_gpuError.localizedDescription?:error.localizedDescription];[self stop];_gpuBuffer=nil;_gpuDrawable=nil;return;}
  }else {
    if(mp_frame_input(_handle,&input)!=0){[self captureError];[self stop];_gpuBuffer=nil;_gpuDrawable=nil;return;}
    [self recordInput:&input];
    if(mp_gpu_snapshot(_handle,16384,deliverGpu,(__bridge void *)self)!=0){if(_gpuError)[self fail:_gpuError.localizedDescription];else [self captureError];[self stop];_gpuBuffer=nil;_gpuDrawable=nil;return;}
  }
  if(![self submitGpu])return;
  // Drain only after the guest turn is complete; callbacks may enqueue replies.
  if(_container){
    for(NSData *record in effects){NSString *line=[[NSString alloc] initWithData:record encoding:NSUTF8StringEncoding];if(line && self.onVerifiedEffect)self.onVerifiedEffect(origin,generation,line);}
    _frameNumber++;if(self.onFrame)self.onFrame(_frameNumber,input.count);return;
  }
  uint8_t *records=_serviceBuffer.mutableBytes;ptrdiff_t count=mp_svc_take(_handle,records,_serviceBuffer.length);
  if(count<0){[self captureError];[self stop];return;}
  if(count && self.onEffect){NSString *batch=[[NSString alloc] initWithBytes:records length:(NSUInteger)count encoding:NSUTF8StringEncoding];
    for(NSString *line in [batch componentsSeparatedByString:@"\n"])if(line.length)self.onEffect(line);}
  _frameNumber++;if(self.onFrame)self.onFrame(_frameNumber,input.count);
}
- (int32_t)encodeGpuSnapshot:(const MpGpuSnapshot *)frame {
  CGRect fitted=[self fittedContentRect];CGRect bounds=self.bounds;
  if(bounds.size.width<=0||bounds.size.height<=0)return -1;
  double sx=_gpuDrawable.texture.width/bounds.size.width,sy=_gpuDrawable.texture.height/bounds.size.height;
  MTLViewport viewport={fitted.origin.x*sx,fitted.origin.y*sy,fitted.size.width*sx,fitted.size.height*sy,0,1};
  NSError *error=nil;BOOL encoded=[_direct encodeSnapshot:frame target:_gpuDrawable.texture viewport:viewport commandBuffer:_gpuBuffer error:&error];_gpuError=error;return encoded?0:-1;
}
- (BOOL)submitGpu {
  NSMutableDictionary *record=[NSMutableDictionary dictionaryWithObject:_gpuBuffer forKey:@"command"];
  if(PJM_TEST_MODE){
    NSUInteger width=_gpuDrawable.texture.width,height=_gpuDrawable.texture.height,row=(width*4+255)&~255;
    if(!height||row>64*1024*1024/height){[self fail:@"Metal capture exceeds budget"];[self stop];_gpuBuffer=nil;_gpuDrawable=nil;return NO;}
    id<MTLBuffer> readback=[_gpuQueue.device newBufferWithLength:row*height options:MTLResourceStorageModeShared];
    id<MTLBlitCommandEncoder> blit=[_gpuBuffer blitCommandEncoder];
    if(!readback||!blit){[self fail:@"Metal capture allocation failed"];[self stop];_gpuBuffer=nil;_gpuDrawable=nil;return NO;}
    [blit copyFromTexture:_gpuDrawable.texture sourceSlice:0 sourceLevel:0 sourceOrigin:MTLOriginMake(0,0,0) sourceSize:MTLSizeMake(width,height,1) toBuffer:readback destinationOffset:0 destinationBytesPerRow:row destinationBytesPerImage:row*height];[blit endEncoding];
    record[@"readback"]=readback;record[@"width"]=@(width);record[@"height"]=@(height);record[@"row"]=@(row);
  }
  [_gpuPending addObject:record];[_gpuBuffer presentDrawable:_gpuDrawable];[_gpuBuffer commit];_gpuBuffer=nil;_gpuDrawable=nil;return YES;
}
- (void)collectGpu {
  for(NSDictionary *record in [_gpuPending copy]){
    id<MTLCommandBuffer> command=record[@"command"];
    if(command.status!=MTLCommandBufferStatusCompleted&&command.status!=MTLCommandBufferStatusError)continue;
    if(command.status==MTLCommandBufferStatusError){[self fail:command.error.localizedDescription?:@"Metal submission failed"];[self stop];}
    else if(record[@"readback"]){
      id<MTLBuffer> readback=record[@"readback"];const uint8_t *bytes=readback.contents;
      NSUInteger width=[record[@"width"] unsignedIntegerValue],height=[record[@"height"] unsignedIntegerValue],row=[record[@"row"] unsignedIntegerValue];
      uint32_t hash=2166136261u;for(NSUInteger y=0;y<height;y++)for(NSUInteger x=0;x<width*4;x++)hash=(hash^bytes[y*row+x])*16777619u;_gpuHash=hash;
    }
    [_gpuPending removeObject:record];
  }
}
- (void)finishGpu {
  for(NSDictionary *record in _gpuPending){id<MTLCommandBuffer> command=record[@"command"];[command waitUntilCompleted];}
  [self collectGpu];[_direct reset];_gpuBuffer=nil;_gpuDrawable=nil;
}
@end
