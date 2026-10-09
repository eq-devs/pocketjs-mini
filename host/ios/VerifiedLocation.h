#import <UIKit/UIKit.h>
#import "PackageStore.h"
NS_ASSUME_NONNULL_BEGIN
/** Main-thread, signed-package one-shot location service. */
@interface MiniVerifiedLocation : NSObject
- (instancetype)initWithStore:(MiniPackageStore *)store presenter:(UIViewController *)presenter;
// nil means the request is pending; otherwise returns an immediate {ok,data/error} body.
- (nullable NSDictionary *)start:(id)arguments identifier:(NSNumber *)identifier package:(MiniVerifiedPackage *)package generation:(uint64_t)generation;
- (void)drain:(BOOL (^)(MiniVerifiedPackage *package,uint64_t generation,NSString *reply))receiver;
- (void)cancelGeneration:(uint64_t)generation identifier:(NSNumber *)identifier;
- (void)retireGeneration:(uint64_t)generation;
- (void)suspend;
- (void)resume;
- (void)close;
@end
NS_ASSUME_NONNULL_END
