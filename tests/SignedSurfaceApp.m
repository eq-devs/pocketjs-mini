// Simulator integration harness; not included in the shipping host.
#import <UIKit/UIKit.h>
#import "PocketSurfaceView.h"
#import "InstalledController.h"
#include <assert.h>
@interface MiniInstalledController (ServiceTest)
- (void)dispatchService:(NSString *)line package:(MiniVerifiedPackage *)package generation:(uint64_t)generation;
- (NSURLSessionConfiguration *)httpConfiguration;
- (id)reserveResourceForIdentity:(NSString *)identity generation:(uint64_t)generation;
- (void)drainHTTP;
- (void)cancelGeneration:(uint64_t)generation;
- (NSDictionary *)resourceService:(NSString *)kind arguments:(id)arguments identity:(NSString *)identity generation:(uint64_t)generation;
- (BOOL)admitHTTPRateForIdentity:(NSString *)identity time:(double)now;
- (NSDictionary *)startHTTP:(id)arguments identifier:(NSNumber *)identifier package:(MiniVerifiedPackage *)package generation:(uint64_t)generation;
@end
// A deterministic transport exercises URLSession delegates without external I/O.
@interface SurfaceHTTPProtocol : NSURLProtocol
@end
@implementation SurfaceHTTPProtocol
+ (BOOL)canInitWithRequest:(NSURLRequest *)request {return [request.URL.host isEqual:@"example.com"];}
+ (NSURLRequest *)canonicalRequestForRequest:(NSURLRequest *)request {return request;}
- (void)startLoading {
    if([self.request.URL.path isEqual:@"/hold"])return;
    NSHTTPURLResponse *response=[[NSHTTPURLResponse alloc] initWithURL:self.request.URL statusCode:200 HTTPVersion:@"HTTP/1.1" headerFields:@{}];
    [self.client URLProtocol:self didReceiveResponse:response cacheStoragePolicy:NSURLCacheStorageNotAllowed];
    NSMutableData *maximum=[NSMutableData dataWithLength:1536];memset(maximum.mutableBytes,255,maximum.length);
    NSData *data=[self.request.URL.path isEqual:@"/max"]?maximum:[self.request.URL.path isEqual:@"/large"]?[NSMutableData dataWithLength:1537]:[@"hello" dataUsingEncoding:NSUTF8StringEncoding];
    [self.client URLProtocol:self didLoadData:data];[self.client URLProtocolDidFinishLoading:self];
}
- (void)stopLoading {}
@end
@interface SurfaceHTTPController : MiniInstalledController
@end
@implementation SurfaceHTTPController
- (NSURLSessionConfiguration *)httpConfiguration {NSURLSessionConfiguration *config=[super httpConfiguration];config.protocolClasses=@[SurfaceHTTPProtocol.class];return config;}
@end
@interface SignedSurfaceApp : UIResponder <UIApplicationDelegate>
@property UIWindow *window;
@property PocketSurfaceView *surface;
@property MiniInstalledController *controller;
@property MiniVerifiedPackage *package;
@property NSData *launch;
@property MiniPackageStore *store;
@property NSUInteger frames;
@property BOOL warm;
@property BOOL cleanup;
@property BOOL hiddenVerified;
@property BOOL deviceVerified;
@property uint64_t generation;
@property NSUInteger retirements;
@property NSUInteger httpReplies;
@property BOOL backpressureVerified;
@property NSUInteger pressureAttempts;
@end
@implementation SignedSurfaceApp
- (void)verifyBackpressure {
    NSDictionary *requests=[self.controller valueForKey:@"requests"];BOOL ready=requests.count==4;
    for(id work in requests.allValues)if(![work valueForKey:@"reply"])ready=NO;
    if(!ready){assert(++_pressureAttempts<40);dispatch_after(dispatch_time(DISPATCH_TIME_NOW,25*NSEC_PER_MSEC),dispatch_get_main_queue(),^{[self verifyBackpressure];});return;}
    NSUInteger accepted=0;for(NSUInteger i=0;i<33;i++){if(![_surface postVerifiedEvent:@"pressure" identity:_package.metadata[@"appId"] generation:_generation error:nil])break;accepted++;}
    assert(accepted>0 && accepted<33);[_controller drainHTTP];assert([[self.controller valueForKey:@"requests"] count]==4);_backpressureVerified=YES;NSLog(@"PJM_HTTP_BACKPRESSURE_PASS retained=4 fillers=%lu",(unsigned long)accepted);[_surface start];
}
- (BOOL)application:(UIApplication *)application didFinishLaunchingWithOptions:(NSDictionary *)options {
    (void)application;(void)options;NSError *error=nil;
    NSArray *cases=[NSJSONSerialization JSONObjectWithData:[NSData dataWithContentsOfFile:[NSBundle.mainBundle pathForResource:@"cases" ofType:@"json"]] options:0 error:&error];assert(cases && !error);
    NSDictionary *fixture=cases.firstObject;assert([fixture[@"valid"] boolValue]);
    NSData *payload=[[NSData alloc] initWithBase64EncodedString:fixture[@"payload"] options:0];
    NSData *key=[[NSData alloc] initWithBase64EncodedString:fixture[@"key"] options:0];
    NSData *envelope=[NSJSONSerialization dataWithJSONObject:fixture[@"manifest"] options:0 error:&error];
    self.package=[[MiniVerifiedPackage alloc] initWithPayload:payload envelope:envelope trustedKey:key error:&error];assert(self.package && !error);
    self.launch=[@"{\"source\":\"test\",\"path\":\"/\",\"query\":{}}" dataUsingEncoding:NSUTF8StringEncoding];
    NSString *root=[NSSearchPathForDirectoriesInDomains(NSLibraryDirectory,NSUserDomainMask,YES).firstObject stringByAppendingPathComponent:@"packages"];
    self.store=[[MiniPackageStore alloc] initWithRoot:root trustedKey:key error:&error];assert(self.store && !error);
    assert([self.store stagePayload:payload envelope:envelope error:&error]);
    self.controller=[[SurfaceHTTPController alloc] initWithIdentity:@"dev.pjm.fixture" store:self.store launchData:self.launch error:&error];assert(self.controller && !error);self.surface=self.controller.surface;
    [self.controller dispatchService:@"{\"v\":0,\"v\":1,\"id\":990,\"kind\":\"request.v1\",\"args\":{\"url\":\"https://example.com/hold\"}}" package:self.package generation:800];
    assert([[self.controller valueForKey:@"requests"] count]==0);
    [self.controller dispatchService:@"{\"v\":1,\"id\":990,\"kind\":\"request.v1\",\"args\":{\"url\":\"https://denied.example/\",\"url\":\"https://example.com/hold\"}}" package:self.package generation:800];
    assert([[self.controller valueForKey:@"requests"] count]==0);
    NSLog(@"PJM_STRICT_SERVICE_PASS duplicate fields have no network side effect");
    @autoreleasepool {
        MiniInstalledController *peer=[[SurfaceHTTPController alloc] initWithIdentity:@"dev.pjm.fixture" store:self.store launchData:self.launch error:&error];assert(peer);
        NSMutableArray *held=[NSMutableArray new];
        for(NSUInteger i=0;i<16;i++){@autoreleasepool {id slot=[self.controller reserveResourceForIdentity:@"dev.pjm.fixture" generation:1000+i/4];assert(slot);[held addObject:slot];}}
        assert(![self.controller reserveResourceForIdentity:@"dev.pjm.fixture" generation:1000]);assert(![peer reserveResourceForIdentity:@"dev.pjm.fixture" generation:2000]);
        [self.controller cancelGeneration:1000];assert(![peer reserveResourceForIdentity:@"dev.pjm.fixture" generation:2000]);
        [held removeObjectAtIndex:0];@autoreleasepool {id replacement=[peer reserveResourceForIdentity:@"dev.pjm.fixture" generation:2000];assert(replacement);}
        for(NSUInteger generation=1001;generation<=1003;generation++)[self.controller cancelGeneration:generation];[held removeAllObjects];[peer cancelGeneration:2000];[peer shutdown];
    }
    NSLog(@"PJM_RESOURCE_ACCOUNTING_PASS generation=4 process=16 retained cancellation");
    // Exercise the real resource producer delegates on the main owner queue.
    for(NSUInteger attempt=0;attempt<3;attempt++){
        NSDictionary *started=[self.controller startHTTP:@{@"url":@"https://example.com/hold",@"responseMode":@"resource"} identifier:@(980+attempt) package:self.package generation:800];assert(!started);
        id work=[[self.controller valueForKey:@"requests"] objectForKey:[NSString stringWithFormat:@"800:%lu",(unsigned long)(980+attempt)]];assert(work);
        NSHTTPURLResponse *response=[[NSHTTPURLResponse alloc] initWithURL:[NSURL URLWithString:@"https://example.com/hold"] statusCode:200 HTTPVersion:@"HTTP/1.1" headerFields:@{}];
        __block BOOL allowed=NO;[(id<NSURLSessionDataDelegate>)work URLSession:[work valueForKey:@"session"] dataTask:[work valueForKey:@"task"] didReceiveResponse:response completionHandler:^(NSURLSessionResponseDisposition disposition){allowed=disposition==NSURLSessionResponseAllow;}];assert(allowed);
        NSUInteger length=attempt==0?1537:attempt==1?1024*1024:1024*1024+1;NSMutableData *data=[NSMutableData dataWithLength:length];memset(data.mutableBytes,255,length);
        [(id<NSURLSessionDataDelegate>)work URLSession:[work valueForKey:@"session"] dataTask:[work valueForKey:@"task"] didReceiveData:data];
        if(attempt==2){NSDictionary *reply=[NSJSONSerialization JSONObjectWithData:[[work valueForKey:@"reply"] dataUsingEncoding:NSUTF8StringEncoding] options:0 error:nil];assert([reply[@"error"][@"code"] isEqual:@"FAILED"]);}
        else {
            [(id<NSURLSessionTaskDelegate>)work URLSession:[work valueForKey:@"session"] task:[work valueForKey:@"task"] didCompleteWithError:nil];
            NSDictionary *reply=[NSJSONSerialization JSONObjectWithData:[[work valueForKey:@"reply"] dataUsingEncoding:NSUTF8StringEncoding] options:0 error:nil];assert([reply[@"ok"] boolValue]);NSString *handle=reply[@"data"][@"resource"][@"handle"];assert([reply[@"data"][@"resource"][@"size"] unsignedIntegerValue]==length);
            NSDictionary *args=@{@"handle":handle,@"offset":@0,@"count":@1536};NSDictionary *chunk=[self.controller resourceService:@"resource.read.v1" arguments:args identity:@"dev.pjm.fixture" generation:800];assert(CFGetTypeID((__bridge CFTypeRef)chunk[@"data"][@"eof"])==CFBooleanGetTypeID());assert([chunk[@"ok"] boolValue] && [chunk[@"data"][@"bodyBase64"] length]==2048 && ![chunk[@"data"][@"eof"] boolValue]);
            assert([[self.controller resourceService:@"resource.read.v1" arguments:args identity:@"dev.pjm.other" generation:800][@"error"][@"code"] isEqual:@"DENIED"]);
            assert([[self.controller resourceService:@"resource.read.v1" arguments:args identity:@"dev.pjm.fixture" generation:801][@"error"][@"code"] isEqual:@"DENIED"]);
            chunk=[self.controller resourceService:@"resource.read.v1" arguments:@{@"handle":handle,@"offset":@(length),@"count":@1} identity:@"dev.pjm.fixture" generation:800];assert([chunk[@"data"][@"eof"] boolValue] && [chunk[@"data"][@"bodyBase64"] isEqual:@""]);
            if(attempt==0){assert([[self.controller resourceService:@"resource.release.v1" arguments:@{@"handle":handle} identity:@"dev.pjm.fixture" generation:800][@"ok"] boolValue]);assert([[self.controller resourceService:@"resource.read.v1" arguments:args identity:@"dev.pjm.fixture" generation:800][@"error"][@"code"] isEqual:@"DENIED"]);}
        }
        [self.controller cancelGeneration:800];assert([[self.controller valueForKey:@"resources"] count]==0);
    }
    NSLog(@"PJM_RESOURCE_PASS chunks ownership release retirement capacity overflow");
    NSDictionary *unicodeHeader=[self.controller startHTTP:@{@"url":@"https://example.com/",@"headers":@{@"Accept":@"é"}} identifier:@917 package:self.package generation:1];assert([unicodeHeader[@"error"][@"code"] isEqual:@"PROTOCOL"]);
    double now=NSProcessInfo.processInfo.systemUptime;for(NSUInteger i=0;i<32;i++)assert([self.controller admitHTTPRateForIdentity:@"dev.pjm.rate" time:now]);assert(![self.controller admitHTTPRateForIdentity:@"dev.pjm.rate" time:now]);
    MiniInstalledController *other=[MiniInstalledController new];assert(![other admitHTTPRateForIdentity:@"dev.pjm.rate" time:now+59.999]);assert([other admitHTTPRateForIdentity:@"dev.pjm.rate" time:now+60]);
    now+=121;for(NSUInteger i=0;i<64;i++){NSString *identity=[NSString stringWithFormat:@"dev.pjm.rate%lu",(unsigned long)i];assert([self.controller admitHTTPRateForIdentity:identity time:now]);}assert(![other admitHTTPRateForIdentity:@"dev.pjm.overflow" time:now]);assert([other admitHTTPRateForIdentity:@"dev.pjm.rate0" time:now]);assert([other admitHTTPRateForIdentity:@"dev.pjm.overflow" time:now+60]);NSLog(@"PJM_HTTP_RATE_PASS window=32 identities=64");
    NSDictionary *update=fixture[@"update"];assert(update);
    NSData *newPayload=[[NSData alloc] initWithBase64EncodedString:update[@"payload"] options:0];NSData *newEnvelope=[NSJSONSerialization dataWithJSONObject:update[@"manifest"] options:0 error:&error];
    assert([self.store stagePayload:newPayload envelope:newEnvelope error:&error]);self.package=nil;
    __weak SignedSurfaceApp *weakSelf=self;
    self.surface.onError=^(NSString *message){NSLog(@"PJM_SIGNED_SURFACE_FAILURE %@",message);exit(2);};
    self.surface.onVerifiedEffect=^(MiniVerifiedPackage *package,uint64_t generation,NSString *line){
        SignedSurfaceApp *owner=weakSelf;if(!owner.package)owner.package=package;owner.generation=generation;assert(package==owner.package && generation>0 && [package.metadata[@"version"] isEqual:@"1.0.0"]);
        if([line hasPrefix:@"reply:"]){NSDictionary *reply=[NSJSONSerialization JSONObjectWithData:[[line substringFromIndex:6] dataUsingEncoding:NSUTF8StringEncoding] options:0 error:nil];
            if([reply[@"id"] isEqual:@900]){assert([reply[@"ok"] boolValue]);NSDictionary *data=reply[@"data"];MpConfig config=package.config;assert([data[@"platform"] isEqual:@"ios"] && [data[@"model"] isKindOfClass:NSString.class] && [data[@"width"] unsignedIntValue]==config.width && [data[@"height"] unsignedIntValue]==config.height && [data[@"density"] unsignedIntValue]==config.density);
                for(NSString *key in @[@"safeTop",@"safeBottom",@"safeLeft",@"safeRight"])assert([data[key] isKindOfClass:NSNumber.class] && [data[key] doubleValue]==0);owner.deviceVerified=YES;
            }
            if([reply[@"id"] isEqual:@901]){assert([reply[@"ok"] boolValue] && [reply[@"data"][@"status"] isEqual:@200] && [reply[@"data"][@"bodyBase64"] isEqual:@"aGVsbG8="]);owner.httpReplies++;}
            if([reply[@"id"] isEqual:@902]){assert(![reply[@"ok"] boolValue] && [reply[@"error"][@"code"] isEqual:@"DENIED"]);owner.httpReplies++;}
            if([reply[@"id"] isEqual:@903]){assert(![reply[@"ok"] boolValue] && [reply[@"error"][@"code"] isEqual:@"FAILED"]);owner.httpReplies++;}
            if([reply[@"id"] isEqual:@906]){assert(![reply[@"ok"] boolValue] && [reply[@"error"][@"code"] isEqual:@"DENIED"]);owner.httpReplies++;}
            if([reply[@"id"] isEqual:@912]){assert(![reply[@"ok"] boolValue] && [reply[@"error"][@"code"] isEqual:@"BUSY"]);owner.httpReplies++;}
            if([reply[@"id"] isEqual:@915]){assert([reply[@"ok"] boolValue] && [reply[@"data"][@"bodyBase64"] length]==2048 && [[reply[@"data"][@"bodyBase64"] stringByTrimmingCharactersInSet:[NSCharacterSet characterSetWithCharactersInString:@"/"]] length]==0);owner.httpReplies++;}
            if([reply[@"id"] isEqual:@914]){assert(![reply[@"ok"] boolValue] && [reply[@"error"][@"code"] isEqual:@"PROTOCOL"]);owner.httpReplies++;}
        }
        if([line hasPrefix:@"verified:"]){owner.frames++;assert(([line isEqual:[NSString stringWithFormat:@"verified:1:%lu",(unsigned long)owner.frames]]));}
    };
    self.surface.onVerifiedCleanup=^(MiniVerifiedPackage *package,uint64_t generation,NSString *line){SignedSurfaceApp *owner=weakSelf;assert(package==owner.package && generation>0);NSLog(@"PJM_SIGNED_CLEANUP %@",line);if([line isEqual:@"cleanup"])owner.cleanup=YES;};
    void (^retirement)(MiniVerifiedPackage *,uint64_t)=self.surface.onVerifiedRetirement;
    self.surface.onVerifiedRetirement=^(MiniVerifiedPackage *package,uint64_t generation){SignedSurfaceApp *owner=weakSelf;assert(NSThread.isMainThread && owner.cleanup && package==owner.package && generation==owner.generation);retirement(package,generation);assert([[owner.controller valueForKey:@"requests"] count]==0);assert(++owner.retirements==1);NSLog(@"PJM_SIGNED_RETIREMENT generation=%llu",(unsigned long long)generation);};
    self.surface.onFrame=^(uint64_t frameNumber,NSUInteger contacts){
        (void)frameNumber;assert(contacts==0);SignedSurfaceApp *owner=weakSelf;
        if(owner.frames==1)[owner.controller dispatchService:@"{\"v\":1,\"id\":900,\"kind\":\"device.info.v1\",\"args\":{}}" package:owner.package generation:owner.generation];
        if(owner.frames==1){
            [owner.controller dispatchService:@"{\"v\":1,\"id\":914,\"kind\":\"request.v1\",\"args\":{\"url\":\"https://example.com/\",\"headers\":{\"Accept\":\"a\",\"accept\":\"b\"}}}" package:owner.package generation:owner.generation];
            NSArray *addresses=@[@"https://example.com/ok",@"https://denied.example/",@"https://example.com/large",@"https://example.com/hold"];
            for(NSUInteger i=0;i<addresses.count;i++){NSData *data=[NSJSONSerialization dataWithJSONObject:@{@"v":@1,@"id":@(901+i),@"kind":@"request.v1",@"args":@{@"url":addresses[i]}} options:0 error:nil];[owner.controller dispatchService:[[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding] package:owner.package generation:owner.generation];}
            NSString *taskKey=[NSString stringWithFormat:@"%llu:904",(unsigned long long)owner.generation];id work=[[owner.controller valueForKey:@"requests"] objectForKey:taskKey];assert(work);
            NSMutableURLRequest *redirect=[NSMutableURLRequest requestWithURL:[NSURL URLWithString:@"https://example.com/next"]];[redirect setValue:@"secret" forHTTPHeaderField:@"Authorization"];[redirect setValue:@"private=1" forHTTPHeaderField:@"Cookie"];
            NSHTTPURLResponse *redirectResponse=[[NSHTTPURLResponse alloc] initWithURL:redirect.URL statusCode:302 HTTPVersion:@"HTTP/1.1" headerFields:@{}];
            __block BOOL redirected=NO;
            [(id<NSURLSessionTaskDelegate>)work URLSession:[work valueForKey:@"session"] task:[work valueForKey:@"task"] willPerformHTTPRedirection:redirectResponse newRequest:redirect completionHandler:^(NSURLRequest *next){assert(next && ![next valueForHTTPHeaderField:@"Authorization"] && ![next valueForHTTPHeaderField:@"Cookie"]);redirected=YES;}];assert(redirected);
            [owner.controller dispatchService:@"{\"v\":1,\"id\":904,\"kind\":\"cancel.v1\",\"args\":{}}" package:owner.package generation:owner.generation];
            assert((![[owner.controller valueForKey:@"requests"] objectForKey:[NSString stringWithFormat:@"%llu:904",(unsigned long long)owner.generation]]));
            [owner.controller dispatchService:@"{\"v\":1,\"id\":906,\"kind\":\"request.v1\",\"args\":{\"url\":\"https://example.com/hold\"}}" package:owner.package generation:owner.generation];
            work=[[owner.controller valueForKey:@"requests"] objectForKey:[NSString stringWithFormat:@"%llu:906",(unsigned long long)owner.generation]];assert(work);redirect.URL=[NSURL URLWithString:@"https://denied.example/"];
            __block BOOL deniedRedirect=NO;
            [(id<NSURLSessionTaskDelegate>)work URLSession:[work valueForKey:@"session"] task:[work valueForKey:@"task"] willPerformHTTPRedirection:redirectResponse newRequest:redirect completionHandler:^(NSURLRequest *next){assert(!next);deniedRedirect=YES;}];assert(deniedRedirect);
            for(NSUInteger identifier=910;identifier<=912;identifier++){NSData *data=[NSJSONSerialization dataWithJSONObject:@{@"v":@1,@"id":@(identifier),@"kind":@"request.v1",@"args":@{@"url":@"https://example.com/hold"}} options:0 error:nil];[owner.controller dispatchService:[[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding] package:owner.package generation:owner.generation];}
            assert([[owner.controller valueForKey:@"requests"] count]==4);
            for(NSUInteger identifier=910;identifier<=911;identifier++){NSData *data=[NSJSONSerialization dataWithJSONObject:@{@"v":@1,@"id":@(identifier),@"kind":@"cancel.v1",@"args":@{}} options:0 error:nil];[owner.controller dispatchService:[[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding] package:owner.package generation:owner.generation];}
        }
        if(owner.frames==1)[owner.controller dispatchService:@"{\"v\":1,\"id\":915,\"kind\":\"request.v1\",\"args\":{\"url\":\"https://example.com/max\"}}" package:owner.package generation:owner.generation];
        if(owner.frames==1){[owner.surface stop];dispatch_after(dispatch_time(DISPATCH_TIME_NOW,25*NSEC_PER_MSEC),dispatch_get_main_queue(),^{[owner verifyBackpressure];});}
        if(owner.frames==1)NSLog(@"PJM_GEOMETRY surface=%@ root=%@ safe=%@ presenter=%@",NSStringFromCGRect(owner.surface.bounds),NSStringFromCGRect(owner.controller.view.bounds),NSStringFromCGRect(owner.controller.view.safeAreaLayoutGuide.layoutFrame),NSStringFromCGRect(owner.surface.subviews.firstObject.bounds));
        if(owner.frames==2 && !owner.warm){NSError *failure=nil;assert([owner.controller openIdentity:@"dev.pjm.fixture" launchData:owner.launch error:&failure]);owner.warm=YES;
            UIViewController *cover=[UIViewController new];cover.modalPresentationStyle=UIModalPresentationFullScreen;
            [owner.controller presentViewController:cover animated:NO completion:^{
                dispatch_after(dispatch_time(DISPATCH_TIME_NOW,150*NSEC_PER_MSEC),dispatch_get_main_queue(),^{
                    assert(owner.frames==2);[NSNotificationCenter.defaultCenter postNotificationName:UIApplicationWillEnterForegroundNotification object:nil];
                    dispatch_after(dispatch_time(DISPATCH_TIME_NOW,50*NSEC_PER_MSEC),dispatch_get_main_queue(),^{assert(owner.frames==2);owner.hiddenVerified=YES;[owner.controller dismissViewControllerAnimated:NO completion:nil];});
                });
            }];
        }
        assert(owner.frames<120);
        if(owner.frames>=4 && owner.surface.presentedHash!=0 && owner.httpReplies==7){assert(owner.warm && owner.hiddenVerified && owner.deviceVerified && owner.backpressureVerified && owner.retirements==0);NSLog(@"PJM_SIGNED_HTTP_PASS replies=%lu",(unsigned long)owner.httpReplies);[owner.controller dispatchService:@"{\"v\":1,\"id\":905,\"kind\":\"request.v1\",\"args\":{\"url\":\"https://example.com/hold\"}}" package:owner.package generation:owner.generation];assert([[owner.controller valueForKey:@"requests"] count]==1);while([owner.controller admitHTTPRateForIdentity:owner.package.metadata[@"appId"] time:NSProcessInfo.processInfo.systemUptime]){}NSDictionary *limited=[owner.controller startHTTP:@{@"url":@"https://example.com/ok"} identifier:@916 package:owner.package generation:owner.generation];assert([limited[@"error"][@"code"] isEqual:@"BUSY"] && [limited[@"error"][@"message"] containsString:@"rate limit"]);[owner.surface shutdown];assert(owner.cleanup && owner.retirements==1);[owner.surface shutdown];assert(owner.retirements==1);NSError *failure=nil;MiniVerifiedPackage *cold=[owner.store coldStart:@"dev.pjm.fixture" error:&failure];assert(cold && [cold.metadata[@"version"] isEqual:@"2.0.0"] && [owner.package.metadata[@"version"] isEqual:@"1.0.0"]);NSLog(@"PJM_SIGNED_SURFACE_PASS frames=%lu hash=%u",(unsigned long)owner.frames,owner.surface.presentedHash);exit(0);}
    };
    self.window=[[UIWindow alloc] initWithFrame:UIScreen.mainScreen.bounds];self.window.rootViewController=self.controller;[self.window makeKeyAndVisible];return YES;
}
@end
int main(int argc,char **argv){@autoreleasepool{return UIApplicationMain(argc,argv,nil,NSStringFromClass(SignedSurfaceApp.class));}}
