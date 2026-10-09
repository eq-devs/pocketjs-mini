#import "GpuResourceBudget.h"
@interface MiniGpuResourceBudget ()
- (void)releaseBytes:(NSUInteger)bytes;
@end
@interface MiniGpuReservation ()
- (instancetype)initWithBudget:(MiniGpuResourceBudget *)budget bytes:(NSUInteger)bytes;
@end
@implementation MiniGpuResourceBudget {
  NSLock *_lock;NSUInteger _limit,_used;
}
+ (instancetype)sharedBudget {static MiniGpuResourceBudget *budget;static dispatch_once_t once;dispatch_once(&once,^{budget=[[self alloc] initWithLimit:128*1024*1024];});return budget;}
- (instancetype)initWithLimit:(NSUInteger)limit {if((self=[super init])){_limit=limit;_lock=[NSLock new];}return self;}
- (MiniGpuReservation *)reserve:(NSUInteger)bytes {[_lock lock];if(!bytes||bytes>_limit-_used){[_lock unlock];return nil;}_used+=bytes;[_lock unlock];return [[MiniGpuReservation alloc] initWithBudget:self bytes:bytes];}
- (NSUInteger)usedBytes {[_lock lock];NSUInteger used=_used;[_lock unlock];return used;}
- (void)releaseBytes:(NSUInteger)bytes {[_lock lock];NSAssert(bytes<=_used,@"GPU reservation underflow");_used-=bytes;[_lock unlock];}
@end
@implementation MiniGpuReservation {
  MiniGpuResourceBudget *_budget;NSUInteger _bytes;
}
- (instancetype)initWithBudget:(MiniGpuResourceBudget *)budget bytes:(NSUInteger)bytes {if((self=[super init])){_budget=budget;_bytes=bytes;}return self;}
- (void)dealloc {[_budget releaseBytes:_bytes];}
@end
