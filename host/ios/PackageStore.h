#import "VerifiedPackage.h"
NS_ASSUME_NONNULL_BEGIN
/** Host-owned package cache, main thread only. Trust is provided by the host,
 * never by the downloaded envelope. Updates take effect at coldStart only.
 * Running guests retain independent authenticated snapshots. */
@interface MiniPackageStore : NSObject
- (nullable instancetype)initWithRoot:(NSString *)root trustedKey:(NSData *)key error:(NSError **)error;
// Seeds the host-bundled package without replacing any current/pending update.
- (BOOL)seedPayload:(NSData *)payload envelope:(NSData *)envelope error:(NSError **)error;
- (BOOL)stagePayload:(NSData *)payload envelope:(NSData *)envelope error:(NSError **)error;
- (nullable MiniVerifiedPackage *)coldStart:(NSString *)identity error:(NSError **)error;
- (BOOL)rollback:(NSString *)identity error:(NSError **)error;
@end
NS_ASSUME_NONNULL_END
