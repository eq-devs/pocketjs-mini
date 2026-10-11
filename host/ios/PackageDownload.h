#import "PackageStore.h"
NS_ASSUME_NONNULL_BEGIN
/** Host configuration only. Uses system HTTPS trust and stages on the main owner.
 * A staged update is selected at cold start, never substituted into a running guest. */
@interface MiniPackageDownload : NSObject <NSURLSessionDataDelegate>
- (instancetype)initWithStore:(MiniPackageStore *)store;
+ (nullable NSString *)configuration:(NSData *)bytes error:(NSError **)error;
- (BOOL)startURL:(NSString *)address identity:(NSString *)identity completion:(void (^)(NSString * _Nullable version,NSError * _Nullable error))completion error:(NSError **)error;
- (void)close;
@end
NS_ASSUME_NONNULL_END
