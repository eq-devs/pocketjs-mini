#import "PackageKeyTransition.h"
int main(int argc,const char **argv){@autoreleasepool{
    assert(argc==2);NSError *error=nil;
    NSArray *cases=[NSJSONSerialization JSONObjectWithData:[NSData dataWithContentsOfFile:@(argv[1])] options:0 error:&error];assert(cases && !error);
    NSDictionary *fixture=nil;for(NSDictionary *item in cases)if([item[@"name"] isEqual:@"valid-retained-execution"]){fixture=item;break;}assert(fixture);
    NSData *payload=[[NSData alloc] initWithBase64EncodedString:fixture[@"payload"] options:0],*key=[[NSData alloc] initWithBase64EncodedString:fixture[@"key"] options:0],*envelope=[NSJSONSerialization dataWithJSONObject:fixture[@"manifest"] options:0 error:&error];
    PackageKeyTransition([[@(argv[1]) stringByDeletingLastPathComponent] stringByAppendingPathComponent:@"key-transition"],payload,envelope,key,fixture[@"rotation"]);
    return 0;
}}
