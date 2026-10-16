#import "VerifiedLocation.h"
#import <CoreLocation/CoreLocation.h>

static BOOL MiniLocationInteger(id value,double low,double high) {
    if(![value isKindOfClass:NSNumber.class] || CFGetTypeID((__bridge CFTypeRef)value)==CFBooleanGetTypeID())return NO;
    double number=[value doubleValue];return isfinite(number)&&floor(number)==number&&number>=low&&number<=high;
}
static BOOL MiniLocationRate(NSString *identity,double now) {
    static NSMutableDictionary<NSString *,NSMutableArray<NSNumber *> *> *rates;static dispatch_once_t once;dispatch_once(&once,^{rates=[NSMutableDictionary new];});
    @synchronized(rates){
        for(NSString *key in [rates.allKeys copy]){NSMutableArray<NSNumber *> *times=rates[key];while(times.count&&[times.firstObject doubleValue]<=now-60)[times removeObjectAtIndex:0];if(!times.count)[rates removeObjectForKey:key];}
        NSMutableArray *times=rates[identity];if(!times){if(rates.count>=64)return NO;times=[NSMutableArray new];rates[identity]=times;}if(times.count>=16)return NO;[times addObject:@(now)];return YES;
    }
}
@class MiniVerifiedLocation;
@interface MiniLocationWork : NSObject <CLLocationManagerDelegate>
@property(nonatomic,weak) MiniVerifiedLocation *owner;
@property MiniVerifiedPackage *package;
@property NSString *identity;
@property uint64_t generation;
@property NSNumber *identifier;
@property NSString *key;
@property CLLocationManager *manager;
@property NSTimer *timer;
@property UIAlertController *alert;
@property NSDate *startedDate;
@property double started;
@property NSUInteger maximumAge;
@property BOOL highAccuracy,finished,awaitingAuthorization,authorizationReady;
@property NSString *reply;
@end
@interface MiniVerifiedLocation ()
@property MiniPackageStore *store;
@property(nonatomic,weak) UIViewController *presenter;
@property NSMutableDictionary<NSString *,MiniLocationWork *> *works;
@property BOOL suspended,closed;
@property NSString *developmentIdentity;
@property BOOL developmentDeclared;
- (BOOL)foreground;
- (void)authorized:(MiniLocationWork *)work;
- (void)locations:(NSArray<CLLocation *> *)locations work:(MiniLocationWork *)work;
- (void)finish:(MiniLocationWork *)work code:(nullable NSString *)code position:(nullable NSDictionary *)position;
@end
@implementation MiniLocationWork
- (void)locationManagerDidChangeAuthorization:(CLLocationManager *)manager {
    if(_finished)return;CLAuthorizationStatus status=manager.authorizationStatus;
    if(_awaitingAuthorization&&status==kCLAuthorizationStatusNotDetermined)return;
    if(status==kCLAuthorizationStatusAuthorizedWhenInUse||status==kCLAuthorizationStatusAuthorizedAlways){if(!_awaitingAuthorization)return;_awaitingAuthorization=NO;if([_owner foreground])[_owner authorized:self];else _authorizationReady=YES;}
    else {_awaitingAuthorization=NO;[_owner finish:self code:@"DENIED" position:nil];}
}
- (void)locationManager:(CLLocationManager *)manager didUpdateLocations:(NSArray<CLLocation *> *)locations {(void)manager;[_owner locations:locations work:self];}
- (void)locationManager:(CLLocationManager *)manager didFailWithError:(NSError *)error {(void)manager;[_owner finish:self code:error.code==kCLErrorDenied?@"DENIED":error.code==kCLErrorLocationUnknown?@"TIMEOUT":@"FAILED" position:nil];}
- (void)cancel {if(_finished)return;_finished=YES;[_timer invalidate];_timer=nil;[_alert dismissViewControllerAnimated:NO completion:nil];_alert=nil;[_manager stopUpdatingLocation];_manager.delegate=nil;_manager=nil;}
@end
@implementation MiniVerifiedLocation
- (instancetype)initWithStore:(MiniPackageStore *)store presenter:(UIViewController *)presenter {if((self=[super init])){_store=store;_presenter=presenter;_works=[NSMutableDictionary new];[NSNotificationCenter.defaultCenter addObserver:self selector:@selector(authorizationActivated) name:UIApplicationDidBecomeActiveNotification object:nil];}return self;}
- (nullable instancetype)initDevelopmentWithIdentity:(NSString *)identity declared:(BOOL)declared presenter:(UIViewController *)presenter {
    if(![identity isKindOfClass:NSString.class] || !identity.length || identity.length>128 || [identity rangeOfString:@"^[A-Za-z0-9][A-Za-z0-9._-]*$" options:NSRegularExpressionSearch].length!=identity.length)return nil;
    if((self=[super init])){_developmentIdentity=[identity copy];_developmentDeclared=declared;_presenter=presenter;_works=[NSMutableDictionary new];
        [NSNotificationCenter.defaultCenter addObserver:self selector:@selector(suspend) name:UIApplicationDidEnterBackgroundNotification object:nil];
        [NSNotificationCenter.defaultCenter addObserver:self selector:@selector(resume) name:UIApplicationDidBecomeActiveNotification object:nil];
    }return self;
}
- (NSNumber *)decisionForIdentity:(NSString *)identity error:(NSError **)error {
    if(!_developmentIdentity)return [_store permissionDecision:@"location" identity:identity error:error];
    id values=[NSUserDefaults.standardUserDefaults objectForKey:@"pjm-development-location-consent"];
    id value=[values isKindOfClass:NSDictionary.class]?values[identity]:nil;
    return [value isKindOfClass:NSNumber.class] && CFGetTypeID((__bridge CFTypeRef)value)==CFBooleanGetTypeID()?value:nil;
}
- (BOOL)setDecision:(BOOL)approved identity:(NSString *)identity error:(NSError **)error {
    if(!_developmentIdentity)return [_store setPermissionDecision:approved permission:@"location" identity:identity error:error];
    id saved=[NSUserDefaults.standardUserDefaults objectForKey:@"pjm-development-location-consent"];
    NSMutableDictionary *values=[saved isKindOfClass:NSDictionary.class]?[saved mutableCopy]:[NSMutableDictionary new];
    if(!values[identity] && values.count>=64)return NO;
    values[identity]=@(approved);[NSUserDefaults.standardUserDefaults setObject:values forKey:@"pjm-development-location-consent"];return YES;
}
- (nullable NSDictionary *)startDevelopment:(id)arguments identifier:(NSNumber *)identifier generation:(uint64_t)generation {
    if(!_developmentIdentity)return [self failure:@"DENIED"];
    return [self startCommon:arguments identifier:identifier package:nil generation:generation];
}
- (nullable NSDictionary *)start:(id)arguments identifier:(NSNumber *)identifier package:(MiniVerifiedPackage *)package generation:(uint64_t)generation {
    if(_developmentIdentity || !package)return [self failure:@"DENIED"];
    return [self startCommon:arguments identifier:identifier package:package generation:generation];
}
- (CLLocationManager *)makeManager {return [CLLocationManager new];}
- (BOOL)foreground {return !_suspended&&!_closed&&UIApplication.sharedApplication.applicationState==UIApplicationStateActive&&_presenter.viewIfLoaded.window!=nil;}
- (NSDictionary *)failure:(NSString *)code {return @{@"ok":@NO,@"error":@{@"code":code,@"message":@"Location request rejected"}};}
- (nullable NSDictionary *)startCommon:(id)arguments identifier:(NSNumber *)identifier package:(MiniVerifiedPackage *)package generation:(uint64_t)generation {
    NSAssert(NSThread.isMainThread,@"Location requires main owner");if(_closed)return [self failure:@"CLOSED"];
    if(![arguments isKindOfClass:NSDictionary.class]||[arguments count]!=3)return [self failure:@"PROTOCOL"];NSDictionary *args=arguments;
    if(!MiniLocationInteger(args[@"timeoutMs"],1,15000)||!MiniLocationInteger(args[@"maximumAgeMs"],0,60000)||![args[@"highAccuracy"] isKindOfClass:NSNumber.class]||CFGetTypeID((__bridge CFTypeRef)args[@"highAccuracy"])!=CFBooleanGetTypeID())return [self failure:@"PROTOCOL"];
    NSString *identity=package?package.metadata[@"appId"]:_developmentIdentity;
    NSError *error=nil;if(package?![package authorizePermission:@"location" hostGranted:YES error:&error]:!_developmentDeclared)return [self failure:@"DENIED"];
    if(![self foreground])return [self failure:@"BUSY"];NSString *key=[NSString stringWithFormat:@"%llu:%@",(unsigned long long)generation,identifier];NSUInteger count=0;for(MiniLocationWork *item in _works.allValues)if(item.generation==generation)count++;
    if(_works[key]||_works.count>=8||count>=4)return [self failure:@"BUSY"];if(!MiniLocationRate(identity,NSProcessInfo.processInfo.systemUptime))return [self failure:@"BUSY"];
    MiniLocationWork *work=[MiniLocationWork new];work.owner=self;work.package=package;work.identity=identity;work.generation=generation;work.identifier=identifier;work.key=key;work.started=NSProcessInfo.processInfo.systemUptime;work.startedDate=[NSDate date];work.maximumAge=[args[@"maximumAgeMs"] unsignedIntegerValue];work.highAccuracy=[args[@"highAccuracy"] boolValue];_works[key]=work;
    __weak MiniVerifiedLocation *weakSelf=self;__weak MiniLocationWork *weakWork=work;work.timer=[NSTimer timerWithTimeInterval:[args[@"timeoutMs"] doubleValue]/1000.0 repeats:NO block:^(NSTimer *timer){(void)timer;MiniLocationWork *bound=weakWork;if(bound)[weakSelf finish:bound code:@"TIMEOUT" position:nil];}];[NSRunLoop.mainRunLoop addTimer:work.timer forMode:NSRunLoopCommonModes];
    NSNumber *decision=[self decisionForIdentity:identity error:&error];if(error){[self finish:work code:@"FAILED" position:nil];return nil;}if(decision&&!decision.boolValue){[self finish:work code:@"DENIED" position:nil];return nil;}
    void (^continueAuthorization)(void)=^{MiniVerifiedLocation *owner=weakSelf;MiniLocationWork *bound=weakWork;if(!owner||!bound||bound.finished||owner.works[key]!=bound||![owner foreground]){if(bound)[owner finish:bound code:@"BUSY" position:nil];return;}if(!bound.manager){bound.manager=[owner makeManager];bound.manager.delegate=bound;}CLAuthorizationStatus status=bound.manager.authorizationStatus;if(status==kCLAuthorizationStatusAuthorizedWhenInUse||status==kCLAuthorizationStatusAuthorizedAlways)[owner authorized:bound];else if(status==kCLAuthorizationStatusNotDetermined){bound.awaitingAuthorization=YES;[bound.manager requestWhenInUseAuthorization];}else [owner finish:bound code:@"DENIED" position:nil];};
    if(decision.boolValue){continueAuthorization();return nil;}if(_presenter.presentedViewController){[self finish:work code:@"BUSY" position:nil];return nil;}
    UIAlertController *alert=[UIAlertController alertControllerWithTitle:@"Location access" message:[NSString stringWithFormat:@"Allow %@ to request your location?",identity] preferredStyle:UIAlertControllerStyleAlert];work.alert=alert;
    void (^decide)(BOOL)=^(BOOL approved){MiniVerifiedLocation *owner=weakSelf;MiniLocationWork *bound=weakWork;if(!owner||!bound||bound.finished||owner.works[key]!=bound)return;bound.alert=nil;if(![owner foreground]){[owner finish:bound code:@"BUSY" position:nil];return;}NSError *failure=nil;if(![owner setDecision:approved identity:bound.identity error:&failure]){[owner finish:bound code:@"FAILED" position:nil];return;}if(!approved){[owner finish:bound code:@"DENIED" position:nil];return;}continueAuthorization();};
    [alert addAction:[UIAlertAction actionWithTitle:@"Don’t allow" style:UIAlertActionStyleCancel handler:^(UIAlertAction *action){(void)action;decide(NO);}]];[alert addAction:[UIAlertAction actionWithTitle:@"Allow" style:UIAlertActionStyleDefault handler:^(UIAlertAction *action){(void)action;decide(YES);}]];[_presenter presentViewController:alert animated:YES completion:nil];return nil;
}
// Recheck both approval layers at position delivery, not only at admission.
// Core Location can enqueue a fix before its authorization-change callback.
- (BOOL)permissionReady:(MiniLocationWork *)work {
 NSError *error=nil;
 if(work.package?[_store permissionStatus:@"location" package:work.package osGranted:YES error:&error]!=MiniPermissionGranted:(!_developmentDeclared||![[self decisionForIdentity:work.identity error:&error] boolValue])){[self finish:work code:error?@"FAILED":@"DENIED" position:nil];return NO;}
 CLAuthorizationStatus status=work.manager.authorizationStatus;
 if(status!=kCLAuthorizationStatusAuthorizedWhenInUse&&status!=kCLAuthorizationStatusAuthorizedAlways){[self finish:work code:@"DENIED" position:nil];return NO;}
 return YES;
}
- (void)authorized:(MiniLocationWork *)work {if(work.finished||_works[work.key]!=work)return;if(![self foreground]){[self finish:work code:@"BUSY" position:nil];return;}if(!work.manager){work.manager=[self makeManager];work.manager.delegate=work;}if(![self permissionReady:work])return;work.manager.desiredAccuracy=work.highAccuracy?kCLLocationAccuracyBest:kCLLocationAccuracyHundredMeters;work.manager.distanceFilter=kCLDistanceFilterNone;
    CLLocation *cached=work.manager.location;if(cached&&work.maximumAge>0&&cached.horizontalAccuracy>=0&&-[cached.timestamp timeIntervalSinceNow]*1000.0<=work.maximumAge){[self locations:@[cached] work:work];return;}[work.manager requestLocation];}
