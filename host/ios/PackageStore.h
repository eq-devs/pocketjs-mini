#import "VerifiedPackage.h"
NS_ASSUME_NONNULL_BEGIN
typedef NS_ENUM(NSInteger, MiniPermissionStatus) {
    MiniPermissionUnavailable=-1, MiniPermissionDenied=0,
    MiniPermissionPrompt=1, MiniPermissionGranted=2
};
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
// Host approval only; callers must separately check declaration and OS status.
// nil with no error means no prior decision. Identity comes from verified metadata.
- (nullable NSNumber *)permissionDecision:(NSString *)permission identity:(NSString *)identity error:(NSError **)error;
- (BOOL)setPermissionDecision:(BOOL)granted permission:(NSString *)permission identity:(NSString *)identity error:(NSError **)error;
// Compare explicitly with Granted; Prompt is never authorization.
- (MiniPermissionStatus)permissionStatus:(NSString *)permission package:(MiniVerifiedPackage *)package osGranted:(BOOL)osGranted error:(NSError **)error;
- (MiniPermissionStatus)recordPermissionApproval:(BOOL)approved permission:(NSString *)permission package:(MiniVerifiedPackage *)package osGranted:(BOOL)osGranted error:(NSError **)error;
@end
NS_ASSUME_NONNULL_END
