#import "Mini-Swift.h"
#import <UIKit/UIKit.h>
#import "PocketSurfaceView.h"
#import "Config.h"
#import "AppStorage.h"
#import "InstalledController.h"
#import "VerifiedNetwork.h"
#import "VerifiedLocation.h"
#import "VerifiedMedia.h"

#if PJM_DEVELOPMENT_MODE

@interface MiniDevelopmentClipboardRead : NSObject
@property(nonatomic,weak) PocketSurfaceView *surface;
@property(nonatomic,copy) NSString *identity,*reply;
@property(nonatomic,strong) NSNumber *identifier;
@property(nonatomic,strong) NSTimer *timer;
@property(nonatomic,strong) UIAlertController *alert;
@property(nonatomic) double started;
- (void)cancel;
@end
@implementation MiniDevelopmentClipboardRead
- (void)cancel {[_timer invalidate];_timer=nil;[_alert dismissViewControllerAnimated:NO completion:nil];_alert=nil;}
- (void)dealloc {[_timer invalidate];}
@end
// UIKit owns display timing, safe areas and input. PocketJS owns the guest/UI.
@interface MiniController : UIViewController
@property PocketSurfaceView *surface;
@property UILabel *message;
@property NSURL *base;
@property NSTimer *poll;
@property NSDictionary *metrics;
@property NSUInteger revision, failedRevision;
@property BOOL fetching, reporting;
@property NSUInteger touches, pendingLogs;
@property NSUInteger queuedServiceReplies, sdkReceipt;
@property BOOL inspectionPending;
@property MiniVerifiedNetwork *networkStatus;
@property BOOL networkWatching;
@property NSDictionary *networkDelivered;
@property NSString *appIdentity;
@property MiniDevelopmentHTTP *http;
@property MiniVerifiedLocation *location;
@property MiniVerifiedMedia *media;
@property BOOL clipboardReadDeclared;
@property NSMutableDictionary<NSNumber *,MiniDevelopmentClipboardRead *> *clipboardReads;
@end

