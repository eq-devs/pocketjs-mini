#import "PackageDownload.h"
#import "Mini-Swift.h"
#include <time.h>
static NSError *downloadError(NSString *message){return [NSError errorWithDomain:@"MiniPackageDownload" code:1 userInfo:@{NSLocalizedDescriptionKey:message}];}
static BOOL downloadMatches(id value,NSString *pattern,NSUInteger maximum){if(![value isKindOfClass:NSString.class] || [value length]>maximum)return NO;NSRange range=[value rangeOfString:pattern options:NSRegularExpressionSearch];return range.location==0 && range.length==[value length];}
static NSURL *downloadEndpoint(id address){
    if(![address isKindOfClass:NSString.class] || [address length]>2048)return nil;
    NSURLComponents *parts=[NSURLComponents componentsWithString:address];
    if(![parts.scheme.lowercaseString isEqual:@"https"] || !parts.host.length || parts.user!=nil || parts.password!=nil || parts.query!=nil || parts.fragment!=nil || (parts.port && (parts.port.integerValue<1 || parts.port.integerValue>65535)))return nil;
    // Require a literal absolute authority; URL normalization must not erase credentials.
    NSRange prefix=[address rangeOfString:@"://"];if(prefix.location==NSNotFound)return nil;
    NSString *tail=[address substringFromIndex:NSMaxRange(prefix)];NSRange end=[tail rangeOfCharacterFromSet:[NSCharacterSet characterSetWithCharactersInString:@"/?#"]];NSString *authority=end.location==NSNotFound?tail:[tail substringToIndex:end.location];
    if(!authority.length || [authority containsString:@"@"] || [address rangeOfCharacterFromSet:NSCharacterSet.whitespaceAndNewlineCharacterSet].location!=NSNotFound)return nil;
    return parts.URL;
}
static double downloadClock(void){struct timespec now;clock_gettime(CLOCK_MONOTONIC,&now);return now.tv_sec+now.tv_nsec/1e9;}
@interface MiniPackageDownload ()
@property MiniPackageStore *store;
@property NSString *root;
@property NSString *identity;
@property NSURL *latest;
@property NSURL *manifestURL;
@property NSURL *payloadURL;
@property NSURL *requestedURL;
@property NSString *version;
@property NSData *envelope;
@property NSMutableData *body;
@property NSURLSession *session;
@property NSURLSessionDataTask *task;
@property NSTimer *timer;
@property(copy) void (^completion)(NSString *,NSError *);
@property NSUInteger phase;
@property NSUInteger maximum;
@property double deadline;
@property BOOL active;
@property BOOL closed;
@end
@implementation MiniPackageDownload
static NSMutableSet<NSString *> *downloadRoots;
- (instancetype)initWithStore:(MiniPackageStore *)store {NSAssert(NSThread.isMainThread,@"Download requires main owner");if((self=[super init]))_store=store;return self;}
+ (NSString *)configuration:(NSData *)bytes error:(NSError **)error {
    if(bytes.length>4096){if(error)*error=downloadError(@"Distribution configuration exceeds budget");return nil;}
    id value=[MiniPackageVerifier parseStrictJSON:bytes error:error];
    if(![value isKindOfClass:NSDictionary.class] || [value count]!=2 || ![value[@"format"] isKindOfClass:NSNumber.class] || CFGetTypeID((__bridge CFTypeRef)value[@"format"])==CFBooleanGetTypeID() || [value[@"format"] doubleValue]!=1 || !downloadEndpoint(value[@"latestUrl"])){if(error)*error=downloadError(@"Invalid distribution configuration");return nil;}
    return value[@"latestUrl"];
}
- (NSURLSessionConfiguration *)sessionConfiguration {return NSURLSessionConfiguration.ephemeralSessionConfiguration;}
- (BOOL)startURL:(NSString *)address identity:(NSString *)identity completion:(void (^)(NSString *,NSError *))completion error:(NSError **)error {
    NSAssert(NSThread.isMainThread,@"Download requires main owner");NSURL *url=downloadEndpoint(address);
    if(_closed || _active || !completion || !url || !downloadMatches(identity,@"^[a-zA-Z][a-zA-Z0-9_-]*(?:\\.[a-zA-Z][a-zA-Z0-9_-]*)+$",128)){if(error)*error=downloadError(@"Download unavailable or invalid configuration");return NO;}
    NSString *root=[_store rootIdentity];if(!root){if(error)*error=downloadError(@"Package store unavailable");return NO;}
    if(!downloadRoots)downloadRoots=[NSMutableSet new];
    if(downloadRoots.count>=2 || [downloadRoots containsObject:root]){if(error)*error=downloadError(@"Download BUSY");return NO;}
    [downloadRoots addObject:root];_root=root;_identity=[identity copy];_latest=url;_completion=[completion copy];_active=YES;_phase=0;_deadline=downloadClock()+30;
    NSURLSessionConfiguration *configuration=[[self sessionConfiguration] copy];
    configuration.URLCache=nil;configuration.HTTPCookieStorage=nil;configuration.URLCredentialStorage=nil;configuration.requestCachePolicy=NSURLRequestReloadIgnoringLocalCacheData;configuration.timeoutIntervalForRequest=15;configuration.timeoutIntervalForResource=30;configuration.HTTPMaximumConnectionsPerHost=1;
    _session=[NSURLSession sessionWithConfiguration:configuration delegate:self delegateQueue:NSOperationQueue.mainQueue];
    __weak MiniPackageDownload *weakSelf=self;
    _timer=[NSTimer timerWithTimeInterval:30 repeats:NO block:^(NSTimer *timer){(void)timer;[weakSelf finish:downloadError(@"Download timed out") notify:YES];}];[NSRunLoop.mainRunLoop addTimer:_timer forMode:NSRunLoopCommonModes];
    [self request:url maximum:65536];return YES;
}
- (BOOL)live {return _active && !_closed && downloadClock()<_deadline;}
- (void)request:(NSURL *)url maximum:(NSUInteger)maximum {
    if(![self live]){[self finish:downloadError(@"Download timed out") notify:YES];return;}
    _body=[NSMutableData new];_maximum=maximum;_requestedURL=url;
    NSMutableURLRequest *request=[NSMutableURLRequest requestWithURL:url cachePolicy:NSURLRequestReloadIgnoringLocalCacheData timeoutInterval:MIN(15,_deadline-downloadClock())];
    [request setValue:@"identity" forHTTPHeaderField:@"Accept-Encoding"];[request setValue:@"no-cache" forHTTPHeaderField:@"Cache-Control"];
    _task=[_session dataTaskWithRequest:request];[_task resume];
}
- (NSURL *)sibling:(id)address {NSURL *url=downloadEndpoint(address);return url && [url.host.lowercaseString isEqual:_latest.host.lowercaseString] && [(url.port?:@443) isEqual:(_latest.port?:@443)]?url:nil;}
- (void)finish:(NSError *)error notify:(BOOL)notify {
    NSAssert(NSThread.isMainThread,@"Download requires main owner");if(!_active)return;
    void (^completion)(NSString *,NSError *)=_completion;NSString *version=_version;
    _active=NO;[_timer invalidate];_timer=nil;[_task cancel];_task=nil;[_session invalidateAndCancel];_session=nil;[downloadRoots removeObject:_root];
    _completion=nil;_body=nil;_envelope=nil;_root=nil;_identity=nil;_latest=nil;_manifestURL=nil;_payloadURL=nil;_requestedURL=nil;_version=nil;
    if(notify && completion)completion(error?nil:version,error);
}
- (void)URLSession:(NSURLSession *)session task:(NSURLSessionTask *)task willPerformHTTPRedirection:(NSHTTPURLResponse *)response newRequest:(NSURLRequest *)request completionHandler:(void (^)(NSURLRequest *))completionHandler {
    (void)response;(void)request;completionHandler(nil);if(session==_session && task==_task)[self finish:downloadError(@"Distribution redirect denied") notify:YES];
}
- (void)URLSession:(NSURLSession *)session dataTask:(NSURLSessionDataTask *)task didReceiveResponse:(NSURLResponse *)response completionHandler:(void (^)(NSURLSessionResponseDisposition))completionHandler {
    NSHTTPURLResponse *http=[response isKindOfClass:NSHTTPURLResponse.class]?(id)response:nil;
    BOOL accepted=session==_session && task==_task && [self live] && http.statusCode==200 && [response.URL isEqual:_requestedURL] && (response.expectedContentLength<0 || (uint64_t)response.expectedContentLength<=_maximum);
    completionHandler(accepted?NSURLSessionResponseAllow:NSURLSessionResponseCancel);
    if(!accepted && session==_session && task==_task)[self finish:downloadError(@"Distribution response rejected") notify:YES];
}
- (void)URLSession:(NSURLSession *)session dataTask:(NSURLSessionDataTask *)task didReceiveData:(NSData *)data {
    if(session!=_session || task!=_task)return;
    if(![self live] || data.length>_maximum-_body.length){[self finish:downloadError(@"Distribution stream exceeds budget or deadline") notify:YES];return;}[_body appendData:data];
}
- (void)URLSession:(NSURLSession *)session task:(NSURLSessionTask *)task didCompleteWithError:(NSError *)error {
    if(session!=_session || task!=_task)return;
    if(error || ![self live] || !_body.length){[self finish:error?:downloadError(@"Empty distribution body or deadline exceeded") notify:YES];return;}
    if(_phase==0){
        id index=[MiniPackageVerifier parseStrictJSON:_body error:&error];
        NSURL *manifest=[self sibling:[index isKindOfClass:NSDictionary.class]?index[@"manifestUrl"]:nil],*payload=[self sibling:[index isKindOfClass:NSDictionary.class]?index[@"packageUrl"]:nil];
        if(![index isKindOfClass:NSDictionary.class] || [index count]!=4 || ![index[@"appId"] isEqual:_identity] || !downloadMatches(index[@"version"],@"^(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)$",64) || !manifest || !payload){[self finish:error?:downloadError(@"Invalid distribution index or origin") notify:YES];return;}
        _version=index[@"version"];_manifestURL=manifest;_payloadURL=payload;_phase=1;[self request:manifest maximum:65536];
    }else if(_phase==1){
        id manifest=[MiniPackageVerifier parseStrictJSON:_body error:&error];
        if(![manifest isKindOfClass:NSDictionary.class] || ![manifest[@"appId"] isEqual:_identity] || ![manifest[@"version"] isEqual:_version]){[self finish:error?:downloadError(@"Distribution manifest mismatch") notify:YES];return;}
        _envelope=[_body copy];_phase=2;[self request:_payloadURL maximum:64*1024*1024];
    }else {
        if(![_store stagePayload:_body envelope:_envelope error:&error]){[self finish:error?:downloadError(@"Package admission failed") notify:YES];return;}
        [self finish:nil notify:YES];
    }
}
- (void)close {NSAssert(NSThread.isMainThread,@"Download requires main owner");_closed=YES;[self finish:nil notify:NO];}
@end
