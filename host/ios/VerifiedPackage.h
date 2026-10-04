#import <Foundation/Foundation.h>
#include "mini_core.h"
NS_ASSUME_NONNULL_BEGIN
/** Owns authenticated bytes. Borrowed inputs are valid for this object's life.
 * Build-plan admission is required before engine activation. */
@interface MiniVerifiedPackage : NSObject
@property(nonatomic, readonly) NSDictionary *metadata;
@property(nonatomic, readonly) NSData *payload;
@property(nonatomic, readonly) MpPackageInputs inputs;
@property(nonatomic, readonly) NSDictionary *plan;
@property(nonatomic, readonly) MpConfig config;
- (nullable instancetype)initWithPayload:(NSData *)payload envelope:(NSData *)envelope trustedKey:(NSData *)key error:(NSError **)error;
- (BOOL)activateInPool:(MpPool *)pool launchData:(NSData *)launch error:(NSError **)error;
/* Apply to initial URLs and every redirect. These methods do not perform I/O
 * or grant OS permission; each service must also check host/OS approval. */
- (BOOL)authorizeURL:(NSString *)address error:(NSError **)error;
- (BOOL)authorizePermission:(NSString *)permission hostGranted:(BOOL)granted error:(NSError **)error;
@end
NS_ASSUME_NONNULL_END
