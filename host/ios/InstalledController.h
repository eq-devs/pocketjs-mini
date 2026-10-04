#import <UIKit/UIKit.h>
#import "PocketSurfaceView.h"
NS_ASSUME_NONNULL_BEGIN
/** Installed signed guests only. Owner supplies the trusted package store. */
@interface MiniInstalledController : UIViewController
@property(nonatomic,readonly) PocketSurfaceView *surface;
- (nullable instancetype)initWithIdentity:(NSString *)identity store:(MiniPackageStore *)store launchData:(NSData *)launch error:(NSError **)error;
- (BOOL)openIdentity:(NSString *)identity launchData:(NSData *)launch error:(NSError **)error;
- (void)shutdown;
@end
NS_ASSUME_NONNULL_END
