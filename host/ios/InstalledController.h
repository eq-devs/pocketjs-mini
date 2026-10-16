#import <UIKit/UIKit.h>
#import "PocketSurfaceView.h"
@class MiniVerifiedMedia;
NS_ASSUME_NONNULL_BEGIN
/** Installed signed guests only. Owner supplies the trusted package store. */
@interface MiniInstalledController : UIViewController
@property(nonatomic,readonly) PocketSurfaceView *surface;
/** Called after a guest-requested exit has completed normal teardown. */
@property(nonatomic,copy,nullable) void (^onExit)(void);
- (nullable instancetype)initWithIdentity:(NSString *)identity store:(MiniPackageStore *)store launchData:(NSData *)launch error:(NSError **)error;
- (void)startDistribution:(NSData *)configuration identity:(NSString *)identity;
- (BOOL)openIdentity:(NSString *)identity launchData:(NSData *)launch error:(NSError **)error;
- (void)shutdown;
@end
/** Development binding sharing installed HTTP transport and HTTP/media resource accounting. */
@interface MiniDevelopmentHTTP : NSObject
- (nullable instancetype)initWithIdentity:(NSString *)identity domains:(NSArray *)domains generation:(uint64_t)generation;
- (nullable MiniVerifiedMedia *)mediaWithPresenter:(UIViewController *)presenter declared:(BOOL)declared;
- (nullable NSDictionary *)start:(id)arguments identifier:(NSNumber *)identifier;
- (NSDictionary *)resource:(NSString *)kind arguments:(id)arguments;
- (void)cancel:(NSNumber *)identifier;
- (void)drain:(BOOL (^)(NSString *reply))sink;
- (void)close;
@end
NS_ASSUME_NONNULL_END
