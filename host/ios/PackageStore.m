#import "PackageStore.h"
#include <sys/file.h>
#include <sys/stat.h>
#include <fcntl.h>
#include <unistd.h>
#include <dirent.h>
static void failure(NSError **error,NSString *message){if(error)*error=[NSError errorWithDomain:@"MiniPackageStore" code:1 userInfo:@{NSLocalizedDescriptionKey:message}];}
static BOOL matches(NSString *value,NSString *pattern){if(![value isKindOfClass:NSString.class])return NO;NSRange range=[value rangeOfString:pattern options:NSRegularExpressionSearch];return range.location==0 && range.length==value.length;}
static BOOL identityValid(NSString *value){return value.length<=128 && matches(value,@"^[a-zA-Z][a-zA-Z0-9_-]*(?:\\.[a-zA-Z][a-zA-Z0-9_-]*)+$");}
static BOOL slotValid(NSString *value){return value.length<=192 && matches(value,@"^[0-9]+\\.[0-9]+\\.[0-9]+-[a-f0-9]{64}$");}
static int directory(int parent,NSString *name,BOOL create){
    if(create && mkdirat(parent,name.fileSystemRepresentation,0700)!=0 && errno!=EEXIST)return -1;
    return openat(parent,name.fileSystemRepresentation,O_RDONLY|O_DIRECTORY|O_NOFOLLOW|O_CLOEXEC);
}
static NSData *readFile(int parent,NSString *name,NSUInteger limit){
    int fd=openat(parent,name.fileSystemRepresentation,O_RDONLY|O_NOFOLLOW|O_CLOEXEC);if(fd<0)return nil;
    struct stat status;if(fstat(fd,&status)!=0 || !S_ISREG(status.st_mode) || status.st_size<0 || (uint64_t)status.st_size>limit){close(fd);errno=EINVAL;return nil;}
    NSMutableData *data=[NSMutableData dataWithLength:(NSUInteger)status.st_size];size_t offset=0;
    while(offset<data.length){ssize_t count=read(fd,(uint8_t *)data.mutableBytes+offset,data.length-offset);if(count<0 && errno==EINTR)continue;if(count<=0){close(fd);errno=EIO;return nil;}offset+=(size_t)count;}
    close(fd);return data;
}
static BOOL writeAtomic(int parent,NSString *name,NSData *data){
    NSString *temporary=[@".write-" stringByAppendingString:NSUUID.UUID.UUIDString];
    int fd=openat(parent,temporary.fileSystemRepresentation,O_WRONLY|O_CREAT|O_EXCL|O_NOFOLLOW|O_CLOEXEC,0600);if(fd<0)return NO;
    size_t offset=0;BOOL ok=YES;
    while(offset<data.length){ssize_t count=write(fd,(const uint8_t *)data.bytes+offset,data.length-offset);if(count<0 && errno==EINTR)continue;if(count<=0){ok=NO;break;}offset+=(size_t)count;}
    if(ok)ok=fsync(fd)==0;close(fd);
    if(ok)ok=renameat(parent,temporary.fileSystemRepresentation,parent,name.fileSystemRepresentation)==0;
    if(ok)ok=fsync(parent)==0;unlinkat(parent,temporary.fileSystemRepresentation,0);return ok;
}
@implementation MiniPackageStore {int _root;NSData *_key;}
- (instancetype)initWithRoot:(NSString *)root trustedKey:(NSData *)key error:(NSError **)error {
    self=[super init];if(!self)return nil;_root=-1;
    if(!NSThread.isMainThread || !root.isAbsolutePath || key.length!=32){failure(error,@"Store requires an absolute private root, trusted key and main-thread owner");return nil;}
    int fd=open("/",O_RDONLY|O_DIRECTORY|O_CLOEXEC);
    for(NSString *part in root.pathComponents){if([part isEqual:@"/"])continue;if([part isEqual:@"."] || [part isEqual:@".."]){close(fd);failure(error,@"Invalid store path");return nil;}int next=directory(fd,part,YES);close(fd);fd=next;if(fd<0)break;}
    if(fd<0){failure(error,@"Store root must contain real directories");return nil;}_root=fd;_key=[key copy];return self;
}
- (BOOL)lock:(NSError **)error {if(NSThread.isMainThread && _root>=0 && flock(_root,LOCK_EX|LOCK_NB)==0)return YES;failure(error,@"Package store unavailable or busy");return NO;}
- (NSMutableDictionary *)state:(int)app error:(NSError **)error {
    NSData *bytes=readFile(app,@"state.json",2048);if(!bytes){if(errno==ENOENT)return [NSMutableDictionary dictionary];failure(error,@"Invalid package state file");return nil;}
    id value=[NSJSONSerialization JSONObjectWithData:bytes options:NSJSONReadingMutableContainers error:error];if(![value isKindOfClass:NSDictionary.class]){failure(error,@"Invalid package state");return nil;}
    for(id key in value)if(![@[@"current",@"previous",@"pending"] containsObject:key] || !slotValid(value[key])){failure(error,@"Invalid package slot reference");return nil;}
    return value;
}
- (BOOL)commit:(NSDictionary *)state app:(int)app error:(NSError **)error {
    NSData *bytes=[NSJSONSerialization dataWithJSONObject:state options:0 error:error];if(bytes && writeAtomic(app,@"state.json",bytes))return YES;failure(error,@"Package state commit failed");return NO;
}
- (MiniVerifiedPackage *)load:(NSString *)slot identity:(NSString *)identity app:(int)app error:(NSError **)error {
    if(!slotValid(slot)){failure(error,@"Package is not installed");return nil;}
    int folder=directory(app,slot,NO);if(folder<0){failure(error,@"Invalid installed package directory");return nil;}
    NSData *payload=readFile(folder,@"main.pocket",64*1024*1024),*envelope=readFile(folder,@"manifest.json",65536);close(folder);
    if(!payload || !envelope){failure(error,@"Invalid installed package files");return nil;}
    MiniVerifiedPackage *package=[[MiniVerifiedPackage alloc] initWithPayload:payload envelope:envelope trustedKey:_key error:error];
    NSString *expected=[NSString stringWithFormat:@"%@-%@",package.metadata[@"version"],package.metadata[@"sha256"]];
    if(!package || ![package.metadata[@"appId"] isEqual:identity] || ![expected isEqual:slot]){failure(error,@"Installed package identity mismatch");return nil;}return package;
}
- (void)prune:(int)app state:(NSDictionary *)state {
    DIR *entries=fdopendir(dup(app));if(!entries)return;struct dirent *entry;
    while((entry=readdir(entries))){NSString *name=@(entry->d_name);if(!slotValid(name) || [state.allValues containsObject:name])continue;
        int folder=directory(app,name,NO);if(folder<0)continue;
        unlinkat(folder,"main.pocket",0);unlinkat(folder,"manifest.json",0);close(folder);unlinkat(app,name.fileSystemRepresentation,AT_REMOVEDIR);
    }closedir(entries);
}
- (BOOL)seedPayload:(NSData *)payload envelope:(NSData *)envelope error:(NSError **)error {return [self stagePayload:payload envelope:envelope onlyIfEmpty:YES error:error];}
- (BOOL)stagePayload:(NSData *)payload envelope:(NSData *)envelope error:(NSError **)error {return [self stagePayload:payload envelope:envelope onlyIfEmpty:NO error:error];}
- (BOOL)stagePayload:(NSData *)payload envelope:(NSData *)envelope onlyIfEmpty:(BOOL)onlyIfEmpty error:(NSError **)error {
    if(!NSThread.isMainThread){failure(error,@"Package stage requires main-thread owner");return NO;}
    NSData *manifest=[envelope copy];MiniVerifiedPackage *package=[[MiniVerifiedPackage alloc] initWithPayload:payload envelope:manifest trustedKey:_key error:error];if(!package)return NO;
    if(![self lock:error])return NO;int app=-1;BOOL result=NO;
    @try {
        NSString *identity=package.metadata[@"appId"],*slot=[NSString stringWithFormat:@"%@-%@",package.metadata[@"version"],package.metadata[@"sha256"]];
        if(!identityValid(identity) || !slotValid(slot)){failure(error,@"Invalid signed package identity or version");return NO;}
        app=directory(_root,identity,YES);if(app<0){failure(error,@"Invalid application directory");return NO;}
        NSMutableDictionary *state=[self state:app error:error];if(!state)return NO;
        if(onlyIfEmpty && (state[@"current"] || state[@"pending"]))return YES;
        int existing=directory(app,slot,NO);
        if(existing>=0){NSData *saved=readFile(existing,@"manifest.json",65536);close(existing);MiniVerifiedPackage *installed=[self load:slot identity:identity app:app error:error];id savedObject=saved?[NSJSONSerialization JSONObjectWithData:saved options:0 error:nil]:nil;id newObject=[NSJSONSerialization JSONObjectWithData:manifest options:0 error:nil];if(!installed || ![savedObject isEqual:newObject]){failure(error,@"Existing slot has different signed metadata");return NO;}}
        else if(errno==ENOENT){
            NSString *temporary=[@".install-" stringByAppendingString:NSUUID.UUID.UUIDString];int folder=directory(app,temporary,YES);if(folder<0){failure(error,@"Cannot stage package");return NO;}
            BOOL written=writeAtomic(folder,@"main.pocket",package.payload) && writeAtomic(folder,@"manifest.json",manifest);close(folder);
            if(written)written=renameat(app,temporary.fileSystemRepresentation,app,slot.fileSystemRepresentation)==0 && fsync(app)==0;
            if(!written){int partial=directory(app,temporary,NO);if(partial>=0){unlinkat(partial,"main.pocket",0);unlinkat(partial,"manifest.json",0);close(partial);}unlinkat(app,temporary.fileSystemRepresentation,AT_REMOVEDIR);failure(error,@"Package installation failed");return NO;}
        }else {failure(error,@"Invalid package slot directory");return NO;}
        state[@"pending"]=slot;result=[self commit:state app:app error:error];if(result)[self prune:app state:state];
    }@finally {if(app>=0)close(app);flock(_root,LOCK_UN);}return result;
}
- (MiniVerifiedPackage *)coldStart:(NSString *)identity error:(NSError **)error {
    if(!identityValid(identity)){failure(error,@"Invalid application identity");return nil;}if(![self lock:error])return nil;int app=-1;
    @try {app=directory(_root,identity,NO);if(app<0){failure(error,@"Application is not installed");return nil;}NSMutableDictionary *state=[self state:app error:error];if(!state)return nil;
        NSString *slot=state[@"pending"]?:state[@"current"];MiniVerifiedPackage *package=[self load:slot identity:identity app:app error:error];if(!package)return nil;
        if(![slot isEqual:state[@"current"]]){if(state[@"current"])state[@"previous"]=state[@"current"];state[@"current"]=slot;}[state removeObjectForKey:@"pending"];
        if(![self commit:state app:app error:error])return nil;[self prune:app state:state];return package;
    }@finally {if(app>=0)close(app);flock(_root,LOCK_UN);}
}
- (BOOL)rollback:(NSString *)identity error:(NSError **)error {
    if(!identityValid(identity)){failure(error,@"Invalid application identity");return NO;}if(![self lock:error])return NO;int app=-1;
    @try {app=directory(_root,identity,NO);if(app<0){failure(error,@"Application is not installed");return NO;}NSMutableDictionary *state=[self state:app error:error];if(!state || ![self load:state[@"previous"] identity:identity app:app error:error])return NO;state[@"pending"]=state[@"previous"];return [self commit:state app:app error:error];}
    @finally {if(app>=0)close(app);flock(_root,LOCK_UN);}
}
- (void)dealloc {if(_root>=0)close(_root);}
@end
