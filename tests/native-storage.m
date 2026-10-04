#import <Foundation/Foundation.h>
#import "AppStorage.h"
#include <sys/file.h>
#include <fcntl.h>
#include <unistd.h>
#include <assert.h>
#undef assert
#define assert(...) do {if(!(__VA_ARGS__)){fprintf(stderr,"Storage assertion failed at line %d\n",__LINE__);abort();}}while(0)

int main(void) {@autoreleasepool {
  NSString *root=[@"/private/tmp" stringByAppendingPathComponent:[@"pjm-native-storage-" stringByAppendingString:NSUUID.UUID.UUIDString]];
  NSError *error=nil;
  assert([NSFileManager.defaultManager createDirectoryAtPath:root withIntermediateDirectories:NO attributes:nil error:&error]);
  MiniAppStorage *first=[[MiniAppStorage alloc]initWithRoot:root appId:@"com.example.first" error:&error];if(!first)NSLog(@"%@",error);assert(first);
  MiniAppStorage *second=[[MiniAppStorage alloc]initWithRoot:root appId:@"com.example.first" error:&error];assert(second);
  MiniAppStorage *other=[[MiniAppStorage alloc]initWithRoot:root appId:@"com.example.other" error:&error];assert(other);
  NSString *directory=[root stringByAppendingPathComponent:@"MiniData/com.example.first"];
  NSString *lockPath=[directory stringByAppendingPathComponent:@".storage-lock"];
  int lock=open(lockPath.fileSystemRepresentation,O_CREAT|O_RDWR,0600);assert(lock>=0 && flock(lock,LOCK_EX|LOCK_NB)==0);
  assert(![first dispatch:@"storage.set.v1" arguments:@{@"key":@"blocked",@"value":@1} error:&error]);assert([error.domain isEqual:@"MiniBusy"]);
  assert(![second dispatch:@"storage.get.v1" arguments:@{@"key":@"blocked"} error:&error]);assert([error.domain isEqual:@"MiniBusy"]);
  // Another app owns a different lock and keeps working while this app is busy.
  assert([other dispatch:@"storage.set.v1" arguments:@{@"key":@"ok",@"value":@1} error:&error]);close(lock);
  assert([first dispatch:@"storage.set.v1" arguments:@{@"key":@"../__proto__",@"value":@"😀"} error:&error]);
  assert([second dispatch:@"storage.set.v1" arguments:@{@"key":@"second",@"value":@2} error:&error]);
  assert([[first dispatch:@"storage.get.v1" arguments:@{@"key":@"second"} error:&error] isEqual:@2]);
  assert([[second dispatch:@"storage.get.v1" arguments:@{@"key":@"../__proto__"} error:&error] isEqual:@"😀"]);
  assert([other dispatch:@"storage.get.v1" arguments:@{@"key":@"../__proto__"} error:&error]==NSNull.null);
  for(int i=0;i<254;i++)assert([first dispatch:@"storage.set.v1" arguments:@{@"key":[NSString stringWithFormat:@"key-%d",i],@"value":@(i)} error:&error]);
  assert(![first dispatch:@"storage.set.v1" arguments:@{@"key":@"overflow",@"value":@0} error:&error]);assert([error.domain isEqual:@"MiniProtocol"]);
  assert([[second dispatch:@"storage.get.v1" arguments:@{@"key":@"second"} error:&error] isEqual:@2]);
  NSString *file=[directory stringByAppendingPathComponent:@"storage.json"];
  assert([@"invalid" writeToFile:file atomically:YES encoding:NSUTF8StringEncoding error:&error]);
  assert(![first dispatch:@"storage.set.v1" arguments:@{@"key":@"second",@"value":@3} error:&error]);
  assert([[NSString stringWithContentsOfFile:file encoding:NSUTF8StringEncoding error:&error] isEqual:@"invalid"]);
  assert(unlink(lockPath.fileSystemRepresentation)==0);
  assert(symlink(file.fileSystemRepresentation,lockPath.fileSystemRepresentation)==0);
  assert(![second dispatch:@"storage.get.v1" arguments:@{@"key":@"second"} error:&error]);
  assert([NSFileManager.defaultManager removeItemAtPath:root error:&error]);
  puts("Native iOS storage: competing providers, busy isolation, lock release, quotas, corruption and symbolic links passed");
}return 0;}
