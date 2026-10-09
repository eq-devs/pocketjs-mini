#import <UIKit/UIKit.h>
#import "PackageStore.h"
#import "MediaImage.h"
NS_ASSUME_NONNULL_BEGIN
/** Main-owner picker and mailbox; resource callbacks run only on the main owner.
 * An opaque reserved slot is retained through provider/worker completion. */
@interface MiniVerifiedMedia : NSObject
- (instancetype)initWithStore:(MiniPackageStore *)store presenter:(UIViewController *)presenter
 reserve:(id _Nullable (^)(NSString *,uint64_t))reserve
 complete:(NSDictionary * _Nullable (^)(id,MiniMediaImage *))complete
 discard:(void (^)(id))discard;
- (nullable NSDictionary *)start:(id)arguments identifier:(NSNumber *)identifier package:(MiniVerifiedPackage *)package generation:(uint64_t)generation;
- (void)drain:(BOOL (^)(MiniVerifiedPackage *,uint64_t,NSString *))receiver;
- (void)cancelGeneration:(uint64_t)generation identifier:(NSNumber *)identifier;
- (void)retireGeneration:(uint64_t)generation;
- (void)suspend;
- (void)suspendForHost;
- (void)resume;
- (void)close;
@end
NS_ASSUME_NONNULL_END
