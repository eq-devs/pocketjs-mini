#import "VerifiedPackage.h"
NS_ASSUME_NONNULL_BEGIN
/** Main-thread owner. Call shutdown on the main thread before releasing.
 * A package/policy stays bound to its retained guest's completion generation. */
@interface MiniVerifiedContainer : NSObject
@property(nonatomic, readonly) MpPool *pool;
@property(nonatomic, readonly, nullable) NSString *activeIdentity;
@property(nonatomic, readonly) uint64_t activeGeneration;
/* Frame pixels borrow the active guest until the next frame, activation or
 * retirement. Effects are copied and retain their originating generation.
 * Storage effects are dispatched here; other effects are returned to the host. */
- (BOOL)advanceGpuInput:(const MpInput *)input maxSide:(uint32_t)maxSide callback:(MpGpuCallback)callback context:(void *)context effects:(NSArray<NSData *> * _Nullable * _Nullable)effects error:(NSError **)error;
- (BOOL)advanceInput:(const MpInput *)input frame:(MpFrame *)frame damage:(MpDamage *)damage effects:(NSArray<NSData *> * _Nullable * _Nullable)effects error:(NSError **)error;
- (BOOL)background:(NSError **)error;
- (BOOL)resume:(NSError **)error;
- (BOOL)memoryWarning:(NSError **)error;
- (BOOL)closeIdentity:(NSString *)identity error:(NSError **)error;
@property(nonatomic, readonly, nullable) NSError *lastCleanupError;
- (nullable instancetype)initWithStorageRoot:(nullable NSString *)root;
/* Synchronous main-thread callbacks. No pool reentry or thrown exceptions.
 * Cleanup records are copied; retirement runs before engine release and must
 * finish outstanding GPU use before freeing guest resources. */
@property(nonatomic, copy, nullable) void (^onCleanup)(MiniVerifiedPackage *,uint64_t,NSData *);
@property(nonatomic, copy, nullable) void (^onRetirement)(MiniVerifiedPackage *,uint64_t);
- (BOOL)activatePackage:(MiniVerifiedPackage *)package launchData:(NSData *)launch error:(NSError **)error;
- (nullable MiniVerifiedPackage *)packageForIdentity:(NSString *)identity generation:(uint64_t)generation;
- (BOOL)dispatchStorageRecord:(NSData *)record identity:(NSString *)identity generation:(uint64_t)generation error:(NSError **)error;
- (BOOL)postCompletion:(NSData *)record identity:(NSString *)identity generation:(uint64_t)generation error:(NSError **)error;
- (void)shutdown;
@end
NS_ASSUME_NONNULL_END
