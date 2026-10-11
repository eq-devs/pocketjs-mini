#import <UIKit/UIKit.h>
// Keep the native fixture assertions enabled in the Release test app.
#undef NDEBUG
#define main MiniPackageMatrixVerify
#include "package-load-fixture.m"
#undef main
@interface MiniScene : UIResponder <UIWindowSceneDelegate>
@property(nonatomic,strong) UIWindow *window;
@end
@implementation MiniScene
- (void)scene:(UIScene *)scene willConnectToSession:(UISceneSession *)session options:(UISceneConnectionOptions *)options {
    (void)session;(void)options;if(![scene isKindOfClass:UIWindowScene.class])return;
    UIViewController *controller=[UIViewController new];controller.view.backgroundColor=UIColor.whiteColor;
    UILabel *proof=[UILabel new];proof.frame=CGRectMake(20,120,350,550);proof.numberOfLines=0;proof.accessibilityIdentifier=@"package-matrix-proof";proof.text=@"Native signed-package checks running";[controller.view addSubview:proof];
    self.window=[[UIWindow alloc] initWithWindowScene:(UIWindowScene *)scene];self.window.rootViewController=controller;[self.window makeKeyAndVisible];
    dispatch_async(dispatch_get_main_queue(),^{
        @try {
            int assertionsEnabled=0;assert(++assertionsEnabled);
            if(assertionsEnabled!=1)@throw [NSException exceptionWithName:@"PackageMatrixFailure" reason:@"Native assertions disabled" userInfo:nil];
            NSError *error=nil;NSData *data=[NSData dataWithContentsOfFile:[NSBundle.mainBundle pathForResource:@"cases" ofType:@"json"]];
            NSArray *cases=[NSJSONSerialization JSONObjectWithData:data options:0 error:&error];
            if(![cases isKindOfClass:NSArray.class] || !cases.count)@throw [NSException exceptionWithName:@"PackageMatrixFailure" reason:@"Missing native cases" userInfo:nil];
            NSString *root=[NSSearchPathForDirectoriesInDomains(NSLibraryDirectory,NSUserDomainMask,YES).firstObject stringByAppendingPathComponent:NSUUID.UUID.UUIDString];
            if(![NSFileManager.defaultManager createDirectoryAtPath:root withIntermediateDirectories:YES attributes:nil error:&error])@throw [NSException exceptionWithName:@"PackageMatrixFailure" reason:error.localizedDescription userInfo:nil];
            NSString *path=[root stringByAppendingPathComponent:@"cases.json"];
            if(![data writeToFile:path options:NSDataWritingAtomic error:&error])@throw [NSException exceptionWithName:@"PackageMatrixFailure" reason:error.localizedDescription userInfo:nil];
            char *arguments[]={"native-package-matrix",(char *)path.UTF8String};
            if(MiniPackageMatrixVerify(2,arguments)!=0)@throw [NSException exceptionWithName:@"PackageMatrixFailure" reason:@"Native fixture failed" userInfo:nil];
            NSUInteger accepted=0;NSMutableArray *verdicts=[NSMutableArray new];
            for(NSDictionary *item in cases){BOOL valid=[item[@"valid"] boolValue];accepted+=valid;[verdicts addObject:@{@"name":item[@"name"],@"verdict":valid?@"accepted":@"rejected"}];}
            NSDictionary *receipt=@{@"cases":@(cases.count),@"accepted":@(accepted),@"rejected":@(cases.count-accepted),@"verdicts":verdicts,@"runtimeAttacks":MiniRuntimeAttackResults?:@[]};
            NSData *receiptData=[NSJSONSerialization dataWithJSONObject:receipt options:NSJSONWritingSortedKeys error:nil];
            proof.text=[@"native-package-matrix PASS " stringByAppendingString:[[NSString alloc] initWithData:receiptData encoding:NSUTF8StringEncoding]];
            [NSFileManager.defaultManager removeItemAtPath:root error:nil];
        }@catch(NSException *failure){proof.text=[@"native-package-matrix FAIL " stringByAppendingString:failure.reason?:failure.name];}
    });
}
@end
@interface PackageMatrixApp : UIResponder <UIApplicationDelegate>
@end
@implementation PackageMatrixApp
@end
int main(int argc,char **argv){@autoreleasepool{return UIApplicationMain(argc,argv,nil,NSStringFromClass(PackageMatrixApp.class));}}
