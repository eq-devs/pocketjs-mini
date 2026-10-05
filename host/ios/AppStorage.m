#import "Mini-Swift.h"
#import "AppStorage.h"
#include <sys/stat.h>
#include <sys/file.h>
#include <fcntl.h>
#include <unistd.h>

@interface MiniAppStorage ()
@property NSString *directory;
@end
@implementation MiniAppStorage
static BOOL storageFailure(NSError **error,NSString *domain,NSString *message) {
  if(error)*error=[NSError errorWithDomain:domain code:1 userInfo:@{NSLocalizedDescriptionKey:message}];return NO;
}
static BOOL storagePath(NSString *path,NSError **error) {
  if(![path isEqual:path.stringByResolvingSymlinksInPath])return storageFailure(error,@"MiniStorage",@"Storage path contains symbolic links");
  return YES;
}
static BOOL storageKey(id key,NSError **error) {
  if(![key isKindOfClass:NSString.class] || ![key length] || [key lengthOfBytesUsingEncoding:NSUTF8StringEncoding]>128)
    return storageFailure(error,@"MiniProtocol",@"Storage key must contain 1..128 UTF-8 bytes");
  return YES;
}
static BOOL storageValue(id value,NSError **error) {
  NSData *encoded=[NSJSONSerialization dataWithJSONObject:@[value ?: NSNull.null] options:0 error:error];
  if(!encoded)return NO;
  if(encoded.length-2>2048)return storageFailure(error,@"MiniProtocol",@"Storage value exceeds quota");
  return YES;
}
- (instancetype)initWithAppId:(NSString *)appId error:(NSError **)error {
  NSString *root=NSSearchPathForDirectoriesInDomains(NSLibraryDirectory,NSUserDomainMask,YES).firstObject;
  return [self initWithRoot:root appId:appId error:error];
}
- (instancetype)initWithRoot:(NSString *)root appId:(NSString *)appId error:(NSError **)error {
  NSRegularExpression *pattern=[NSRegularExpression regularExpressionWithPattern:@"^[a-zA-Z][a-zA-Z0-9_-]*(\\.[a-zA-Z][a-zA-Z0-9_-]*)+$" options:0 error:nil];
  if(![appId isKindOfClass:NSString.class] || appId.length>128 || [pattern numberOfMatchesInString:appId options:0 range:NSMakeRange(0,appId.length)]!=1) {
    storageFailure(error,@"MiniStorage",@"Invalid host app identity");return nil;
  }
  if((self=[super init])) {
    root=root.stringByResolvingSymlinksInPath;
    self.directory=[[root stringByAppendingPathComponent:@"MiniData"] stringByAppendingPathComponent:appId];
    if(!storagePath(self.directory,error) || ![NSFileManager.defaultManager createDirectoryAtPath:self.directory withIntermediateDirectories:YES attributes:@{NSFilePosixPermissions:@0700} error:error] || !storagePath(self.directory,error))return nil;
  }
  return self;
}
- (id)dispatch:(NSString *)kind arguments:(id)arguments error:(NSError **)error {
  @synchronized(self) {
    if(!storagePath(self.directory,error))return nil;
    NSString *lockPath=[self.directory stringByAppendingPathComponent:@".storage-lock"];
    int descriptor=open(lockPath.fileSystemRepresentation,O_CREAT|O_RDWR|O_NOFOLLOW|O_CLOEXEC,0600);
    if(descriptor<0){storageFailure(error,@"MiniStorage",@"Storage lock unavailable");return nil;}
    @try {
      struct stat info;
      if(fstat(descriptor,&info)!=0 || !S_ISREG(info.st_mode)){storageFailure(error,@"MiniStorage",@"Invalid storage lock");return nil;}
      if(flock(descriptor,LOCK_EX|LOCK_NB)!=0){storageFailure(error,errno==EWOULDBLOCK?@"MiniBusy":@"MiniStorage",@"Application storage is busy");return nil;}
      return [self dispatchLocked:kind arguments:arguments error:error];
    }@finally{close(descriptor);}
  }
}
- (id)dispatchLocked:(NSString *)kind arguments:(id)arguments error:(NSError **)error {
    if(![arguments isKindOfClass:NSDictionary.class] || !storageKey(arguments[@"key"],error)) {
      if(error && !*error)storageFailure(error,@"MiniProtocol",@"Storage arguments must be an object");return nil;
    }
    if(!storagePath(self.directory,error))return nil;
    NSString *path=[self.directory stringByAppendingPathComponent:@"storage.json"];
    if(!storagePath(path,error))return nil;
    struct stat info;NSMutableDictionary *values=[NSMutableDictionary dictionary];
    if(lstat(path.fileSystemRepresentation,&info)==0) {
      if(!S_ISREG(info.st_mode) || info.st_size>1048576){storageFailure(error,@"MiniStorage",@"Invalid storage file");return nil;}
      NSData *data=[NSData dataWithContentsOfFile:path options:0 error:error];if(!data)return nil;
      id parsed=[MiniPackageVerifier parseStrictJSON:data error:error];
      if(![parsed isKindOfClass:NSDictionary.class] || [parsed count]>256){storageFailure(error,@"MiniStorage",@"Invalid storage contents");return nil;}
      values=[parsed mutableCopy];
      for(NSString *key in values)if(!storageKey(key,error) || !storageValue(values[key],error))return nil;
    }else if(errno!=ENOENT){storageFailure(error,@"MiniStorage",@"Storage file unavailable");return nil;}
    NSString *key=arguments[@"key"];
    if([kind isEqual:@"storage.get.v1"])return values[key] ?: NSNull.null;
    if([kind isEqual:@"storage.set.v1"]) {
      id value=arguments[@"value"];if(!value){storageFailure(error,@"MiniProtocol",@"Storage value is required");return nil;}
      if(!storageValue(value,error))return nil;values[key]=value;
    }else if([kind isEqual:@"storage.remove.v1"])[values removeObjectForKey:key];
    else {storageFailure(error,@"MiniProtocol",@"Unknown storage operation");return nil;}
    NSData *encoded=[NSJSONSerialization dataWithJSONObject:values options:0 error:error];if(!encoded)return nil;
    if(values.count>256 || encoded.length>1048576){storageFailure(error,@"MiniProtocol",@"Application storage quota exceeded");return nil;}
    if(![encoded writeToFile:path options:NSDataWritingAtomic | NSDataWritingFileProtectionCompleteUntilFirstUserAuthentication error:error])return nil;
    return NSNull.null;
}
@end
