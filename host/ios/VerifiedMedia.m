#import "VerifiedMedia.h"
#import <PhotosUI/PhotosUI.h>
#import <AVFoundation/AVFoundation.h>

static BOOL MiniMediaBusy;
static BOOL MiniMediaRate(NSString *identity) {
 static NSMutableDictionary<NSString *,NSMutableArray<NSNumber *> *> *rates;static dispatch_once_t once;dispatch_once(&once,^{rates=[NSMutableDictionary new];});
 double now=NSProcessInfo.processInfo.systemUptime;
 @synchronized(rates){for(NSString *key in [rates.allKeys copy]){NSMutableArray *times=rates[key];while(times.count&&[times.firstObject doubleValue]<=now-60)[times removeObjectAtIndex:0];if(!times.count)[rates removeObjectForKey:key];}NSMutableArray *times=rates[identity];if(!times){if(rates.count>=64)return NO;times=[NSMutableArray new];rates[identity]=times;}if(times.count>=8)return NO;[times addObject:@(now)];return YES;}
}
static BOOL MiniMediaNumber(id value,double low,double high){if(![value isKindOfClass:NSNumber.class]||CFGetTypeID((__bridge CFTypeRef)value)==CFBooleanGetTypeID())return NO;double number=[value doubleValue];return isfinite(number)&&floor(number)==number&&number>=low&&number<=high;}
@class MiniVerifiedMedia;
@interface MiniMediaWork : NSObject <PHPickerViewControllerDelegate,UIImagePickerControllerDelegate,UINavigationControllerDelegate,UIAdaptivePresentationControllerDelegate>
@property(nonatomic,weak) MiniVerifiedMedia *owner;
@property MiniVerifiedPackage *package;
@property uint64_t generation;
@property NSNumber *identifier;
@property NSDictionary *options;
@property id slot;
@property UIViewController *ui;
@property NSProgress *progress;
@property NSTimer *timer;
@property NSString *reply;
@property(atomic) BOOL cancelled;
@property BOOL finished,external,permit;
@end
@interface MiniVerifiedMedia ()
@property MiniPackageStore *store;
@property(nonatomic,weak) UIViewController *presenter;
@property(copy) id (^reserve)(NSString *,uint64_t);
@property(copy) NSDictionary *(^complete)(id,MiniMediaImage *);
@property(copy) void (^discard)(id);
@property MiniMediaWork *work;
@property BOOL closed;
- (void)finish:(MiniMediaWork *)work image:(nullable MiniMediaImage *)image code:(nullable NSString *)code;
- (void)launch:(MiniMediaWork *)work;
- (void)load:(NSItemProvider *)provider work:(MiniMediaWork *)work;
- (void)camera:(UIImage *)image work:(MiniMediaWork *)work;
@end
@implementation MiniMediaWork
- (void)picker:(PHPickerViewController *)picker didFinishPicking:(NSArray<PHPickerResult *> *)results {
 if(_finished||_cancelled)return;picker.delegate=nil;[picker dismissViewControllerAnimated:NO completion:nil];_ui=nil;_external=NO;
 if(results.count!=1){[_owner finish:self image:nil code:@"CANCELLED"];return;}[_owner load:results.firstObject.itemProvider work:self];
}
- (void)imagePickerControllerDidCancel:(UIImagePickerController *)picker {(void)picker;[_owner finish:self image:nil code:@"CANCELLED"];}
- (void)imagePickerController:(UIImagePickerController *)picker didFinishPickingMediaWithInfo:(NSDictionary<UIImagePickerControllerInfoKey,id> *)info {
 if(_finished||_cancelled)return;picker.delegate=nil;[picker dismissViewControllerAnimated:NO completion:nil];_ui=nil;_external=NO;
 UIImage *image=info[UIImagePickerControllerOriginalImage];if(![image isKindOfClass:UIImage.class]){[_owner finish:self image:nil code:@"FAILED"];return;}[_owner camera:image work:self];
}
- (void)presentationControllerDidDismiss:(UIPresentationController *)presentationController {(void)presentationController;[_owner finish:self image:nil code:@"CANCELLED"];}
- (void)dealloc {if(_permit)@synchronized(MiniMediaWork.class){MiniMediaBusy=NO;}}
@end
@implementation MiniVerifiedMedia
- (instancetype)initWithStore:(MiniPackageStore *)store presenter:(UIViewController *)presenter reserve:(id (^)(NSString *,uint64_t))reserve complete:(NSDictionary *(^)(id,MiniMediaImage *))complete discard:(void (^)(id))discard {
 if((self=[super init])){_store=store;_presenter=presenter;_reserve=[reserve copy];_complete=[complete copy];_discard=[discard copy];
  [NSNotificationCenter.defaultCenter addObserver:self selector:@selector(suspend) name:UIApplicationDidEnterBackgroundNotification object:nil];
 }return self;
}
- (BOOL)foreground {return !_closed&&UIApplication.sharedApplication.applicationState==UIApplicationStateActive&&_presenter.viewIfLoaded.window!=nil;}
- (NSDictionary *)failure:(NSString *)code {return @{@"ok":@NO,@"error":@{@"code":code,@"message":@"Media selection failed"}};}
- (nullable NSDictionary *)start:(id)arguments identifier:(NSNumber *)identifier package:(MiniVerifiedPackage *)package generation:(uint64_t)generation {
 NSAssert(NSThread.isMainThread,@"Media requires main owner");if(_closed)return [self failure:@"CLOSED"];
 if(![arguments isKindOfClass:NSDictionary.class]||[arguments count]!=3||![@[@"library",@"camera"] containsObject:arguments[@"source"]]||!MiniMediaNumber(arguments[@"maxDimension"],64,1024)||!MiniMediaNumber(arguments[@"quality"],25,90)||!MiniMediaNumber(identifier,1,9007199254740991.0)||!generation)return [self failure:@"PROTOCOL"];
 if(![package authorizePermission:@"media" hostGranted:YES error:nil])return [self failure:@"DENIED"];
 if(_work||![self foreground]||_presenter.presentedViewController||!MiniMediaRate(package.metadata[@"appId"]))return [self failure:@"BUSY"];
 @synchronized(MiniMediaWork.class){if(MiniMediaBusy)return [self failure:@"BUSY"];MiniMediaBusy=YES;}
 MiniMediaWork *work=[MiniMediaWork new];work.permit=YES;work.owner=self;work.package=package;work.generation=generation;work.identifier=identifier;work.options=[arguments copy];work.slot=_reserve(package.metadata[@"appId"],generation);if(!work.slot)return [self failure:@"BUSY"];_work=work;
 __weak MiniVerifiedMedia *weakSelf=self;__weak MiniMediaWork *weakWork=work;
 work.timer=[NSTimer timerWithTimeInterval:120 repeats:NO block:^(NSTimer *timer){(void)timer;[weakSelf finish:weakWork image:nil code:@"TIMEOUT"];}];[NSRunLoop.mainRunLoop addTimer:work.timer forMode:NSRunLoopCommonModes];
 NSError *error=nil;MiniPermissionStatus status=[_store permissionStatus:@"media" package:package osGranted:YES error:&error];
 if(error){[self finish:work image:nil code:@"FAILED"];return nil;}if(status==MiniPermissionDenied){[self finish:work image:nil code:@"DENIED"];return nil;}if(status==MiniPermissionGranted){[self launch:work];return nil;}
 UIAlertController *alert=[UIAlertController alertControllerWithTitle:@"Image access" message:[NSString stringWithFormat:@"Allow %@ to select or capture an image?",package.metadata[@"appId"]] preferredStyle:UIAlertControllerStyleAlert];work.ui=alert;
 void (^decide)(BOOL)=^(BOOL approved){MiniVerifiedMedia *owner=weakSelf;MiniMediaWork *bound=weakWork;if(!owner||!bound||owner.work!=bound||bound.finished)return;bound.ui=nil;if(![owner foreground]){[owner finish:bound image:nil code:@"BUSY"];return;}NSError *failure=nil;MiniPermissionStatus selected=[owner.store recordPermissionApproval:approved permission:@"media" package:bound.package osGranted:YES error:&failure];if(failure){[owner finish:bound image:nil code:@"FAILED"];return;}if(selected!=MiniPermissionGranted){[owner finish:bound image:nil code:@"DENIED"];return;}dispatch_async(dispatch_get_main_queue(),^{[owner launch:bound];});};
 [alert addAction:[UIAlertAction actionWithTitle:@"Don’t allow" style:UIAlertActionStyleCancel handler:^(UIAlertAction *action){(void)action;decide(NO);}]];[alert addAction:[UIAlertAction actionWithTitle:@"Allow" style:UIAlertActionStyleDefault handler:^(UIAlertAction *action){(void)action;decide(YES);}]];[_presenter presentViewController:alert animated:YES completion:nil];return nil;
}
- (void)present:(UIViewController *)picker work:(MiniMediaWork *)work {
 if(_work!=work||work.finished||work.cancelled)return;if(![self foreground]||_presenter.presentedViewController){[self finish:work image:nil code:@"BUSY"];return;}
 work.ui=picker;work.external=YES;picker.modalPresentationStyle=UIModalPresentationFullScreen;[_presenter presentViewController:picker animated:YES completion:nil];picker.presentationController.delegate=work;
}
- (void)launch:(MiniMediaWork *)work {
 if(_work!=work||work.finished||work.cancelled)return;if(![self foreground]){[self finish:work image:nil code:@"BUSY"];return;}
 if([_store permissionStatus:@"media" package:work.package osGranted:YES error:nil]!=MiniPermissionGranted){[self finish:work image:nil code:@"DENIED"];return;}
 if([work.options[@"source"] isEqual:@"library"]){PHPickerConfiguration *config=[PHPickerConfiguration new];config.selectionLimit=1;config.filter=PHPickerFilter.imagesFilter;config.preferredAssetRepresentationMode=PHPickerConfigurationAssetRepresentationModeCurrent;PHPickerViewController *picker=[[PHPickerViewController alloc] initWithConfiguration:config];picker.delegate=work;[self present:picker work:work];return;}
 if(![UIImagePickerController isSourceTypeAvailable:UIImagePickerControllerSourceTypeCamera]){[self finish:work image:nil code:@"UNSUPPORTED"];return;}
 AVAuthorizationStatus status=[AVCaptureDevice authorizationStatusForMediaType:AVMediaTypeVideo];
 if(status==AVAuthorizationStatusNotDetermined){work.external=YES;__weak MiniVerifiedMedia *weakSelf=self;[AVCaptureDevice requestAccessForMediaType:AVMediaTypeVideo completionHandler:^(BOOL granted){dispatch_async(dispatch_get_main_queue(),^{work.external=NO;if(!granted)[weakSelf finish:work image:nil code:@"DENIED"];else [weakSelf launch:work];});}];return;}
 if(status!=AVAuthorizationStatusAuthorized){[self finish:work image:nil code:@"DENIED"];return;}
 UIImagePickerController *picker=[UIImagePickerController new];picker.sourceType=UIImagePickerControllerSourceTypeCamera;picker.mediaTypes=@[@"public.image"];picker.allowsEditing=NO;picker.delegate=work;[self present:picker work:work];
}
// The provider's temporary URL is valid only inside this callback. Stream there,
// with a hard read cap, instead of loading an unbounded data representation.
- (void)load:(NSItemProvider *)provider work:(MiniMediaWork *)work {
 if(![provider hasItemConformingToTypeIdentifier:@"public.image"]){[self finish:work image:nil code:@"FAILED"];return;}
 __weak MiniVerifiedMedia *weakSelf=self;
 work.progress=[provider loadFileRepresentationForTypeIdentifier:@"public.image" completionHandler:^(NSURL *url,NSError *error){@autoreleasepool{
  if(work.cancelled)return;NSMutableData *source=[NSMutableData new];BOOL failed=error!=nil||!url.isFileURL;NSInputStream *stream=failed?nil:[NSInputStream inputStreamWithURL:url];[stream open];uint8_t bytes[8192];
  while(!failed&&!work.cancelled){NSInteger count=[stream read:bytes maxLength:sizeof(bytes)];if(count<0){failed=YES;break;}if(!count)break;if((NSUInteger)count>8*1024*1024-source.length){failed=YES;break;}[source appendBytes:bytes length:(NSUInteger)count];}[stream close];
  MiniMediaImage *image=(!failed&&!work.cancelled)?[MiniMediaImage decode:source maxDimension:[work.options[@"maxDimension"] unsignedIntegerValue] quality:[work.options[@"quality"] unsignedIntegerValue] error:nil]:nil;
  dispatch_async(dispatch_get_main_queue(),^{[weakSelf finish:work image:image code:image?nil:@"FAILED"];});
 }}];
}
- (void)camera:(UIImage *)image work:(MiniMediaWork *)work {
 __weak MiniVerifiedMedia *weakSelf=self;dispatch_async(dispatch_get_global_queue(QOS_CLASS_USER_INITIATED,0),^{@autoreleasepool{
  MiniMediaImage *result=nil;size_t w=image.CGImage?CGImageGetWidth(image.CGImage):0,h=image.CGImage?CGImageGetHeight(image.CGImage):0;
  if(!work.cancelled&&w&&h&&w<=8192&&h<=8192&&w*h<=16*1024*1024){CGFloat dimension=[work.options[@"maxDimension"] doubleValue],scale=MIN(1,dimension/MAX(image.size.width,image.size.height));CGSize size=CGSizeMake(MAX(1,floor(image.size.width*scale)),MAX(1,floor(image.size.height*scale)));UIGraphicsImageRendererFormat *format=[UIGraphicsImageRendererFormat defaultFormat];format.scale=1;format.opaque=YES;
   UIGraphicsImageRenderer *renderer=[[UIGraphicsImageRenderer alloc] initWithSize:size format:format];UIImage *small=[renderer imageWithActions:^(UIGraphicsImageRendererContext *context){[UIColor.whiteColor setFill];UIRectFill(CGRectMake(0,0,size.width,size.height));[image drawInRect:CGRectMake(0,0,size.width,size.height)];}];NSData *jpeg=UIImageJPEGRepresentation(small,[work.options[@"quality"] doubleValue]/100);if(!work.cancelled&&jpeg.length<=1024*1024)result=[MiniMediaImage decode:jpeg maxDimension:(NSUInteger)dimension quality:[work.options[@"quality"] unsignedIntegerValue] error:nil];
  }dispatch_async(dispatch_get_main_queue(),^{[weakSelf finish:work image:result code:result?nil:@"FAILED"];});
 }});
}
- (void)stopUI:(MiniMediaWork *)work { [work.timer invalidate];work.timer=nil;[work.progress cancel];work.progress=nil;if([work.ui isKindOfClass:PHPickerViewController.class])((PHPickerViewController *)work.ui).delegate=nil;if([work.ui isKindOfClass:UIImagePickerController.class])((UIImagePickerController *)work.ui).delegate=nil;[work.ui dismissViewControllerAnimated:NO completion:nil];work.ui=nil;work.external=NO;}
- (void)finish:(MiniMediaWork *)work image:(MiniMediaImage *)image code:(NSString *)code {
 NSAssert(NSThread.isMainThread,@"Media completion requires main owner");if(!work||_work!=work||work.finished||work.cancelled)return;work.finished=YES;if(!image)work.cancelled=YES;[self stopUI:work];NSDictionary *data=image?_complete(work.slot,image):nil;if(!data){_discard(work.slot);code=code?:@"FAILED";}
 NSDictionary *body=data?@{@"ok":@YES,@"data":data}:[self failure:code];NSMutableDictionary *reply=[body mutableCopy];reply[@"v"]=@1;reply[@"id"]=work.identifier;NSData *encoded=[NSJSONSerialization dataWithJSONObject:reply options:NSJSONWritingWithoutEscapingSlashes error:nil];work.reply=[[NSString alloc] initWithData:encoded encoding:NSUTF8StringEncoding];
}
- (void)drain:(BOOL (^)(MiniVerifiedPackage *,uint64_t,NSString *))receiver {NSAssert(NSThread.isMainThread,@"Media requires main owner");MiniMediaWork *work=_work;if(work.reply&&receiver(work.package,work.generation,work.reply))_work=nil;}
- (void)cancelWork {MiniMediaWork *work=_work;if(!work)return;work.cancelled=YES;[self stopUI:work];_discard(work.slot);_work=nil;}
- (void)cancelGeneration:(uint64_t)generation identifier:(NSNumber *)identifier {if(_work.generation==generation&&[_work.identifier isEqual:identifier])[self cancelWork];}
- (void)retireGeneration:(uint64_t)generation {if(_work.generation==generation)[self cancelWork];}
- (void)suspend {if(_work&&!_work.finished)[self finish:_work image:nil code:@"BUSY"];}
- (void)suspendForHost {if(!_work.external)[self suspend];}
- (void)resume {}
- (void)close {if(_closed)return;[self cancelWork];_closed=YES;[NSNotificationCenter.defaultCenter removeObserver:self];}
- (void)dealloc {[NSNotificationCenter.defaultCenter removeObserver:self];}
@end
