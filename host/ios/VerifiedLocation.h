#import <UIKit/UIKit.h>
#import "PackageStore.h"
NS_ASSUME_NONNULL_BEGIN
/** Main-thread one-shot location service with separate signed/development entry points. */
@interface MiniVerifiedLocation : NSObject
- (instancetype)initWithStore:(MiniPackageStore *)store presenter:(UIViewController *)presenter;
- (nullable instancetype)initDevelopmentWithIdentity:(NSString *)identity declared:(BOOL)declared presenter:(UIViewController *)presenter;
- (nullable NSDictionary *)startDevelopment:(id)arguments identifier:(NSNumber *)identifier generation:(uint64_t)generation;
- (void)drainDevelopment:(BOOL (^)(NSString *identity,uint64_t generation,NSString *reply))receiver;
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
