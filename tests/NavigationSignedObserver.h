#import "InstalledController.h"
#import "AppStorage.h"
#import "VerifiedMedia.h"
#import "VerifiedContainer.h"

#ifdef PJM_MEDIA_PROVIDER_TEST
@interface MiniVerifiedMedia (ControlledSource)
- (void)load:(NSItemProvider *)provider work:(id)work;
@end
#ifdef PJM_MEDIA_LATE_TEST
@interface LateSourceProvider : NSItemProvider
@property NSURL *source;
@end
@implementation LateSourceProvider
- (BOOL)hasItemConformingToTypeIdentifier:(NSString *)identifier {return [identifier isEqual:@"public.image"];}
- (NSProgress *)loadFileRepresentationForTypeIdentifier:(NSString *)identifier completionHandler:(void (^)(NSURL *,NSError *))completionHandler {
  NSAssert([identifier isEqual:@"public.image"],@"Wrong provider type");NSURL *source=_source;
  // Deliberately complete after cancellation, as a slow external provider may.
  dispatch_after(dispatch_time(DISPATCH_TIME_NOW,5*NSEC_PER_SEC),dispatch_get_global_queue(QOS_CLASS_USER_INITIATED,0),^{completionHandler(source,nil);dispatch_async(dispatch_get_main_queue(),^{MiniAppStorage *storage=[[MiniAppStorage alloc] initWithAppId:@"dev.pjm.navigation" error:nil];[storage dispatch:@"storage.set.v1" arguments:@{@"key":@"media-provider-done",@"value":@YES} error:nil];});});
  return [NSProgress progressWithTotalUnitCount:1];
}
@end
#endif
// Only the source UI is replaced. The real provider reader, normalization,
// resource pool, signed host dispatch and SDK handle operations execute.
@interface ControlledSourceMedia : MiniVerifiedMedia
@property NSUInteger launches;
@end
@implementation ControlledSourceMedia
- (void)launch:(id)work {
  UIGraphicsImageRendererFormat *format=[UIGraphicsImageRendererFormat defaultFormat];format.scale=1;format.opaque=YES;
  UIImage *image=[[[UIGraphicsImageRenderer alloc] initWithSize:CGSizeMake(64,32) format:format] imageWithActions:^(UIGraphicsImageRendererContext *context){[UIColor.redColor setFill];UIRectFill(CGRectMake(0,0,64,32));}];
  NSURL *url=[[NSFileManager.defaultManager URLsForDirectory:NSCachesDirectory inDomains:NSUserDomainMask].firstObject URLByAppendingPathComponent:@"pjm-owned-test-image.png"];
  NSAssert([UIImagePNGRepresentation(image) writeToURL:url atomically:YES],@"Test image write failed");
#ifdef PJM_MEDIA_OVERFLOW_TEST
  if(++_launches==1){NSMutableData *oversized=[UIImagePNGRepresentation(image) mutableCopy];[oversized setLength:8*1024*1024+1];NSAssert([oversized writeToURL:url atomically:YES],@"Overflow fixture write failed");}
#endif
#ifdef PJM_MEDIA_LATE_TEST
  if(++_launches==1){LateSourceProvider *provider=[LateSourceProvider new];provider.source=url;[self load:provider work:work];MiniAppStorage *storage=[[MiniAppStorage alloc] initWithAppId:@"dev.pjm.navigation" error:nil];[storage dispatch:@"storage.set.v1" arguments:@{@"key":@"media-provider-start",@"value":@YES} error:nil];return;}
#endif
  [self load:[[NSItemProvider alloc] initWithContentsOfURL:url] work:work];
}
@end
#endif

