#import "Mini-Swift.h"
#import "InstalledController.h"
// Bounded process-wide rolling windows, independent of controller/generation.
static BOOL MiniHTTPAdmitRate(NSString *identity,double now) {
    static NSMutableDictionary<NSString *,NSMutableArray<NSNumber *> *> *rates;
    static dispatch_once_t once;dispatch_once(&once,^{rates=[NSMutableDictionary new];});
    @synchronized(rates){
        for(NSString *key in [rates.allKeys copy]){NSMutableArray *times=rates[key];while(times.count && [times.firstObject doubleValue]<=now-60)[times removeObjectAtIndex:0];if(!times.count)[rates removeObjectForKey:key];}
        NSMutableArray *times=rates[identity];if(!times){if(rates.count>=64)return NO;times=[NSMutableArray new];rates[identity]=times;}
        if(times.count>=32)return NO;[times addObject:@(now)];return YES;
    }
}
static BOOL MiniClipboardAdmitRate(NSString *identity,double now) {
    static NSMutableDictionary<NSString *,NSMutableArray<NSNumber *> *> *rates;
    static dispatch_once_t once;dispatch_once(&once,^{rates=[NSMutableDictionary new];});
    @synchronized(rates){
        for(NSString *key in [rates.allKeys copy]){NSMutableArray *times=rates[key];while(times.count && [times.firstObject doubleValue]<=now-60)[times removeObjectAtIndex:0];if(!times.count)[rates removeObjectForKey:key];}
        NSMutableArray *times=rates[identity];if(!times){if(rates.count>=64)return NO;times=[NSMutableArray new];rates[identity]=times;}
        if(times.count>=16)return NO;[times addObject:@(now)];return YES;
    }
}
// Resource buffers are owned and accessed exclusively on the main delegate queue.
static NSUInteger MiniResourceSlots;
@interface MiniResource : NSObject
@property NSString *handle;
@property NSString *identity;
@property uint64_t generation;
@property NSMutableData *bytes;
@property NSUInteger length;
@property BOOL ready;
@end
@implementation MiniResource
- (void)dealloc {@synchronized(MiniResource.class){NSCAssert(MiniResourceSlots>0,@"Resource accounting underflow");MiniResourceSlots--;}}
@end
static MiniResource *MiniReserveResource(NSString *identity,uint64_t generation) {
    @synchronized(MiniResource.class){if(MiniResourceSlots>=16)return nil;MiniResourceSlots++;}
    MiniResource *slot=[MiniResource new];slot.handle=[@"r_" stringByAppendingString:[[NSUUID.UUID.UUIDString stringByReplacingOccurrencesOfString:@"-" withString:@""] lowercaseString]];slot.identity=identity;slot.generation=generation;slot.bytes=[NSMutableData dataWithLength:1024*1024];return slot;
}
static BOOL MiniResourceInteger(id value,NSUInteger low,NSUInteger high) {
    if(![value isKindOfClass:NSNumber.class] || CFGetTypeID((__bridge CFTypeRef)value)==CFBooleanGetTypeID())return NO;
    double number=[value doubleValue];return isfinite(number) && floor(number)==number && number>=low && number<=high;
}
// Per-request ephemeral sessions isolate cache, cookies and credentials.
@interface MiniHTTPTask : NSObject <NSURLSessionDataDelegate>
@property MiniVerifiedPackage *package;
@property NSURLSession *session;
@property NSURLSessionDataTask *task;
@property NSMutableData *body;
@property MiniResource *resource;
@property NSHTTPURLResponse *response;
@property NSUInteger redirects;
@property BOOL finished;
@property uint64_t generation;
@property(copy) NSString *reply;
@property(copy) void (^completion)(NSDictionary *);
- (void)cancel;
@end
@implementation MiniHTTPTask
- (void)finish:(NSDictionary *)reply {
    if(_finished)return;_finished=YES;
    void (^completion)(NSDictionary *)=_completion;_completion=nil;
    [_session invalidateAndCancel];_session=nil;_task=nil;_body=nil;_response=nil;
    if(completion)completion(reply);
}
- (void)cancel {_completion=nil;_reply=nil;[self finish:nil];}
- (void)URLSession:(NSURLSession *)session dataTask:(NSURLSessionDataTask *)task didReceiveResponse:(NSURLResponse *)response completionHandler:(void (^)(NSURLSessionResponseDisposition))completionHandler {
    (void)session;(void)task;
    if(_finished || ![response isKindOfClass:NSHTTPURLResponse.class] || response.expectedContentLength>(_resource?1024*1024:1536)){completionHandler(NSURLSessionResponseCancel);[self finish:@{@"ok":@NO,@"error":@{@"code":@"FAILED",@"message":@"HTTP response exceeds inline limit"}}];return;}
    _response=(NSHTTPURLResponse *)response;completionHandler(NSURLSessionResponseAllow);
}
- (void)URLSession:(NSURLSession *)session dataTask:(NSURLSessionDataTask *)task didReceiveData:(NSData *)data {
    (void)session;(void)task;if(_finished)return;
    NSUInteger used=_resource?_resource.length:_body.length,limit=_resource?1024*1024:1536;
    if(data.length>limit-used){[self finish:@{@"ok":@NO,@"error":@{@"code":@"FAILED",@"message":@"HTTP response exceeds inline limit"}}];return;}
    if(_resource){memcpy((uint8_t *)_resource.bytes.mutableBytes+used,data.bytes,data.length);_resource.length+=data.length;}else [_body appendData:data];
}
- (void)URLSession:(NSURLSession *)session task:(NSURLSessionTask *)task willPerformHTTPRedirection:(NSHTTPURLResponse *)response newRequest:(NSURLRequest *)request completionHandler:(void (^)(NSURLRequest *))completionHandler {
    (void)session;(void)task;(void)response;NSError *error=nil;
    if(_finished || ++_redirects>5 || ![_package authorizeURL:request.URL.absoluteString error:&error]){completionHandler(nil);[self finish:@{@"ok":@NO,@"error":@{@"code":@"DENIED",@"message":@"HTTP redirect denied"}}];return;}
    NSMutableURLRequest *next=[request mutableCopy];[next setValue:nil forHTTPHeaderField:@"Authorization"];[next setValue:nil forHTTPHeaderField:@"Cookie"];completionHandler(next);
}
- (void)URLSession:(NSURLSession *)session task:(NSURLSessionTask *)task didCompleteWithError:(NSError *)error {
    (void)session;(void)task;if(_finished)return;
    if(error || !_response){[self finish:@{@"ok":@NO,@"error":@{@"code":error.code==NSURLErrorTimedOut?@"TIMEOUT":@"FAILED",@"message":@"HTTP request failed"}}];return;}
    if(_resource){_resource.ready=YES;[self finish:@{@"ok":@YES,@"data":@{@"status":@(_response.statusCode),@"resource":@{@"handle":_resource.handle,@"size":@(_resource.length)}}}];}
    else [self finish:@{@"ok":@YES,@"data":@{@"status":@(_response.statusCode),@"bodyBase64":[_body base64EncodedStringWithOptions:0]}}];
}
@end
@interface MiniClipboardRead : NSObject
@property MiniVerifiedPackage *package;
@property uint64_t generation;
@property NSNumber *identifier;
@property NSString *reply;
@property NSTimer *timer;
@property UIAlertController *alert;
@property double started;
@end
@implementation MiniClipboardRead
- (void)cancel {[_timer invalidate];_timer=nil;[_alert dismissViewControllerAnimated:NO completion:nil];_alert=nil;}
@end
@interface MiniInstalledController ()
@property(nonatomic) MiniPackageStore *store;
@property(nonatomic,readwrite) PocketSurfaceView *surface;
@property(nonatomic) UILabel *message;
@property(nonatomic) NSMutableDictionary<NSString *,MiniHTTPTask *> *requests;
@property(nonatomic) NSMutableDictionary<NSString *,MiniResource *> *resources;
@property(nonatomic) NSMutableDictionary<NSString *,MiniClipboardRead *> *clipboardReads;
@end
@implementation MiniInstalledController
- (instancetype)initWithIdentity:(NSString *)identity store:(MiniPackageStore *)store launchData:(NSData *)launch error:(NSError **)error {
    self=[super initWithNibName:nil bundle:nil];if(!self)return nil;
    _store=store;_surface=[[PocketSurfaceView alloc] initWithInstalledIdentity:identity store:store storageRoot:nil launchData:launch error:error];if(!_surface)return nil;
    __weak MiniInstalledController *weakSelf=self;
    _requests=[NSMutableDictionary new];_resources=[NSMutableDictionary new];_clipboardReads=[NSMutableDictionary new];
    _surface.onError=^(NSString *message){(void)message;MiniInstalledController *owner=weakSelf;owner.message.text=@"Unable to run this app.";owner.message.hidden=NO;};
    _surface.onVerifiedEffect=^(MiniVerifiedPackage *package,uint64_t generation,NSString *line){[weakSelf dispatchService:line package:package generation:generation];};
    _surface.onVerifiedRetirement=^(MiniVerifiedPackage *package,uint64_t generation){(void)package;[weakSelf cancelGeneration:generation];};
    _surface.onVerifiedFrameStart=^{[weakSelf drainHTTP];};
    return self;
}
- (void)viewDidLoad {
    [super viewDidLoad];self.view.backgroundColor=UIColor.blackColor;
    [self.view addSubview:_surface];_surface.autoresizingMask=UIViewAutoresizingFlexibleWidth|UIViewAutoresizingFlexibleHeight;_surface.isAccessibilityElement=YES;_surface.accessibilityIdentifier=@"pjm-signed-surface";
    _message=[UILabel new];_message.textColor=UIColor.whiteColor;_message.numberOfLines=0;_message.textAlignment=NSTextAlignmentCenter;_message.hidden=YES;_message.accessibilityIdentifier=@"pjm-status";[self.view addSubview:_message];[self layoutSurface];
}
- (void)layoutSurface {CGRect bounds=UIEdgeInsetsInsetRect(self.view.bounds,self.view.safeAreaInsets);_surface.frame=bounds;_message.frame=CGRectInset(bounds,16,16);}
- (void)viewDidLayoutSubviews {[super viewDidLayoutSubviews];[self layoutSurface];}
- (void)viewSafeAreaInsetsDidChange {[super viewSafeAreaInsetsDidChange];[self layoutSurface];}
- (void)viewDidAppear:(BOOL)animated {[super viewDidAppear:animated];[self layoutSurface];[_surface resumeForHost];[_surface start];}
- (void)viewDidDisappear:(BOOL)animated {[super viewDidDisappear:animated];[_surface stop];[_surface suspendForHost];}
- (BOOL)openIdentity:(NSString *)identity launchData:(NSData *)launch error:(NSError **)error {
    BOOL opened=[_surface activateInstalledIdentity:identity store:_store launchData:launch error:error];if(opened)_message.hidden=YES;return opened;
}
- (void)cancelGeneration:(uint64_t)generation {
    for(NSString *key in [_clipboardReads.allKeys copy])if(_clipboardReads[key].generation==generation){[_clipboardReads[key] cancel];[_clipboardReads removeObjectForKey:key];}
    for(NSString *handle in [_resources.allKeys copy])if(_resources[handle].generation==generation)[_resources removeObjectForKey:handle];
    NSString *prefix=[NSString stringWithFormat:@"%llu:",(unsigned long long)generation];
    for(NSString *key in [_requests.allKeys copy])if([key hasPrefix:prefix]){[_requests[key] cancel];[_requests removeObjectForKey:key];}
}
- (NSURLSessionConfiguration *)httpConfiguration {return NSURLSessionConfiguration.ephemeralSessionConfiguration;}
- (BOOL)admitHTTPRateForIdentity:(NSString *)identity time:(double)now {return MiniHTTPAdmitRate(identity,now);}
- (void)drainHTTP {
    for(NSString *key in [_clipboardReads.allKeys copy]){MiniClipboardRead *work=_clipboardReads[key];if(work.reply && [_surface postVerifiedEvent:work.reply identity:work.package.metadata[@"appId"] generation:work.generation error:nil]){[work cancel];[_clipboardReads removeObjectForKey:key];}}
    for(NSString *key in [_requests.allKeys copy]){
        MiniHTTPTask *work=_requests[key];if(!work.reply)continue;
        if([_surface postVerifiedEvent:work.reply identity:work.package.metadata[@"appId"] generation:work.generation error:nil]){if(work.resource && !work.resource.ready)[_resources removeObjectForKey:work.resource.handle];[_requests removeObjectForKey:key];}
    }
}
- (MiniResource *)reserveResourceForIdentity:(NSString *)identity generation:(uint64_t)generation {
    NSAssert(NSThread.isMainThread,@"Resources require main owner");
    NSUInteger count=0;for(NSString *handle in _resources)if(_resources[handle].generation==generation)count++;
    if(count>=4)return nil;MiniResource *resource=MiniReserveResource(identity,generation);if(resource)_resources[resource.handle]=resource;return resource;
}
- (NSDictionary *)startHTTP:(id)arguments identifier:(NSNumber *)identifier package:(MiniVerifiedPackage *)package generation:(uint64_t)generation {
    NSDictionary *(^failure)(NSString *,NSString *)=^NSDictionary *(NSString *code,NSString *message){return @{@"ok":@NO,@"error":@{@"code":code,@"message":message}};};
    if(![arguments isKindOfClass:NSDictionary.class])return failure(@"PROTOCOL",@"Invalid HTTP arguments");
    NSDictionary *args=arguments;for(id key in args)if(![@[@"url",@"method",@"headers",@"bodyBase64",@"responseMode"] containsObject:key])return failure(@"PROTOCOL",@"Unknown HTTP argument");
    id mode=args[@"responseMode"]?:@"inline";if(![@[@"inline",@"resource"] containsObject:mode])return failure(@"PROTOCOL",@"Invalid response mode");
    id address=args[@"url"],method=args[@"method"]?:@"GET",headers=args[@"headers"]?:@{},body=args[@"bodyBase64"]?:@"";
    if(![address isKindOfClass:NSString.class] || [address length]==0 || [address lengthOfBytesUsingEncoding:NSUTF8StringEncoding]>2048 || ![@[@"GET",@"HEAD",@"POST",@"PUT",@"PATCH",@"DELETE"] containsObject:method] || ![headers isKindOfClass:NSDictionary.class] || [headers count]>16 || ![body isKindOfClass:NSString.class] || [body length]>2048)return failure(@"PROTOCOL",@"Invalid HTTP arguments");
    NSData *bytes=[[NSData alloc] initWithBase64EncodedString:body options:0];
    if(!bytes || bytes.length>1536 || (![body isEqual:[bytes base64EncodedStringWithOptions:0]]) || (([method isEqual:@"GET"] || [method isEqual:@"HEAD"]) && bytes.length))return failure(@"PROTOCOL",@"Invalid HTTP body");
    NSError *error=nil;if(![package authorizeURL:address error:&error])return failure(@"DENIED",@"HTTP URL denied by package policy");
    NSMutableURLRequest *request=[NSMutableURLRequest requestWithURL:[NSURL URLWithString:address] cachePolicy:NSURLRequestReloadIgnoringLocalCacheData timeoutInterval:15];request.HTTPMethod=method;request.HTTPBody=bytes.length?bytes:nil;request.HTTPShouldHandleCookies=NO;
    NSUInteger headerBytes=0;NSMutableSet *headerNames=[NSMutableSet new];
    for(id name in headers){id value=headers[name];
        if(![name isKindOfClass:NSString.class] || ![value isKindOfClass:NSString.class] || [name length]==0 || [name length]>64 || [name rangeOfString:@"^[A-Za-z0-9-]+$" options:NSRegularExpressionSearch].length!=[name length] || [value lengthOfBytesUsingEncoding:NSUTF8StringEncoding]>256 || [value rangeOfCharacterFromSet:NSCharacterSet.controlCharacterSet].location!=NSNotFound || [@[@"host",@"cookie",@"content-length",@"connection",@"transfer-encoding",@"proxy-authorization"] containsObject:[name lowercaseString]])return failure(@"PROTOCOL",@"Invalid HTTP header");
        if(![value dataUsingEncoding:NSASCIIStringEncoding allowLossyConversion:NO])return failure(@"PROTOCOL",@"HTTP header must use printable ASCII");
        NSString *lower=[name lowercaseString];if([headerNames containsObject:lower])return failure(@"PROTOCOL",@"Duplicate HTTP header");[headerNames addObject:lower];
        headerBytes+=[name lengthOfBytesUsingEncoding:NSUTF8StringEncoding]+[value lengthOfBytesUsingEncoding:NSUTF8StringEncoding];if(headerBytes>1024)return failure(@"PROTOCOL",@"HTTP headers exceed limit");[request setValue:value forHTTPHeaderField:name];
    }
    NSString *prefix=[NSString stringWithFormat:@"%llu:",(unsigned long long)generation],*key=[prefix stringByAppendingString:identifier.stringValue];NSUInteger guestCount=0;for(NSString *candidate in _requests)if([candidate hasPrefix:prefix])guestCount++;
    if(_requests[key] || _requests.count>=8 || guestCount>=4)return failure(@"BUSY",@"Too many HTTP requests");
    if(![self admitHTTPRateForIdentity:package.metadata[@"appId"] time:NSProcessInfo.processInfo.systemUptime])return failure(@"BUSY",@"Application HTTP rate limit exceeded");
    MiniResource *resource=nil;if([mode isEqual:@"resource"]){if(!(resource=[self reserveResourceForIdentity:package.metadata[@"appId"] generation:generation]))return failure(@"BUSY",@"Resource capacity exceeded");}
    MiniHTTPTask *work=[MiniHTTPTask new];work.resource=resource;work.package=package;work.generation=generation;work.body=[NSMutableData new];
    __weak MiniInstalledController *weakSelf=self;
    work.completion=^(NSDictionary *result){MiniInstalledController *owner=weakSelf;if(!owner)return;MiniHTTPTask *bound=owner.requests[key];if(!bound)return;NSMutableDictionary *reply=[result mutableCopy];reply[@"v"]=@1;reply[@"id"]=identifier;NSData *encoded=[NSJSONSerialization dataWithJSONObject:reply options:NSJSONWritingWithoutEscapingSlashes error:nil];if(!encoded || encoded.length>4096)encoded=[NSJSONSerialization dataWithJSONObject:@{@"v":@1,@"id":identifier,@"ok":@NO,@"error":@{@"code":@"FAILED",@"message":@"HTTP reply exceeds limit"}} options:0 error:nil];bound.reply=[[NSString alloc] initWithData:encoded encoding:NSUTF8StringEncoding];};
    NSURLSessionConfiguration *config=[self httpConfiguration];config.URLCache=nil;config.HTTPCookieStorage=nil;config.URLCredentialStorage=nil;config.HTTPShouldSetCookies=NO;config.timeoutIntervalForRequest=15;config.timeoutIntervalForResource=15;config.HTTPMaximumConnectionsPerHost=4;
    work.session=[NSURLSession sessionWithConfiguration:config delegate:work delegateQueue:NSOperationQueue.mainQueue];work.task=[work.session dataTaskWithRequest:request];_requests[key]=work;[work.task resume];return nil;
}
- (void)dispatchService:(NSString *)line package:(MiniVerifiedPackage *)package generation:(uint64_t)generation {
    NSData *record=[line dataUsingEncoding:NSUTF8StringEncoding];if(record.length>4096)return;
    id parsed=[MiniPackageVerifier parseStrictJSON:record error:nil];if(![parsed isKindOfClass:NSDictionary.class])return;
    NSDictionary *request=parsed;id identifier=request[@"id"],version=request[@"v"],kind=request[@"kind"];
    if(![identifier isKindOfClass:NSNumber.class] || CFGetTypeID((__bridge CFTypeRef)identifier)==CFBooleanGetTypeID())return;
    double number=[identifier doubleValue];if(!isfinite(number) || number<1 || number>9007199254740991.0 || floor(number)!=number)return;
    NSMutableDictionary *reply=[@{@"v":@1,@"id":identifier} mutableCopy];NSString *code=nil,*message=nil;
    if(![version isKindOfClass:NSNumber.class] || CFGetTypeID((__bridge CFTypeRef)version)==CFBooleanGetTypeID() || [version doubleValue]!=1 || ![kind isKindOfClass:NSString.class] || [kind length]>64 || [kind rangeOfString:@"^[a-z][a-zA-Z0-9.]*\\.v[1-9][0-9]*$" options:NSRegularExpressionSearch].length!=[kind length] || ![kind length] || !request[@"args"]){code=@"PROTOCOL";message=@"Invalid service request";}
    else if([kind isEqual:@"device.info.v1"]){MpConfig config=package.config;reply[@"data"]=@{@"platform":@"ios",@"model":UIDevice.currentDevice.model,@"width":@(config.width),@"height":@(config.height),@"density":@(config.density),@"safeTop":@0,@"safeBottom":@0,@"safeLeft":@0,@"safeRight":@0};}
    else if([kind isEqual:@"clipboard.write.v1"]){NSDictionary *result=[self clipboardWrite:request[@"args"] identity:package.metadata[@"appId"]];[reply addEntriesFromDictionary:result];if(![result[@"ok"] boolValue]){code=result[@"error"][@"code"];message=result[@"error"][@"message"];}}
    else if([kind isEqual:@"clipboard.read.v1"]){NSDictionary *result=[self startClipboardRead:request[@"args"] identifier:identifier package:package generation:generation];if(!result)return;[reply addEntriesFromDictionary:result];if(![result[@"ok"] boolValue]){code=result[@"error"][@"code"];message=result[@"error"][@"message"];}}
    else if([kind isEqual:@"request.v1"]){NSDictionary *result=[self startHTTP:request[@"args"] identifier:identifier package:package generation:generation];if(!result)return;[reply addEntriesFromDictionary:result];if(![result[@"ok"] boolValue]){code=result[@"error"][@"code"];message=result[@"error"][@"message"];}}
    else if([kind isEqual:@"resource.read.v1"] || [kind isEqual:@"resource.release.v1"]){NSDictionary *result=[self resourceService:kind arguments:request[@"args"] identity:package.metadata[@"appId"] generation:generation];[reply addEntriesFromDictionary:result];if(![result[@"ok"] boolValue]){code=result[@"error"][@"code"];message=result[@"error"][@"message"];}}
    else if([kind isEqual:@"cancel.v1"]){NSString *key=[NSString stringWithFormat:@"%llu:%@",(unsigned long long)generation,identifier];[_clipboardReads[key] cancel];[_clipboardReads removeObjectForKey:key];MiniHTTPTask *work=_requests[key];if(work.resource)[_resources removeObjectForKey:work.resource.handle];[work cancel];[_requests removeObjectForKey:key];reply[@"data"]=NSNull.null;}
    else {code=@"UNSUPPORTED";message=@"Unsupported native service";}
    reply[@"ok"]=code?@NO:@YES;if(code)reply[@"error"]=@{@"code":code,@"message":message};
    NSData *encoded=[NSJSONSerialization dataWithJSONObject:reply options:NSJSONWritingWithoutEscapingSlashes error:nil];if(encoded && encoded.length<=4096){NSError *failure=nil;[_surface postVerifiedEvent:[[NSString alloc] initWithData:encoded encoding:NSUTF8StringEncoding] identity:package.metadata[@"appId"] generation:generation error:&failure];}
}
- (NSDictionary *)resourceService:(NSString *)kind arguments:(id)arguments identity:(NSString *)identity generation:(uint64_t)generation {
    NSAssert(NSThread.isMainThread,@"Resources require main owner");
    NSDictionary *(^fail)(NSString *)=^NSDictionary *(NSString *code){return @{@"ok":@NO,@"error":@{@"code":code,@"message":@"Invalid resource request"}};};
    BOOL read=[kind isEqual:@"resource.read.v1"];if(![arguments isKindOfClass:NSDictionary.class])return fail(@"PROTOCOL");NSDictionary *args=arguments;
    if(args.count!=(read?3:1) || ![args[@"handle"] isKindOfClass:NSString.class] || (read && (!MiniResourceInteger(args[@"offset"],0,1024*1024) || !MiniResourceInteger(args[@"count"],1,1536))))return fail(@"PROTOCOL");
    MiniResource *slot=_resources[args[@"handle"]];if(!slot || !slot.ready || slot.generation!=generation || ![slot.identity isEqual:identity])return fail(@"DENIED");
    if(!read){[_resources removeObjectForKey:slot.handle];return @{@"ok":@YES,@"data":NSNull.null};}
    NSUInteger offset=[args[@"offset"] unsignedIntegerValue];if(offset>slot.length)return fail(@"PROTOCOL");NSUInteger count=MIN([args[@"count"] unsignedIntegerValue],slot.length-offset);
    NSData *chunk=[slot.bytes subdataWithRange:NSMakeRange(offset,count)];return @{@"ok":@YES,@"data":@{@"bodyBase64":[chunk base64EncodedStringWithOptions:0],@"offset":@(offset),@"nextOffset":@(offset+count),@"size":@(slot.length),@"eof":(offset+count==slot.length?@YES:@NO)}};
}
- (void)writeClipboardText:(NSString *)text {UIPasteboard.generalPasteboard.string=text;}
- (BOOL)admitClipboardRateForIdentity:(NSString *)identity time:(double)now {return MiniClipboardAdmitRate(identity,now);}
- (NSDictionary *)clipboardWrite:(id)arguments identity:(NSString *)identity {
    NSAssert(NSThread.isMainThread,@"Clipboard requires main owner");
    NSDictionary *(^fail)(NSString *,NSString *)=^NSDictionary *(NSString *code,NSString *message){return @{@"ok":@NO,@"error":@{@"code":code,@"message":message}};};
    if(![arguments isKindOfClass:NSDictionary.class] || [arguments count]!=1 || ![arguments[@"text"] isKindOfClass:NSString.class])return fail(@"PROTOCOL",@"Invalid clipboard write");
    NSString *text=arguments[@"text"];NSData *utf8=[text dataUsingEncoding:NSUTF8StringEncoding allowLossyConversion:NO],*json=[NSJSONSerialization dataWithJSONObject:text options:NSJSONWritingFragmentsAllowed|NSJSONWritingWithoutEscapingSlashes error:nil];
    if(!utf8 || utf8.length>2048 || !json || json.length>3072)return fail(@"PROTOCOL",@"Clipboard text exceeds record limit");
    if(![self admitClipboardRateForIdentity:identity time:NSProcessInfo.processInfo.systemUptime])return fail(@"BUSY",@"Clipboard rate limit exceeded");
    @try{[self writeClipboardText:text];}@catch(NSException *exception){(void)exception;return fail(@"FAILED",@"Clipboard write failed");}
    return @{@"ok":@YES,@"data":NSNull.null};
}
- (NSString *)readClipboardText {UIPasteboard *board=UIPasteboard.generalPasteboard;return board.hasStrings?board.string:@"";}
- (double)clipboardTime {return NSProcessInfo.processInfo.systemUptime;}
- (BOOL)clipboardForeground {return UIApplication.sharedApplication.applicationState==UIApplicationStateActive && self.viewIfLoaded.window!=nil;}
- (void)finishClipboardRead:(MiniClipboardRead *)work key:(NSString *)key code:(NSString *)code text:(NSString *)text {
    if(_clipboardReads[key]!=work || work.reply)return;[work cancel];
    NSMutableDictionary *reply=[@{@"v":@1,@"id":work.identifier,@"ok":code?@NO:@YES} mutableCopy];
    if(code)reply[@"error"]=@{@"code":code,@"message":@"Clipboard read rejected"};else reply[@"data"]=@{@"text":text?:@""};
    NSData *bytes=[NSJSONSerialization dataWithJSONObject:reply options:NSJSONWritingWithoutEscapingSlashes error:nil];work.reply=[[NSString alloc] initWithData:bytes encoding:NSUTF8StringEncoding];
}
- (BOOL)clipboardReadReady:(MiniClipboardRead *)work key:(NSString *)key {
    if(_clipboardReads[key]!=work || work.reply)return NO;
    if([self clipboardTime]-work.started>=15){[self finishClipboardRead:work key:key code:@"TIMEOUT" text:nil];return NO;}
    if(![self clipboardForeground]){[self finishClipboardRead:work key:key code:@"BUSY" text:nil];return NO;}
    return YES;
}
- (void)performClipboardRead:(MiniClipboardRead *)work key:(NSString *)key {
    if(![self clipboardReadReady:work key:key])return;
    NSError *error=nil;MiniPermissionStatus status=[_store permissionStatus:@"clipboard.read" package:work.package osGranted:YES error:&error];
    if(status!=MiniPermissionGranted){[self finishClipboardRead:work key:key code:status==MiniPermissionUnavailable?@"FAILED":@"DENIED" text:nil];return;}
    NSString *text=nil;@try{text=[self readClipboardText];}@catch(NSException *exception){(void)exception;[self finishClipboardRead:work key:key code:@"FAILED" text:nil];return;}
    if(!text){[self finishClipboardRead:work key:key code:@"DENIED" text:nil];return;}
    NSData *raw=[text dataUsingEncoding:NSUTF8StringEncoding allowLossyConversion:NO],*json=[NSJSONSerialization dataWithJSONObject:text options:NSJSONWritingFragmentsAllowed|NSJSONWritingWithoutEscapingSlashes error:nil];
    if(!raw || raw.length>2048 || !json || json.length>3072){[self finishClipboardRead:work key:key code:@"FAILED" text:nil];return;}
    [self finishClipboardRead:work key:key code:nil text:text];
}
- (NSDictionary *)startClipboardRead:(id)arguments identifier:(NSNumber *)identifier package:(MiniVerifiedPackage *)package generation:(uint64_t)generation {
    NSAssert(NSThread.isMainThread,@"Clipboard requires main owner");
    NSDictionary *(^fail)(NSString *)=^NSDictionary *(NSString *code){return @{@"ok":@NO,@"error":@{@"code":code,@"message":@"Clipboard read rejected"}};};
    if(![arguments isKindOfClass:NSDictionary.class] || [arguments count])return fail(@"PROTOCOL");
    NSError *error=nil;MiniPermissionStatus status=[_store permissionStatus:@"clipboard.read" package:package osGranted:YES error:&error];
    if(status==MiniPermissionUnavailable)return fail(@"FAILED");if(status==MiniPermissionDenied)return fail(@"DENIED");
    NSString *key=[NSString stringWithFormat:@"%llu:%@",(unsigned long long)generation,identifier];
    if(_clipboardReads.count>=4 || _clipboardReads[key] || (status==MiniPermissionPrompt && self.presentedViewController))return fail(@"BUSY");
    if(![self clipboardForeground])return fail(@"BUSY");
    if(![self admitClipboardRateForIdentity:package.metadata[@"appId"] time:[self clipboardTime]])return fail(@"BUSY");
    MiniClipboardRead *work=[MiniClipboardRead new];work.package=package;work.generation=generation;work.identifier=identifier;work.started=[self clipboardTime];_clipboardReads[key]=work;
    __weak MiniInstalledController *weakSelf=self;__weak MiniClipboardRead *weakWork=work;
    work.timer=[NSTimer timerWithTimeInterval:15 repeats:NO block:^(NSTimer *timer){(void)timer;MiniClipboardRead *bound=weakWork;if(bound)[weakSelf finishClipboardRead:bound key:key code:@"TIMEOUT" text:nil];}];
    [NSRunLoop.mainRunLoop addTimer:work.timer forMode:NSRunLoopCommonModes];
    if(status==MiniPermissionGranted){[self performClipboardRead:work key:key];return nil;}
    UIAlertController *alert=[UIAlertController alertControllerWithTitle:@"Clipboard access" message:[NSString stringWithFormat:@"Allow %@ to read clipboard text?",package.metadata[@"appId"]] preferredStyle:UIAlertControllerStyleAlert];work.alert=alert;
    void (^decide)(BOOL)=^(BOOL approved){MiniInstalledController *owner=weakSelf;MiniClipboardRead *bound=weakWork;if(!owner || !bound || ![owner clipboardReadReady:bound key:key])return;bound.alert=nil;
        NSError *failure=nil;MiniPermissionStatus selected=[owner.store recordPermissionApproval:approved permission:@"clipboard.read" package:bound.package osGranted:YES error:&failure];
        if(selected==MiniPermissionGranted)[owner performClipboardRead:bound key:key];else [owner finishClipboardRead:bound key:key code:selected==MiniPermissionUnavailable?@"FAILED":@"DENIED" text:nil];};
    [alert addAction:[UIAlertAction actionWithTitle:@"Don’t allow" style:UIAlertActionStyleCancel handler:^(UIAlertAction *action){(void)action;decide(NO);}]];
    [alert addAction:[UIAlertAction actionWithTitle:@"Allow" style:UIAlertActionStyleDefault handler:^(UIAlertAction *action){(void)action;decide(YES);}]];
    [self presentViewController:alert animated:YES completion:nil];return nil;
}
- (void)shutdown {[_surface shutdown];for(MiniClipboardRead *work in _clipboardReads.allValues)[work cancel];[_clipboardReads removeAllObjects];for(MiniHTTPTask *work in _requests.allValues)[work cancel];[_requests removeAllObjects];[_resources removeAllObjects];}
- (void)dealloc {[_surface shutdown];for(MiniClipboardRead *work in _clipboardReads.allValues)[work cancel];for(MiniHTTPTask *work in _requests.allValues)[work cancel];}
@end
