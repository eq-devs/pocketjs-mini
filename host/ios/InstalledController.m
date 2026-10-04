#import "InstalledController.h"
@interface MiniInstalledController ()
@property(nonatomic) MiniPackageStore *store;
@property(nonatomic,readwrite) PocketSurfaceView *surface;
@property(nonatomic) UILabel *message;
@end
@implementation MiniInstalledController
- (instancetype)initWithIdentity:(NSString *)identity store:(MiniPackageStore *)store launchData:(NSData *)launch error:(NSError **)error {
    self=[super initWithNibName:nil bundle:nil];if(!self)return nil;
    _store=store;_surface=[[PocketSurfaceView alloc] initWithInstalledIdentity:identity store:store storageRoot:nil launchData:launch error:error];if(!_surface)return nil;
    __weak MiniInstalledController *weakSelf=self;
    _surface.onError=^(NSString *message){(void)message;MiniInstalledController *owner=weakSelf;owner.message.text=@"Unable to run this app.";owner.message.hidden=NO;};
    _surface.onVerifiedEffect=^(MiniVerifiedPackage *package,uint64_t generation,NSString *line){[weakSelf dispatchService:line package:package generation:generation];};
    return self;
}
- (void)viewDidLoad {
    [super viewDidLoad];self.view.backgroundColor=UIColor.blackColor;
    [self.view addSubview:_surface];_surface.autoresizingMask=UIViewAutoresizingFlexibleWidth|UIViewAutoresizingFlexibleHeight;_surface.isAccessibilityElement=YES;_surface.accessibilityIdentifier=@"pjm-signed-surface";
    _message=[UILabel new];_message.textColor=UIColor.whiteColor;_message.numberOfLines=0;_message.textAlignment=NSTextAlignmentCenter;_message.hidden=YES;_message.accessibilityIdentifier=@"pjm-status";[self.view addSubview:_message];[self layoutSurface];
}
- (void)layoutSurface {CGRect bounds=UIEdgeInsetsInsetRect(self.view.bounds,self.view.safeAreaInsets);_surface.frame=bounds;_message.frame=CGRectInset(bounds,16,16);}
- (void)viewDidLayoutSubviews {[super viewDidLayoutSubviews];[self layoutSurface];}
- (void)viewSafeAreaInsetsDidChange {[super viewSafeAreaInsetsDidChange];[self layoutSurface];}
- (void)viewDidAppear:(BOOL)animated {[super viewDidAppear:animated];[self layoutSurface];[_surface resumeForHost];[_surface start];}
- (void)viewDidDisappear:(BOOL)animated {[super viewDidDisappear:animated];[_surface stop];[_surface suspendForHost];}
- (BOOL)openIdentity:(NSString *)identity launchData:(NSData *)launch error:(NSError **)error {
    BOOL opened=[_surface activateInstalledIdentity:identity store:_store launchData:launch error:error];if(opened)_message.hidden=YES;return opened;
}
- (void)dispatchService:(NSString *)line package:(MiniVerifiedPackage *)package generation:(uint64_t)generation {
    NSData *record=[line dataUsingEncoding:NSUTF8StringEncoding];if(record.length>4096)return;
    id parsed=[NSJSONSerialization JSONObjectWithData:record options:0 error:nil];if(![parsed isKindOfClass:NSDictionary.class])return;
    NSDictionary *request=parsed;id identifier=request[@"id"],version=request[@"v"],kind=request[@"kind"];
    if(![identifier isKindOfClass:NSNumber.class] || CFGetTypeID((__bridge CFTypeRef)identifier)==CFBooleanGetTypeID())return;
    double number=[identifier doubleValue];if(!isfinite(number) || number<1 || number>9007199254740991.0 || floor(number)!=number)return;
    NSMutableDictionary *reply=[@{@"v":@1,@"id":identifier} mutableCopy];NSString *code=nil,*message=nil;
    if(![version isKindOfClass:NSNumber.class] || CFGetTypeID((__bridge CFTypeRef)version)==CFBooleanGetTypeID() || [version doubleValue]!=1 || ![kind isKindOfClass:NSString.class] || [kind length]>64 || [kind rangeOfString:@"^[a-z][a-zA-Z0-9.]*\\.v[1-9][0-9]*$" options:NSRegularExpressionSearch].length!=[kind length] || ![kind length] || !request[@"args"]){code=@"PROTOCOL";message=@"Invalid service request";}
    else if([kind isEqual:@"device.info.v1"]){MpConfig config=package.config;reply[@"data"]=@{@"platform":@"ios",@"model":UIDevice.currentDevice.model,@"width":@(config.width),@"height":@(config.height),@"density":@(config.density)};}
    else if([kind isEqual:@"cancel.v1"])reply[@"data"]=NSNull.null;
    else {code=@"UNSUPPORTED";message=@"Unsupported native service";}
    reply[@"ok"]=code?@NO:@YES;if(code)reply[@"error"]=@{@"code":code,@"message":message};
    NSData *encoded=[NSJSONSerialization dataWithJSONObject:reply options:0 error:nil];if(encoded && encoded.length<=4096){NSError *failure=nil;[_surface postVerifiedEvent:[[NSString alloc] initWithData:encoded encoding:NSUTF8StringEncoding] identity:package.metadata[@"appId"] generation:generation error:&failure];}
}
- (void)shutdown {[_surface shutdown];}
- (void)dealloc {[_surface shutdown];}
@end