// Test-only subclass: observes normal SDK storage; does not replace services,
// authentication, rendering, input, retention or lifecycle implementation.
@interface NavigationProofController : MiniInstalledController
@property(nonatomic,strong) MiniAppStorage *proofStorage;
@property(nonatomic,strong) NSTimer *proofTimer;
@property(nonatomic) BOOL mediaRetired;
@end
@implementation NavigationProofController
#ifdef PJM_MEDIA_PROVIDER_TEST
- (Class)mediaServiceClass {return ControlledSourceMedia.class;}
#endif
- (instancetype)initWithIdentity:(NSString *)identity store:(MiniPackageStore *)store launchData:(NSData *)launch error:(NSError **)error {
  self=[super initWithIdentity:identity store:store launchData:launch error:error];
  if(!self)return nil;
  void (^originalError)(NSString *)=self.surface.onError;
  self.surface.onError=^(NSString *message){NSLog(@"Signed navigation failure: %@",message);if(originalError)originalError(message);};
  _proofStorage=[[MiniAppStorage alloc] initWithAppId:identity error:error];
  // Cold-run receipts must come from this guest, not persisted prior results.
  if(_proofStorage)[_proofStorage dispatch:@"storage.remove.v1" arguments:@{@"key":@"media-proof"} error:nil];
  if(_proofStorage)[_proofStorage dispatch:@"storage.remove.v1" arguments:@{@"key":@"exit-unload-proof"} error:nil];
  __weak NavigationProofController *weakSelf=self;
  self.onExit=^{NavigationProofController *owner=weakSelf;if(!owner)return;[owner.proofTimer invalidate];owner.proofTimer=nil;
    id saved=[owner.proofStorage dispatch:@"storage.get.v1" arguments:@{@"key":@"exit-unload-proof"} error:nil];
    UILabel *label=[owner valueForKey:@"message"];label.accessibilityValue=[saved isEqual:@"saved"]?@"unload=saved":@"unload=missing";
  };
  return _proofStorage?self:nil;
}
- (void)viewDidAppear:(BOOL)animated {
  [super viewDidAppear:animated];[_proofTimer invalidate];
  __weak NavigationProofController *weakSelf=self;
  _proofTimer=[NSTimer scheduledTimerWithTimeInterval:.25 repeats:YES block:^(NSTimer *timer){
    NavigationProofController *owner=weakSelf;if(!owner){[timer invalidate];return;}
    id proof=[owner.proofStorage dispatch:@"storage.get.v1" arguments:@{@"key":@"navigation-proof"} error:nil];
    id network=[owner.proofStorage dispatch:@"storage.get.v1" arguments:@{@"key":@"network-proof"} error:nil];
#ifdef PJM_MEDIA_RETIRE_TEST
    id retirement=[owner.proofStorage dispatch:@"storage.get.v1" arguments:@{@"key":@"media-proof"} error:nil];
    if(!owner.mediaRetired&&[retirement isKindOfClass:NSDictionary.class]&&[retirement[@"code"] isEqual:@"RETIRE_READY"]){
      owner.mediaRetired=YES;
      MiniVerifiedContainer *container=[owner.surface valueForKey:@"container"];
      uint64_t before=container.activeGeneration;NSError *error=nil;
      NSAssert([container closeIdentity:@"dev.pjm.navigation" error:&error],@"Guest retirement failed: %@",error);
      NSAssert([owner openIdentity:@"dev.pjm.navigation" launchData:[@"{}" dataUsingEncoding:NSUTF8StringEncoding] error:&error],@"Guest reactivation failed: %@",error);
      NSAssert(container.activeGeneration>before,@"Retirement did not create a new generation");
      return;
    }
#endif
    if([proof isKindOfClass:NSDictionary.class] && [network isKindOfClass:NSDictionary.class]){owner.surface.accessibilityValue=[NSString stringWithFormat:@"navigation path=%@ count=%@ item=%@ network=%@ events=%@",proof[@"path"],proof[@"count"],proof[@"item"]==NSNull.null?@"null":proof[@"item"],network[@"state"][@"type"],network[@"events"]];id media=[owner.proofStorage dispatch:@"storage.get.v1" arguments:@{@"key":@"media-proof"} error:nil];if([media isKindOfClass:NSDictionary.class])owner.surface.accessibilityValue=[owner.surface.accessibilityValue stringByAppendingFormat:@" media=%@",media[@"code"]];}
  }];
}
- (void)viewDidDisappear:(BOOL)animated {[_proofTimer invalidate];_proofTimer=nil;[super viewDidDisappear:animated];}
- (void)dealloc {[_proofTimer invalidate];}
@end
