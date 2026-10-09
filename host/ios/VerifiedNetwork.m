#import "VerifiedNetwork.h"
#import <Network/Network.h>
#import <UIKit/UIKit.h>
@interface MiniVerifiedNetwork ()
@property(nonatomic,readwrite) NSDictionary *state;
@property(nonatomic) nw_path_monitor_t monitor;
@property(nonatomic) NSUInteger epoch;
@property(nonatomic) BOOL requested;
@end
@implementation MiniVerifiedNetwork
- (instancetype)init {if((self=[super init])){_state=@{@"connected":NSNull.null,@"type":@"unknown",@"expensive":NSNull.null};[[NSNotificationCenter defaultCenter] addObserver:self selector:@selector(background) name:UIApplicationDidEnterBackgroundNotification object:nil];[[NSNotificationCenter defaultCenter] addObserver:self selector:@selector(foreground) name:UIApplicationDidBecomeActiveNotification object:nil];}return self;}
- (void)resume {_requested=YES;if(UIApplication.sharedApplication.applicationState!=UIApplicationStateBackground)[self startMonitor];}
- (void)startMonitor {
 NSAssert(NSThread.isMainThread,@"Network monitor requires main owner");if(_monitor)return;
 NSUInteger epoch=++_epoch;_state=@{@"connected":NSNull.null,@"type":@"unknown",@"expensive":NSNull.null};
 _monitor=nw_path_monitor_create();__weak MiniVerifiedNetwork *weakSelf=self;
 nw_path_monitor_set_update_handler(_monitor,^(nw_path_t path){
  MiniVerifiedNetwork *owner=weakSelf;if(!owner||owner.epoch!=epoch||!owner.monitor)return;
  BOOL connected=nw_path_get_status(path)==nw_path_status_satisfied;
  NSString *type=!connected?@"none":nw_path_uses_interface_type(path,nw_interface_type_wifi)?@"wifi":nw_path_uses_interface_type(path,nw_interface_type_cellular)?@"cellular":nw_path_uses_interface_type(path,nw_interface_type_wired)?@"ethernet":@"other";
  owner.state=@{@"connected":@(connected),@"type":type,@"expensive":connected?@(nw_path_is_expensive(path)):NSNull.null};
 });
 nw_path_monitor_set_queue(_monitor,dispatch_get_main_queue());nw_path_monitor_start(_monitor);
}
- (void)stopMonitor {NSAssert(NSThread.isMainThread,@"Network monitor requires main owner");++_epoch;if(_monitor){nw_path_monitor_cancel(_monitor);_monitor=nil;}}
- (void)suspend {_requested=NO;[self stopMonitor];}
- (void)background {[self stopMonitor];}
- (void)foreground {if(_requested)[self startMonitor];}
- (void)dealloc {[[NSNotificationCenter defaultCenter] removeObserver:self];if(_monitor)nw_path_monitor_cancel(_monitor);}
@end
