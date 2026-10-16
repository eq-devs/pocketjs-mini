// Controlled Core Location callback ordering; no physical location is accessed.
#import <UIKit/UIKit.h>
#import <CoreLocation/CoreLocation.h>
#import "VerifiedLocation.h"
#include <assert.h>
@interface RevocationManager : CLLocationManager
@property CLAuthorizationStatus status;
@property NSUInteger requests;
@property(nonatomic,weak) id<CLLocationManagerDelegate> recipient;
@end
@implementation RevocationManager
- (CLAuthorizationStatus)authorizationStatus {return _status;}
- (CLLocation *)location {return nil;}
- (void)requestLocation {_requests++;_recipient=self.delegate;}
- (void)stopUpdatingLocation {}
@end
@interface RevocationLocation : MiniVerifiedLocation
@property RevocationManager *next;
@end
@implementation RevocationLocation
- (BOOL)foreground {return YES;}
- (CLLocationManager *)makeManager {RevocationManager *manager=_next;_next=nil;return manager;}
@end
@interface LocationRevocationApp : UIResponder <UIApplicationDelegate>
@property UIWindow *window;
@end
@implementation LocationRevocationApp
- (BOOL)application:(UIApplication *)application didFinishLaunchingWithOptions:(NSDictionary *)options {
 (void)application;(void)options;
 NSError *error=nil;NSArray *cases=[NSJSONSerialization JSONObjectWithData:[NSData dataWithContentsOfFile:[NSBundle.mainBundle pathForResource:@"cases" ofType:@"json"]] options:0 error:&error];assert(cases&&!error);
 NSDictionary *item=cases.firstObject,*entry=item[@"locationCase"];assert(entry);
 NSData *key=[[NSData alloc] initWithBase64EncodedString:item[@"key"] options:0],*payload=[[NSData alloc] initWithBase64EncodedString:entry[@"payload"] options:0],*envelope=[NSJSONSerialization dataWithJSONObject:entry[@"manifest"] options:0 error:&error];
 MiniVerifiedPackage *package=[[MiniVerifiedPackage alloc] initWithPayload:payload envelope:envelope trustedKey:key error:&error];assert(package&&!error);
 NSString *root=[NSSearchPathForDirectoriesInDomains(NSLibraryDirectory,NSUserDomainMask,YES).firstObject stringByAppendingPathComponent:@"revocation-packages"];
 MiniPackageStore *store=[[MiniPackageStore alloc] initWithRoot:root trustedKey:key error:&error];assert(store&&[store stagePayload:payload envelope:envelope error:&error]);
 UIViewController *presenter=[UIViewController new];self.window=[[UIWindow alloc] initWithFrame:UIScreen.mainScreen.bounds];self.window.rootViewController=presenter;[self.window makeKeyAndVisible];
 for(NSUInteger signedMode=0;signedMode<2;signedMode++){
  NSString *identity=signedMode?package.metadata[@"appId"]:@"dev.pjm.location.revocation";
  for(NSUInteger variant=0;variant<4;variant++){
   if(signedMode)assert([store setPermissionDecision:YES permission:@"location" identity:identity error:&error]);else [NSUserDefaults.standardUserDefaults setObject:@{identity:@YES} forKey:@"pjm-development-location-consent"];
   RevocationLocation *service=signedMode?[[RevocationLocation alloc] initWithStore:store presenter:presenter]:[[RevocationLocation alloc] initDevelopmentWithIdentity:identity declared:YES presenter:presenter];
   RevocationManager *manager=[RevocationManager new];manager.status=kCLAuthorizationStatusAuthorizedWhenInUse;service.next=manager;
   NSDictionary *args=@{@"timeoutMs":@15000,@"maximumAgeMs":@0,@"highAccuracy":@YES};NSNumber *identifier=@(1+variant);NSDictionary *started=signedMode?[service start:args identifier:identifier package:package generation:1]:[service startDevelopment:args identifier:identifier generation:1];assert(!started&&manager.requests==1);
   id<CLLocationManagerDelegate> delegate=manager.recipient;assert(delegate);
   if(variant==0||variant==2)manager.status=kCLAuthorizationStatusDenied;
   if(variant==1){if(signedMode)assert([store setPermissionDecision:NO permission:@"location" identity:identity error:&error]);else [NSUserDefaults.standardUserDefaults setObject:@{identity:@NO} forKey:@"pjm-development-location-consent"];}
   CLLocation *fix=[[CLLocation alloc] initWithCoordinate:CLLocationCoordinate2DMake(43.238949,76.889709) altitude:0 horizontalAccuracy:4 verticalAccuracy:8 timestamp:NSDate.date];
   if(variant==2)[delegate locationManagerDidChangeAuthorization:manager];else [delegate locationManager:manager didUpdateLocations:@[fix]];
   __block NSDictionary *reply=nil;__block NSUInteger replies=0;
   void (^drain)(void)=^{if(signedMode)[service drain:^BOOL(MiniVerifiedPackage *bound,uint64_t generation,NSString *line){assert(bound==package&&generation==1);replies++;reply=[NSJSONSerialization JSONObjectWithData:[line dataUsingEncoding:NSUTF8StringEncoding] options:0 error:nil];return YES;}];else [service drainDevelopment:^BOOL(NSString *bound,uint64_t generation,NSString *line){assert([bound isEqual:identity]&&generation==1);replies++;reply=[NSJSONSerialization JSONObjectWithData:[line dataUsingEncoding:NSUTF8StringEncoding] options:0 error:nil];return YES;}];};
   drain();NSLog(@"LOCATION_REVOCATION signed=%lu variant=%lu reply=%@",(unsigned long)signedMode,(unsigned long)variant,reply);
   assert(replies==1&&[reply[@"id"] isEqual:identifier]);if(variant<3){assert(![reply[@"ok"] boolValue]&&[reply[@"error"][@"code"] isEqual:@"DENIED"]&&!reply[@"data"]);}else assert([reply[@"ok"] boolValue]&&fabs([reply[@"data"][@"latitude"] doubleValue]-43.238949)<1e-8);
   assert(!manager.delegate);[delegate locationManager:manager didUpdateLocations:@[fix]];[delegate locationManagerDidChangeAuthorization:manager];drain();assert(replies==1);[service close];
  }
 }
 NSLog(@"PJM_LOCATION_REVOCATION_PASS signed=4 development=4 os-before-position app-before-position authorization-change recovery late-callbacks");exit(0);
}
@end
int main(int argc,char **argv){@autoreleasepool{return UIApplicationMain(argc,argv,nil,NSStringFromClass(LocationRevocationApp.class));}}
