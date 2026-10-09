// PocketSurfaceView — a UIKit view that hosts one PocketJS guest: display-link
// driven ticks, packed touch input, and Swift Metal presentation of the
// shared engine's software-rasterized BGRA framebuffer. Main thread only.

#import <UIKit/UIKit.h>
#import "VerifiedContainer.h"
#import "PackageStore.h"

NS_ASSUME_NONNULL_BEGIN

@interface PocketSurfaceView : UIView
// Store-backed activation applies updates only when this identity is cold.
- (nullable instancetype)initWithInstalledIdentity:(NSString *)identity store:(MiniPackageStore *)store storageRoot:(nullable NSString *)root launchData:(NSData *)launch error:(NSError **)error;
- (BOOL)activateInstalledIdentity:(NSString *)identity store:(MiniPackageStore *)store launchData:(NSData *)launch error:(NSError **)error;
// Signed mode owns a three-guest container. Warm activation retains state.
- (nullable instancetype)initWithVerifiedPackage:(MiniVerifiedPackage *)package
                                    storageRoot:(nullable NSString *)root
                                     launchData:(NSData *)launch error:(NSError **)error;
- (BOOL)activateVerifiedPackage:(MiniVerifiedPackage *)package launchData:(NSData *)launch error:(NSError **)error;
// Asynchronous services must echo the original identity and generation.
- (BOOL)postVerifiedEvent:(NSString *)line identity:(NSString *)identity generation:(uint64_t)generation error:(NSError **)error;
@property(nonatomic, copy, nullable) void (^onVerifiedEffect)(MiniVerifiedPackage *package,uint64_t generation,NSString *line);
// Final unload effects; storage is handled by the container before this hook.
// Synchronous retirement callback: do not reenter the container or throw.
@property(nonatomic, copy, nullable) void (^onVerifiedCleanup)(MiniVerifiedPackage *package,uint64_t generation,NSString *line);
// Called once for every retired guest, including guests with no unload effects,
// after cleanup records and before native engine release. Cancel service tasks
// for this exact identity/generation synchronously; do not reenter the container.
@property(nonatomic, copy, nullable) void (^onVerifiedRetirement)(MiniVerifiedPackage *package,uint64_t generation);
// Main-thread boundary before a signed guest advances. Service owners may post
// bounded completions here; do not advance, activate or retire the container.
@property(nonatomic, copy, nullable) void (^onVerifiedFrameStart)(void);
@property(nonatomic,readonly,nullable) NSString *verifiedActiveIdentity;
@property(nonatomic,readonly) uint64_t verifiedActiveGeneration;
- (BOOL)setServiceNamespaces:(NSArray<NSString *> *)names;

// density is the raster scale (1..4; use 2 or 3 to match screen scale).
- (instancetype)initWithFrame:(CGRect)frame
                 logicalWidth:(uint32_t)logicalWidth
                logicalHeight:(uint32_t)logicalHeight
                      density:(uint32_t)density;

// Struct-free convenience for bridged callers; frame starts at zero and is
// laid out by the parent view system.
+ (instancetype)surfaceWithLogicalWidth:(uint32_t)logicalWidth
                          logicalHeight:(uint32_t)logicalHeight
                                density:(uint32_t)density;

// Explicit identity initializer. Mini requires pjm-ios/7.
+ (instancetype)surfaceWithLogicalWidth:(uint32_t)logicalWidth
                          logicalHeight:(uint32_t)logicalHeight
                                density:(uint32_t)density
                                 hostId:(NSString *)hostId
                                hostAbi:(uint32_t)hostAbi;

// Feed assets before start. Returns NO with `lastError` set on failure.
- (BOOL)loadPak:(NSData *)pak;
- (BOOL)evalBundle:(NSString *)source label:(nullable NSString *)label;
// Development-only cold-boot recording. Configure before evalBundle; no signed pool support.
- (BOOL)beginRecordingPackageHash:(NSString *)hash density:(uint32_t)density;
- (nullable NSData *)finishRecording;
- (nullable NSData *)debugTree;
// Host overlay for an exact captured development snapshot. Zero clears it.
- (void)highlightInspectionNode:(int32_t)nodeId frame:(uint64_t)frame;
@property(nonatomic, readonly) int32_t highlightedInspectionNode;

// Shared engine currently advances at 60 Hz; 0 selects that default.
@property(nonatomic) uint32_t tickRate;

// Starts/stops the CADisplayLink. start after evalBundle succeeds.
- (void)start;

// Starts a 60 Hz main-run-loop timer instead of CADisplayLink. Connected
// device hosts use this only when their runtime does not deliver display-link
// callbacks; it is mutually exclusive with start.
- (void)startWithFixedFrameTimer;
- (void)stop;
// Hidden controller guests freeze even when the application returns foreground.
- (void)suspendForHost;
- (void)resumeForHost;
// Owner-thread orderly guest and GPU teardown, idempotent.
- (void)shutdown;

// Guest -> host effect lines (JSON by convention), delivered on the main
// thread during the display tick.
@property(nonatomic, copy, nullable) void (^onEffect)(NSString *line);
// Synchronous bounded retirement effects, after the final guest turn returns.
@property(nonatomic, copy, nullable) void (^onCleanupEffect)(NSString *line);

// Called after a guest frame has advanced and rendered successfully. Native
// device hosts use this for liveness and touch receipts without observing or
// changing application state.
@property(nonatomic, copy, nullable) void (^onFrame)
    (uint64_t frameNumber, NSUInteger touchCount);

// Host -> guest: queued for the guest's next poll (frame-boundary delivery).
- (void)postEvent:(NSString *)line;

// Test-mode hash of the GPU-rendered drawable, after command completion.
@property(nonatomic, readonly) uint32_t presentedHash;
@property(nonatomic, readonly) uint32_t logicalWidth;
@property(nonatomic, readonly) uint32_t logicalHeight;
@property(nonatomic, readonly, nullable) NSString *lastError;
@property(nonatomic, copy, nullable) void (^onError)(NSString *message);

@end

NS_ASSUME_NONNULL_END
