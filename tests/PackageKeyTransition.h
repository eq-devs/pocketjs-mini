#import "PackageStore.h"
#include <assert.h>
static void PackageKeyTransition(NSString *root,NSData *payload,NSData *envelope,NSData *oldKey,NSDictionary *rotation){
    NSError *error=nil;NSString *identity=@"dev.pjm.fixture";
    NSData *nextKey=[[NSData alloc] initWithBase64EncodedString:rotation[@"key"] options:0],*next=[[NSData alloc] initWithBase64EncodedString:rotation[@"payload"] options:0];
    NSData *manifest=[NSJSONSerialization dataWithJSONObject:rotation[@"manifest"] options:0 error:&error];assert(nextKey && next && manifest && !error);
    MiniPackageStore *original=[[MiniPackageStore alloc] initWithRoot:root trustedKey:oldKey error:&error];assert(original && [original seedPayload:payload envelope:envelope error:&error]);
    MiniVerifiedPackage *running=[original coldStart:identity error:&error];assert([running.metadata[@"version"] isEqual:@"1.0.0"]);
    error=nil;assert(![original stagePayload:next envelope:manifest error:&error] && error);error=nil;
    NSMutableData *providedKey=[nextKey mutableCopy];NSMutableArray *provided=[NSMutableArray arrayWithArray:@[providedKey,oldKey]];
    MiniPackageStore *overlap=[[MiniPackageStore alloc] initWithRoot:root trustedKeys:provided error:&error];assert(overlap && !error);
    ((uint8_t *)providedKey.mutableBytes)[0]^=1;provided[1]=[NSMutableData dataWithLength:32];
    assert([[[overlap coldStart:identity error:&error] metadata][@"version"] isEqual:@"1.0.0"]);
    assert([overlap stagePayload:next envelope:manifest error:&error]);
    MiniPackageStore *reopened=[[MiniPackageStore alloc] initWithRoot:root trustedKeys:@[nextKey,oldKey] error:&error];assert(reopened);
    assert([[[reopened coldStart:identity error:&error] metadata][@"version"] isEqual:@"2.0.0"] && [running.metadata[@"version"] isEqual:@"1.0.0"]);
    assert([reopened rollback:identity error:&error]);NSString *state=[[root stringByAppendingPathComponent:identity] stringByAppendingPathComponent:@"state.json"];NSData *before=[NSData dataWithContentsOfFile:state];assert(before);
    MiniPackageStore *revoked=[[MiniPackageStore alloc] initWithRoot:root trustedKey:nextKey error:&error];assert(revoked);
    error=nil;assert(![revoked coldStart:identity error:&error] && error);assert([[NSData dataWithContentsOfFile:state] isEqual:before]);error=nil;
    assert([[[reopened coldStart:identity error:&error] metadata][@"version"] isEqual:@"1.0.0"]);
    assert([reopened stagePayload:next envelope:manifest error:&error]);assert([reopened coldStart:identity error:&error]);
    assert([[[revoked coldStart:identity error:&error] metadata][@"version"] isEqual:@"2.0.0"]);before=[NSData dataWithContentsOfFile:state];
    error=nil;assert(![revoked rollback:identity error:&error] && error);error=nil;assert(![revoked stagePayload:payload envelope:envelope error:&error] && error);
    error=nil;NSData *injected=[NSJSONSerialization dataWithJSONObject:rotation[@"injectedManifest"] options:0 error:&error];assert(injected);
    assert(![reopened stagePayload:next envelope:injected error:&error] && error);assert([[NSData dataWithContentsOfFile:state] isEqual:before]);
    NSString *invalid=[root stringByAppendingString:@"-invalid"];
    for(NSArray *keys in @[@[],@[oldKey,oldKey],@[oldKey,nextKey,[NSMutableData dataWithLength:32]],@[[NSMutableData dataWithLength:31]]]){
        error=nil;assert(![[MiniPackageStore alloc] initWithRoot:invalid trustedKeys:keys error:&error] && error);
        assert(![[NSFileManager defaultManager] fileExistsAtPath:invalid]);
    }
    puts("PACKAGE_KEYS iOS transition rollback revocation bounds snapshots passed");
}
