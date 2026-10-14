#import <UIKit/UIKit.h>
#import "InstalledController.h"
#import "ResourcePeers.h"

// Test-only access to the shipping registry shared by HTTP and media.
@interface MiniInstalledController (ResourceProcessTest)
- (id)reserveResourceForIdentity:(NSString *)identity generation:(uint64_t)generation;
- (NSDictionary *)resourceService:(NSString *)kind arguments:(id)arguments identity:(NSString *)identity generation:(uint64_t)generation;
@end
static void Require(BOOL condition,NSString *message){if(!condition)@throw [NSException exceptionWithName:@"ResourceProcessFailure" reason:message userInfo:nil];}
static NSDictionary *Read(MiniInstalledController *owner,NSString *identity,uint64_t generation,NSString *handle){return [owner resourceService:@"resource.read.v1" arguments:@{@"handle":handle,@"offset":@0,@"count":@1} identity:identity generation:generation];}
static void Denied(MiniInstalledController *owner,NSString *identity,uint64_t generation,NSString *handle){Require([Read(owner,identity,generation,handle)[@"error"][@"code"] isEqual:@"DENIED"],@"Foreign or retired handle remained readable");}
static NSArray *Fill(NSArray<MiniInstalledController *> *owners,BOOL delayed,NSMutableArray *producers){
    NSMutableArray *records=[NSMutableArray new];NSMutableSet *handles=[NSMutableSet new];
    @autoreleasepool {
        for(NSUInteger index=0;index<owners.count;index++){
            MiniInstalledController *owner=owners[index];NSString *identity=owner.surface.verifiedActiveIdentity;uint64_t generation=owner.surface.verifiedActiveGeneration;Require(generation>0,@"Missing authenticated generation");
            for(NSUInteger count=0;count<4;count++){
                id slot=[owner reserveResourceForIdentity:identity generation:generation];Require(slot!=nil,@"Resource capacity leaked");
                NSString *handle=[slot valueForKey:@"handle"];Require(![handles containsObject:handle],@"Duplicate process handle");[handles addObject:handle];
                Denied(owner,identity,generation,handle);
                if(delayed && count%2){[producers addObject:slot];}
                else {
                    NSMutableData *bytes=[slot valueForKey:@"bytes"];((uint8_t *)bytes.mutableBytes)[0]=42;[slot setValue:@1 forKey:@"length"];[slot setValue:@YES forKey:@"ready"];
                    Require([Read(owner,identity,generation,handle)[@"data"][@"bodyBase64"] isEqual:@"Kg=="],@"Completed bytes changed");
                    Denied(owner,@"dev.pjm.foreign",generation,handle);Denied(owner,identity,generation+10000,handle);
                    for(MiniInstalledController *other in owners)if(other!=owner){
                        NSString *foreign=other.surface.verifiedActiveIdentity;Denied(other,foreign,other.surface.verifiedActiveGeneration,handle);
                        if(![foreign isEqual:identity]){
                            Denied(owner,foreign,generation,handle);
                            NSDictionary *reply=[owner resourceService:@"resource.release.v1" arguments:@{@"handle":handle} identity:foreign generation:generation];Require([reply[@"error"][@"code"] isEqual:@"DENIED"],@"Foreign app released an owned handle");
                            Require([Read(owner,identity,generation,handle)[@"data"][@"bodyBase64"] isEqual:@"Kg=="],@"Foreign release changed owner bytes");
                        }
                    }
                }
                [records addObject:@{@"owner":owner,@"identity":identity,@"handle":handle,@"generation":@(generation)}];
            }
        }
    }
    return records;
}
static void Release(NSArray *records){
    @autoreleasepool{for(NSDictionary *record in records){MiniInstalledController *owner=record[@"owner"];NSString *identity=record[@"identity"];NSDictionary *reply=[owner resourceService:@"resource.release.v1" arguments:@{@"handle":record[@"handle"]} identity:identity generation:[record[@"generation"] unsignedLongLongValue]];Require([reply[@"ok"] boolValue],@"Completed release failed");Denied(owner,identity,[record[@"generation"] unsignedLongLongValue],record[@"handle"]);}}
}
static NSDictionary *Stress(MiniPackageStore *store,NSArray<NSString *> *identities){
    NSMutableArray<MiniInstalledController *> *controllers=[NSMutableArray new];
    @try {
        for(NSUInteger index=0;index<6;index++){NSString *identity=identities[index%identities.count];NSError *error=nil;MiniInstalledController *owner=[[MiniInstalledController alloc] initWithIdentity:identity store:store launchData:[@"{}" dataUsingEncoding:NSUTF8StringEncoding] error:&error];Require(owner!=nil,error.localizedDescription?:@"Signed controller creation failed");Require([owner.surface.verifiedActiveIdentity isEqual:identity],@"Authenticated app identity changed");[controllers addObject:owner];}
        NSArray *primary=[controllers subarrayWithRange:NSMakeRange(0,4)],*probe=[controllers subarrayWithRange:NSMakeRange(4,2)];
        for(NSUInteger round=0;round<32;round++){
            @autoreleasepool {
                NSMutableArray *producers=[NSMutableArray new];NSArray *old=Fill(primary,YES,producers);Require(producers.count==8,@"Delayed producer coverage changed");
                MiniInstalledController *extra=controllers[4];Require(![extra reserveResourceForIdentity:extra.surface.verifiedActiveIdentity generation:extra.surface.verifiedActiveGeneration],@"Seventeenth process slot admitted");
                @autoreleasepool {
                    for(MiniInstalledController *owner in primary){NSString *identity=owner.surface.verifiedActiveIdentity;NSError *error=nil;MiniVerifiedContainer *container=[owner.surface valueForKey:@"container"];Require([container closeIdentity:identity error:&error],error.localizedDescription?:@"Generation retirement failed");Require([owner openIdentity:identity launchData:[@"{}" dataUsingEncoding:NSUTF8StringEncoding] error:&error],error.localizedDescription?:@"Cold generation recovery failed");}
                }
                for(NSDictionary *record in old){MiniInstalledController *owner=record[@"owner"];NSString *identity=record[@"identity"];uint64_t oldGeneration=[record[@"generation"] unsignedLongLongValue];Require(owner.surface.verifiedActiveGeneration>oldGeneration,@"Generation did not advance");Denied(owner,identity,oldGeneration,record[@"handle"]);Denied(owner,identity,owner.surface.verifiedActiveGeneration,record[@"handle"]);Denied(extra,identity,extra.surface.verifiedActiveGeneration,record[@"handle"]);}
                NSArray *replacement=Fill(probe,NO,nil);
                MiniInstalledController *recovered=controllers[0];Require(![recovered reserveResourceForIdentity:recovered.surface.verifiedActiveIdentity generation:recovered.surface.verifiedActiveGeneration],@"Retirement released a producer still holding its buffer");
                Release(replacement);
                @autoreleasepool{[producers removeAllObjects];}
                NSArray *full=Fill(primary,NO,nil);Require(full.count==16,@"Late completion did not restore all process slots");
                Require(![extra reserveResourceForIdentity:extra.surface.verifiedActiveIdentity generation:extra.surface.verifiedActiveGeneration],@"Process cap changed after recovery");Release(full);
            }
        }
        MiniInstalledController *owner=controllers[0];NSArray *four=Fill(@[owner],NO,nil);
        Require(![owner reserveResourceForIdentity:owner.surface.verifiedActiveIdentity generation:owner.surface.verifiedActiveGeneration],@"Fifth per-generation resource admitted with free process capacity");Release(four);
        return @{@"controllers":@6,@"authenticatedIdentities":@(identities.count),@"rounds":@32,@"contendedAdmissions":@512,@"delayedProducerChecks":@256,@"processCap":@16,@"perGenerationCap":@4,@"nativeGenerationRetirements":@128};
    }@finally{for(MiniInstalledController *owner in controllers)[owner shutdown];}
}
@interface MiniScene : UIResponder <UIWindowSceneDelegate>
@property(nonatomic,strong) UIWindow *window;
@end
@implementation MiniScene
- (void)scene:(UIScene *)scene willConnectToSession:(UISceneSession *)session options:(UISceneConnectionOptions *)options {
    (void)session;(void)options;if(![scene isKindOfClass:UIWindowScene.class])return;
    UIViewController *view=[UIViewController new];view.view.backgroundColor=UIColor.whiteColor;UILabel *receipt=[UILabel new];receipt.frame=CGRectMake(20,120,360,550);receipt.numberOfLines=0;receipt.text=@"Concurrent resource checks running";receipt.accessibilityIdentifier=@"resource-process-proof";[view.view addSubview:receipt];self.window=[[UIWindow alloc] initWithWindowScene:(UIWindowScene *)scene];self.window.rootViewController=view;[self.window makeKeyAndVisible];
    dispatch_async(dispatch_get_main_queue(),^{
        @try {
            NSError *error=nil;NSString *root=[NSSearchPathForDirectoriesInDomains(NSLibraryDirectory,NSUserDomainMask,YES).firstObject stringByAppendingPathComponent:@"resource-process-packages"];
            NSData *payload=[NSData dataWithContentsOfFile:[NSBundle.mainBundle pathForResource:@"main" ofType:@"pocket"]],*envelope=[NSData dataWithContentsOfFile:[NSBundle.mainBundle pathForResource:@"manifest" ofType:@"json"]],*key=[NSData dataWithContentsOfFile:[NSBundle.mainBundle pathForResource:@"publisher" ofType:@"key"]];
            MiniPackageStore *store=[[MiniPackageStore alloc] initWithRoot:root trustedKey:key error:&error];Require(store&&[store seedPayload:payload envelope:envelope error:&error],error.localizedDescription?:@"Signed store seed failed");
            NSArray *peers=[NSJSONSerialization JSONObjectWithData:[ResourcePeersJSON dataUsingEncoding:NSUTF8StringEncoding] options:0 error:&error];Require(peers.count==3,@"Missing distinct signed peer fixtures");
            NSMutableArray *identities=[NSMutableArray arrayWithObject:@"dev.pjm.fixture"];
            for(NSDictionary *peer in peers){NSData *bytes=[[NSData alloc] initWithBase64EncodedString:peer[@"payload"] options:0],*manifest=[NSJSONSerialization dataWithJSONObject:peer[@"manifest"] options:0 error:&error];Require([store seedPayload:bytes envelope:manifest error:&error],error.localizedDescription?:@"Peer signature verification failed");NSString *identity=peer[@"manifest"][@"appId"];Require(identity.length && ![identities containsObject:identity],@"Peer identity is not distinct");[identities addObject:identity];}
            NSDictionary *same=Stress(store,@[@"dev.pjm.fixture"]),*distinct=Stress(store,identities);Require([same[@"nativeGenerationRetirements"] unsignedIntegerValue]==128,@"Same-identity retirement coverage changed");
            NSMutableDictionary *result=[distinct mutableCopy];result[@"scenarios"]=@2;result[@"nativeGenerationRetirements"]=@256;result[@"contendedAdmissions"]=@1024;result[@"delayedProducerChecks"]=@512;
            NSData *data=[NSJSONSerialization dataWithJSONObject:result options:NSJSONWritingSortedKeys error:nil];receipt.text=[@"native-resource-process PASS " stringByAppendingString:[[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding]];
        }@catch(NSException *failure){receipt.text=[@"native-resource-process FAIL " stringByAppendingString:failure.reason?:failure.name];NSLog(@"PJM_RESOURCE_PROCESS_FAILURE %@",failure);}
        receipt.accessibilityValue=receipt.text;
    });
}
@end
@interface ResourceProcessApp : UIResponder <UIApplicationDelegate>
@end
@implementation ResourceProcessApp
@end
int main(int argc,char **argv){@autoreleasepool{return UIApplicationMain(argc,argv,nil,NSStringFromClass(ResourceProcessApp.class));}}
