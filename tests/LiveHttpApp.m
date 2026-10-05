// Signed simulator acceptance through the production default URLSession path.
#import <UIKit/UIKit.h>
#import "InstalledController.h"
#include <assert.h>
@interface LiveHttpApp : UIResponder <UIApplicationDelegate>
@property(nonatomic) UIWindow *window;
@property MiniInstalledController *controller;
@property MiniPackageStore *store;
@property BOOL verified;
@end
@implementation LiveHttpApp
- (BOOL)application:(UIApplication *)application didFinishLaunchingWithOptions:(NSDictionary *)options {
    (void)application;(void)options;NSError *error=nil;
    NSArray *cases=[NSJSONSerialization JSONObjectWithData:[NSData dataWithContentsOfFile:[NSBundle.mainBundle pathForResource:@"cases" ofType:@"json"]] options:0 error:&error];assert(cases && !error);NSDictionary *fixture=cases.firstObject;
    NSData *payload=[[NSData alloc] initWithBase64EncodedString:fixture[@"payload"] options:0],*key=[[NSData alloc] initWithBase64EncodedString:fixture[@"key"] options:0],*envelope=[NSJSONSerialization dataWithJSONObject:fixture[@"manifest"] options:0 error:&error];
    NSString *root=[NSSearchPathForDirectoriesInDomains(NSLibraryDirectory,NSUserDomainMask,YES).firstObject stringByAppendingPathComponent:@"packages"];
    _store=[[MiniPackageStore alloc] initWithRoot:root trustedKey:key error:&error];assert(_store && !error);assert([_store seedPayload:payload envelope:envelope error:&error]);
    _controller=[[MiniInstalledController alloc] initWithIdentity:@"dev.pjm.fixture" store:_store launchData:[@"{}" dataUsingEncoding:NSUTF8StringEncoding] error:&error];assert(_controller && !error);
    __weak LiveHttpApp *weakSelf=self;void (^dispatch)(MiniVerifiedPackage *,uint64_t,NSString *)=_controller.surface.onVerifiedEffect;
    _controller.surface.onVerifiedEffect=^(MiniVerifiedPackage *package,uint64_t generation,NSString *line){dispatch(package,generation,line);if([line hasPrefix:@"http-live-pass:"]){assert([package.metadata[@"appId"] isEqual:@"dev.pjm.fixture"] && generation>0);weakSelf.verified=YES;NSLog(@"PJM_LIVE_HTTP_REPLY %@",line);}};
    _controller.surface.onError=^(NSString *message){NSLog(@"PJM_LIVE_HTTP_FAILURE %@",message);exit(2);};
    _controller.surface.onFrame=^(uint64_t frame,NSUInteger contacts){(void)contacts;assert(frame<1800);LiveHttpApp *owner=weakSelf;if(owner.verified){[owner.controller shutdown];assert([[owner.controller valueForKey:@"requests"] count]==0);NSLog(@"PJM_SIGNED_SURFACE_PASS LIVE_TLS frame=%llu",(unsigned long long)frame);exit(0);}};
    _window=[[UIWindow alloc] initWithFrame:UIScreen.mainScreen.bounds];_window.rootViewController=_controller;[_window makeKeyAndVisible];return YES;
}
@end
int main(int argc,char **argv){@autoreleasepool{return UIApplicationMain(argc,argv,nil,NSStringFromClass(LiveHttpApp.class));}}
