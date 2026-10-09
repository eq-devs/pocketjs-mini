// Simulator integration harness; not included in the shipping host.
#import <UIKit/UIKit.h>
#import "PocketSurfaceView.h"
#import "InstalledController.h"
#import "VerifiedLocation.h"
#import <CoreLocation/CoreLocation.h>
#include <assert.h>
@interface MiniVerifiedLocation (LocationTestHooks)
- (BOOL)foreground;
- (CLLocationManager *)makeManager;
@end
@interface SurfaceLocationManager : CLLocationManager
@property CLAuthorizationStatus testStatus;
@property CLLocation *testLocation;
@property BOOL waitForCompletion;
@property NSUInteger requests;
@property(nonatomic,weak) id<CLLocationManagerDelegate> capturedDelegate;
@end
@implementation SurfaceLocationManager
- (CLAuthorizationStatus)authorizationStatus {return _testStatus;}
- (CLLocation *)location {return _testLocation;}
- (void)requestWhenInUseAuthorization {}
- (void)requestLocation {_requests++;_capturedDelegate=self.delegate;if(!_waitForCompletion&&_testLocation){CLLocation *fix=[[CLLocation alloc] initWithCoordinate:_testLocation.coordinate altitude:_testLocation.altitude horizontalAccuracy:_testLocation.horizontalAccuracy verticalAccuracy:_testLocation.verticalAccuracy timestamp:[NSDate date]];[self.delegate locationManager:self didUpdateLocations:@[fix]];}}
- (void)stopUpdatingLocation {}
@end
@interface SurfaceLocationService : MiniVerifiedLocation
@property SurfaceLocationManager *nextManager;
@property BOOL visible;
@end
@implementation SurfaceLocationService
- (BOOL)foreground {return _visible;}
- (CLLocationManager *)makeManager {SurfaceLocationManager *manager=_nextManager;_nextManager=nil;return manager;}
@end
@interface SurfaceRealLocationService : MiniVerifiedLocation
@end
@implementation SurfaceRealLocationService
- (BOOL)foreground {return YES;}
@end
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
- (void)dispatchService:(NSString *)line package:(MiniVerifiedPackage *)package generation:(uint64_t)generation {if([line containsString:@"location.get.v1"])NSLog(@"PJM_LOCATION_SDK_REQUEST %@",line);[super dispatchService:line package:package generation:generation];}
@end
@interface SignedSurfaceApp : UIResponder <UIApplicationDelegate>
@property(nonatomic) UIWindow *window;
@property PocketSurfaceView *surface;
@property MiniInstalledController *controller;
@property MiniVerifiedPackage *package;
@property MiniVerifiedPackage *locationPackage;
@property NSData *launch;
@property MiniPackageStore *store;
@property NSUInteger frames;
@property NSUInteger serviceFrames;
@property BOOL warm;
@property BOOL cleanup;
@property BOOL hiddenVerified;
@property BOOL deviceVerified;
@property uint64_t generation;
@property NSUInteger retirements;
@property NSUInteger httpReplies;
@property BOOL backpressureVerified;
@property BOOL locationSdkVerified;
@property BOOL locationLimitsVerified;
@property NSUInteger pressureAttempts;
@end
@implementation SignedSurfaceApp
- (NSDictionary *)drainLocation:(MiniVerifiedLocation *)service package:(MiniVerifiedPackage *)package generation:(uint64_t)generation {
    __block NSDictionary *result=nil;[service drain:^BOOL(MiniVerifiedPackage *bound,uint64_t boundGeneration,NSString *reply){assert(bound==package&&boundGeneration==generation);result=[NSJSONSerialization JSONObjectWithData:[reply dataUsingEncoding:NSUTF8StringEncoding] options:0 error:nil];return YES;}];return result;
}
- (void)verifyLocation:(NSDictionary *)fixture root:(NSString *)root key:(NSData *)key {
    NSDictionary *locationCase=fixture[@"locationCase"];assert(locationCase);NSError *error=nil;
    NSData *payload=[[NSData alloc] initWithBase64EncodedString:locationCase[@"payload"] options:0];NSData *envelope=[NSJSONSerialization dataWithJSONObject:locationCase[@"manifest"] options:0 error:&error];
    MiniVerifiedPackage *package=[[MiniVerifiedPackage alloc] initWithPayload:payload envelope:envelope trustedKey:key error:&error];assert(package&&!error);self.locationPackage=package;assert([self.store setPermissionDecision:YES permission:@"location" identity:package.metadata[@"appId"] error:&error]);assert([self.store setPermissionDecision:YES permission:@"clipboard.read" identity:package.metadata[@"appId"] error:&error]);
    SurfaceLocationService *service=[[SurfaceLocationService alloc] initWithStore:self.store presenter:self.controller];service.visible=YES;
    NSDictionary *args=@{@"timeoutMs":@15000,@"maximumAgeMs":@0,@"highAccuracy":@YES};
    SurfaceLocationManager *fresh=[SurfaceLocationManager new];fresh.testStatus=kCLAuthorizationStatusAuthorizedWhenInUse;fresh.testLocation=[[CLLocation alloc] initWithCoordinate:CLLocationCoordinate2DMake(43.238949,76.889709) altitude:700 horizontalAccuracy:4 verticalAccuracy:8 timestamp:[NSDate date]];service.nextManager=fresh;
    assert(![service start:args identifier:@41 package:package generation:71]);NSDictionary *reply=[self drainLocation:service package:package generation:71];NSLog(@"PJM_LOCATION_FRESH reply=%@ requests=%lu",reply,(unsigned long)fresh.requests);assert([reply[@"ok"] boolValue]&&[reply[@"id"] isEqual:@41]&&fresh.requests==1);assert(fabs([reply[@"data"][@"latitude"] doubleValue]-43.238949)<1e-8&&fabs([reply[@"data"][@"longitude"] doubleValue]-76.889709)<1e-8&&[reply[@"data"][@"accuracyMeters"] doubleValue]==4);
    SurfaceLocationManager *denied=[SurfaceLocationManager new];denied.testStatus=kCLAuthorizationStatusDenied;service.nextManager=denied;assert(![service start:args identifier:@42 package:package generation:72]);reply=[self drainLocation:service package:package generation:72];assert([reply[@"error"][@"code"] isEqual:@"DENIED"]&&denied.requests==0);
    SurfaceLocationManager *cached=[SurfaceLocationManager new];cached.testStatus=kCLAuthorizationStatusAuthorizedWhenInUse;cached.testLocation=fresh.testLocation;service.nextManager=cached;NSDictionary *cachedArgs=@{@"timeoutMs":@15000,@"maximumAgeMs":@1000,@"highAccuracy":@NO};assert(![service start:cachedArgs identifier:@46 package:package generation:76]);reply=[self drainLocation:service package:package generation:76];assert([reply[@"ok"] boolValue]&&cached.requests==0);
    SurfaceLocationManager *pending=[SurfaceLocationManager new];pending.testStatus=kCLAuthorizationStatusAuthorizedWhenInUse;pending.testLocation=fresh.testLocation;pending.waitForCompletion=YES;service.nextManager=pending;assert(![service start:args identifier:@43 package:package generation:73]);id<CLLocationManagerDelegate> stale=pending.capturedDelegate;assert(stale&&pending.requests==1);[service cancelGeneration:73 identifier:@43];[stale locationManager:pending didUpdateLocations:@[pending.testLocation]];assert(![self drainLocation:service package:package generation:73]);
    service.visible=NO;reply=[service start:args identifier:@44 package:package generation:74];assert([reply[@"error"][@"code"] isEqual:@"BUSY"]);
    service.visible=YES;SurfaceLocationManager *timed=[SurfaceLocationManager new];timed.testStatus=kCLAuthorizationStatusAuthorizedWhenInUse;timed.waitForCompletion=YES;service.nextManager=timed;NSDictionary *timeoutArgs=@{@"timeoutMs":@1,@"maximumAgeMs":@0,@"highAccuracy":@NO};assert(![service start:timeoutArgs identifier:@47 package:package generation:77]);reply=nil;NSDate *until=[NSDate dateWithTimeIntervalSinceNow:.05];while([until timeIntervalSinceNow]>0&&!reply){[NSRunLoop.mainRunLoop runMode:NSDefaultRunLoopMode beforeDate:[NSDate dateWithTimeIntervalSinceNow:.005]];reply=[self drainLocation:service package:package generation:77];}assert([reply[@"error"][@"code"] isEqual:@"TIMEOUT"]);
    reply=[service start:@{@"timeoutMs":@0,@"maximumAgeMs":@0,@"highAccuracy":@NO} identifier:@45 package:package generation:75];assert([reply[@"error"][@"code"] isEqual:@"PROTOCOL"]);
    [service close];NSLog(@"PJM_LOCATION_PASS fresh cached denial timeout cancellation stale-callback lifecycle protocol");
    SurfaceRealLocationService *real=[[SurfaceRealLocationService alloc] initWithStore:self.store presenter:self.controller];NSDictionary *realArgs=@{@"timeoutMs":@5000,@"maximumAgeMs":@60000,@"highAccuracy":@NO};assert(![real start:realArgs identifier:@48 package:package generation:78]);reply=nil;until=[NSDate dateWithTimeIntervalSinceNow:6];while([until timeIntervalSinceNow]>0&&!reply){[NSRunLoop.mainRunLoop runMode:NSDefaultRunLoopMode beforeDate:[NSDate dateWithTimeIntervalSinceNow:.05]];reply=[self drainLocation:real package:package generation:78];}NSLog(@"PJM_LOCATION_REAL reply=%@",reply);assert([reply[@"ok"] boolValue]);assert(fabs([reply[@"data"][@"latitude"] doubleValue]-43.238949)<.001&&fabs([reply[@"data"][@"longitude"] doubleValue]-76.889709)<.001);[real close];NSLog(@"PJM_LOCATION_REAL_PASS CoreLocation simulated-coordinate");
    (void)root;
}
- (void)verifyLocationLimits {
    MiniVerifiedPackage *package=self.locationPackage;assert(package);NSDictionary *args=@{@"timeoutMs":@15000,@"maximumAgeMs":@0,@"highAccuracy":@YES};NSDictionary *reply=nil;SurfaceLocationService *limits=[[SurfaceLocationService alloc] initWithStore:self.store presenter:self.controller];limits.visible=YES;NSMutableArray<SurfaceLocationManager *> *held=[NSMutableArray new];
    for(NSUInteger index=0;index<4;index++){SurfaceLocationManager *manager=[SurfaceLocationManager new];manager.testStatus=kCLAuthorizationStatusAuthorizedWhenInUse;manager.waitForCompletion=YES;limits.nextManager=manager;assert(![limits start:args identifier:@(100+index) package:package generation:80]);[held addObject:manager];}
    reply=[limits start:args identifier:@104 package:package generation:80];assert([reply[@"error"][@"code"] isEqual:@"BUSY"]);
    for(NSUInteger index=0;index<4;index++){SurfaceLocationManager *manager=[SurfaceLocationManager new];manager.testStatus=kCLAuthorizationStatusAuthorizedWhenInUse;manager.waitForCompletion=YES;limits.nextManager=manager;assert(![limits start:args identifier:@(110+index) package:package generation:81]);[held addObject:manager];}
    reply=[limits start:args identifier:@120 package:package generation:82];assert([reply[@"error"][@"code"] isEqual:@"BUSY"]);[limits retireGeneration:80];[limits retireGeneration:81];
    SurfaceLocationManager *denied=[SurfaceLocationManager new];denied.testStatus=kCLAuthorizationStatusDenied;limits.nextManager=denied;assert(![limits start:args identifier:@130 package:package generation:83]);assert([[self drainLocation:limits package:package generation:83][@"error"][@"code"] isEqual:@"DENIED"]);
    SurfaceLocationService *peer=[[SurfaceLocationService alloc] initWithStore:self.store presenter:self.controller];peer.visible=YES;SurfaceLocationManager *rateManager=[SurfaceLocationManager new];rateManager.testStatus=kCLAuthorizationStatusDenied;peer.nextManager=rateManager;reply=[peer start:args identifier:@140 package:package generation:90];assert([reply[@"error"][@"code"] isEqual:@"BUSY"]&&rateManager.requests==0);[limits close];[peer close];self.locationLimitsVerified=YES;NSLog(@"PJM_LOCATION_LIMITS_PASS generation=4 instance=8 process-rate=16 shared");
}
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
    [self verifyLocation:fixture root:root key:key];
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
    void (^serviceDispatch)(MiniVerifiedPackage *,uint64_t,NSString *)=self.surface.onVerifiedEffect;
    self.surface.onVerifiedEffect=^(MiniVerifiedPackage *package,uint64_t generation,NSString *line){
        SignedSurfaceApp *owner=weakSelf;if(!owner.package)owner.package=package;owner.generation=generation;assert(package==owner.package && generation>0 && [package.metadata[@"version"] isEqual:@"1.0.0"]);
        if([line hasPrefix:@"{"]){serviceDispatch(package,generation,line);return;}
        if([line hasPrefix:@"location-sdk-error:"]){NSLog(@"PJM_LOCATION_SDK_ERROR %@",line);assert(false);}
        if([line hasPrefix:@"location-sdk-pass:"]){assert(!owner.locationSdkVerified&&[line hasSuffix:@":clipboard"]);owner.locationSdkVerified=YES;NSLog(@"PJM_LOCATION_SDK_PASS %@",line);NSLog(@"PJM_CLIPBOARD_SDK_PASS write-read-frame-path");[owner verifyLocationLimits];}
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
        assert(owner.frames<120);if(!owner.locationSdkVerified)return;owner.serviceFrames++;
        if(owner.serviceFrames==1)[owner.controller dispatchService:@"{\"v\":1,\"id\":900,\"kind\":\"device.info.v1\",\"args\":{}}" package:owner.package generation:owner.generation];
        if(owner.serviceFrames==1){
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
        if(owner.serviceFrames==1)[owner.controller dispatchService:@"{\"v\":1,\"id\":915,\"kind\":\"request.v1\",\"args\":{\"url\":\"https://example.com/max\"}}" package:owner.package generation:owner.generation];
        if(owner.serviceFrames==1){[owner.surface stop];dispatch_after(dispatch_time(DISPATCH_TIME_NOW,25*NSEC_PER_MSEC),dispatch_get_main_queue(),^{[owner verifyBackpressure];});}
        if(owner.serviceFrames==1)NSLog(@"PJM_GEOMETRY surface=%@ root=%@ safe=%@ presenter=%@",NSStringFromCGRect(owner.surface.bounds),NSStringFromCGRect(owner.controller.view.bounds),NSStringFromCGRect(owner.controller.view.safeAreaLayoutGuide.layoutFrame),NSStringFromCGRect(owner.surface.subviews.firstObject.bounds));
        if(owner.serviceFrames==2 && !owner.warm){NSError *failure=nil;assert([owner.controller openIdentity:@"dev.pjm.fixture" launchData:owner.launch error:&failure]);owner.warm=YES;
            UIViewController *cover=[UIViewController new];cover.modalPresentationStyle=UIModalPresentationFullScreen;
            [owner.controller presentViewController:cover animated:NO completion:^{
                dispatch_after(dispatch_time(DISPATCH_TIME_NOW,150*NSEC_PER_MSEC),dispatch_get_main_queue(),^{
                    assert(owner.serviceFrames==2);[NSNotificationCenter.defaultCenter postNotificationName:UIApplicationWillEnterForegroundNotification object:nil];
                    dispatch_after(dispatch_time(DISPATCH_TIME_NOW,50*NSEC_PER_MSEC),dispatch_get_main_queue(),^{assert(owner.serviceFrames==2);owner.hiddenVerified=YES;[owner.controller dismissViewControllerAnimated:NO completion:nil];});
                });
            }];
        }
        if(owner.serviceFrames>=4 && owner.surface.presentedHash!=0 && owner.httpReplies==7 && owner.locationLimitsVerified){assert(owner.warm && owner.hiddenVerified && owner.deviceVerified && owner.backpressureVerified && owner.retirements==0);NSLog(@"PJM_SIGNED_HTTP_PASS replies=%lu",(unsigned long)owner.httpReplies);[owner.controller dispatchService:@"{\"v\":1,\"id\":905,\"kind\":\"request.v1\",\"args\":{\"url\":\"https://example.com/hold\"}}" package:owner.package generation:owner.generation];assert([[owner.controller valueForKey:@"requests"] count]==1);while([owner.controller admitHTTPRateForIdentity:owner.package.metadata[@"appId"] time:NSProcessInfo.processInfo.systemUptime]){}NSDictionary *limited=[owner.controller startHTTP:@{@"url":@"https://example.com/ok"} identifier:@916 package:owner.package generation:owner.generation];assert([limited[@"error"][@"code"] isEqual:@"BUSY"] && [limited[@"error"][@"message"] containsString:@"rate limit"]);[owner.surface shutdown];assert(owner.cleanup && owner.retirements==1);[owner.surface shutdown];assert(owner.retirements==1);NSError *failure=nil;MiniVerifiedPackage *cold=[owner.store coldStart:@"dev.pjm.fixture" error:&failure];assert(cold && [cold.metadata[@"version"] isEqual:@"2.0.0"] && [owner.package.metadata[@"version"] isEqual:@"1.0.0"]);NSLog(@"PJM_SIGNED_SURFACE_PASS frames=%lu hash=%u",(unsigned long)owner.frames,owner.surface.presentedHash);exit(0);}
    };
    self.window=[[UIWindow alloc] initWithFrame:UIScreen.mainScreen.bounds];self.window.rootViewController=self.controller;[self.window makeKeyAndVisible];return YES;
}
@end
int main(int argc,char **argv){@autoreleasepool{return UIApplicationMain(argc,argv,nil,NSStringFromClass(SignedSurfaceApp.class));}}
