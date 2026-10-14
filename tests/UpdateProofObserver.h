#import "InstalledController.h"
#import "AppStorage.h"
@interface UpdateProofController : MiniInstalledController
@property MiniPackageStore *updateStore;
@property MiniAppStorage *updateStorage;
@property NSString *updateIdentity;
@property NSTimer *updateTimer;
@property NSString *updateFailure;
@property NSString *updateDownloadResult;
@property NSData *updateInitialState;
@property UILabel *updateDownloadLabel;
@end
@implementation UpdateProofController
- (instancetype)initWithIdentity:(NSString *)identity store:(MiniPackageStore *)store launchData:(NSData *)launch error:(NSError **)error {
    if((self=[super initWithIdentity:identity store:store launchData:launch error:error])){
        _updateStore=store;_updateIdentity=identity;_updateStorage=[[MiniAppStorage alloc] initWithAppId:identity error:error];if(!_updateStorage)return nil;
        _updateInitialState=[self cacheState];
        [_updateStorage dispatch:@"storage.remove.v1" arguments:@{@"key":@"update-proof"} error:nil];
        __weak UpdateProofController *weakSelf=self;void (^original)(NSString *)=self.surface.onError;
        self.surface.onError=^(NSString *message){weakSelf.updateFailure=message;if(original)original(message);};
    }return self;
}
- (NSData *)cacheState {NSString *root=[NSSearchPathForDirectoriesInDomains(NSLibraryDirectory,NSUserDomainMask,YES).firstObject stringByAppendingPathComponent:@"mini-packages"];return [NSData dataWithContentsOfFile:[[root stringByAppendingPathComponent:_updateIdentity] stringByAppendingPathComponent:@"state.json"]];}
- (void)viewDidLoad {[super viewDidLoad];UIButton *rollback=[UIButton buttonWithType:UIButtonTypeSystem];rollback.frame=CGRectMake(20,65,160,44);[rollback setTitle:@"Rollback update" forState:UIControlStateNormal];rollback.accessibilityIdentifier=@"update-rollback";[rollback addTarget:self action:@selector(rollbackUpdate:) forControlEvents:UIControlEventTouchUpInside];[self.view addSubview:rollback];_updateDownloadLabel=[[UILabel alloc] initWithFrame:CGRectMake(20,110,360,30)];_updateDownloadLabel.accessibilityIdentifier=@"update-download-result";[self.view addSubview:_updateDownloadLabel];}
- (void)rollbackUpdate:(UIButton *)sender {NSError *error=nil;NSData *before=[self cacheState];if(![_updateStore rollback:_updateIdentity error:&error]){if(before && [before isEqual:[self cacheState]])sender.accessibilityIdentifier=@"update-rollback-rejected-state-unchanged";else _updateFailure=@"Rejected rollback mutated cache state";}}
- (void)viewDidAppear:(BOOL)animated {[super viewDidAppear:animated];[_updateTimer invalidate];__weak UpdateProofController *weakSelf=self;
    _updateTimer=[NSTimer scheduledTimerWithTimeInterval:.1 repeats:YES block:^(NSTimer *timer){
        UpdateProofController *owner=weakSelf;if(!owner){[timer invalidate];return;}
        if(owner.updateFailure){owner.surface.accessibilityValue=[@"FAIL " stringByAppendingString:owner.updateFailure];return;}
        if(owner.updateDownloadResult){owner.updateDownloadLabel.text=[owner.updateDownloadResult isEqual:@"rejected"]?([owner.updateInitialState isEqual:[owner cacheState]]?@"rejected-state-unchanged":@"rejected-state-changed"):owner.updateDownloadResult;}
        MiniVerifiedContainer *container=[owner.surface valueForKey:@"container"];MiniVerifiedPackage *active=[container packageForIdentity:owner.surface.verifiedActiveIdentity generation:owner.surface.verifiedActiveGeneration];
        id proof=[owner.updateStorage dispatch:@"storage.get.v1" arguments:@{@"key":@"update-proof"} error:nil];
        NSString *root=[NSSearchPathForDirectoriesInDomains(NSLibraryDirectory,NSUserDomainMask,YES).firstObject stringByAppendingPathComponent:@"mini-packages"];
        NSString *path=[[root stringByAppendingPathComponent:owner.updateIdentity] stringByAppendingPathComponent:@"state.json"];NSData *bytes=[NSData dataWithContentsOfFile:path];id state=bytes.length<=2048?[NSJSONSerialization JSONObjectWithData:bytes options:0 error:nil]:nil;
        if([proof isKindOfClass:NSDictionary.class] && [state isKindOfClass:NSDictionary.class]){
            NSString *(^version)(id)=^NSString *(id slot){return [slot isKindOfClass:NSString.class]?[[slot componentsSeparatedByString:@"-"] firstObject]:@"none";};
            owner.surface.accessibilityValue=[NSString stringWithFormat:@"running=%@ guest=%@ count=%@ current=%@ pending=%@",active.metadata[@"version"],proof[@"version"],proof[@"count"],version(state[@"current"]),version(state[@"pending"])];
        }
    }];
}
- (void)viewDidDisappear:(BOOL)animated {[_updateTimer invalidate];_updateTimer=nil;[super viewDidDisappear:animated];}
@end