- (void)locations:(NSArray<CLLocation *> *)locations work:(MiniLocationWork *)work {if(work.finished||_works[work.key]!=work)return;if(![self foreground]){[self finish:work code:@"BUSY" position:nil];return;}if(![self permissionReady:work])return;CLLocation *location=locations.lastObject;if(!location){[self finish:work code:@"TIMEOUT" position:nil];return;}double age=-[location.timestamp timeIntervalSinceNow]*1000.0;if(age<0)age=0;if((work.maximumAge==0&&[location.timestamp compare:work.startedDate]==NSOrderedAscending)||(work.maximumAge>0&&age>work.maximumAge)){[self finish:work code:@"TIMEOUT" position:nil];return;}double lat=location.coordinate.latitude,lon=location.coordinate.longitude,accuracy=location.horizontalAccuracy,timestamp=floor(location.timestamp.timeIntervalSince1970*1000.0);if(!isfinite(lat)||!isfinite(lon)||!isfinite(accuracy)||lat< -90||lat>90||lon< -180||lon>180||accuracy<0||timestamp<0||timestamp>9007199254740991.0){[self finish:work code:@"FAILED" position:nil];return;}[self finish:work code:nil position:@{@"latitude":@(lat),@"longitude":@(lon),@"accuracyMeters":@(accuracy),@"timestampMs":@(timestamp)}];}
- (void)finish:(MiniLocationWork *)work code:(nullable NSString *)code position:(nullable NSDictionary *)position {if(work.finished||_works[work.key]!=work)return;[work.timer invalidate];work.timer=nil;[work.alert dismissViewControllerAnimated:NO completion:nil];work.alert=nil;[work.manager stopUpdatingLocation];work.manager.delegate=nil;work.manager=nil;work.finished=YES;NSMutableDictionary *reply=[@{@"v":@1,@"id":work.identifier,@"ok":code?@NO:@YES} mutableCopy];if(code)reply[@"error"]=@{@"code":code,@"message":@"Location request rejected"};else reply[@"data"]=position?:NSNull.null;NSData *bytes=[NSJSONSerialization dataWithJSONObject:reply options:NSJSONWritingWithoutEscapingSlashes error:nil];work.reply=bytes.length<=4096?[[NSString alloc] initWithData:bytes encoding:NSUTF8StringEncoding]:nil;}
- (void)drain:(BOOL (^)(MiniVerifiedPackage *,uint64_t,NSString *))receiver {for(NSString *key in [_works.allKeys copy]){MiniLocationWork *work=_works[key];if(work.package&&work.reply&&receiver(work.package,work.generation,work.reply))[_works removeObjectForKey:key];}}
- (void)drainDevelopment:(BOOL (^)(NSString *,uint64_t,NSString *))receiver {if(!_developmentIdentity)return;for(NSString *key in [_works.allKeys copy]){MiniLocationWork *work=_works[key];if(!work.package&&work.reply&&receiver(work.identity,work.generation,work.reply))[_works removeObjectForKey:key];}}
- (void)cancelGeneration:(uint64_t)generation identifier:(NSNumber *)identifier {NSString *key=[NSString stringWithFormat:@"%llu:%@",(unsigned long long)generation,identifier];MiniLocationWork *work=_works[key];[work cancel];[_works removeObjectForKey:key];}
- (void)retireGeneration:(uint64_t)generation {for(NSString *key in [_works.allKeys copy])if(_works[key].generation==generation){[_works[key] cancel];[_works removeObjectForKey:key];}}
- (void)suspend {if(_closed)return;_suspended=YES;for(MiniLocationWork *work in _works.allValues)if(!work.reply)[self finish:work code:@"BUSY" position:nil];}
- (void)authorizationActivated {if(!_suspended)[self resume];}
- (void)resume {if(_closed)return;_suspended=NO;for(MiniLocationWork *work in [_works.allValues copy])if(work.authorizationReady&&!work.finished){work.authorizationReady=NO;[self authorized:work];}}
- (void)close {if(_closed)return;_closed=YES;for(MiniLocationWork *work in _works.allValues)[work cancel];[_works removeAllObjects];}
- (void)dealloc {[NSNotificationCenter.defaultCenter removeObserver:self];[self close];}
@end
