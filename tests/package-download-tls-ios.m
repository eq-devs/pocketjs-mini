#import "PackageDownload.h"
#import <Security/Security.h>
#include <assert.h>
/** Test-only trust anchor. The production downloader has no challenge override. */
@interface TLSPackageDownload : MiniPackageDownload
@property NSData *testCertificate;
@property BOOL rejectHostname;
@property BOOL hostnameValidationRejected;
@end
@implementation TLSPackageDownload
- (void)URLSession:(NSURLSession *)session didReceiveChallenge:(NSURLAuthenticationChallenge *)challenge completionHandler:(void (^)(NSURLSessionAuthChallengeDisposition,NSURLCredential *))completionHandler {
    (void)session;
    if(![challenge.protectionSpace.authenticationMethod isEqual:NSURLAuthenticationMethodServerTrust]){completionHandler(NSURLSessionAuthChallengePerformDefaultHandling,nil);return;}
    SecTrustRef trust=challenge.protectionSpace.serverTrust;
    SecCertificateRef certificate=SecCertificateCreateWithData(NULL,(__bridge CFDataRef)_testCertificate);
    SecPolicyRef policy=SecPolicyCreateSSL(true,(__bridge CFStringRef)(_rejectHostname?@"wrong-host.invalid":challenge.protectionSpace.host));
    NSArray *anchors=certificate?@[(__bridge id)certificate]:@[];CFErrorRef error=NULL;
    BOOL accepted=trust && certificate && policy && SecTrustSetAnchorCertificates(trust,(__bridge CFArrayRef)anchors)==errSecSuccess && SecTrustSetAnchorCertificatesOnly(trust,true)==errSecSuccess && SecTrustSetPolicies(trust,policy)==errSecSuccess && SecTrustEvaluateWithError(trust,&error);
    if(!accepted && error)NSLog(@"Test anchor validation rejected: %@",(__bridge NSError *)error);
    if(_rejectHostname && trust && certificate && policy && !accepted && error)_hostnameValidationRejected=YES;
    if(certificate)CFRelease(certificate);if(policy)CFRelease(policy);if(error)CFRelease(error);
    completionHandler(accepted?NSURLSessionAuthChallengeUseCredential:NSURLSessionAuthChallengeCancelAuthenticationChallenge,accepted?[NSURLCredential credentialForTrust:trust]:nil);
}
@end
static void tlsDownloadWait(BOOL (^done)(void)){NSDate *end=[NSDate dateWithTimeIntervalSinceNow:40];while(!done() && end.timeIntervalSinceNow>0)[NSRunLoop.currentRunLoop runUntilDate:[NSDate dateWithTimeIntervalSinceNow:0.005]];assert(done());}
static BOOL tlsCertificateFailure(NSError *error){return [error.domain isEqual:NSURLErrorDomain] && (error.code==NSURLErrorServerCertificateUntrusted || error.code==NSURLErrorServerCertificateHasUnknownRoot || error.code==NSURLErrorServerCertificateHasBadDate || error.code==NSURLErrorServerCertificateNotYetValid);}
int main(int argc,char **argv){@autoreleasepool{
    assert(argc==4);NSString *base=@(argv[2]);assert([base hasPrefix:@"https://127.0.0.1:"]);NSError *error=nil;
    NSDictionary *item=[[NSJSONSerialization JSONObjectWithData:[NSData dataWithContentsOfFile:@(argv[1])] options:0 error:&error] firstObject];assert(item[@"update"] && !error);
    NSString *root=[[@(argv[1]) stringByDeletingLastPathComponent] stringByAppendingPathComponent:@"tls-cache"];
    NSData *key=[[NSData alloc] initWithBase64EncodedString:item[@"key"] options:0],*payload=[[NSData alloc] initWithBase64EncodedString:item[@"payload"] options:0],*envelope=[NSJSONSerialization dataWithJSONObject:item[@"manifest"] options:0 error:nil];
    MiniPackageStore *store=[[MiniPackageStore alloc] initWithRoot:root trustedKey:key error:&error];assert(store && [store seedPayload:payload envelope:envelope error:&error]);MiniVerifiedPackage *running=[store coldStart:@"dev.pjm.fixture" error:&error];assert(running);
    __block BOOL done=NO;__block NSError *failure=nil;__block NSString *version=nil;
    void (^completion)(NSString *,NSError *)=^(NSString *selected,NSError *rejected){done=YES;version=selected;failure=rejected;};
    MiniPackageDownload *system=[[MiniPackageDownload alloc] initWithStore:store];assert([system startURL:[base stringByAppendingString:@"/latest.json"] identity:@"dev.pjm.fixture" completion:completion error:&error]);tlsDownloadWait(^BOOL{return done;});
    if(!tlsCertificateFailure(failure))NSLog(@"Unexpected system TLS result: %@",failure);assert(tlsCertificateFailure(failure));[system close];
    NSData *certificate=[NSData dataWithContentsOfFile:@(argv[3])];assert(certificate.length);
    TLSPackageDownload *download=[[TLSPackageDownload alloc] initWithStore:store];download.testCertificate=certificate;done=NO;failure=nil;
    assert([download startURL:[base stringByAppendingString:@"/latest.json"] identity:@"dev.pjm.fixture" completion:completion error:&error]);tlsDownloadWait(^BOOL{return done;});
    if(failure)NSLog(@"Explicit test CA rejected: %@",failure);assert(!failure && [version isEqual:@"2.0.0"] && [running.metadata[@"version"] isEqual:@"1.0.0"]);
    MiniPackageStore *reopened=[[MiniPackageStore alloc] initWithRoot:root trustedKey:key error:&error];assert([[reopened coldStart:@"dev.pjm.fixture" error:&error].metadata[@"version"] isEqual:@"2.0.0"]);assert([reopened rollback:@"dev.pjm.fixture" error:&error]);assert([[reopened coldStart:@"dev.pjm.fixture" error:&error].metadata[@"version"] isEqual:@"1.0.0"]);
    NSString *state=[root stringByAppendingPathComponent:@"dev.pjm.fixture/state.json"];NSData *before=[NSData dataWithContentsOfFile:state];
    for(NSString *path in @[@"/tamper/latest.json",@"/redirect/latest.json",@"/duplicate/latest.json",@"/oversize/latest.json"]){done=NO;failure=nil;assert([download startURL:[base stringByAppendingString:path] identity:@"dev.pjm.fixture" completion:completion error:&error]);tlsDownloadWait(^BOOL{return done;});assert(failure && !version && [[NSData dataWithContentsOfFile:state] isEqual:before]);}
    download.rejectHostname=YES;done=NO;failure=nil;assert([download startURL:[base stringByAppendingString:@"/latest.json"] identity:@"dev.pjm.fixture" completion:completion error:&error]);tlsDownloadWait(^BOOL{return done;});assert(download.hostnameValidationRejected && failure && !version && [[NSData dataWithContentsOfFile:state] isEqual:before]);[download close];
    puts("PACKAGE_DOWNLOAD_TLS iOS passed system-trust-rejected explicit-test-ca hostname-rejected cold-update rollback tamper redirect duplicate streamed-limit");
}return 0;}
