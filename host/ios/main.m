#import <UIKit/UIKit.h>
#import "PocketSurfaceView.h"
#import "Config.h"

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
@end

@implementation MiniController
- (void)viewDidLoad {
  [super viewDidLoad];
  self.view.backgroundColor = [UIColor colorWithRed:15/255.0 green:23/255.0 blue:42/255.0 alpha:1];
  self.message = [[UILabel alloc] init];
  self.message.textColor = UIColor.whiteColor;
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
    NSString *compileError = [state[@"error"] isKindOfClass:NSString.class] ? state[@"error"] : nil;
    if (compileError) [self showError:compileError];
    NSUInteger next = [state[@"revision"] unsignedIntegerValue];
    if (next <= self.revision || next == self.failedRevision || ![state[@"window"] isEqual:metrics]) { self.fetching = NO; return; }
    [self request:[NSString stringWithFormat:@"%lu/app.js", (unsigned long)next] body:nil completion:^(NSData *js, NSError *jsError) {
      if (jsError) { self.fetching = NO; [self showError:jsError.localizedDescription]; return; }
      [self request:[NSString stringWithFormat:@"%lu/app.pak", (unsigned long)next] body:nil completion:^(NSData *pak, NSError *pakError) {
        self.fetching = NO;
        if (![metrics isEqual:self.metrics]) return;
        if (pakError) { [self showError:pakError.localizedDescription]; return; }
        PocketSurfaceView *replacement = [PocketSurfaceView surfaceWithLogicalWidth:[metrics[@"width"] intValue]
          logicalHeight:[metrics[@"height"] intValue] density:[metrics[@"density"] intValue] hostId:@"pjm-ios" hostAbi:7];
        replacement.tickRate = 60;
        if (![replacement loadPak:pak] || ![replacement evalBundle:[[NSString alloc] initWithData:js encoding:NSUTF8StringEncoding] label:@"mini"]) {
          self.failedRevision = next;
          [self showError:replacement.lastError ?: @"Guest boot failed"];
          [replacement stop]; return;
        }
        [self.surface stop]; [self.surface removeFromSuperview];
        self.surface = replacement; self.revision = next; self.failedRevision = 0; self.touches = 0;
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
            CGImageRef image = (__bridge CGImageRef)replacement.layer.contents;
            CFDataRef bytes = image ? CGDataProviderCopyData(CGImageGetDataProvider(image)) : NULL;
            uint32_t hash = 2166136261u;
            if (bytes) { const UInt8 *p = CFDataGetBytePtr(bytes); for (CFIndex i=0; i<CFDataGetLength(bytes); i++) hash=(hash^p[i])*16777619u; CFRelease(bytes); }
            replacement.accessibilityValue = [NSString stringWithFormat:@"revision=%lu hash=%u width=%u height=%u frames=%llu touches=%lu",
              (unsigned long)self.revision, hash, replacement.logicalWidth, replacement.logicalHeight,
              frame, (unsigned long)self.touches];
          }
        };
        [replacement start];
      }];
    }];
  }];
}
@end

@interface MiniDelegate : UIResponder <UIApplicationDelegate>
@property(nonatomic, strong) UIWindow *window;
@end
@implementation MiniDelegate
- (BOOL)application:(UIApplication *)application didFinishLaunchingWithOptions:(NSDictionary *)options {
  self.window = [[UIWindow alloc] initWithFrame:UIScreen.mainScreen.bounds];
  self.window.rootViewController = [[MiniController alloc] init];
  [self.window makeKeyAndVisible]; return YES;
}
@end
int main(int argc, char *argv[]) {
  @autoreleasepool { return UIApplicationMain(argc, argv, nil, NSStringFromClass(MiniDelegate.class)); }
}
