#import <Foundation/Foundation.h>

// Main-owner native path monitor. A single latest snapshot replaces prior
// updates; no per-change completion queue is retained.
@interface MiniVerifiedNetwork : NSObject
@property(nonatomic,readonly) NSDictionary *state;
- (void)resume;
- (void)suspend;
@end
