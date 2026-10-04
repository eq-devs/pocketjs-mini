#import "VerifiedContainer.h"
#import "AppStorage.h"
@interface MiniVerifiedContainer ()
@property(nonatomic) NSMutableDictionary<NSNumber *,MiniVerifiedPackage *> *packages;
@property(nonatomic) NSMutableDictionary<NSNumber *,MiniAppStorage *> *storages;
@property(nonatomic,copy) NSString *storageRoot;
@property(nonatomic) NSMutableData *serviceBuffer;
@property(nonatomic,readwrite) NSError *lastCleanupError;
@property(nonatomic,copy,readwrite) NSString *activeIdentity;
@property(nonatomic,readwrite) uint64_t activeGeneration;
@end
static MiniVerifiedPackage *boundPackage(MiniVerifiedContainer *container,const uint8_t *identity,size_t length,uint64_t generation){
    NSString *name=[[NSString alloc] initWithBytes:identity length:length encoding:NSUTF8StringEncoding];
    MiniVerifiedPackage *package=container.packages[@(generation)];
    return [package.metadata[@"appId"] isEqual:name]?package:nil;
}
static void cleanup(void *context,const uint8_t *identity,size_t length,uint64_t generation,const uint8_t *line,size_t lineLength){
    MiniVerifiedContainer *container=(__bridge MiniVerifiedContainer *)context;
    MiniVerifiedPackage *package=boundPackage(container,identity,length,generation);
    NSData *record=[NSData dataWithBytes:line length:lineLength];
    id parsed=[NSJSONSerialization JSONObjectWithData:record options:0 error:nil];
    if(package && [parsed isKindOfClass:NSDictionary.class]){
        NSDictionary *request=parsed;id kind=request[@"kind"],version=request[@"v"],identifier=request[@"id"];
        if([@[@"storage.get.v1",@"storage.set.v1",@"storage.remove.v1"] containsObject:kind]){
            BOOL valid=[version isKindOfClass:NSNumber.class] && CFGetTypeID((__bridge CFTypeRef)version)!=CFBooleanGetTypeID() && [version doubleValue]==1 && [identifier isKindOfClass:NSNumber.class] && CFGetTypeID((__bridge CFTypeRef)identifier)!=CFBooleanGetTypeID();
            double number=valid?[identifier doubleValue]:0;valid=valid && isfinite(number) && number>=1 && number<=9007199254740991.0 && floor(number)==number;
            NSError *failure=nil;
            if(valid)[container.storages[@(generation)] dispatch:kind arguments:request[@"args"] error:&failure];
            else failure=[NSError errorWithDomain:@"MiniProtocol" code:1 userInfo:@{NSLocalizedDescriptionKey:@"Malformed retiring storage request"}];
            if(failure)container.lastCleanupError=failure;
        }
    }
    void (^handler)(MiniVerifiedPackage *,uint64_t,NSData *)=container.onCleanup;
    if(package && handler)handler(package,generation,record);
}
static void retired(void *context,const uint8_t *identity,size_t length,uint64_t generation){
    MiniVerifiedContainer *container=(__bridge MiniVerifiedContainer *)context;
    MiniVerifiedPackage *package=boundPackage(container,identity,length,generation);
    void (^handler)(MiniVerifiedPackage *,uint64_t)=container.onRetirement;
    if(package && handler)handler(package,generation);
    if(container.activeGeneration==generation){container.activeIdentity=nil;container.activeGeneration=0;}
    [container.packages removeObjectForKey:@(generation)];
    [container.storages removeObjectForKey:@(generation)];
}
@implementation MiniVerifiedContainer
- (instancetype)init {
    return [self initWithStorageRoot:nil];
}
- (instancetype)initWithStorageRoot:(NSString *)root {
    if(!NSThread.isMainThread)return nil;
    self=[super init];if(!self)return nil;
    _serviceBuffer=[NSMutableData dataWithLength:32*4097];_packages=[NSMutableDictionary dictionary];_storages=[NSMutableDictionary dictionary];_storageRoot=[root copy];_pool=mp_pool_create(3);
    if(!_pool)return nil;
    if(mp_pool_set_cleanup(_pool,cleanup,(__bridge void *)self)!=0 || mp_pool_set_retirement(_pool,retired,(__bridge void *)self)!=0){mp_pool_destroy(_pool);_pool=NULL;return nil;}
    return self;
}
- (BOOL)activatePackage:(MiniVerifiedPackage *)package launchData:(NSData *)launch error:(NSError **)error {
    if(!NSThread.isMainThread || !_pool){if(error)*error=[NSError errorWithDomain:@"MiniContainer" code:1 userInfo:@{NSLocalizedDescriptionKey:@"Container requires its active main-thread owner"}];return NO;}
    NSString *identity=package.metadata[@"appId"];
    NSData *idBytes=[identity dataUsingEncoding:NSUTF8StringEncoding];
    uint64_t previous=mp_pool_generation(_pool,idBytes.bytes,idBytes.length);
    // Warm activation must use the originally admitted package and policy.
    MiniVerifiedPackage *bound=previous?_packages[@(previous)]:nil;
    if(previous && !bound){if(error)*error=[NSError errorWithDomain:@"MiniContainer" code:2 userInfo:@{NSLocalizedDescriptionKey:@"Retained package policy is missing"}];return NO;}
    MiniAppStorage *storage=previous?_storages[@(previous)]:(_storageRoot?[[MiniAppStorage alloc] initWithRoot:_storageRoot appId:identity error:error]:[[MiniAppStorage alloc] initWithAppId:identity error:error]);
    if(!storage)return NO;
    if(![(bound?:package) activateInPool:_pool launchData:launch error:error])return NO;
    uint64_t generation=mp_pool_generation(_pool,idBytes.bytes,idBytes.length);
    if(!generation)return NO;
    if(!previous){_packages[@(generation)]=package;_storages[@(generation)]=storage;}
    _activeIdentity=[identity copy];_activeGeneration=generation;
    return YES;
}
- (MiniVerifiedPackage *)packageForIdentity:(NSString *)identity generation:(uint64_t)generation {
    if(!NSThread.isMainThread || !_pool || !generation)return nil;
    NSData *idBytes=[identity dataUsingEncoding:NSUTF8StringEncoding];
    if(mp_pool_generation(_pool,idBytes.bytes,idBytes.length)!=generation)return nil;
    return _packages[@(generation)];
}
- (BOOL)ownerReady:(NSError **)error {
    if(NSThread.isMainThread && _pool)return YES;
    if(error)*error=[NSError errorWithDomain:@"MiniContainer" code:1 userInfo:@{NSLocalizedDescriptionKey:@"Container requires its active main-thread owner"}];return NO;
}
- (BOOL)engineStatus:(int32_t)status error:(NSError **)error {
    if(!status)return YES;
    const char *message=mp_pool_last_error(_pool);
    if(error)*error=[NSError errorWithDomain:@"MiniContainer" code:4 userInfo:@{NSLocalizedDescriptionKey:message?@(message):@"Retained engine operation failed"}];return NO;
}
- (BOOL)background:(NSError **)error {return [self ownerReady:error] && [self engineStatus:mp_pool_background(_pool) error:error];}
- (BOOL)resume:(NSError **)error {return [self ownerReady:error] && [self engineStatus:mp_pool_resume(_pool) error:error];}
- (BOOL)memoryWarning:(NSError **)error {return [self ownerReady:error] && [self engineStatus:mp_pool_memory_warning(_pool) error:error];}
- (BOOL)closeIdentity:(NSString *)identity error:(NSError **)error {
    if(![self ownerReady:error])return NO;
    NSData *bytes=[identity dataUsingEncoding:NSUTF8StringEncoding];
    return [self engineStatus:mp_pool_close(_pool,bytes.bytes,bytes.length) error:error];
}
- (BOOL)advanceInput:(const MpInput *)input frame:(MpFrame *)frame damage:(MpDamage *)damage effects:(NSArray<NSData *> **)effects error:(NSError **)error {
    if(effects)*effects=@[];
    if(![self ownerReady:error])return NO;
    if(!input || !frame || !damage || !_activeGeneration){
        if(error)*error=[NSError errorWithDomain:@"MiniContainer" code:4 userInfo:@{NSLocalizedDescriptionKey:@"Frame requires an active guest and valid output buffers"}];return NO;
    }
    NSString *identity=_activeIdentity;uint64_t generation=_activeGeneration;
    if(![self engineStatus:mp_pool_frame_input(_pool,input) error:error] || ![self engineStatus:mp_pool_render_damage(_pool,frame,damage) error:error])return NO;
    uint8_t *records=_serviceBuffer.mutableBytes;ptrdiff_t length=mp_pool_svc_take(_pool,records,_serviceBuffer.length);
    if(length<0)return [self engineStatus:-1 error:error];
    NSMutableArray<NSData *> *external=[NSMutableArray array];
    size_t start=0;
    for(size_t index=0;index<(size_t)length;index++)if(records[index]=='\n'){
        NSData *record=[NSData dataWithBytes:records+start length:index-start];start=index+1;
        id parsed=[NSJSONSerialization JSONObjectWithData:record options:0 error:nil];
        id kind=[parsed isKindOfClass:NSDictionary.class]?parsed[@"kind"]:nil;
        if([@[@"storage.get.v1",@"storage.set.v1",@"storage.remove.v1"] containsObject:kind]){
            if(![self dispatchStorageRecord:record identity:identity generation:generation error:error])return NO;
        }else [external addObject:record];
    }
    if(effects)*effects=[external copy];return YES;
}
- (void)shutdown {
    if(!NSThread.isMainThread || !_pool)return;
    if(mp_pool_destroy(_pool)==0){_pool=NULL;[_packages removeAllObjects];[_storages removeAllObjects];}
}
- (BOOL)postCompletion:(NSData *)record identity:(NSString *)identity generation:(uint64_t)generation error:(NSError **)error {
    if(record.length>4096 || ![self packageForIdentity:identity generation:generation]){
        if(error)*error=[NSError errorWithDomain:@"MiniContainer" code:3 userInfo:@{NSLocalizedDescriptionKey:@"Completion target is stale or record exceeds budget"}];return NO;
    }
    NSData *idBytes=[identity dataUsingEncoding:NSUTF8StringEncoding];
    if(mp_pool_svc_post(_pool,idBytes.bytes,idBytes.length,generation,record.bytes,record.length)!=0){
        if(error)*error=[NSError errorWithDomain:@"MiniContainer" code:3 userInfo:@{NSLocalizedDescriptionKey:@"Retained guest rejected completion"}];return NO;
    }
    return YES;
}
- (BOOL)dispatchStorageRecord:(NSData *)record identity:(NSString *)identity generation:(uint64_t)generation error:(NSError **)error {
    if(record.length>4096 || ![self packageForIdentity:identity generation:generation]){
        if(error)*error=[NSError errorWithDomain:@"MiniContainer" code:3 userInfo:@{NSLocalizedDescriptionKey:@"Storage target is stale or record exceeds budget"}];return NO;
    }
    NSError *parseError=nil;id parsed=[NSJSONSerialization JSONObjectWithData:record options:0 error:&parseError];
    if(![parsed isKindOfClass:NSDictionary.class]){if(error)*error=parseError?:[NSError errorWithDomain:@"MiniProtocol" code:1 userInfo:@{NSLocalizedDescriptionKey:@"Storage request must be an object"}];return NO;}
    NSDictionary *request=parsed;id identifier=request[@"id"],version=request[@"v"],kind=request[@"kind"];
    BOOL valid=[identifier isKindOfClass:NSNumber.class] && CFGetTypeID((__bridge CFTypeRef)identifier)!=CFBooleanGetTypeID() && [version isKindOfClass:NSNumber.class] && CFGetTypeID((__bridge CFTypeRef)version)!=CFBooleanGetTypeID() && [version doubleValue]==1;
    double number=valid?[identifier doubleValue]:0;
    valid=valid && isfinite(number) && number>=1 && number<=9007199254740991.0 && floor(number)==number && [@[@"storage.get.v1",@"storage.set.v1",@"storage.remove.v1"] containsObject:kind];
    if(!valid){if(error)*error=[NSError errorWithDomain:@"MiniProtocol" code:1 userInfo:@{NSLocalizedDescriptionKey:@"Invalid retained storage request"}];return NO;}
    NSError *failure=nil;id result=[_storages[@(generation)] dispatch:kind arguments:request[@"args"] error:&failure];
    NSMutableDictionary *reply=[@{@"v":@1,@"id":identifier} mutableCopy];
    if(result)reply[@"data"]=result;
    else reply[@"error"]=@{@"code":[failure.domain isEqual:@"MiniBusy"]?@"BUSY":[failure.domain isEqual:@"MiniProtocol"]?@"PROTOCOL":@"FAILED",@"message":failure.localizedDescription?:@"Storage unavailable"};
    NSData *encoded=[NSJSONSerialization dataWithJSONObject:reply options:0 error:error];
    return encoded && [self postCompletion:encoded identity:identity generation:generation error:error];
}
- (void)dealloc { NSCAssert(NSThread.isMainThread,@"Container release requires main thread");[self shutdown]; }
@end
