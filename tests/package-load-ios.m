#import "VerifiedPackage.h"
#import "VerifiedContainer.h"
#import "AppStorage.h"
#import "PackageStore.h"
#include <sys/file.h>
#include <fcntl.h>
#include <unistd.h>
#include <assert.h>
int main(int argc,char **argv){@autoreleasepool{
    assert(argc==2);NSError *error=nil;
    NSArray *cases=[NSJSONSerialization JSONObjectWithData:[NSData dataWithContentsOfFile:@(argv[1])] options:0 error:&error];assert(cases && !error);
    for(NSDictionary *item in cases){
        NSMutableData *payload=[[NSMutableData alloc] initWithBase64EncodedString:item[@"payload"] options:0];
        NSData *envelope=[NSJSONSerialization dataWithJSONObject:item[@"manifest"] options:0 error:&error];
        NSData *key=[[NSData alloc] initWithBase64EncodedString:item[@"key"] options:0];error=nil;
        MiniVerifiedPackage *package=[[MiniVerifiedPackage alloc] initWithPayload:payload envelope:envelope trustedKey:key error:&error];
        assert((package!=nil)==[item[@"valid"] boolValue]);
        if(!package){
            assert(error);NSString *rejectedRoot=[[@(argv[1]) stringByDeletingLastPathComponent] stringByAppendingPathComponent:NSUUID.UUID.UUIDString];
            error=nil;MiniPackageStore *rejected=[[MiniPackageStore alloc] initWithRoot:rejectedRoot trustedKey:key error:&error];assert(rejected);
            assert(![rejected stagePayload:payload envelope:envelope error:&error] && error);
            assert([NSFileManager.defaultManager contentsOfDirectoryAtPath:rejectedRoot error:nil].count==0);continue;
        }
        if([package.metadata[@"appId"] isEqual:@"dev.pjm.fixture"]){
            assert([package authorizeURL:@"https://example.com/path" error:&error]);
            assert([package authorizeURL:@"https://EXAMPLE.com:443/path" error:&error]);
            for(NSString *address in @[@"http://example.com",@"https://other.com",@"https://sub.example.com",@"https://example.com:444",@"https://user:secret@example.com",@"file:///example.com",@"https://example.com.attacker.com"]){error=nil;assert(![package authorizeURL:address error:&error] && error);}
            assert([package authorizePermission:@"media" hostGranted:YES error:&error]);
            error=nil;assert(![package authorizePermission:@"media" hostGranted:NO error:&error] && error);
            error=nil;assert(![package authorizePermission:@"location" hostGranted:YES error:&error] && error);
        }
        MpPackageInputs inputs=package.inputs;NSData *before=[NSData dataWithBytes:inputs.js length:inputs.js_len];
        [payload resetBytesInRange:NSMakeRange(0,payload.length)];assert(inputs.js_len>0 && memcmp(inputs.js,before.bytes,before.length)==0);
        MpConfig config=package.config;assert(config.width>0 && config.height>0 && config.density>0);MpInstance *guest=mp_create(&config);assert(guest);
        assert(mp_boot(guest,inputs.js,inputs.js_len,inputs.pak,inputs.pak_len)==0);
        assert(mp_frame(guest,NULL,0)==0);if([package.metadata[@"appId"] isEqual:@"dev.pjm.fixture"]){uint8_t line[64];assert(mp_svc_take(guest,line,sizeof(line))==13 && memcmp(line,"verified:0:1\n",13)==0);}
        assert(mp_destroy(guest)==0);
        MpPool *pool=mp_pool_create(3);assert(pool);
        NSData *launch=[@"{\"source\":\"test\",\"path\":\"/\",\"query\":{}}" dataUsingEncoding:NSUTF8StringEncoding];
        assert([package activateInPool:pool launchData:launch error:&error]);
        NSData *idBytes=[package.metadata[@"appId"] dataUsingEncoding:NSUTF8StringEncoding];
        uint64_t generation=mp_pool_generation(pool,idBytes.bytes,idBytes.length);assert(generation>0);
        assert(mp_pool_frame(pool,NULL,0)==0);
        if([package.metadata[@"appId"] isEqual:@"dev.pjm.fixture"]){uint8_t line[64];assert(mp_pool_svc_take(pool,line,sizeof(line))==13 && memcmp(line,"verified:1:1\n",13)==0);}
        assert(mp_pool_background(pool)==0);
        assert([package activateInPool:pool launchData:launch error:&error]);
        assert(mp_pool_generation(pool,idBytes.bytes,idBytes.length)==generation);
        assert(mp_pool_frame(pool,NULL,0)==0);
        if([package.metadata[@"appId"] isEqual:@"dev.pjm.fixture"]){uint8_t line[64];assert(mp_pool_svc_take(pool,line,sizeof(line))==13 && memcmp(line,"verified:1:2\n",13)==0);}
        assert(![package activateInPool:pool launchData:[NSMutableData dataWithLength:4097] error:&error]);
        assert(error && mp_pool_generation(pool,idBytes.bytes,idBytes.length)==generation);
        assert(mp_pool_frame(pool,NULL,0)==0);
        if([package.metadata[@"appId"] isEqual:@"dev.pjm.fixture"]){uint8_t line[64];assert(mp_pool_svc_take(pool,line,sizeof(line))==13 && memcmp(line,"verified:1:3\n",13)==0);}
        assert(mp_pool_destroy(pool)==0);
        NSString *storageRoot=[@(argv[1]) stringByDeletingLastPathComponent];MiniVerifiedContainer *container=[[MiniVerifiedContainer alloc] initWithStorageRoot:storageRoot];assert(container);
        assert([container activatePackage:package launchData:launch error:&error]);
        uint64_t retained=mp_pool_generation(container.pool,idBytes.bytes,idBytes.length);
        __block unsigned cleanupCalls=0,retirements=0;
        container.onCleanup=^(MiniVerifiedPackage *bound,uint64_t generation,NSData *record){
            assert(bound==package && generation==retained);
            NSString *line=[[NSString alloc] initWithData:record encoding:NSUTF8StringEncoding];
            if([line isEqual:@"cleanup"])cleanupCalls++;
        };
        container.onRetirement=^(MiniVerifiedPackage *bound,uint64_t generation){assert(bound==package && generation==retained && cleanupCalls==([package.metadata[@"appId"] isEqual:@"dev.pjm.fixture"]?1:0));retirements++;};
        assert([container packageForIdentity:package.metadata[@"appId"] generation:retained]==package);
        MiniVerifiedPackage *fresh=[[MiniVerifiedPackage alloc] initWithPayload:package.payload envelope:envelope trustedKey:key error:&error];assert(fresh && fresh!=package);
        assert([container activatePackage:fresh launchData:launch error:&error]);
        assert([container packageForIdentity:package.metadata[@"appId"] generation:retained]==package);
        assert([container packageForIdentity:package.metadata[@"appId"] generation:retained+1]==nil);
        if([package.metadata[@"appId"] isEqual:@"dev.pjm.fixture"]){
            NSData *request=[NSJSONSerialization dataWithJSONObject:@{@"v":@1,@"id":@123,@"kind":@"storage.set.v1",@"args":@{@"key":@"live-proof",@"value":@"live"}} options:0 error:&error];
            assert([container background:&error]);
            assert([container dispatchStorageRecord:request identity:package.metadata[@"appId"] generation:retained error:&error]);
            assert([container resume:&error]);
            assert([container.activeIdentity isEqual:package.metadata[@"appId"]] && container.activeGeneration==retained);
            MpInput input={0};input.size=sizeof(input);MpFrame frame={0};MpDamage damage={0};damage.size=sizeof(damage);NSArray<NSData *> *effects=nil;
            assert([container advanceInput:&input frame:&frame damage:&damage effects:&effects error:&error]);
            assert(frame.pixels && frame.width==64 && frame.height==64 && damage.full_redraw);
            NSString *reply=[[NSString alloc] initWithData:effects.firstObject encoding:NSUTF8StringEncoding];assert([reply containsString:@"reply:"] && [reply containsString:@"123"]);
            assert([container postCompletion:[@"pump" dataUsingEncoding:NSUTF8StringEncoding] identity:package.metadata[@"appId"] generation:retained error:&error]);
            damage.size=sizeof(damage);
            assert([container advanceInput:&input frame:&frame damage:&damage effects:&effects error:&error] && effects.count==1);
            assert([[[NSString alloc] initWithData:effects.firstObject encoding:NSUTF8StringEncoding] hasPrefix:@"verified:"]);
            assert([container advanceInput:&input frame:&frame damage:&damage effects:&effects error:&error]);
            reply=[[NSString alloc] initWithData:effects.firstObject encoding:NSUTF8StringEncoding];assert([reply containsString:@"456"] && [reply containsString:@"live"]);
            assert([container memoryWarning:&error] && container.activeGeneration==retained);
            error=nil;assert(![container dispatchStorageRecord:request identity:package.metadata[@"appId"] generation:retained+1 error:&error] && error);
        }
        assert([container closeIdentity:package.metadata[@"appId"] error:&error]);
        assert(container.activeIdentity==nil && container.activeGeneration==0);
        assert(cleanupCalls==([package.metadata[@"appId"] isEqual:@"dev.pjm.fixture"]?1:0) && retirements==1);
        assert([container packageForIdentity:package.metadata[@"appId"] generation:retained]==nil);
        assert(!container.lastCleanupError);
        if([package.metadata[@"appId"] isEqual:@"dev.pjm.fixture"]){MiniAppStorage *stored=[[MiniAppStorage alloc] initWithRoot:storageRoot appId:package.metadata[@"appId"] error:&error];assert(stored);assert([[stored dispatch:@"storage.get.v1" arguments:@{@"key":@"cleanup-proof"} error:&error] isEqual:@"saved"]);}
        [container shutdown];[container shutdown];
        if(item[@"update"]){
            NSString *root=[storageRoot stringByAppendingPathComponent:@"packages"];error=nil;
            MiniPackageStore *store=[[MiniPackageStore alloc] initWithRoot:root trustedKey:key error:&error];assert(store && !error);
            assert([store stagePayload:package.payload envelope:envelope error:&error]);
            MiniVerifiedPackage *first=[store coldStart:package.metadata[@"appId"] error:&error];assert(first && [first.metadata[@"version"] isEqual:@"1.0.0"]);
            NSDictionary *update=item[@"update"];NSData *updated=[[NSData alloc] initWithBase64EncodedString:update[@"payload"] options:0];NSData *updatedEnvelope=[NSJSONSerialization dataWithJSONObject:update[@"manifest"] options:0 error:&error];
            assert([store stagePayload:updated envelope:updatedEnvelope error:&error]);
            assert([store seedPayload:package.payload envelope:envelope error:&error]);
            assert([first.metadata[@"version"] isEqual:@"1.0.0"] && [first.payload isEqual:package.payload]);
            store=nil;store=[[MiniPackageStore alloc] initWithRoot:root trustedKey:key error:&error];
            MiniVerifiedPackage *second=[store coldStart:package.metadata[@"appId"] error:&error];assert(second && [second.metadata[@"version"] isEqual:@"2.0.0"]);
            assert([store rollback:package.metadata[@"appId"] error:&error]);assert([second.metadata[@"version"] isEqual:@"2.0.0"]);
            assert([[[store coldStart:package.metadata[@"appId"] error:&error] metadata][@"version"] isEqual:@"1.0.0"]);
            assert([store stagePayload:package.payload envelope:envelope error:&error]);
            error=nil;assert(![store stagePayload:[@"tampered" dataUsingEncoding:NSUTF8StringEncoding] envelope:envelope error:&error] && error);
            NSString *slot=[NSString stringWithFormat:@"%@-%@",first.metadata[@"version"],first.metadata[@"sha256"]];
            NSString *saved=[[root stringByAppendingPathComponent:package.metadata[@"appId"]] stringByAppendingPathComponent:slot];
            NSString *payloadPath=[saved stringByAppendingPathComponent:@"main.pocket"];
            assert([[@"tampered" dataUsingEncoding:NSUTF8StringEncoding] writeToFile:payloadPath atomically:YES]);
            error=nil;assert(![store coldStart:package.metadata[@"appId"] error:&error] && error);
            assert([package.payload writeToFile:payloadPath atomically:YES]);
            assert(unlink(payloadPath.fileSystemRepresentation)==0 && symlink("/etc/hosts",payloadPath.fileSystemRepresentation)==0);
            error=nil;assert(![store coldStart:package.metadata[@"appId"] error:&error] && error);
            assert(unlink(payloadPath.fileSystemRepresentation)==0 && [package.payload writeToFile:payloadPath atomically:YES]);
            int lock=open(root.fileSystemRepresentation,O_RDONLY|O_DIRECTORY);assert(lock>=0 && flock(lock,LOCK_EX|LOCK_NB)==0);
            error=nil;assert(![store coldStart:package.metadata[@"appId"] error:&error] && error);flock(lock,LOCK_UN);close(lock);
            assert([store coldStart:package.metadata[@"appId"] error:&error]);
            NSMutableData *wrongKey=[key mutableCopy];((uint8_t *)wrongKey.mutableBytes)[0]^=1;
            MiniPackageStore *untrusted=[[MiniPackageStore alloc] initWithRoot:root trustedKey:wrongKey error:&error];assert(untrusted);
            error=nil;assert(![untrusted coldStart:package.metadata[@"appId"] error:&error] && error);
            NSString *statePath=[[root stringByAppendingPathComponent:package.metadata[@"appId"]] stringByAppendingPathComponent:@"state.json"];
            NSData *stateSnapshot=[NSData dataWithContentsOfFile:statePath];assert(stateSnapshot);
            assert([[@"{\"current\":\"../escape\"}" dataUsingEncoding:NSUTF8StringEncoding] writeToFile:statePath atomically:YES]);
            error=nil;assert(![store coldStart:package.metadata[@"appId"] error:&error] && error);
            assert([stateSnapshot writeToFile:statePath atomically:YES]);
            assert(unlink(statePath.fileSystemRepresentation)==0 && symlink("/etc/hosts",statePath.fileSystemRepresentation)==0);
            error=nil;assert(![store stagePayload:package.payload envelope:envelope error:&error] && error);
            assert(unlink(statePath.fileSystemRepresentation)==0 && [stateSnapshot writeToFile:statePath atomically:YES]);
            NSString *alias=[storageRoot stringByAppendingPathComponent:@"package-alias"];assert(symlink(root.fileSystemRepresentation,alias.fileSystemRepresentation)==0);
            error=nil;assert(![[MiniPackageStore alloc] initWithRoot:alias trustedKey:key error:&error] && error);
        }
    }
    puts("iOS authenticated package ownership, admission, engine boot and retained activation passed");
}return 0;}
