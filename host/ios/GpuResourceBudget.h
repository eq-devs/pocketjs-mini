#import <Foundation/Foundation.h>
@class MiniGpuReservation;
/** Process-wide accounting of explicit texture payload and vertex-buffer bytes.
 * Driver overhead and caller-owned drawable/readback storage are separate. */
@interface MiniGpuResourceBudget : NSObject
+ (instancetype)sharedBudget;
- (instancetype)initWithLimit:(NSUInteger)limit;
- (MiniGpuReservation *)reserve:(NSUInteger)bytes;
@property(nonatomic,readonly) NSUInteger usedBytes;
@end
@interface MiniGpuReservation : NSObject
@end
