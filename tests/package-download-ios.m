#import "PackageDownload.h"
#include <assert.h>
static NSDictionary *DownloadFixture;
static NSString *DownloadMode;
static NSUInteger DownloadRequests;
@interface DownloadProtocol : NSURLProtocol
@end
@implementation DownloadProtocol
+ (BOOL)canInitWithRequest:(NSURLRequest *)request {return [request.URL.host isEqual:@"distribution.example"];}
+ (NSURLRequest *)canonicalRequestForRequest:(NSURLRequest *)request {return request;}
- (void)startLoading {
    @synchronized(DownloadProtocol.class){DownloadRequests++;}
    if([DownloadMode isEqual:@"hold"])return;
    NSString *path=self.request.URL.path;NSData *body=nil;NSInteger status=200;
    if([path isEqual:@"/latest.json"]){
        NSDictionary *index=@{@"appId":@"dev.pjm.fixture",@"version":@"2.0.0",@"manifestUrl":[DownloadMode isEqual:@"origin"]?@"https://other.example/manifest.json":@"https://distribution.example/manifest.json",@"packageUrl":@"https://distribution.example/main.pocket"};body=[NSJSONSerialization dataWithJSONObject:index options:0 error:nil];
        if([DownloadMode isEqual:@"duplicate"])body=[@"{\"appId\":\"dev.pjm.fixture\",\"appId\":\"dev.pjm.fixture\",\"version\":\"2.0.0\",\"manifestUrl\":\"https://distribution.example/manifest.json\",\"packageUrl\":\"https://distribution.example/main.pocket\"}" dataUsingEncoding:NSUTF8StringEncoding];
        if([DownloadMode isEqual:@"bounds"])body=[NSMutableData dataWithLength:65537];
        if([DownloadMode isEqual:@"redirect"])status=302;
    }else if([path isEqual:@"/manifest.json"]){body=[NSJSONSerialization dataWithJSONObject:DownloadFixture[@"update"][@"manifest"] options:0 error:nil];}
    else if([path isEqual:@"/main.pocket"]){NSMutableData *payload=[[[NSData alloc] initWithBase64EncodedString:DownloadFixture[@"update"][@"payload"] options:0] mutableCopy];if([DownloadMode isEqual:@"tamper"])((uint8_t *)payload.mutableBytes)[0]^=1;body=payload;}
    else {status=404;body=[@"missing" dataUsingEncoding:NSUTF8StringEncoding];}
    // Omit Content-Length so actual stream accounting is required.
    NSHTTPURLResponse *response=[[NSHTTPURLResponse alloc] initWithURL:self.request.URL statusCode:status HTTPVersion:@"HTTP/1.1" headerFields:@{}];
    [self.client URLProtocol:self didReceiveResponse:response cacheStoragePolicy:NSURLCacheStorageNotAllowed];
    NSUInteger half=body.length/2;[self.client URLProtocol:self didLoadData:[body subdataWithRange:NSMakeRange(0,half)]];[self.client URLProtocol:self didLoadData:[body subdataWithRange:NSMakeRange(half,body.length-half)]];[self.client URLProtocolDidFinishLoading:self];
}
- (void)stopLoading {}
@end
@interface TestPackageDownload : MiniPackageDownload
@end
@implementation TestPackageDownload
- (NSURLSessionConfiguration *)sessionConfiguration {NSURLSessionConfiguration *config=NSURLSessionConfiguration.ephemeralSessionConfiguration;config.protocolClasses=@[DownloadProtocol.class];return config;}
@end
static void downloadWait(BOOL (^done)(void)){NSDate *end=[NSDate dateWithTimeIntervalSinceNow:10];while(!done() && end.timeIntervalSinceNow>0)[NSRunLoop.currentRunLoop runUntilDate:[NSDate dateWithTimeIntervalSinceNow:0.005]];assert(done());}
int main(int argc,char **argv){@autoreleasepool{
    assert(argc==2);NSArray *cases=[NSJSONSerialization JSONObjectWithData:[NSData dataWithContentsOfFile:@(argv[1])] options:0 error:nil];DownloadFixture=cases.firstObject;assert(DownloadFixture[@"update"]);
    NSString *base=[@(argv[1]) stringByDeletingLastPathComponent],*root=[base stringByAppendingPathComponent:@"download-cache"];NSError *error=nil;
    NSData *key=[[NSData alloc] initWithBase64EncodedString:DownloadFixture[@"key"] options:0],*payload=[[NSData alloc] initWithBase64EncodedString:DownloadFixture[@"payload"] options:0],*envelope=[NSJSONSerialization dataWithJSONObject:DownloadFixture[@"manifest"] options:0 error:nil];
    MiniPackageStore *store=[[MiniPackageStore alloc] initWithRoot:root trustedKey:key error:&error];assert(store && [store seedPayload:payload envelope:envelope error:&error]);MiniVerifiedPackage *running=[store coldStart:@"dev.pjm.fixture" error:&error];assert(running);
    TestPackageDownload *download=[[TestPackageDownload alloc] initWithStore:store];__block BOOL done=NO;__block NSError *failure=nil;__block NSString *version=nil;
    void (^completion)(NSString *,NSError *)=^(NSString *selected,NSError *rejected){done=YES;version=selected;failure=rejected;};
    DownloadMode=@"valid";assert([download startURL:@"https://distribution.example/latest.json" identity:@"dev.pjm.fixture" completion:completion error:&error]);downloadWait(^BOOL{return done;});assert(!failure && [version isEqual:@"2.0.0"] && [running.metadata[@"version"] isEqual:@"1.0.0"]);
    MiniPackageStore *reopened=[[MiniPackageStore alloc] initWithRoot:root trustedKey:key error:&error];assert([[reopened coldStart:@"dev.pjm.fixture" error:&error].metadata[@"version"] isEqual:@"2.0.0"]);assert([reopened rollback:@"dev.pjm.fixture" error:&error]);assert([[reopened coldStart:@"dev.pjm.fixture" error:&error].metadata[@"version"] isEqual:@"1.0.0"]);
    NSString *state=[root stringByAppendingPathComponent:@"dev.pjm.fixture/state.json"];NSData *before=[NSData dataWithContentsOfFile:state];
    for(NSString *mode in @[@"tamper",@"origin",@"redirect",@"duplicate",@"bounds"]){DownloadMode=mode;done=NO;failure=nil;error=nil;assert([download startURL:@"https://distribution.example/latest.json" identity:@"dev.pjm.fixture" completion:completion error:&error]);downloadWait(^BOOL{return done;});assert(failure && !version && [[NSData dataWithContentsOfFile:state] isEqual:before]);}
    for(NSString *address in @[@"http://distribution.example/latest.json",@"https://@distribution.example/latest.json",@"https://distribution.example/latest.json?",@"https://distribution.example/latest.json#"]){error=nil;assert(![download startURL:address identity:@"dev.pjm.fixture" completion:completion error:&error] && error);}
    error=nil;assert([MiniPackageDownload configuration:[@"{\"format\":1,\"latestUrl\":\"https://distribution.example/latest.json\"}" dataUsingEncoding:NSUTF8StringEncoding] error:&error]);assert(![MiniPackageDownload configuration:[@"{\"format\":true,\"latestUrl\":\"https://distribution.example/latest.json\"}" dataUsingEncoding:NSUTF8StringEncoding] error:&error]);
    DownloadMode=@"hold";done=NO;NSUInteger count=DownloadRequests;assert([download startURL:@"https://distribution.example/latest.json" identity:@"dev.pjm.fixture" completion:completion error:&error]);downloadWait(^BOOL{return DownloadRequests>count;});
    TestPackageDownload *same=[[TestPackageDownload alloc] initWithStore:reopened];error=nil;assert(![same startURL:@"https://distribution.example/latest.json" identity:@"dev.pjm.fixture" completion:completion error:&error] && error);
    MiniPackageStore *otherStore=[[MiniPackageStore alloc] initWithRoot:[base stringByAppendingPathComponent:@"other-cache"] trustedKey:key error:&error];TestPackageDownload *other=[[TestPackageDownload alloc] initWithStore:otherStore];assert([other startURL:@"https://distribution.example/latest.json" identity:@"dev.pjm.fixture" completion:completion error:&error]);
    MiniPackageStore *thirdStore=[[MiniPackageStore alloc] initWithRoot:[base stringByAppendingPathComponent:@"third-cache"] trustedKey:key error:&error];TestPackageDownload *third=[[TestPackageDownload alloc] initWithStore:thirdStore];error=nil;assert(![third startURL:@"https://distribution.example/latest.json" identity:@"dev.pjm.fixture" completion:completion error:&error] && error);
    [download close];[other close];DownloadMode=@"valid";failure=nil;assert([same startURL:@"https://distribution.example/latest.json" identity:@"dev.pjm.fixture" completion:completion error:&error]);downloadWait(^BOOL{return done;});assert(!failure && [version isEqual:@"2.0.0"]);[same close];[third close];
    puts("PACKAGE_DOWNLOAD iOS controlled-native passed cold-update rollback tamper origin redirect duplicate streamed-limit quota retirement recovery");
}return 0;}
