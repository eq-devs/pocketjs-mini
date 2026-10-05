#import "InstalledController.h"
#include <assert.h>
@interface MiniInstalledController (ClipboardTest)
- (NSDictionary *)clipboardWrite:(id)arguments identity:(NSString *)identity;
- (BOOL)clipboardReadReady:(id)work key:(NSString *)key;
@end
@interface RecordingClipboardController : MiniInstalledController
@property(nonatomic) NSString *written;
@property(nonatomic) NSUInteger writes;
@property(nonatomic) BOOL quotaDenied;
@property(nonatomic) double now;
@property(nonatomic) BOOL foreground;
@end
@implementation RecordingClipboardController
- (void)writeClipboardText:(NSString *)text {self.written=text;self.writes++;}
- (BOOL)admitClipboardRateForIdentity:(NSString *)identity time:(double)now {(void)identity;(void)now;return !self.quotaDenied;}
- (double)clipboardTime {return self.now;}
- (BOOL)clipboardForeground {return self.foreground;}
@end
int main(void){@autoreleasepool{
    RecordingClipboardController *controller=[RecordingClipboardController new];
    for(id arguments in @[@{},@{@"text":@1},@{@"text":@"ok",@"extra":@YES},@{@"text":[@"x" stringByPaddingToLength:2049 withString:@"x" startingAtIndex:0]}]){
        NSDictionary *result=[controller clipboardWrite:arguments identity:@"dev.pjm.fixture"];assert([result[@"error"][@"code"] isEqual:@"PROTOCOL"]);assert(controller.writes==0);
    }
    NSString *text=[@"😀" stringByPaddingToLength:1024 withString:@"😀" startingAtIndex:0];NSDictionary *result=[controller clipboardWrite:@{@"text":text} identity:@"dev.pjm.fixture"];assert([result[@"ok"] boolValue] && result[@"data"]==NSNull.null);assert([controller.written isEqual:text] && controller.writes==1);
    controller.quotaDenied=YES;result=[controller clipboardWrite:@{@"text":@"blocked"} identity:@"dev.pjm.fixture"];assert([result[@"error"][@"code"] isEqual:@"BUSY"] && controller.writes==1);
    // Exercise the deadline/foreground guard without accessing a pasteboard or store.
    NSMutableDictionary *pending=[NSMutableDictionary new];[controller setValue:pending forKey:@"clipboardReads"];
    Class taskClass=NSClassFromString(@"MiniClipboardRead");assert(taskClass!=Nil);
    id work=[taskClass new];[work setValue:@7 forKey:@"identifier"];[work setValue:@10 forKey:@"started"];pending[@"3:7"]=work;
    controller.foreground=YES;controller.now=24.999;assert([controller clipboardReadReady:work key:@"3:7"]);
    controller.now=25;assert(![controller clipboardReadReady:work key:@"3:7"]);
    NSString *reply=[work valueForKey:@"reply"];NSDictionary *record=[NSJSONSerialization JSONObjectWithData:[reply dataUsingEncoding:NSUTF8StringEncoding] options:0 error:nil];assert([record[@"error"][@"code"] isEqual:@"TIMEOUT"]);
    controller.now=10;assert(![controller clipboardReadReady:work key:@"3:7"]);assert([[work valueForKey:@"reply"] isEqual:reply]);
    id hidden=[taskClass new];[hidden setValue:@8 forKey:@"identifier"];[hidden setValue:@10 forKey:@"started"];pending[@"3:8"]=hidden;controller.foreground=NO;
    assert(![controller clipboardReadReady:hidden key:@"3:8"]);record=[NSJSONSerialization JSONObjectWithData:[[hidden valueForKey:@"reply"] dataUsingEncoding:NSUTF8StringEncoding] options:0 error:nil];assert([record[@"error"][@"code"] isEqual:@"BUSY"]);
    id cancelled=[taskClass new];[cancelled setValue:@9 forKey:@"identifier"];[cancelled setValue:@10 forKey:@"started"];
    controller.foreground=YES;assert(![controller clipboardReadReady:cancelled key:@"3:9"]);assert([cancelled valueForKey:@"reply"]==nil);
    return 0;
}}
