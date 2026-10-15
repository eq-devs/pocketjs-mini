#import <UIKit/UIKit.h>
#import <objc/runtime.h>
#include <math.h>
#import "InstalledController.h"
#import "VerifiedMedia.h"
#import "ResourcePeers.h"

static void Require(BOOL ok,NSString *message){if(!ok)@throw [NSException exceptionWithName:@"MixedProcessFailure" reason:message userInfo:nil];}
@interface MiniInstalledController (MixedTest)
- (NSDictionary *)startHTTP:(id)arguments identifier:(NSNumber *)identifier package:(MiniVerifiedPackage *)package generation:(uint64_t)generation;
- (NSDictionary *)resourceService:(NSString *)kind arguments:(id)arguments identity:(NSString *)identity generation:(uint64_t)generation;
- (void)drainHTTP;
@end
@interface MiniVerifiedMedia (MixedTest)
- (void)load:(NSItemProvider *)provider work:(id)work;
@end
// Synthetic picker input only. The original production provider callback reads
// the file and performs bounded ImageIO decoding and JPEG normalization.
@interface MixedProvider : NSItemProvider
@property NSURL *url;
@property NSProgress *progress;
@property dispatch_semaphore_t gate;
@property(atomic) BOOL ready;
@property(atomic) BOOL timedOut;
@end
@implementation MixedProvider
- (instancetype)init {if((self=[super init])){_gate=dispatch_semaphore_create(0);_progress=[NSProgress progressWithTotalUnitCount:1];}return self;}
- (BOOL)hasItemConformingToTypeIdentifier:(NSString *)type {return [type isEqual:@"public.image"];}
- (NSProgress *)loadFileRepresentationForTypeIdentifier:(NSString *)type completionHandler:(void (^)(NSURL *,NSError *))completion {
    Require([type isEqual:@"public.image"],@"Unexpected provider type");
    dispatch_async(dispatch_get_global_queue(QOS_CLASS_USER_INITIATED,0),^{@autoreleasepool{
        self.ready=YES;
        self.timedOut=dispatch_semaphore_wait(self.gate,dispatch_time(DISPATCH_TIME_NOW,30*NSEC_PER_SEC))!=0;
        completion(self.url,self.timedOut?[NSError errorWithDomain:@"MixedProviderTimeout" code:1 userInfo:nil]:nil);
    }});return self.progress;
}
@end
static MixedProvider *ActiveProvider;
@interface MixedMedia : MiniVerifiedMedia
@end
@implementation MixedMedia
// Offscreen test controllers have no picker window. Admission, permission,
// process-wide media exclusivity, provider load and completion stay original.
- (BOOL)foreground {return UIApplication.sharedApplication.applicationState==UIApplicationStateActive;}
- (void)launch:(id)work {Require(ActiveProvider!=nil,@"Synthetic picker provider missing");[self load:ActiveProvider work:work];}
@end
@interface MixedController : MiniInstalledController
@end
@implementation MixedController
- (Class)mediaServiceClass {return MixedMedia.class;}
@end
static BOOL GateEnabled;
static NSUInteger GateHeaders;
static NSMutableArray *GateDispositions;
static NSString *GateFailure;
static void InstallResponseObserver(void){
    Class type=NSClassFromString(@"MiniHTTPTask");SEL selector=@selector(URLSession:dataTask:didReceiveResponse:completionHandler:);Method method=class_getInstanceMethod(type,selector);Require(method!=NULL,@"Shipping HTTP delegate missing");
    void (*original)(id,SEL,NSURLSession *,NSURLSessionDataTask *,NSURLResponse *,void (^)(NSURLSessionResponseDisposition))=(void *)method_getImplementation(method);
    method_setImplementation(method,imp_implementationWithBlock(^(id work,NSURLSession *session,NSURLSessionDataTask *task,NSURLResponse *response,void (^completion)(NSURLSessionResponseDisposition)){
        if(!GateEnabled){original(work,selector,session,task,response,completion);return;}
        if(!NSThread.isMainThread || ![response isKindOfClass:NSHTTPURLResponse.class] || ((NSHTTPURLResponse *)response).statusCode!=200)GateFailure=@"Real mixed HTTPS 200 headers missing";
        original(work,selector,session,task,response,^(NSURLSessionResponseDisposition disposition){if(disposition!=NSURLSessionResponseAllow)GateFailure=@"Original delegate rejected mixed response";[GateDispositions addObject:[completion copy]];GateHeaders++;});
    }));
}
static NSDictionary *Service(MiniInstalledController *owner,NSString *kind,NSString *identity,uint64_t generation,NSString *handle,NSUInteger offset){
    return [owner resourceService:kind arguments:[kind isEqual:@"resource.read.v1"]?@{@"handle":handle,@"offset":@(offset),@"count":@1536}:@{@"handle":handle} identity:identity generation:generation];
}
static void Denied(MiniInstalledController *owner,NSString *identity,uint64_t generation,NSString *handle){for(NSString *kind in @[@"resource.read.v1",@"resource.release.v1"])Require([Service(owner,kind,identity,generation,handle,0)[@"error"][@"code"] isEqual:@"DENIED"],@"Mixed foreign/retired handle accepted");}
@interface MiniScene : UIResponder <UIWindowSceneDelegate>
@property(nonatomic,strong) UIWindow *window;
@property UILabel *proof;
@property MiniPackageStore *store;
@property NSMutableArray<MiniInstalledController *> *owners;
@property NSMutableArray<NSDictionary *> *records;
@property NSArray<NSURLSessionDataTask *> *tasks;
@property NSHashTable *httpSlots;
@property(nonatomic,weak) id cancelledMediaSlot;
@property(nonatomic,weak) id phaseMediaSlot;
@property MixedProvider *provider;
@property MixedProvider *cancelledProvider;
@property NSURL *imageURL;
@property NSTimer *timer;
@property double deadline;
@property double traceStart;
@property NSMutableArray *trace;
@property NSString *lastTraceState;
@property BOOL transitioning;
@property NSUInteger phase,state,httpResponses,jpegResponses,guestReplies,capDenials,retirements,stalePostDenials,mediaBusyDenials;
@end
@implementation MiniScene
- (void)traceSnapshot:(NSString *)event {
    NSMutableArray *pending=[NSMutableArray new];for(NSUInteger index=0;index<MIN((NSUInteger)4,self.owners.count);index++)[pending addObject:@([[self.owners[index] valueForKey:@"requests"] count])];
    NSDictionary *state=@{@"phase":@(self.phase),@"state":@(self.state),@"headers":@(GateHeaders),@"httpSlots":@(self.httpSlots.allObjects.count),@"oldMedia":@(self.cancelledMediaSlot!=nil),@"phaseMedia":@(self.phaseMediaSlot!=nil),@"providerReady":@(self.provider.ready),@"providerTimedOut":@(self.provider.timedOut),@"oldProviderTimedOut":@(self.cancelledProvider.timedOut),@"pendingHTTP":pending,@"httpReplies":@(self.httpResponses),@"jpegReplies":@(self.jpegResponses)};
    NSData *encoded=[NSJSONSerialization dataWithJSONObject:state options:NSJSONWritingSortedKeys error:nil];NSString *signature=[[NSString alloc] initWithData:encoded encoding:NSUTF8StringEncoding];if(!event && [signature isEqual:self.lastTraceState])return;self.lastTraceState=signature;
    if(self.trace.count>=128)return;
    NSMutableDictionary *snapshot=[state mutableCopy];snapshot[@"elapsedMs"]=@(llround((NSProcessInfo.processInfo.systemUptime-self.traceStart)*1000));snapshot[@"event"]=event?:@"state-change";[self.trace addObject:snapshot];
}
- (void)saveTrace:(NSString *)message {
    [self traceSnapshot:[message hasPrefix:@"native-mixed-process PASS"]?@"PASS":@"FAIL"];
    NSString *path=[NSSearchPathForDirectoriesInDomains(NSCachesDirectory,NSUserDomainMask,YES).firstObject stringByAppendingPathComponent:@"mixed-process-trace.json"];
    NSDictionary *report=@{@"outcome":message,@"runtime":UIDevice.currentDevice.systemVersion,@"events":self.trace?:@[]};NSData *data=[NSJSONSerialization dataWithJSONObject:report options:NSJSONWritingPrettyPrinted|NSJSONWritingSortedKeys error:nil];[data writeToFile:path options:NSDataWritingAtomic error:nil];
}
- (void)finish:(NSString *)message {
    [self saveTrace:message];[self.timer invalidate];self.timer=nil;GateEnabled=NO;
    for(void (^completion)(NSURLSessionResponseDisposition) in [GateDispositions copy])completion(NSURLSessionResponseCancel);[GateDispositions removeAllObjects];
    if(self.provider)dispatch_semaphore_signal(self.provider.gate);if(self.cancelledProvider)dispatch_semaphore_signal(self.cancelledProvider.gate);ActiveProvider=nil;
    for(MiniInstalledController *owner in self.owners)[owner shutdown];
    if(self.imageURL)[NSFileManager.defaultManager removeItemAtURL:self.imageURL error:nil];
    self.proof.text=message;self.proof.accessibilityValue=message;
}
- (void)fail:(NSException *)failure {
    NSString *detail=[NSString stringWithFormat:@"%@ [phase=%lu state=%lu headers=%lu httpSlots=%lu oldMedia=%d httpReplies=%lu jpegReplies=%lu]",failure.reason?:failure.name,(unsigned long)self.phase,(unsigned long)self.state,(unsigned long)GateHeaders,(unsigned long)self.httpSlots.allObjects.count,self.cancelledMediaSlot!=nil,(unsigned long)self.httpResponses,(unsigned long)self.jpegResponses];
    [self finish:[@"native-mixed-process FAIL " stringByAppendingString:detail]];NSLog(@"PJM_MIXED_PROCESS_FAILURE %@",detail);
}
- (void)probe {
    MiniInstalledController *owner=self.owners[4];NSError *error=nil;MiniVerifiedPackage *package=[self.store coldStart:owner.surface.verifiedActiveIdentity error:&error];Require(package!=nil,error.localizedDescription?:@"Mixed probe authentication failed");
    NSDictionary *result=[owner startHTTP:@{@"url":@"https://example.com/",@"responseMode":@"resource"} identifier:@9999 package:package generation:owner.surface.verifiedActiveGeneration];
    Require([result[@"error"][@"code"] isEqual:@"BUSY"] && [result[@"error"][@"message"] isEqual:@"Resource capacity exceeded"],[@"Mixed process cap not enforced: " stringByAppendingString:result.description?:@"admitted"]);self.capDenials++;
}
- (MiniVerifiedPackage *)packageFor:(MiniInstalledController *)owner {NSError *error=nil;MiniVerifiedPackage *package=[self.store coldStart:owner.surface.verifiedActiveIdentity error:&error];Require(package!=nil,error.localizedDescription?:@"Mixed authentication failed");return package;}
- (void)startHTTP {
    self.records=[NSMutableArray new];self.httpSlots=[NSHashTable weakObjectsHashTable];NSMutableArray *tasks=[NSMutableArray new];GateDispositions=[NSMutableArray new];GateHeaders=0;GateEnabled=YES;
    for(NSUInteger index=0;index<4;index++){
        MiniInstalledController *owner=self.owners[index];MiniVerifiedPackage *package=[self packageFor:owner];NSString *identity=owner.surface.verifiedActiveIdentity;uint64_t generation=owner.surface.verifiedActiveGeneration;
        for(NSUInteger slot=0;slot<(index?4:3);slot++){
            NSNumber *identifier=@(1000+self.phase*100+index*4+slot);NSString *key=[NSString stringWithFormat:@"%llu:%@",(unsigned long long)generation,identifier];
            Require([owner startHTTP:@{@"url":@"https://example.com/",@"responseMode":@"resource"} identifier:identifier package:package generation:generation]==nil,@"Mixed HTTP admission failed");id work=[owner valueForKey:@"requests"][key];NSURLSessionDataTask *task=[work valueForKey:@"task"];Require(task && task.state==NSURLSessionTaskStateRunning,@"Mixed URLSession task not running");[tasks addObject:task];id resource=[work valueForKey:@"resource"];Require(resource!=nil,@"Mixed HTTP resource absent");[self.httpSlots addObject:resource];
            [self.records addObject:@{@"owner":owner,@"identity":identity,@"generation":@(generation),@"identifier":identifier,@"key":key,@"handle":[resource valueForKey:@"handle"]}];
        }
    }
    Require(tasks.count==15 && self.httpSlots.allObjects.count==15,@"Mixed HTTP task coverage changed");self.tasks=tasks;
}
- (NSDictionary *)mediaArguments {return @{@"source":@"library",@"maxDimension":@64,@"quality":@80};}
- (void)startMedia {
    self.provider=[MixedProvider new];self.provider.url=self.imageURL;ActiveProvider=self.provider;
    MiniInstalledController *owner=self.owners[0];MiniVerifiedMedia *media=[owner valueForKey:@"media"];MiniVerifiedPackage *package=[self packageFor:owner];NSNumber *identifier=@(1900+self.phase);uint64_t generation=owner.surface.verifiedActiveGeneration;
    NSDictionary *admission=[media start:[self mediaArguments] identifier:identifier package:package generation:generation];Require(admission==nil,[NSString stringWithFormat:@"Mixed media admission failed phase=%lu appState=%ld: %@",(unsigned long)self.phase,(long)UIApplication.sharedApplication.applicationState,admission]);id work=[media valueForKey:@"work"],resource=[work valueForKey:@"slot"];Require(work && resource && ![[work valueForKey:@"finished"] boolValue],@"Mixed media producer missing");self.phaseMediaSlot=resource;
    [self.records addObject:@{@"owner":owner,@"identity":owner.surface.verifiedActiveIdentity,@"generation":@(generation),@"identifier":identifier,@"media":@YES,@"handle":[resource valueForKey:@"handle"]}];Require(self.records.count==16,@"Mixed total resource coverage changed");
}
- (void)startPhase {self.state=0;[self startHTTP];[self startMedia];self.transitioning=NO;}
- (void)releaseHTTP:(NSURLSessionResponseDisposition)disposition {GateEnabled=NO;for(void (^completion)(NSURLSessionResponseDisposition) in [GateDispositions copy])completion(disposition);[GateDispositions removeAllObjects];self.tasks=nil;}
- (void)retireMixed {
    self.cancelledProvider=self.provider;
    MiniVerifiedMedia *media=[self.owners[0] valueForKey:@"media"];id mediaWork=[media valueForKey:@"work"];Require(mediaWork && ![[mediaWork valueForKey:@"finished"] boolValue] && [mediaWork valueForKey:@"reply"]==nil,@"Media retirement occurred after completion");self.cancelledMediaSlot=[mediaWork valueForKey:@"slot"];
    for(NSUInteger index=0;index<4;index++){
        MiniInstalledController *owner=self.owners[index];NSDictionary *requests=[owner valueForKey:@"requests"];Require(requests.count==(index?4:3),@"Mixed unfinished HTTP count changed");for(id work in requests.allValues)Require(![[work valueForKey:@"finished"] boolValue] && [work valueForKey:@"reply"]==nil,@"Mixed HTTP already completed");
        NSError *error=nil;NSString *identity=owner.surface.verifiedActiveIdentity;uint64_t before=owner.surface.verifiedActiveGeneration;MiniVerifiedContainer *container=[owner.surface valueForKey:@"container"];
        Require([container closeIdentity:identity error:&error],error.localizedDescription?:@"Mixed native retirement failed");Require([owner openIdentity:identity launchData:[@"{}" dataUsingEncoding:NSUTF8StringEncoding] error:&error],error.localizedDescription?:@"Mixed native reopen failed");Require(owner.surface.verifiedActiveGeneration>before,@"Mixed generation did not advance");self.retirements++;
    }
    for(NSURLSessionDataTask *task in self.tasks)Require(task.state==NSURLSessionTaskStateCanceling || task.state==NSURLSessionTaskStateCompleted,@"Mixed native retirement did not cancel HTTP");Require(self.cancelledProvider.progress.cancelled,@"Native retirement did not cancel real media progress");
    for(NSDictionary *record in self.records){MiniInstalledController *owner=record[@"owner"];uint64_t old=[record[@"generation"] unsignedLongLongValue];Denied(owner,record[@"identity"],old,record[@"handle"]);Denied(owner,record[@"identity"],owner.surface.verifiedActiveGeneration,record[@"handle"]);NSError *error=nil;MiniVerifiedContainer *container=[owner.surface valueForKey:@"container"];Require(![container postCompletion:[@"{\"v\":1,\"id\":1,\"ok\":true,\"data\":null}" dataUsingEncoding:NSUTF8StringEncoding] identity:record[@"identity"] generation:old error:&error] && error!=nil,@"Mixed retired container accepted completion");self.stalePostDenials++;}
    [self releaseHTTP:NSURLSessionResponseCancel];self.state=2;
}
- (void)beginRecoveryWhileMediaHeld {
    Require(self.cancelledMediaSlot!=nil,@"Cancelled provider released token before callback exited");self.phase=2;[self startHTTP];
    MiniInstalledController *owner=self.owners[0];MiniVerifiedMedia *media=[owner valueForKey:@"media"];NSDictionary *busy=[media start:[self mediaArguments] identifier:@1999 package:[self packageFor:owner] generation:owner.surface.verifiedActiveGeneration];Require([busy[@"error"][@"code"] isEqual:@"BUSY"],@"Cancelled provider lost process-wide media permit early");self.mediaBusyDenials++;
    // Fifteen new real HTTP resources plus the still-held old media producer
    // occupy the original process cap without synthetic resource tokens.
    [self probe];dispatch_semaphore_signal(self.cancelledProvider.gate);self.state=3;
}
- (void)captureReplies {
    for(NSUInteger index=0;index<self.records.count;index++){
        NSDictionary *record=self.records[index];if(record[@"reply"])continue;MiniInstalledController *owner=record[@"owner"];id work=record[@"media"]?[[owner valueForKey:@"media"] valueForKey:@"work"]:[owner valueForKey:@"requests"][record[@"key"]];Require(work!=nil,@"Mixed task disappeared before response delivery");NSString *encoded=[work valueForKey:@"reply"];if(!encoded)continue;
        NSDictionary *reply=[NSJSONSerialization JSONObjectWithData:[encoded dataUsingEncoding:NSUTF8StringEncoding] options:0 error:nil];Require([reply[@"ok"] boolValue] && [reply[@"v"] integerValue]==1 && [reply[@"id"] isEqual:record[@"identifier"]] && [[work valueForKey:@"generation"] isEqual:record[@"generation"]] && [((MiniVerifiedPackage *)[work valueForKey:@"package"]).metadata[@"appId"] isEqual:record[@"identity"]],[@"Mixed completion binding failed: " stringByAppendingString:encoded]);
        if(record[@"media"]){Require([reply[@"data"][@"mime"] isEqual:@"image/jpeg"] && [reply[@"data"][@"width"] integerValue]==64 && [reply[@"data"][@"height"] integerValue]==32,@"Mixed JPEG normalization failed");self.jpegResponses++;}else{Require([reply[@"data"][@"status"] integerValue]==200,@"Mixed HTTPS status changed");self.httpResponses++;}
        Require([reply[@"data"][@"resource"][@"handle"] isEqual:record[@"handle"]],@"Mixed resource binding changed");NSMutableDictionary *saved=[record mutableCopy];saved[@"reply"]=reply;self.records[index]=saved;
    }
    for(NSUInteger index=0;index<4;index++){
        MiniInstalledController *owner=self.owners[index];[owner drainHTTP];MiniVerifiedMedia *media=[owner valueForKey:@"media"];
        [media drain:^BOOL(MiniVerifiedPackage *package,uint64_t generation,NSString *line){Require([package.metadata[@"appId"] isEqual:owner.surface.verifiedActiveIdentity] && generation==owner.surface.verifiedActiveGeneration,@"Mixed media delivery crossed owner");return [owner.surface postVerifiedEvent:line identity:package.metadata[@"appId"] generation:generation error:nil];}];
    }
}
- (NSData *)body:(NSDictionary *)record {
    MiniInstalledController *owner=record[@"owner"];uint64_t generation=[record[@"generation"] unsignedLongLongValue];NSString *handle=record[@"handle"];NSUInteger size=[record[@"reply"][@"data"][@"resource"][@"size"] unsignedIntegerValue],offset=0;Require(size>0 && size<=1024*1024,@"Mixed resource size invalid");NSMutableData *body=[NSMutableData new];
    while(offset<size){NSDictionary *reply=Service(owner,@"resource.read.v1",record[@"identity"],generation,handle,offset);Require([reply[@"ok"] boolValue],@"Mixed owned resource unreadable");NSDictionary *data=reply[@"data"];NSData *chunk=[[NSData alloc] initWithBase64EncodedString:data[@"bodyBase64"] options:0];NSUInteger next=[data[@"nextOffset"] unsignedIntegerValue];Require(chunk.length>0 && chunk.length<=1536 && next==offset+chunk.length && next<=size && [data[@"size"] unsignedIntegerValue]==size,@"Mixed bounded chunk changed");[body appendData:chunk];offset=next;}return body;
}
- (void)validateAndRelease {
    NSMutableSet *handles=[NSMutableSet new];
    for(NSDictionary *record in self.records){NSData *body=[self body:record];NSString *handle=record[@"handle"];Require(![handles containsObject:handle],@"Mixed handle collision");[handles addObject:handle];
        if(record[@"media"]){const uint8_t *bytes=body.bytes;Require(body.length>=3 && bytes[0]==255 && bytes[1]==216 && bytes[2]==255,@"Mixed JPEG marker absent");UIImage *image=[UIImage imageWithData:body];Require(image.CGImage && CGImageGetWidth(image.CGImage)==64 && CGImageGetHeight(image.CGImage)==32,@"Mixed JPEG decode failed");uint8_t pixels[64*32*4]={0};CGColorSpaceRef colors=CGColorSpaceCreateDeviceRGB();CGContextRef context=CGBitmapContextCreate(pixels,64,32,8,256,colors,(CGBitmapInfo)kCGImageAlphaNoneSkipLast);CGColorSpaceRelease(colors);Require(context!=NULL,@"Mixed JPEG pixel buffer failed");CGContextDrawImage(context,CGRectMake(0,0,64,32),image.CGImage);CGContextRelease(context);NSUInteger at=(16*64+32)*4;Require(pixels[at]>=240 && pixels[at+1]<=15 && pixels[at+2]<=15,@"Mixed JPEG pixels changed");}
        else Require([[[NSString alloc] initWithData:body encoding:NSUTF8StringEncoding] containsString:@"Example Domain"],@"Mixed HTTPS body changed");
        MiniInstalledController *owner=record[@"owner"];uint64_t generation=[record[@"generation"] unsignedLongLongValue];for(NSUInteger index=0;index<4;index++){MiniInstalledController *other=self.owners[index];if(other==owner)continue;Denied(owner,other.surface.verifiedActiveIdentity,generation,handle);Denied(other,other.surface.verifiedActiveIdentity,other.surface.verifiedActiveGeneration,handle);}Require([body isEqual:[self body:record]],@"Foreign mixed release changed owner bytes");
    }
    for(NSUInteger index=0;index<4;index++){
        MiniInstalledController *owner=self.owners[index];NSMutableDictionary *expected=[NSMutableDictionary new];for(NSDictionary *record in self.records)if(record[@"owner"]==owner)expected[record[@"identifier"]]=record[@"reply"];
        MpInput input={0};input.size=sizeof(input);MpFrame frame={0};MpDamage damage={0};damage.size=sizeof(damage);NSArray<NSData *> *effects=nil;NSError *error=nil;MiniVerifiedContainer *container=[owner.surface valueForKey:@"container"];Require([container advanceInput:&input frame:&frame damage:&damage effects:&effects error:&error],error.localizedDescription?:@"Mixed native guest frame failed");NSMutableSet *seen=[NSMutableSet new];BOOL framed=NO;
        for(NSData *data in effects){NSString *line=[[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding];if([line hasPrefix:@"verified:"])framed=YES;else if([line hasPrefix:@"reply:"]){NSDictionary *reply=[NSJSONSerialization JSONObjectWithData:[[line substringFromIndex:6] dataUsingEncoding:NSUTF8StringEncoding] options:0 error:nil];NSNumber *identifier=reply[@"id"];Require(identifier && expected[identifier] && ![seen containsObject:identifier] && [reply isEqual:expected[identifier]],@"Mixed guest reply changed");[seen addObject:identifier];self.guestReplies++;}else Require(line.length==0,@"Unexpected mixed guest effect");}Require(framed && seen.count==4,@"Mixed guest did not consume four replies");
    }
    for(NSDictionary *record in self.records){MiniInstalledController *owner=record[@"owner"];uint64_t generation=[record[@"generation"] unsignedLongLongValue];Require([Service(owner,@"resource.release.v1",record[@"identity"],generation,record[@"handle"],0)[@"ok"] boolValue],@"Mixed release failed");Denied(owner,record[@"identity"],generation,record[@"handle"]);}
}
- (void)tick {
    if(self.transitioning)return;
    @try{@autoreleasepool{
        [self traceSnapshot:nil];
        Require(NSProcessInfo.processInfo.systemUptime<self.deadline,@"Mixed process deadline exceeded");Require(GateFailure==nil,GateFailure?:@"Mixed HTTP observer failed");Require(!self.provider.timedOut && !self.cancelledProvider.timedOut,@"Synthetic provider gate timed out");
        if(self.state==4){if(UIApplication.sharedApplication.applicationState==UIApplicationStateActive)[self startPhase];return;}
        if(self.state==5){if(self.phaseMediaSlot==nil){self.phase=1;[self startPhase];}return;}
        if(self.state==2){if(self.httpSlots.allObjects.count==0){for(NSUInteger index=0;index<4;index++)Require([[self.owners[index] valueForKey:@"requests"] count]==0,@"Retired HTTP returned to owner");[self beginRecoveryWhileMediaHeld];}return;}
        if(self.state==0 || self.state==3){for(NSUInteger index=0;index<4;index++)for(id work in [[self.owners[index] valueForKey:@"requests"] allValues]){NSString *encoded=[work valueForKey:@"reply"];if(encoded){NSDictionary *reply=[NSJSONSerialization JSONObjectWithData:[encoded dataUsingEncoding:NSUTF8StringEncoding] options:0 error:nil];Require([reply[@"ok"] boolValue],[@"Mixed HTTPS failed before observer gate: " stringByAppendingString:encoded]);}}}
        if(self.state==3){if(self.cancelledMediaSlot==nil){[self startMedia];self.state=0;}return;}
        if(self.state==0){if(GateHeaders<15 || !self.provider.ready)return;Require(GateHeaders==15 && GateDispositions.count==15 && self.records.count==16,@"Mixed overlap coverage changed");[self probe];if(self.phase==1){[self retireMixed];return;}[self releaseHTTP:NSURLSessionResponseAllow];dispatch_semaphore_signal(self.provider.gate);self.state=1;return;}
        [self captureReplies];for(NSDictionary *record in self.records)if(!record[@"reply"])return;[self probe];[self validateAndRelease];
        if(self.phase==0){self.state=5;return;}
        Require(self.phase==2 && self.httpResponses==30 && self.jpegResponses==2 && self.guestReplies==32 && self.capDenials==6 && self.retirements==4 && self.stalePostDenials==16 && self.mediaBusyDenials==1,@"Mixed acceptance counts changed");
        NSDictionary *result=@{@"authenticatedIdentities":@4,@"mixedStages":@3,@"mixedSuccessfulHttpsResponses":@(self.httpResponses),@"mixedJpegResponses":@(self.jpegResponses),@"verifiedGuestReplies":@(self.guestReplies),@"mixedResourceCapacityDenials":@(self.capDenials),@"nativeGenerationRetirements":@(self.retirements),@"staleContainerPostDenials":@(self.stalePostDenials),@"mixedInFlightHttpRetirements":@15,@"mixedInFlightMediaRetirements":@1,@"peakRunningURLSessionTasks":@15,@"peakImageProviderWorkers":@1,@"mediaBusyDenials":@(self.mediaBusyDenials),@"cancelledMediaRetainedCapacityDenials":@1,@"processCap":@16,@"syntheticMediaProvider":@YES,@"controlledTiming":@YES,@"controlledTransport":@NO,@"defaultTlsTrust":@YES,@"foreignReadAndReleaseDenied":@YES};NSData *data=[NSJSONSerialization dataWithJSONObject:result options:NSJSONWritingSortedKeys error:nil];[self finish:[@"native-mixed-process PASS " stringByAppendingString:[[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding]]];
    }}@catch(NSException *failure){[self fail:failure];}
}
- (void)scene:(UIScene *)scene willConnectToSession:(UISceneSession *)session options:(UISceneConnectionOptions *)options {
    (void)session;(void)options;if(![scene isKindOfClass:UIWindowScene.class])return;UIViewController *view=[UIViewController new];view.view.backgroundColor=UIColor.whiteColor;self.proof=[UILabel new];self.proof.frame=CGRectMake(20,100,350,650);self.proof.numberOfLines=0;self.proof.text=@"Mixed HTTP/image checks running";self.proof.accessibilityIdentifier=@"mixed-process-proof";[view.view addSubview:self.proof];self.window=[[UIWindow alloc] initWithWindowScene:(UIWindowScene *)scene];self.window.rootViewController=view;[self.window makeKeyAndVisible];
    dispatch_async(dispatch_get_main_queue(),^{@try{@autoreleasepool{
        NSError *error=nil;NSString *root=[NSSearchPathForDirectoriesInDomains(NSLibraryDirectory,NSUserDomainMask,YES).firstObject stringByAppendingPathComponent:@"mixed-process-packages"];NSData *payload=[NSData dataWithContentsOfFile:[NSBundle.mainBundle pathForResource:@"main" ofType:@"pocket"]],*envelope=[NSData dataWithContentsOfFile:[NSBundle.mainBundle pathForResource:@"manifest" ofType:@"json"]],*key=[NSData dataWithContentsOfFile:[NSBundle.mainBundle pathForResource:@"publisher" ofType:@"key"]];self.store=[[MiniPackageStore alloc] initWithRoot:root trustedKey:key error:&error];Require(self.store && [self.store seedPayload:payload envelope:envelope error:&error],error.localizedDescription?:@"Mixed signed seed failed");NSArray *peers=[NSJSONSerialization JSONObjectWithData:[ResourcePeersJSON dataUsingEncoding:NSUTF8StringEncoding] options:0 error:&error];Require(peers.count==3,@"Mixed signed peers missing");NSMutableArray *identities=[NSMutableArray arrayWithObject:@"dev.pjm.fixture"];
        for(NSDictionary *peer in peers){Require([self.store seedPayload:[[NSData alloc] initWithBase64EncodedString:peer[@"payload"] options:0] envelope:[NSJSONSerialization dataWithJSONObject:peer[@"manifest"] options:0 error:&error] error:&error],error.localizedDescription?:@"Mixed peer authentication failed");NSString *identity=peer[@"manifest"][@"appId"];Require(identity.length && ![identities containsObject:identity],@"Mixed peer identity collision");[identities addObject:identity];}
        self.owners=[NSMutableArray new];for(NSUInteger index=0;index<5;index++){NSString *identity=identities[index%4];MixedController *owner=[[MixedController alloc] initWithIdentity:identity store:self.store launchData:[@"{}" dataUsingEncoding:NSUTF8StringEncoding] error:&error];Require(owner && [owner.surface.verifiedActiveIdentity isEqual:identity],error.localizedDescription?:@"Mixed native owner failed");[self.owners addObject:owner];}
        Require([self.store setPermissionDecision:YES permission:@"media" identity:identities[0] error:&error],error.localizedDescription?:@"Synthetic host image consent setup failed");
        UIGraphicsImageRendererFormat *format=[UIGraphicsImageRendererFormat defaultFormat];format.scale=1;format.opaque=YES;UIGraphicsImageRenderer *renderer=[[UIGraphicsImageRenderer alloc] initWithSize:CGSizeMake(320,160) format:format];UIImage *image=[renderer imageWithActions:^(UIGraphicsImageRendererContext *context){(void)context;[UIColor.redColor setFill];UIRectFill(CGRectMake(0,0,320,160));}];self.imageURL=[NSURL fileURLWithPath:[NSTemporaryDirectory() stringByAppendingPathComponent:@"mixed-source.png"]];Require([UIImagePNGRepresentation(image) writeToURL:self.imageURL options:NSDataWritingAtomic error:&error],error.localizedDescription?:@"Synthetic provider source write failed");
        self.trace=[NSMutableArray new];self.traceStart=NSProcessInfo.processInfo.systemUptime;[self traceSnapshot:@"start"];InstallResponseObserver();self.deadline=NSProcessInfo.processInfo.systemUptime+110;self.state=4;self.timer=[NSTimer scheduledTimerWithTimeInterval:0.02 repeats:YES block:^(NSTimer *timer){(void)timer;[self tick];}];
    }}@catch(NSException *failure){[self fail:failure];}});
}
@end
@interface MixedProcessApp : UIResponder <UIApplicationDelegate>
@end
@implementation MixedProcessApp
@end
int main(int argc,char **argv){@autoreleasepool{return UIApplicationMain(argc,argv,nil,NSStringFromClass(MixedProcessApp.class));}}
