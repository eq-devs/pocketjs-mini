#import <UIKit/UIKit.h>
#import "PocketSurfaceView.h"
#import "Config.h"
#import "AppStorage.h"
#import "InstalledController.h"

#if PJM_DEVELOPMENT_MODE

// UIKit owns display timing, safe areas and input. PocketJS owns the guest/UI.
@interface MiniController : UIViewController
@property PocketSurfaceView *surface;
@property UILabel *message;
@property NSURL *base;
@property NSTimer *poll;
@property NSDictionary *metrics;
@property NSUInteger revision, failedRevision;
@property BOOL fetching, reporting;
@property NSUInteger touches;
@property NSUInteger queuedServiceReplies, sdkReceipt;
@end

@implementation MiniController
- (void)viewDidLoad {
  [super viewDidLoad];
  self.view.backgroundColor = [UIColor colorWithRed:15/255.0 green:23/255.0 blue:42/255.0 alpha:1];
  self.message = [[UILabel alloc] init];
  self.message.textColor = UIColor.whiteColor;
  self.message.backgroundColor = [UIColor colorWithRed:15/255.0 green:23/255.0 blue:42/255.0 alpha:0.95];
  self.message.textAlignment = NSTextAlignmentCenter;
  self.message.numberOfLines = 0;
  self.message.text = @"Starting PocketJS…";
  self.message.accessibilityIdentifier = @"pjm-status";
  [self.view addSubview:self.message];
  NSString *url = @PJM_DEFAULT_URL;
  NSArray *args = NSProcessInfo.processInfo.arguments;
  NSUInteger index = [args indexOfObject:@"--pjm-url"];
  if (index != NSNotFound && index + 1 < args.count) url = args[index + 1];
  self.base = [NSURL URLWithString:url];
  __weak MiniController *weak = self;
  self.poll = [NSTimer scheduledTimerWithTimeInterval:0.3 repeats:YES block:^(NSTimer *timer) { [weak reload]; }];
}
- (void)dealloc { [self.poll invalidate]; [self.surface stop]; }
- (void)queueService:(NSString *)line surface:(PocketSurfaceView *)surface metrics:(NSDictionary *)metrics storage:(MiniAppStorage *)storage {
  if ([line lengthOfBytesUsingEncoding:NSUTF8StringEncoding] > 4096 || self.queuedServiceReplies >= 32) return;
  self.queuedServiceReplies++;
  __weak MiniController *weak = self;
  __weak PocketSurfaceView *weakSurface = surface;
  // Deliver on the next owner-thread turn and reject replies belonging to
  // a replaced guest.
  dispatch_async(dispatch_get_main_queue(), ^{
    MiniController *self = weak; if (!self) return;
    self.queuedServiceReplies--;
    PocketSurfaceView *surface = weakSurface;
    if (!surface || surface != self.surface) return;
    [self processService:line surface:surface metrics:metrics storage:storage];
  });
}
- (void)processService:(NSString *)line surface:(PocketSurfaceView *)surface metrics:(NSDictionary *)metrics storage:(MiniAppStorage *)storage {
  if(!surface || surface!=self.surface || [line lengthOfBytesUsingEncoding:NSUTF8StringEncoding]>4096)return;
    id parsed = [NSJSONSerialization JSONObjectWithData:[line dataUsingEncoding:NSUTF8StringEncoding] options:0 error:nil];
    if (![parsed isKindOfClass:NSDictionary.class]) return;
    NSDictionary *request = parsed; id identifier = request[@"id"], version = request[@"v"], kind = request[@"kind"];
    if (![identifier isKindOfClass:NSNumber.class] || CFGetTypeID((__bridge CFTypeRef)identifier) == CFBooleanGetTypeID()) return;
    double number = [identifier doubleValue];
    if (!isfinite(number) || number < 1 || number > 9007199254740991.0 || floor(number) != number) return;
    NSMutableDictionary *reply = [@{@"v":@1,@"id":identifier} mutableCopy];
    NSString *errorCode = nil, *errorMessage = nil;
    NSRegularExpression *pattern = [NSRegularExpression regularExpressionWithPattern:@"^[a-z][a-zA-Z0-9.]*\\.v[1-9][0-9]*$" options:0 error:nil];
    if (![version isKindOfClass:NSNumber.class] || CFGetTypeID((__bridge CFTypeRef)version) == CFBooleanGetTypeID() || [version doubleValue] != 1
      || ![kind isKindOfClass:NSString.class] || [kind length] > 64 || [pattern numberOfMatchesInString:kind options:0 range:NSMakeRange(0,[kind length])] != 1 || !request[@"args"]) {
      errorCode=@"PROTOCOL";errorMessage=@"Invalid service request";
    } else if ([kind isEqual:@"device.info.v1"]) {
      NSMutableDictionary *data=[metrics mutableCopy];data[@"platform"]=@"ios";data[@"model"]=UIDevice.currentDevice.model;reply[@"data"]=data;
    } else if ([kind isEqual:@"storage.get.v1"] || [kind isEqual:@"storage.set.v1"] || [kind isEqual:@"storage.remove.v1"]) {
      NSError *failure=nil;id result=[storage dispatch:kind arguments:request[@"args"] error:&failure];
      if(result)reply[@"data"]=result;
      else {errorCode=[failure.domain isEqual:@"MiniBusy"]?@"BUSY":[failure.domain isEqual:@"MiniProtocol"]?@"PROTOCOL":@"FAILED";errorMessage=failure.localizedDescription ?: @"Storage unavailable";}
    } else if ([kind isEqual:@"cancel.v1"]) { reply[@"data"] = NSNull.null; }
    else if (PJM_TEST_MODE && [kind isEqual:@"test.report.v1"] && [request[@"args"] isKindOfClass:NSDictionary.class] && [request[@"args"][@"value"] isKindOfClass:NSNumber.class]) {
      self.sdkReceipt=[request[@"args"][@"value"] unsignedIntegerValue];reply[@"data"]=NSNull.null;
    } else { errorCode=@"UNSUPPORTED";errorMessage=@"Unsupported native service"; }
    reply[@"ok"]=errorCode ? @NO : @YES;
    if(errorCode)reply[@"error"]=@{@"code":errorCode,@"message":errorMessage};
    NSData *data=[NSJSONSerialization dataWithJSONObject:reply options:0 error:nil];
    if(data && data.length<=4096)[surface postEvent:[[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding]];
}
- (void)viewDidLayoutSubviews {
  [super viewDidLayoutSubviews];
  CGRect bounds = self.view.safeAreaLayoutGuide.layoutFrame;
  self.message.frame = CGRectInset(bounds, 16, 16);
  UIEdgeInsets insets = self.view.safeAreaInsets;
  NSDictionary *next = @{@"width": @((int)floor(bounds.size.width)), @"height": @((int)floor(bounds.size.height)),
    @"density": @((int)MIN(4, MAX(1, round(self.view.window.screen.scale)))),
    @"safeTop": @(insets.top), @"safeBottom": @(insets.bottom),
    @"safeLeft": @(insets.left), @"safeRight": @(insets.right)};
  if ([next[@"width"] intValue] < 100 || [next[@"height"] intValue] < 100 || [self.metrics isEqual:next]) return;
  self.metrics = next;
  self.surface.hidden = YES;
  self.message.text = @"Adapting to window…";
  self.message.hidden = NO;
  [self reportWindow];
}
- (void)request:(NSString *)path body:(NSData *)body completion:(void (^)(NSData *, NSError *))completion {
  NSMutableURLRequest *request = [NSMutableURLRequest requestWithURL:[NSURL URLWithString:path relativeToURL:self.base].absoluteURL];
  request.timeoutInterval = 5;
  if (body) {
    request.HTTPMethod = @"POST"; request.HTTPBody = body;
    [request setValue:@"application/json" forHTTPHeaderField:@"Content-Type"];
  }
  [[[NSURLSession sharedSession] dataTaskWithRequest:request completionHandler:^(NSData *data, NSURLResponse *response, NSError *error) {
    if (!error && [(NSHTTPURLResponse *)response statusCode] != 200)
      error = [NSError errorWithDomain:@"PocketJS" code:1 userInfo:@{NSLocalizedDescriptionKey: @"Development host rejected request"}];
    dispatch_async(dispatch_get_main_queue(), ^{ completion(data, error); });
  }] resume];
}
- (void)showError:(NSString *)error {
  self.message.text = error; self.message.hidden = NO;
  [self.view bringSubviewToFront:self.message];
}
- (void)reportWindow {
  if (self.reporting || !self.metrics) return;
  self.reporting = YES;
  NSDictionary *snapshot = self.metrics;
  NSData *body = [NSJSONSerialization dataWithJSONObject:snapshot options:0 error:nil];
  __weak MiniController *weak = self;
  [self request:@"window" body:body completion:^(NSData *data, NSError *error) {
    MiniController *self = weak; if (!self) return;
    self.reporting = NO;
    if (error) { [self showError:error.localizedDescription]; return; }
    if (![snapshot isEqual:self.metrics]) { [self reportWindow]; return; }
    [self reload];
  }];
}
- (void)reload {
  if (self.fetching || self.reporting || !self.metrics) return;
  self.fetching = YES;
  NSDictionary *metrics = self.metrics;
  __weak MiniController *weak = self;
  [self request:@"state" body:nil completion:^(NSData *data, NSError *error) {
    MiniController *self = weak; if (!self) return;
    if (error) { self.fetching = NO; [self showError:error.localizedDescription]; [self reportWindow]; return; }
    NSDictionary *state = [NSJSONSerialization JSONObjectWithData:data options:0 error:nil];
    if(![state isKindOfClass:NSDictionary.class]){self.fetching=NO;[self showError:@"Invalid development state"];return;}
    NSString *compileError = [state[@"error"] isKindOfClass:NSString.class] ? state[@"error"] : nil;
    if (compileError) [self showError:compileError];
    NSUInteger next = [state[@"revision"] unsignedIntegerValue];
    if (next <= self.revision || next == self.failedRevision || ![state[@"window"] isEqual:metrics]) { self.fetching = NO; return; }
    NSError *identityError=nil;
    NSDictionary *metadata=state[@"metadata"];
    MiniAppStorage *storage=[[MiniAppStorage alloc] initWithAppId:[metadata isKindOfClass:NSDictionary.class]?metadata[@"appId"]:nil error:&identityError];
    if(!storage){self.fetching=NO;self.failedRevision=next;[self showError:identityError.localizedDescription ?: @"Invalid host identity"];return;}
    [self request:[NSString stringWithFormat:@"%lu/app.js", (unsigned long)next] body:nil completion:^(NSData *js, NSError *jsError) {
      if (jsError) { self.fetching = NO; [self showError:jsError.localizedDescription]; return; }
      [self request:[NSString stringWithFormat:@"%lu/app.pak", (unsigned long)next] body:nil completion:^(NSData *pak, NSError *pakError) {
        self.fetching = NO;
        if (![metrics isEqual:self.metrics]) return;
        if (pakError) { [self showError:pakError.localizedDescription]; return; }
        PocketSurfaceView *replacement = [PocketSurfaceView surfaceWithLogicalWidth:[metrics[@"width"] intValue]
          logicalHeight:[metrics[@"height"] intValue] density:[metrics[@"density"] intValue] hostId:@"pjm-ios" hostAbi:7];
        replacement.tickRate = 60;
        __weak PocketSurfaceView *weakServiceSurface = replacement;
        replacement.onEffect = ^(NSString *line) { [weak queueService:line surface:weakServiceSurface metrics:metrics storage:storage]; };
        replacement.onCleanupEffect = ^(NSString *line) { [weak processService:line surface:weakServiceSurface metrics:metrics storage:storage]; };
        if (![replacement setServiceNamespaces:@[@"mini"]]) {self.failedRevision=next;[self showError:replacement.lastError ?: @"Service configuration failed"];return;}
        if (![replacement loadPak:pak] || ![replacement evalBundle:[[NSString alloc] initWithData:js encoding:NSUTF8StringEncoding] label:@"mini"]) {
          self.failedRevision = next;
          [self showError:replacement.lastError ?: @"Guest boot failed"];
          [replacement stop]; return;
        }
        [self.surface shutdown]; [self.surface removeFromSuperview];
        self.surface = replacement; self.revision = next; self.failedRevision = 0; self.touches = 0;self.sdkReceipt=0;
        replacement.frame = self.view.safeAreaLayoutGuide.layoutFrame;
        replacement.isAccessibilityElement = YES;
        replacement.accessibilityLabel = @"PocketJS content";
        replacement.accessibilityIdentifier = @"pocket-surface";
        [self.view insertSubview:replacement belowSubview:self.message];
        self.message.hidden = YES;
        replacement.onError = ^(NSString *message) { [weak showError:message]; };
        __weak PocketSurfaceView *weakSurface = replacement;
        replacement.onFrame = ^(uint64_t frame, NSUInteger touchCount) {
          MiniController *self = weak; if (!self) return;
          if (touchCount) self.touches++;
          PocketSurfaceView *replacement = weakSurface; if (!replacement) return;
          // Test-only receipt observes native pixels; it never changes guest state.
          if (PJM_TEST_MODE) {
            uint32_t hash = replacement.presentedHash;
            replacement.accessibilityValue = [NSString stringWithFormat:@"revision=%lu hash=%u width=%u height=%u frames=%llu touches=%lu sdk=%lu",
              (unsigned long)self.revision, hash, replacement.logicalWidth, replacement.logicalHeight,
              frame, (unsigned long)self.touches, (unsigned long)self.sdkReceipt];
          }
        };
        [replacement start];
      }];
    }];
  }];
}
@end

#endif
static NSData *bundledData(NSString *name,NSString *type){NSString *path=[NSBundle.mainBundle pathForResource:name ofType:type];return path?[NSData dataWithContentsOfFile:path]:nil;}
static UIViewController *installedController(void) {
  NSError *error=nil;
  NSData *key=bundledData(@"publisher",@"key");
  NSData *payload=bundledData(@"main",@"pocket");
  NSData *envelope=bundledData(@"manifest",@"json");
  NSData *identityBytes=bundledData(@"app",@"id");NSString *identity=identityBytes?[[NSString alloc] initWithData:identityBytes encoding:NSUTF8StringEncoding]:nil;
  NSString *root=[NSSearchPathForDirectoriesInDomains(NSLibraryDirectory,NSUserDomainMask,YES).firstObject stringByAppendingPathComponent:@"mini-packages"];
  MiniPackageStore *store=key?[[MiniPackageStore alloc] initWithRoot:root trustedKey:key error:&error]:nil;
  if(store && payload && envelope && identity && [store seedPayload:payload envelope:envelope error:&error]){
    NSData *launch=[@"{\"source\":\"installed\",\"path\":\"/\",\"query\":{}}" dataUsingEncoding:NSUTF8StringEncoding];
    MiniInstalledController *controller=[[MiniInstalledController alloc] initWithIdentity:identity store:store launchData:launch error:&error];if(controller)return controller;
  }
  UIViewController *failure=[UIViewController new];failure.view.backgroundColor=UIColor.blackColor;
  UILabel *message=[UILabel new];message.text=@"Unable to open this app.";message.textColor=UIColor.whiteColor;message.textAlignment=NSTextAlignmentCenter;message.frame=failure.view.bounds;message.autoresizingMask=UIViewAutoresizingFlexibleWidth|UIViewAutoresizingFlexibleHeight;message.accessibilityIdentifier=@"pjm-status";[failure.view addSubview:message];return failure;
}
// Scene-owned windows follow UIKit's orientation/geometry on current iOS.
@interface MiniScene : UIResponder <UIWindowSceneDelegate>
@property(nonatomic, strong) UIWindow *window;
@end
@implementation MiniScene
- (void)scene:(UIScene *)scene willConnectToSession:(UISceneSession *)session options:(UISceneConnectionOptions *)options {
  if (![scene isKindOfClass:UIWindowScene.class]) return;
  self.window = [[UIWindow alloc] initWithWindowScene:(UIWindowScene *)scene];
  #if PJM_DEVELOPMENT_MODE
  self.window.rootViewController = [[MiniController alloc] init];
#else
  self.window.rootViewController = installedController();
#endif
  [self.window makeKeyAndVisible];
}
@end
@interface MiniDelegate : UIResponder <UIApplicationDelegate>
@end
@implementation MiniDelegate
@end
int main(int argc, char *argv[]) {
  @autoreleasepool { return UIApplicationMain(argc, argv, nil, NSStringFromClass(MiniDelegate.class)); }
}
