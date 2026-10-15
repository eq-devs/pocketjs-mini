#import <UIKit/UIKit.h>
#import <objc/runtime.h>
#import "InstalledController.h"
#import "ResourcePeers.h"

// Test-only access; requests use the shipping URLSession transport and TLS trust.
@interface MiniInstalledController (HttpProcessTest)
- (NSDictionary *)startHTTP:(id)arguments identifier:(NSNumber *)identifier package:(MiniVerifiedPackage *)package generation:(uint64_t)generation;
- (NSDictionary *)resourceService:(NSString *)kind arguments:(id)arguments identity:(NSString *)identity generation:(uint64_t)generation;
- (void)drainHTTP;
@end
static void Require(BOOL ok,NSString *message){if(!ok)@throw [NSException exceptionWithName:@"HttpProcessFailure" reason:message userInfo:nil];}
static NSDictionary *Service(MiniInstalledController *owner,NSString *kind,NSString *identity,uint64_t generation,NSString *handle,NSUInteger offset){
    return [owner resourceService:kind arguments:[kind isEqual:@"resource.read.v1"]?@{@"handle":handle,@"offset":@(offset),@"count":@1536}:@{@"handle":handle} identity:identity generation:generation];
}
static void Denied(MiniInstalledController *owner,NSString *identity,uint64_t generation,NSString *handle){
    for(NSString *kind in @[@"resource.read.v1",@"resource.release.v1"])Require([Service(owner,kind,identity,generation,handle,0)[@"error"][@"code"] isEqual:@"DENIED"],@"Foreign or retired handle accepted");
}
// Delay only response-disposition callbacks after real HTTPS headers. No fake
// URLProtocol, response bytes, trust delegate or transport configuration is used.
static BOOL GateEnabled;
static NSUInteger GateHeaders;
static NSMutableArray *GateDispositions;
static NSString *GateFailure;
static void InstallResponseObserver(void){
    Class type=NSClassFromString(@"MiniHTTPTask");SEL selector=@selector(URLSession:dataTask:didReceiveResponse:completionHandler:);Method method=class_getInstanceMethod(type,selector);Require(method!=NULL,@"Production HTTP delegate missing");
    void (*original)(id,SEL,NSURLSession *,NSURLSessionDataTask *,NSURLResponse *,void (^)(NSURLSessionResponseDisposition))=(void *)method_getImplementation(method);
    IMP observer=imp_implementationWithBlock(^(id work,NSURLSession *session,NSURLSessionDataTask *task,NSURLResponse *response,void (^completion)(NSURLSessionResponseDisposition)){
        if(!GateEnabled){original(work,selector,session,task,response,completion);return;}
        if(!NSThread.isMainThread || ![response isKindOfClass:NSHTTPURLResponse.class] || ((NSHTTPURLResponse *)response).statusCode!=200)GateFailure=@"Cancellation gate did not receive real HTTPS 200 headers on owner thread";
        original(work,selector,session,task,response,^(NSURLSessionResponseDisposition disposition){
            if(disposition!=NSURLSessionResponseAllow)GateFailure=@"Production HTTP delegate rejected cancellation response";
            [GateDispositions addObject:[completion copy]];GateHeaders++;
        });
    });
    method_setImplementation(method,observer);
}
@interface MiniScene : UIResponder <UIWindowSceneDelegate>
@property(nonatomic,strong) UIWindow *window;
@property UILabel *proof;
@property MiniPackageStore *store;
@property NSMutableArray<MiniInstalledController *> *owners;
@property NSMutableArray<NSDictionary *> *records;
@property NSTimer *timer;
@property NSUInteger wave;
@property NSUInteger responses;
@property NSUInteger bytesRead;
@property NSUInteger globalDenials;
@property NSUInteger peakTasks;
@property NSUInteger retirements;
@property double deadline;
@property BOOL transitioning;
@property BOOL cancelling;
@property BOOL cancellationRetired;
@property NSArray<NSURLSessionDataTask *> *cancelTasks;
@property NSMutableArray *cancelRecords;
@property NSHashTable *cancelSlots;
@property NSUInteger cancelledRequests;
@property NSUInteger verifiedGuestReplies;
@property NSUInteger staleContainerPostDenials;
@end
@implementation MiniScene
- (void)finish:(NSString *)message {
    [self.timer invalidate];self.timer=nil;GateEnabled=NO;
    for(void (^completion)(NSURLSessionResponseDisposition) in [GateDispositions copy])completion(NSURLSessionResponseCancel);
    [GateDispositions removeAllObjects];
    for(MiniInstalledController *owner in self.owners)[owner shutdown];
    self.proof.text=message;self.proof.accessibilityValue=message;
}
- (void)fail:(NSException *)failure {[self finish:[@"native-http-process FAIL " stringByAppendingString:failure.reason?:failure.name]];NSLog(@"PJM_HTTP_PROCESS_FAILURE %@",failure);}
- (void)probe {
    MiniInstalledController *owner=self.owners[4];NSError *error=nil;MiniVerifiedPackage *package=[self.store coldStart:owner.surface.verifiedActiveIdentity error:&error];Require(package!=nil,error.localizedDescription?:@"Probe authentication failed");
    NSDictionary *result=[owner startHTTP:@{@"url":@"https://example.com/",@"responseMode":@"resource"} identifier:@999 package:package generation:owner.surface.verifiedActiveGeneration];
    Require([result[@"error"][@"code"] isEqual:@"BUSY"] && [result[@"error"][@"message"] isEqual:@"Resource capacity exceeded"],@"Global resource cap did not deny seventeenth request");self.globalDenials++;
}
- (void)startWave {
    self.wave++;self.records=[NSMutableArray new];NSUInteger running=0;
    for(NSUInteger index=0;index<4;index++){
        MiniInstalledController *owner=self.owners[index];NSString *identity=owner.surface.verifiedActiveIdentity;uint64_t generation=owner.surface.verifiedActiveGeneration;NSError *error=nil;
        MiniVerifiedPackage *package=[self.store coldStart:identity error:&error];Require(package!=nil,error.localizedDescription?:@"HTTP package authentication failed");
        for(NSUInteger slot=0;slot<4;slot++){
            NSNumber *identifier=@(self.wave*100+index*4+slot);NSString *key=[NSString stringWithFormat:@"%llu:%@",(unsigned long long)generation,identifier];
            Require([owner startHTTP:@{@"url":@"https://example.com/",@"responseMode":@"resource"} identifier:identifier package:package generation:generation]==nil,@"Real HTTPS request rejected");
            id work=[owner valueForKey:@"requests"][key];NSURLSessionDataTask *task=[work valueForKey:@"task"];
            Require(task && task.state==NSURLSessionTaskStateRunning,@"Production URLSession task did not resume");running++;
            [self.records addObject:@{@"owner":owner,@"identity":identity,@"generation":@(generation),@"identifier":identifier,@"key":key}];
        }
    }
    Require(running==16,@"Sixteen actual URLSession tasks were not running");self.peakTasks=MAX(self.peakTasks,running);[self probe];self.transitioning=NO;
}
- (void)denyContainerPost:(MiniInstalledController *)owner identity:(NSString *)identity generation:(uint64_t)generation {
    MiniVerifiedContainer *container=[owner.surface valueForKey:@"container"];NSError *error=nil;
    Require(![container postCompletion:[@"{\"v\":1,\"id\":1,\"ok\":true,\"data\":null}" dataUsingEncoding:NSUTF8StringEncoding] identity:identity generation:generation error:&error] && error!=nil,@"Retired native container accepted completion");self.staleContainerPostDenials++;
}
- (void)verifyGuestReplies {
    for(NSUInteger index=0;index<4;index++){
        MiniInstalledController *owner=self.owners[index];MiniVerifiedContainer *container=[owner.surface valueForKey:@"container"];NSMutableDictionary *expected=[NSMutableDictionary new];
        for(NSDictionary *record in self.records)if(record[@"owner"]==owner)expected[record[@"identifier"]]=record[@"reply"];
        MpInput input={0};input.size=sizeof(input);MpFrame frame={0};MpDamage damage={0};damage.size=sizeof(damage);NSArray<NSData *> *effects=nil;NSError *error=nil;
        Require([container advanceInput:&input frame:&frame damage:&damage effects:&effects error:&error],error.localizedDescription?:@"Verified native guest frame failed");
        NSMutableSet *seen=[NSMutableSet new];BOOL framed=NO;
        for(NSData *data in effects){NSString *line=[[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding];
            if([line hasPrefix:@"verified:"])framed=YES;
            else if([line hasPrefix:@"reply:"]){NSDictionary *reply=[NSJSONSerialization JSONObjectWithData:[[line substringFromIndex:6] dataUsingEncoding:NSUTF8StringEncoding] options:0 error:nil];NSNumber *identifier=reply[@"id"];Require(identifier && expected[identifier] && ![seen containsObject:identifier] && [reply isEqual:expected[identifier]],@"Native guest observed wrong HTTP completion");[seen addObject:identifier];self.verifiedGuestReplies++;}
            else Require(line.length==0,[@"Unexpected verified guest effect: " stringByAppendingString:line?:@"(invalid UTF-8)"]);
        }
        Require(framed && seen.count==4,@"Native guest did not consume four HTTP replies");
    }
}
- (void)startCancellation {
    self.cancelling=YES;self.transitioning=NO;self.cancelRecords=[NSMutableArray new];self.cancelSlots=[NSHashTable weakObjectsHashTable];NSMutableArray *tasks=[NSMutableArray new];GateDispositions=[NSMutableArray new];GateHeaders=0;GateEnabled=YES;
    for(NSUInteger index=0;index<4;index++){
        MiniInstalledController *owner=self.owners[index];NSString *identity=owner.surface.verifiedActiveIdentity;uint64_t generation=owner.surface.verifiedActiveGeneration;NSError *error=nil;MiniVerifiedPackage *package=[self.store coldStart:identity error:&error];Require(package!=nil,error.localizedDescription?:@"Cancellation package authentication failed");
        for(NSUInteger slot=0;slot<4;slot++){
            NSNumber *identifier=@(500+index*4+slot);NSString *key=[NSString stringWithFormat:@"%llu:%@",(unsigned long long)generation,identifier];
            Require([owner startHTTP:@{@"url":@"https://example.com/",@"responseMode":@"resource"} identifier:identifier package:package generation:generation]==nil,@"Cancellation-phase HTTPS request rejected");
            id work=[owner valueForKey:@"requests"][key];NSURLSessionDataTask *task=[work valueForKey:@"task"];Require(task && task.state==NSURLSessionTaskStateRunning,@"Cancellation task was not resumed");[tasks addObject:task];
            id resource=[work valueForKey:@"resource"];Require(resource!=nil,@"Cancellation resource missing");[self.cancelSlots addObject:resource];
            [self.cancelRecords addObject:@{@"owner":owner,@"identity":identity,@"generation":@(generation),@"handle":[resource valueForKey:@"handle"]}];
        }
    }
    Require(tasks.count==16 && self.cancelSlots.count==16,@"Cancellation did not admit sixteen real resource tasks");self.cancelTasks=tasks;
}
- (void)tickCancellation {
    Require(GateFailure==nil,GateFailure?:@"Response observer failure");
    if(!self.cancellationRetired){
        if(GateHeaders<16)return;
        Require(GateHeaders==16 && GateDispositions.count==16,@"Cancellation response observer count changed");GateEnabled=NO;
        for(NSUInteger index=0;index<4;index++){
            MiniInstalledController *owner=self.owners[index];NSDictionary *requests=[owner valueForKey:@"requests"];Require(requests.count==4,@"In-flight cancellation task count changed");
            for(id work in requests.allValues)Require([work valueForKey:@"reply"]==nil && ![[work valueForKey:@"finished"] boolValue],@"Cancellation occurred after task completion");
            NSString *identity=owner.surface.verifiedActiveIdentity;uint64_t before=owner.surface.verifiedActiveGeneration;NSError *error=nil;MiniVerifiedContainer *container=[owner.surface valueForKey:@"container"];
            Require([container closeIdentity:identity error:&error],error.localizedDescription?:@"In-flight native retirement failed");Require([owner openIdentity:identity launchData:[@"{}" dataUsingEncoding:NSUTF8StringEncoding] error:&error],error.localizedDescription?:@"In-flight native reopen failed");Require(owner.surface.verifiedActiveGeneration>before,@"Cancelled generation did not advance");self.retirements++;
        }
        for(NSURLSessionDataTask *task in self.cancelTasks)Require(task.state==NSURLSessionTaskStateCanceling || task.state==NSURLSessionTaskStateCompleted,@"Native retirement did not cancel real URLSession task");
        for(NSDictionary *record in self.cancelRecords){MiniInstalledController *owner=record[@"owner"];Denied(owner,record[@"identity"],[record[@"generation"] unsignedLongLongValue],record[@"handle"]);Denied(owner,record[@"identity"],owner.surface.verifiedActiveGeneration,record[@"handle"]);[self denyContainerPost:owner identity:record[@"identity"] generation:[record[@"generation"] unsignedLongLongValue]];}
        self.cancelledRequests=16;self.cancellationRetired=YES;
        for(void (^completion)(NSURLSessionResponseDisposition) in [GateDispositions copy])completion(NSURLSessionResponseCancel);
        [GateDispositions removeAllObjects];self.cancelTasks=nil;return;
    }
    // Weak observation cannot keep production resource tokens alive itself.
    if(self.cancelSlots.allObjects.count!=0)return;
    for(NSUInteger index=0;index<4;index++){MiniInstalledController *owner=self.owners[index];Require([[owner valueForKey:@"requests"] count]==0,@"Retired HTTP request returned to owner");[owner drainHTTP];}
    self.cancelling=NO;self.transitioning=YES;
    dispatch_async(dispatch_get_main_queue(),^{@try{@autoreleasepool{[self startWave];}}@catch(NSException *failure){[self fail:failure];}});
}
- (void)validateBodies {
    NSMutableSet *handles=[NSMutableSet new];
    for(NSDictionary *record in self.records){
        MiniInstalledController *owner=record[@"owner"];NSString *identity=record[@"identity"],*handle=record[@"reply"][@"data"][@"resource"][@"handle"];uint64_t generation=[record[@"generation"] unsignedLongLongValue];NSUInteger size=[record[@"reply"][@"data"][@"resource"][@"size"] unsignedIntegerValue];
        Require(handle.length && size>0 && size<=1024*1024 && ![handles containsObject:handle],@"Invalid or duplicate resource receipt");[handles addObject:handle];
        NSMutableData *body=[NSMutableData new];NSUInteger offset=0;
        while(offset<size){NSDictionary *reply=Service(owner,@"resource.read.v1",identity,generation,handle,offset);Require([reply[@"ok"] boolValue],@"Owned HTTP resource unreadable");NSDictionary *data=reply[@"data"];NSData *chunk=[[NSData alloc] initWithBase64EncodedString:data[@"bodyBase64"] options:0];NSUInteger next=[data[@"nextOffset"] unsignedIntegerValue];Require(chunk.length>0 && chunk.length<=1536 && next==offset+chunk.length && next<=size && [data[@"size"] unsignedIntegerValue]==size,@"Invalid bounded body chunk");[body appendData:chunk];offset=next;}
        Require([[[NSString alloc] initWithData:body encoding:NSUTF8StringEncoding] containsString:@"Example Domain"],@"Unexpected HTTPS response body");self.bytesRead+=body.length;
        for(NSUInteger index=0;index<4;index++){MiniInstalledController *other=self.owners[index];if(other==owner)continue;Denied(other,other.surface.verifiedActiveIdentity,other.surface.verifiedActiveGeneration,handle);Denied(owner,other.surface.verifiedActiveIdentity,generation,handle);}
        NSDictionary *again=Service(owner,@"resource.read.v1",identity,generation,handle,0);NSData *first=[[NSData alloc] initWithBase64EncodedString:again[@"data"][@"bodyBase64"] options:0];Require([first isEqual:[body subdataWithRange:NSMakeRange(0,MIN((NSUInteger)1536,size))]],@"Foreign access changed owner bytes");
    }
}
- (void)tick {
    if(self.transitioning)return;
    @try {@autoreleasepool {
        Require(NSProcessInfo.processInfo.systemUptime<self.deadline,@"Real HTTPS process test deadline exceeded");
        if(self.cancelling){[self tickCancellation];return;}
        NSUInteger completed=0;
        for(NSUInteger index=0;index<self.records.count;index++){
            NSDictionary *record=self.records[index];if(record[@"reply"]){completed++;continue;}
            MiniInstalledController *owner=record[@"owner"];id work=[owner valueForKey:@"requests"][record[@"key"]];Require(work!=nil,@"Production HTTP task disappeared before delivery");NSString *encoded=[work valueForKey:@"reply"];if(!encoded)continue;
            NSDictionary *reply=[NSJSONSerialization JSONObjectWithData:[encoded dataUsingEncoding:NSUTF8StringEncoding] options:0 error:nil];Require([reply[@"ok"] boolValue] && [reply[@"data"][@"status"] integerValue]==200,[NSString stringWithFormat:@"HTTPS response failed: %@",encoded]);Require([reply[@"id"] isEqual:record[@"identifier"]] && [reply[@"v"] integerValue]==1 && [[work valueForKey:@"generation"] isEqual:record[@"generation"]] && [((MiniVerifiedPackage *)[work valueForKey:@"package"]).metadata[@"appId"] isEqual:record[@"identity"]],@"Response binding changed");
            NSMutableDictionary *saved=[record mutableCopy];saved[@"reply"]=reply;self.records[index]=saved;self.responses++;completed++;
        }
        // Deliver through the real verified native mailbox, then drop transport owners.
        for(NSUInteger index=0;index<4;index++)[self.owners[index] drainHTTP];
        if(completed!=16)return;
        for(NSUInteger index=0;index<4;index++)Require([[self.owners[index] valueForKey:@"requests"] count]==0,@"Verified response delivery did not drain tasks");
        [self probe];[self validateBodies];[self verifyGuestReplies];
        if(self.wave==1){
            for(NSUInteger index=0;index<4;index++){
                MiniInstalledController *owner=self.owners[index];NSString *identity=owner.surface.verifiedActiveIdentity;uint64_t before=owner.surface.verifiedActiveGeneration;NSError *error=nil;MiniVerifiedContainer *container=[owner.surface valueForKey:@"container"];
                Require([container closeIdentity:identity error:&error],error.localizedDescription?:@"Native retirement failed");Require([owner openIdentity:identity launchData:[@"{}" dataUsingEncoding:NSUTF8StringEncoding] error:&error],error.localizedDescription?:@"Native reopen failed");Require(owner.surface.verifiedActiveGeneration>before,@"Generation did not advance");self.retirements++;
            }
            for(NSDictionary *record in self.records){MiniInstalledController *owner=record[@"owner"];NSString *handle=record[@"reply"][@"data"][@"resource"][@"handle"];Denied(owner,record[@"identity"],[record[@"generation"] unsignedLongLongValue],handle);Denied(owner,record[@"identity"],owner.surface.verifiedActiveGeneration,handle);[self denyContainerPost:owner identity:record[@"identity"] generation:[record[@"generation"] unsignedLongLongValue]];}
            // Let this autorelease pool and URLSession callbacks release their slots first.
            self.transitioning=YES;dispatch_async(dispatch_get_main_queue(),^{@try{@autoreleasepool{[self startCancellation];}}@catch(NSException *failure){[self fail:failure];}});
        }else{
            for(NSDictionary *record in self.records){MiniInstalledController *owner=record[@"owner"];NSString *handle=record[@"reply"][@"data"][@"resource"][@"handle"];uint64_t generation=[record[@"generation"] unsignedLongLongValue];Require([Service(owner,@"resource.release.v1",record[@"identity"],generation,handle,0)[@"ok"] boolValue],@"Final resource release failed");Denied(owner,record[@"identity"],generation,handle);}
            Require(self.responses==32 && self.globalDenials==4 && self.retirements==8 && self.cancelledRequests==16 && self.verifiedGuestReplies==32 && self.staleContainerPostDenials==32,@"HTTP coverage changed");
            NSDictionary *result=@{@"authenticatedIdentities":@4,@"waves":@2,@"actualHttpsResponses":@(self.responses),@"responseBytesRead":@(self.bytesRead),@"peakRunningURLSessionTasks":@(self.peakTasks),@"globalResourceDenials":@(self.globalDenials),@"nativeGenerationRetirements":@(self.retirements),@"verifiedGuestReplies":@(self.verifiedGuestReplies),@"staleContainerPostDenials":@(self.staleContainerPostDenials),@"inFlightHttpsRetirements":@(self.cancelledRequests),@"cancellationHttpsHeaders":@(GateHeaders),@"controlledTiming":@YES,@"releasedResources":@16,@"processCap":@16,@"defaultTlsTrust":@YES,@"controlledTransport":@NO,@"foreignReadAndReleaseDenied":@YES};
            NSData *data=[NSJSONSerialization dataWithJSONObject:result options:NSJSONWritingSortedKeys error:nil];[self finish:[@"native-http-process PASS " stringByAppendingString:[[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding]]];
        }
    }}@catch(NSException *failure){[self fail:failure];}
}
- (void)scene:(UIScene *)scene willConnectToSession:(UISceneSession *)session options:(UISceneConnectionOptions *)options {
    (void)session;(void)options;if(![scene isKindOfClass:UIWindowScene.class])return;
    UIViewController *view=[UIViewController new];view.view.backgroundColor=UIColor.whiteColor;self.proof=[UILabel new];self.proof.frame=CGRectMake(20,100,350,650);self.proof.numberOfLines=0;self.proof.text=@"Real HTTPS process checks running";self.proof.accessibilityIdentifier=@"http-process-proof";[view.view addSubview:self.proof];self.window=[[UIWindow alloc] initWithWindowScene:(UIWindowScene *)scene];self.window.rootViewController=view;[self.window makeKeyAndVisible];
    dispatch_async(dispatch_get_main_queue(),^{@try{@autoreleasepool{
        NSError *error=nil;NSString *root=[NSSearchPathForDirectoriesInDomains(NSLibraryDirectory,NSUserDomainMask,YES).firstObject stringByAppendingPathComponent:@"http-process-packages"];
        NSData *payload=[NSData dataWithContentsOfFile:[NSBundle.mainBundle pathForResource:@"main" ofType:@"pocket"]],*envelope=[NSData dataWithContentsOfFile:[NSBundle.mainBundle pathForResource:@"manifest" ofType:@"json"]],*key=[NSData dataWithContentsOfFile:[NSBundle.mainBundle pathForResource:@"publisher" ofType:@"key"]];
        self.store=[[MiniPackageStore alloc] initWithRoot:root trustedKey:key error:&error];Require(self.store && [self.store seedPayload:payload envelope:envelope error:&error],error.localizedDescription?:@"Signed seed failed");
        NSArray *peers=[NSJSONSerialization JSONObjectWithData:[ResourcePeersJSON dataUsingEncoding:NSUTF8StringEncoding] options:0 error:&error];Require(peers.count==3,@"Missing signed peers");NSMutableArray *identities=[NSMutableArray arrayWithObject:@"dev.pjm.fixture"];
        for(NSDictionary *peer in peers){Require([self.store seedPayload:[[NSData alloc] initWithBase64EncodedString:peer[@"payload"] options:0] envelope:[NSJSONSerialization dataWithJSONObject:peer[@"manifest"] options:0 error:&error] error:&error],error.localizedDescription?:@"Signed peer seed failed");NSString *identity=peer[@"manifest"][@"appId"];Require(identity.length && ![identities containsObject:identity],@"Peer identities are not distinct");[identities addObject:identity];}
        self.owners=[NSMutableArray new];for(NSUInteger index=0;index<5;index++){NSString *identity=identities[index%4];MiniInstalledController *owner=[[MiniInstalledController alloc] initWithIdentity:identity store:self.store launchData:[@"{}" dataUsingEncoding:NSUTF8StringEncoding] error:&error];Require(owner && [owner.surface.verifiedActiveIdentity isEqual:identity],error.localizedDescription?:@"Signed controller creation failed");[self.owners addObject:owner];}
        InstallResponseObserver();self.deadline=NSProcessInfo.processInfo.systemUptime+110;[self startWave];self.timer=[NSTimer scheduledTimerWithTimeInterval:0.02 repeats:YES block:^(NSTimer *timer){(void)timer;[self tick];}];
    }}@catch(NSException *failure){[self fail:failure];}});
}
@end
@interface HttpProcessApp : UIResponder <UIApplicationDelegate>
@end
@implementation HttpProcessApp
@end
int main(int argc,char **argv){@autoreleasepool{return UIApplicationMain(argc,argv,nil,NSStringFromClass(HttpProcessApp.class));}}
