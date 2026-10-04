// Simulator integration harness; not included in the shipping host.
#import <UIKit/UIKit.h>
#import "PocketSurfaceView.h"
#import "InstalledController.h"
#include <assert.h>
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
@end
@implementation SignedSurfaceApp
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
    self.controller=[[MiniInstalledController alloc] initWithIdentity:@"dev.pjm.fixture" store:self.store launchData:self.launch error:&error];assert(self.controller && !error);self.surface=self.controller.surface;
    NSDictionary *update=fixture[@"update"];assert(update);
    NSData *newPayload=[[NSData alloc] initWithBase64EncodedString:update[@"payload"] options:0];NSData *newEnvelope=[NSJSONSerialization dataWithJSONObject:update[@"manifest"] options:0 error:&error];
    assert([self.store stagePayload:newPayload envelope:newEnvelope error:&error]);self.package=nil;
    __weak SignedSurfaceApp *weakSelf=self;
    self.surface.onError=^(NSString *message){NSLog(@"PJM_SIGNED_SURFACE_FAILURE %@",message);exit(2);};
    self.surface.onVerifiedEffect=^(MiniVerifiedPackage *package,uint64_t generation,NSString *line){
        SignedSurfaceApp *owner=weakSelf;if(!owner.package)owner.package=package;assert(package==owner.package && generation>0 && [package.metadata[@"version"] isEqual:@"1.0.0"]);
        if([line hasPrefix:@"verified:"]){owner.frames++;assert(([line isEqual:[NSString stringWithFormat:@"verified:1:%lu",(unsigned long)owner.frames]]));}
    };
    self.surface.onVerifiedCleanup=^(MiniVerifiedPackage *package,uint64_t generation,NSString *line){SignedSurfaceApp *owner=weakSelf;assert(package==owner.package && generation>0);NSLog(@"PJM_SIGNED_CLEANUP %@",line);if([line isEqual:@"cleanup"])owner.cleanup=YES;};
    self.surface.onFrame=^(uint64_t frameNumber,NSUInteger contacts){
        (void)frameNumber;assert(contacts==0);SignedSurfaceApp *owner=weakSelf;
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
        if(owner.frames>=4 && owner.surface.presentedHash!=0){assert(owner.warm && owner.hiddenVerified);[owner.surface shutdown];assert(owner.cleanup);NSError *failure=nil;MiniVerifiedPackage *cold=[owner.store coldStart:@"dev.pjm.fixture" error:&failure];assert(cold && [cold.metadata[@"version"] isEqual:@"2.0.0"] && [owner.package.metadata[@"version"] isEqual:@"1.0.0"]);NSLog(@"PJM_SIGNED_SURFACE_PASS frames=%lu hash=%u",(unsigned long)owner.frames,owner.surface.presentedHash);exit(0);}
    };
    self.window=[[UIWindow alloc] initWithFrame:UIScreen.mainScreen.bounds];self.window.rootViewController=self.controller;[self.window makeKeyAndVisible];return YES;
}
@end
int main(int argc,char **argv){@autoreleasepool{return UIApplicationMain(argc,argv,nil,NSStringFromClass(SignedSurfaceApp.class));}}
