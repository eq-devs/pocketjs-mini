#import <Foundation/Foundation.h>

/** Identity is supplied by the host, never by service arguments. */
@interface MiniAppStorage : NSObject
- (instancetype)initWithAppId:(NSString *)appId error:(NSError **)error;
- (instancetype)initWithRoot:(NSString *)root appId:(NSString *)appId error:(NSError **)error;
- (id)dispatch:(NSString *)kind arguments:(id)arguments error:(NSError **)error;
@end