@implementation MiniController
- (void)viewDidLoad {
  [super viewDidLoad];
  self.networkStatus=[[MiniVerifiedNetwork alloc] init];self.clipboardReads=[NSMutableDictionary new];
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
- (void)viewWillAppear:(BOOL)animated {[super viewWillAppear:animated];[self.networkStatus resume];[self.location resume];[self.media resume];}
- (void)viewDidDisappear:(BOOL)animated {[super viewDidDisappear:animated];[self.networkStatus suspend];[self.location suspend];[self.media suspendForHost];}
- (void)dealloc { [self.media close];[self.location close];[self.http close]; for(MiniDevelopmentClipboardRead *work in self.clipboardReads.allValues)[work cancel]; [self.poll invalidate]; [self.networkStatus suspend]; [self.surface stop]; }
- (void)drainNetwork:(PocketSurfaceView *)surface {
  if(!self.networkWatching || surface!=self.surface)return;
  NSDictionary *latest=self.networkStatus.state;if([latest isEqual:self.networkDelivered])return;
  NSData *event=[NSJSONSerialization dataWithJSONObject:@{@"v":@1,@"event":@"device.network.v1",@"data":latest} options:0 error:nil];
  if(event && [surface tryPostEvent:[[NSString alloc] initWithData:event encoding:NSUTF8StringEncoding]])self.networkDelivered=latest;
}
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
- (NSString *)writeDevelopmentClipboard:(id)arguments {
  if(![arguments isKindOfClass:NSDictionary.class] || [arguments count]!=1 || ![arguments[@"text"] isKindOfClass:NSString.class])return @"PROTOCOL";
  NSString *text=arguments[@"text"];
  NSData *bytes=[text dataUsingEncoding:NSUTF8StringEncoding allowLossyConversion:NO];
  NSData *encoded=[NSJSONSerialization dataWithJSONObject:text options:NSJSONWritingFragmentsAllowed|NSJSONWritingWithoutEscapingSlashes error:nil];
  if(!bytes || bytes.length>2048 || !encoded || encoded.length>3072)return @"PROTOCOL";
  if(!self.appIdentity || UIApplication.sharedApplication.applicationState!=UIApplicationStateActive || !self.viewIfLoaded.window)return @"BUSY";
  if(![self admitDevelopmentClipboard:self.appIdentity])return @"BUSY";
  @try{UIPasteboard.generalPasteboard.string=text;}@catch(NSException *failure){(void)failure;return @"FAILED";}
  return nil;
}
- (BOOL)admitDevelopmentClipboard:(NSString *)identity {
  // Main-owner map persists across guest replacement and has bounded identity history.
  static NSMutableDictionary<NSString *,NSMutableArray<NSNumber *> *> *rates;
  if(!rates)rates=[NSMutableDictionary new];
  double now=NSProcessInfo.processInfo.systemUptime;
  for(NSString *identity in [rates.allKeys copy]){
    NSMutableArray *times=rates[identity];while(times.count && [times.firstObject doubleValue]<=now-60)[times removeObjectAtIndex:0];
    if(!times.count)[rates removeObjectForKey:identity];
  }
  NSMutableArray *times=rates[identity];
  if(!times){if(rates.count>=64)return NO;times=[NSMutableArray new];rates[identity]=times;}
  if(times.count>=16)return NO;[times addObject:@(now)];return YES;
}
- (void)cancelDevelopmentClipboardReads {for(MiniDevelopmentClipboardRead *work in self.clipboardReads.allValues)[work cancel];[self.clipboardReads removeAllObjects];}
- (BOOL)developmentClipboardReadLive:(MiniDevelopmentClipboardRead *)work {return work && self.clipboardReads[work.identifier]==work && work.surface==self.surface && !work.reply;}
- (void)finishDevelopmentClipboardRead:(MiniDevelopmentClipboardRead *)work code:(NSString *)code text:(NSString *)text {
  if(![self developmentClipboardReadLive:work])return;[work cancel];
  NSDictionary *reply=code?@{@"v":@1,@"id":work.identifier,@"ok":@NO,@"error":@{@"code":code,@"message":@"Clipboard read rejected"}}:@{@"v":@1,@"id":work.identifier,@"ok":@YES,@"data":@{@"text":text?:@""}};
  NSData *bytes=[NSJSONSerialization dataWithJSONObject:reply options:NSJSONWritingWithoutEscapingSlashes error:nil];work.reply=[[NSString alloc] initWithData:bytes encoding:NSUTF8StringEncoding];
}
- (BOOL)developmentClipboardReadReady:(MiniDevelopmentClipboardRead *)work {
  if(![self developmentClipboardReadLive:work])return NO;
  if(NSProcessInfo.processInfo.systemUptime-work.started>=15){[self finishDevelopmentClipboardRead:work code:@"TIMEOUT" text:nil];return NO;}
  if(UIApplication.sharedApplication.applicationState!=UIApplicationStateActive || !self.viewIfLoaded.window){[self finishDevelopmentClipboardRead:work code:@"BUSY" text:nil];return NO;}return YES;
}
- (NSDictionary *)developmentClipboardDecisions {
  id stored=[NSUserDefaults.standardUserDefaults objectForKey:@"pjm-development-clipboard-consent"];
  return [stored isKindOfClass:NSDictionary.class] && [stored count]<=64?stored:@{};
}
- (void)performDevelopmentClipboardRead:(MiniDevelopmentClipboardRead *)work {
  if(![self developmentClipboardReadReady:work])return;
  id approved=[self developmentClipboardDecisions][work.identity];
  if(![approved isKindOfClass:NSNumber.class] || CFGetTypeID((__bridge CFTypeRef)approved)!=CFBooleanGetTypeID() || ![approved boolValue]){[self finishDevelopmentClipboardRead:work code:@"DENIED" text:nil];return;}
  NSString *text=nil;@try{UIPasteboard *board=UIPasteboard.generalPasteboard;text=board.hasStrings?board.string:@"";}@catch(NSException *failure){(void)failure;[self finishDevelopmentClipboardRead:work code:@"FAILED" text:nil];return;}
  NSData *bytes=[text dataUsingEncoding:NSUTF8StringEncoding allowLossyConversion:NO],*encoded=text?[NSJSONSerialization dataWithJSONObject:text options:NSJSONWritingFragmentsAllowed|NSJSONWritingWithoutEscapingSlashes error:nil]:nil;
  if(!bytes || bytes.length>2048 || !encoded || encoded.length>3072){[self finishDevelopmentClipboardRead:work code:text?@"FAILED":@"DENIED" text:nil];return;}
  [self finishDevelopmentClipboardRead:work code:nil text:text];
}
- (NSString *)startDevelopmentClipboardRead:(id)arguments identifier:(NSNumber *)identifier surface:(PocketSurfaceView *)surface {
  if(![arguments isKindOfClass:NSDictionary.class] || [arguments count])return @"PROTOCOL";
  if(!self.clipboardReadDeclared)return @"DENIED";
  id approved=[self developmentClipboardDecisions][self.appIdentity];
  if(approved && (![approved isKindOfClass:NSNumber.class] || CFGetTypeID((__bridge CFTypeRef)approved)!=CFBooleanGetTypeID() || ![approved boolValue]))return @"DENIED";
  if(self.clipboardReads.count>=4 || self.clipboardReads[identifier] || (!approved && self.presentedViewController))return @"BUSY";
  if(!self.appIdentity || UIApplication.sharedApplication.applicationState!=UIApplicationStateActive || !self.viewIfLoaded.window || ![self admitDevelopmentClipboard:self.appIdentity])return @"BUSY";
  MiniDevelopmentClipboardRead *work=[MiniDevelopmentClipboardRead new];work.identity=self.appIdentity;work.surface=surface;work.identifier=identifier;work.started=NSProcessInfo.processInfo.systemUptime;self.clipboardReads[identifier]=work;
  __weak MiniController *weak=self;__weak MiniDevelopmentClipboardRead *weakWork=work;
  work.timer=[NSTimer timerWithTimeInterval:15 repeats:NO block:^(NSTimer *timer){(void)timer;[weak finishDevelopmentClipboardRead:weakWork code:@"TIMEOUT" text:nil];}];[NSRunLoop.mainRunLoop addTimer:work.timer forMode:NSRunLoopCommonModes];
  if(approved){[self performDevelopmentClipboardRead:work];return nil;}
  UIAlertController *alert=[UIAlertController alertControllerWithTitle:@"Clipboard access" message:[NSString stringWithFormat:@"Allow development app %@ to read clipboard text?",work.identity] preferredStyle:UIAlertControllerStyleAlert];work.alert=alert;
  void (^decide)(BOOL)=^(BOOL allowed){MiniController *owner=weak;MiniDevelopmentClipboardRead *bound=weakWork;if(!owner || ![owner developmentClipboardReadReady:bound])return;bound.alert=nil;NSMutableDictionary *decisions=[[owner developmentClipboardDecisions] mutableCopy];if(!decisions[bound.identity] && decisions.count>=64){[owner finishDevelopmentClipboardRead:bound code:@"BUSY" text:nil];return;}decisions[bound.identity]=@(allowed);[NSUserDefaults.standardUserDefaults setObject:decisions forKey:@"pjm-development-clipboard-consent"];if(allowed)[owner performDevelopmentClipboardRead:bound];else [owner finishDevelopmentClipboardRead:bound code:@"DENIED" text:nil];};
  [alert addAction:[UIAlertAction actionWithTitle:@"Don’t allow" style:UIAlertActionStyleCancel handler:^(UIAlertAction *action){(void)action;decide(NO);}]];[alert addAction:[UIAlertAction actionWithTitle:@"Allow" style:UIAlertActionStyleDefault handler:^(UIAlertAction *action){(void)action;decide(YES);}]];[self presentViewController:alert animated:YES completion:nil];return nil;
}
- (void)drainDevelopmentClipboardReads:(PocketSurfaceView *)surface {
  for(NSNumber *identifier in [self.clipboardReads.allKeys copy]){MiniDevelopmentClipboardRead *work=self.clipboardReads[identifier];if(work.surface!=surface)continue;if(work.reply && [surface tryPostEvent:work.reply]){[work cancel];[self.clipboardReads removeObjectForKey:identifier];}}
}
- (void)processService:(NSString *)line surface:(PocketSurfaceView *)surface metrics:(NSDictionary *)metrics storage:(MiniAppStorage *)storage {
  if(!surface || surface!=self.surface || [line lengthOfBytesUsingEncoding:NSUTF8StringEncoding]>4096)return;
    id parsed = [MiniPackageVerifier parseStrictJSON:[line dataUsingEncoding:NSUTF8StringEncoding] error:nil];
    if (![parsed isKindOfClass:NSDictionary.class]) return;
    NSDictionary *request = parsed; id identifier = request[@"id"], version = request[@"v"], kind = request[@"kind"];
    if([version isEqual:@1] && [kind isEqual:@"debug.log.v1"]){
      id args=request[@"args"];if(![args isKindOfClass:NSDictionary.class] || [args count]!=2 || ![args[@"message"] isKindOfClass:NSString.class] || [args[@"message"] lengthOfBytesUsingEncoding:NSUTF8StringEncoding]>2048 || ![@[@"debug",@"info",@"warn",@"error"] containsObject:args[@"level"]] || self.revision<1 || self.pendingLogs>=8)return;
      NSData *event=[NSJSONSerialization dataWithJSONObject:@{@"revision":@(self.revision),@"platform":@"ios",@"kind":@"log",@"level":args[@"level"],@"message":args[@"message"]} options:0 error:nil];self.pendingLogs++;
      [self request:@"device-event" body:event completion:^(NSData *data,NSError *error){(void)data;(void)error;self.pendingLogs--;}];return;
    }
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
    } else if ([kind isEqual:@"device.network.v1"]) {
      if(![request[@"args"] isKindOfClass:NSDictionary.class] || [request[@"args"] count]){errorCode=@"PROTOCOL";errorMessage=@"Network state takes no arguments";}
      else{reply[@"data"]=self.networkStatus.state;self.networkWatching=YES;self.networkDelivered=self.networkStatus.state;}
    } else if ([kind isEqual:@"storage.get.v1"] || [kind isEqual:@"storage.set.v1"] || [kind isEqual:@"storage.remove.v1"]) {
      NSError *failure=nil;id result=[storage dispatch:kind arguments:request[@"args"] error:&failure];
      if(result)reply[@"data"]=result;
      else {errorCode=[failure.domain isEqual:@"MiniBusy"]?@"BUSY":[failure.domain isEqual:@"MiniProtocol"]?@"PROTOCOL":@"FAILED";errorMessage=failure.localizedDescription ?: @"Storage unavailable";}
    } else if ([kind isEqual:@"clipboard.write.v1"]) {
      errorCode=[self writeDevelopmentClipboard:request[@"args"]];
      if(errorCode)errorMessage=@"Clipboard write rejected";else reply[@"data"]=NSNull.null;
    } else if ([kind isEqual:@"clipboard.read.v1"]) {
      errorCode=[self startDevelopmentClipboardRead:request[@"args"] identifier:identifier surface:surface];if(!errorCode)return;errorMessage=@"Clipboard read rejected";
    } else if ([kind isEqual:@"media.select.v1"]) {
      NSDictionary *result=[self.media startDevelopment:request[@"args"] identifier:identifier generation:self.revision];if(!result)return;[reply addEntriesFromDictionary:result];if(![result[@"ok"] boolValue]){errorCode=result[@"error"][@"code"];errorMessage=result[@"error"][@"message"];}
    } else if ([kind isEqual:@"location.get.v1"]) {
      NSDictionary *result=[self.location startDevelopment:request[@"args"] identifier:identifier generation:self.revision];if(!result)return;[reply addEntriesFromDictionary:result];if(![result[@"ok"] boolValue]){errorCode=result[@"error"][@"code"];errorMessage=result[@"error"][@"message"];}
    } else if ([kind isEqual:@"request.v1"]) {
      NSDictionary *result=[self.http start:request[@"args"] identifier:identifier];if(!result)return;[reply addEntriesFromDictionary:result];if(![result[@"ok"] boolValue]){errorCode=result[@"error"][@"code"];errorMessage=result[@"error"][@"message"];}
    } else if ([kind isEqual:@"resource.read.v1"] || [kind isEqual:@"resource.release.v1"]) {
      NSDictionary *result=[self.http resource:kind arguments:request[@"args"]];[reply addEntriesFromDictionary:result];if(![result[@"ok"] boolValue]){errorCode=result[@"error"][@"code"];errorMessage=result[@"error"][@"message"];}
    } else if ([kind isEqual:@"cancel.v1"]) { [self.media cancelGeneration:self.revision identifier:identifier];[self.location cancelGeneration:self.revision identifier:identifier];[self.http cancel:identifier]; [self.clipboardReads[identifier] cancel];[self.clipboardReads removeObjectForKey:identifier];reply[@"data"] = NSNull.null; }
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
    NSDictionary *selection=[state[@"inspectionSelection"] isKindOfClass:NSDictionary.class]?state[@"inspectionSelection"]:nil;
    if(next==self.revision && [selection[@"revision"] unsignedIntegerValue]==self.revision)
      [self.surface highlightInspectionNode:[selection[@"nodeId"] intValue] frame:[selection[@"frame"] unsignedLongLongValue]];
    else [self.surface highlightInspectionNode:0 frame:0];
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
        BOOL recording=[NSProcessInfo.processInfo.arguments containsObject:@"--pjm-record"];
        BOOL inspect=[NSProcessInfo.processInfo.arguments containsObject:@"--pjm-inspect"];
        if(recording && ![replacement beginRecordingPackageHash:state[@"packageSha256"] density:[metrics[@"density"] intValue]]){self.failedRevision=next;[self showError:@"Recording configuration failed"];return;}
        __weak PocketSurfaceView *weakServiceSurface = replacement;
        replacement.onEffect = ^(NSString *line) { [weak queueService:line surface:weakServiceSurface metrics:metrics storage:storage]; };
        replacement.onCleanupEffect = ^(NSString *line) { [weak processService:line surface:weakServiceSurface metrics:metrics storage:storage]; };
        if (![replacement setServiceNamespaces:@[@"mini"]]) {self.failedRevision=next;[self showError:replacement.lastError ?: @"Service configuration failed"];return;}
        if (![replacement loadPak:pak] || ![replacement evalBundle:[[NSString alloc] initWithData:js encoding:NSUTF8StringEncoding] label:@"mini"]) {
          self.failedRevision = next;
          [self showError:replacement.lastError ?: @"Guest boot failed"];
          [replacement stop]; return;
        }
        MiniDevelopmentHTTP *http=[[MiniDevelopmentHTTP alloc] initWithIdentity:metadata[@"appId"] domains:metadata[@"domains"] generation:next];if(!http){[replacement stop];self.failedRevision=next;[self showError:@"Invalid development HTTP policy"];return;}
        MiniVerifiedLocation *location=[[MiniVerifiedLocation alloc] initDevelopmentWithIdentity:metadata[@"appId"] declared:[metadata[@"permissions"] isKindOfClass:NSArray.class] && [metadata[@"permissions"] containsObject:@"location"] presenter:self];if(!location){[http close];[replacement stop];self.failedRevision=next;[self showError:@"Invalid development location policy"];return;}
        MiniVerifiedMedia *media=[http mediaWithPresenter:self declared:[metadata[@"permissions"] isKindOfClass:NSArray.class] && [metadata[@"permissions"] containsObject:@"media"]];if(!media){[http close];[location close];[replacement stop];self.failedRevision=next;[self showError:@"Invalid development media policy"];return;}
        [self.surface shutdown]; [self.surface removeFromSuperview];[self.media close];self.media=media;[self.http close];self.http=http;[self.location close];self.location=location;
        self.networkWatching=NO;self.networkDelivered=nil;
        [self cancelDevelopmentClipboardReads];self.surface = replacement; self.appIdentity=metadata[@"appId"];self.clipboardReadDeclared=[metadata[@"permissions"] isKindOfClass:NSArray.class] && [metadata[@"permissions"] containsObject:@"clipboard.read"]; self.revision = next; self.failedRevision = 0; self.touches = 0;self.sdkReceipt=0;
        replacement.frame = self.view.safeAreaLayoutGuide.layoutFrame;
        replacement.isAccessibilityElement = YES;
        replacement.accessibilityLabel = @"PocketJS content";
        replacement.accessibilityIdentifier = @"pocket-surface";
        [self.view insertSubview:replacement belowSubview:self.message];
        self.message.hidden = YES;
        replacement.onError = ^(NSString *message) { [weak showError:message]; };
        __weak PocketSurfaceView *weakSurface = replacement;
        __block BOOL reportedFrame=NO;
        __block BOOL sentRecording=NO;
        replacement.onFrame = ^(uint64_t frame, NSUInteger touchCount) {
          MiniController *self = weak; if (!self) return;
          if(!reportedFrame){reportedFrame=YES;NSData *event=[NSJSONSerialization dataWithJSONObject:@{@"revision":@(next),@"platform":@"ios",@"kind":@"frame-ready"} options:0 error:nil];[self request:@"device-event" body:event completion:^(NSData *data,NSError *error){(void)data;(void)error;}];}
          if (touchCount) self.touches++;
          PocketSurfaceView *replacement = weakSurface; if (!replacement) return;
          [self.media drainDevelopment:^BOOL(NSString *identity,uint64_t generation,NSString *reply){return replacement==self.surface && generation==self.revision && [identity isEqual:self.appIdentity] && [replacement tryPostEvent:reply];}];
          [self.location drainDevelopment:^BOOL(NSString *identity,uint64_t generation,NSString *reply){return replacement==self.surface && generation==self.revision && [identity isEqual:self.appIdentity] && [replacement tryPostEvent:reply];}];
          [self.http drain:^BOOL(NSString *reply){return [replacement tryPostEvent:reply];}];
          [self drainDevelopmentClipboardReads:replacement];[self drainNetwork:replacement];
          if(inspect && frame%60==0 && !self.inspectionPending){
            NSData *bytes=[replacement debugTree];id tree=bytes?[NSJSONSerialization JSONObjectWithData:bytes options:0 error:nil]:nil;
            if(tree){NSData *body=[NSJSONSerialization dataWithJSONObject:@{@"revision":@(next),@"platform":@"ios",@"frame":@(frame),@"tree":tree} options:0 error:nil];
              if(body.length<=4*1024*1024+1024){self.inspectionPending=YES;[self request:@"inspection" body:body completion:^(NSData *data,NSError *error){(void)data;(void)error;weak.inspectionPending=NO;}];}}
          }
          if(recording && !sentRecording && frame>=600){sentRecording=YES;NSData *tape=[replacement finishRecording];if(tape)[self request:@"recording" body:tape completion:^(NSData *data,NSError *error){(void)data;if(error)[weak showError:error.localizedDescription];}];}
          // Test-only receipt observes native pixels; it never changes guest state.
          if (PJM_TEST_MODE) {
            uint32_t hash = replacement.presentedHash;
            replacement.accessibilityValue = [NSString stringWithFormat:@"revision=%lu hash=%u width=%u height=%u frames=%llu touches=%lu sdk=%lu highlight=%d",
              (unsigned long)self.revision, hash, replacement.logicalWidth, replacement.logicalHeight,
              frame, (unsigned long)self.touches, (unsigned long)self.sdkReceipt,replacement.highlightedInspectionNode];
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
    MiniInstalledController *controller=[[MiniInstalledController alloc] initWithIdentity:identity store:store launchData:launch error:&error];if(controller){NSString *configurationPath=[NSBundle.mainBundle pathForResource:@"distribution" ofType:@"json"];if(configurationPath){NSData *configuration=bundledData(@"distribution",@"json");if(configuration)[controller startDistribution:configuration identity:identity];}return controller;}
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
