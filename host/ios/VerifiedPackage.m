#import "VerifiedPackage.h"
#import "Mini-Swift.h"
static BOOL boundedInteger(id value,NSUInteger maximum,NSUInteger *result){
    if(![value isKindOfClass:NSNumber.class] || CFGetTypeID((__bridge CFTypeRef)value)==CFBooleanGetTypeID())return NO;
    double number=[value doubleValue];if(!isfinite(number) || number<1 || number>maximum || floor(number)!=number)return NO;
    *result=(NSUInteger)number;return YES;
}
static BOOL exactBoolean(id value,BOOL expected){return [value isKindOfClass:NSNumber.class] && CFGetTypeID((__bridge CFTypeRef)value)==CFBooleanGetTypeID() && [value boolValue]==expected;}
@implementation MiniVerifiedPackage
- (BOOL)authorizeURL:(NSString *)address error:(NSError **)error {
    NSURLComponents *url=[NSURLComponents componentsWithString:address];
    NSString *host=url.host.lowercaseString;
    BOOL permitted=url.URL && [url.scheme.lowercaseString isEqual:@"https"] && !url.user && !url.password && (!url.port || url.port.integerValue==443) && host.length && [_metadata[@"domains"] containsObject:host];
    if(!permitted && error)*error=[NSError errorWithDomain:@"MiniPackage" code:4 userInfo:@{NSLocalizedDescriptionKey:@"URL denied by authenticated package domain policy"}];
    return permitted;
}
- (BOOL)authorizePermission:(NSString *)permission hostGranted:(BOOL)granted error:(NSError **)error {
    BOOL declared=[_metadata[@"permissions"] containsObject:permission];
    if((!declared || !granted) && error)*error=[NSError errorWithDomain:@"MiniPackage" code:5 userInfo:@{NSLocalizedDescriptionKey:declared?@"Permission denied by host or OS":@"Permission not declared by authenticated package"}];
    return declared && granted;
}
- (BOOL)activateInPool:(MpPool *)pool launchData:(NSData *)launch error:(NSError **)error {
    NSData *identity=[_metadata[@"appId"] dataUsingEncoding:NSUTF8StringEncoding];
    if(!pool || !identity.length || !_inputs.js || launch.length>4096){
        if(error)*error=[NSError errorWithDomain:@"MiniPackage" code:3 userInfo:@{NSLocalizedDescriptionKey:@"Invalid verified activation input"}];return NO;
    }
    int result=mp_pool_activate(pool,identity.bytes,identity.length,&_config,_inputs.js,_inputs.js_len,_inputs.pak,_inputs.pak_len,launch.bytes,launch.length);
    if(result!=0){
        const char *reason=mp_pool_last_error(pool);
        NSString *message=reason?[NSString stringWithUTF8String:reason]:nil;
        if(error)*error=[NSError errorWithDomain:@"MiniPackage" code:3 userInfo:@{NSLocalizedDescriptionKey:message?:@"Verified package activation failed"}];return NO;
    }
    return YES;
}
- (instancetype)initWithPayload:(NSData *)payload envelope:(NSData *)envelope trustedKey:(NSData *)key error:(NSError **)error {
    self=[super init]; if(!self)return nil;
    // Freeze caller-owned NSMutableData before verifying or borrowing pointers.
    _payload=[payload copy];
    _metadata=[MiniPackageVerifier verifyWithPayload:_payload envelope:[envelope copy] trustedKey:[key copy] abi:7 target:@"pjm-ios" error:error];
    if(!_metadata)return nil;
    NSData *identity=[_metadata[@"appId"] dataUsingEncoding:NSUTF8StringEncoding];
    _inputs.size=sizeof(_inputs);
    if(mp_package_select(_payload.bytes,_payload.length,1,identity.bytes,identity.length,&_inputs)!=0){
        if(error)*error=[NSError errorWithDomain:@"MiniPackage" code:1 userInfo:@{NSLocalizedDescriptionKey:@"Authenticated package structure or identity rejected"}];
        return nil;
    }
    NSData *planData=[NSData dataWithBytes:_inputs.plan length:_inputs.plan_len];
    id parsed=[NSJSONSerialization JSONObjectWithData:planData options:0 error:error];
    if(![parsed isKindOfClass:NSDictionary.class]){if(error && !*error)*error=[NSError errorWithDomain:@"MiniPackage" code:2 userInfo:@{NSLocalizedDescriptionKey:@"Authenticated build plan must be an object"}];return nil;}
    _plan=parsed;
    if(![MiniPackageVerifier verifyPlanHash:_plan error:error])return nil;
    NSDictionary *app=[_plan[@"app"] isKindOfClass:NSDictionary.class]?_plan[@"app"]:nil;
    NSDictionary *target=[_plan[@"target"] isKindOfClass:NSDictionary.class]?_plan[@"target"]:nil;
    NSDictionary *viewport=[_plan[@"viewport"] isKindOfClass:NSDictionary.class]?_plan[@"viewport"]:nil;
    NSArray *logical=[viewport[@"logical"] isKindOfClass:NSArray.class]?viewport[@"logical"]:nil;
    NSArray *physical=[viewport[@"physical"] isKindOfClass:NSArray.class]?viewport[@"physical"]:nil;
    NSUInteger width=0,height=0,density=0,pw=0,ph=0,abi=0;
    BOOL admitted=[app[@"id"] isEqual:_metadata[@"appId"]] && [app[@"version"] isEqual:_metadata[@"version"]] && [target[@"id"] isEqual:@"pjm-ios"] && boundedInteger(target[@"hostAbi"],7,&abi) && abi==7 && logical.count==2 && physical.count==2;
    if(admitted)admitted=boundedInteger(logical[0],1024,&width) && boundedInteger(logical[1],1024,&height) && boundedInteger(viewport[@"rasterDensity"],4,&density) && boundedInteger(physical[0],4096,&pw) && boundedInteger(physical[1],4096,&ph) && pw==width*density && ph==height*density && pw*ph*4<=16*1024*1024;
    NSDictionary *features=[_plan[@"features"] isKindOfClass:NSDictionary.class]?_plan[@"features"]:nil;
    NSArray *companions=[_plan[@"companions"] isKindOfClass:NSArray.class]?_plan[@"companions"]:nil;
    NSDictionary *modality=[_plan[@"modality"] isKindOfClass:NSDictionary.class]?_plan[@"modality"]:nil;
    if(admitted)admitted=[viewport[@"presentation"] isEqual:@"native"] && [viewport[@"policy"] isEqual:@"fixed"] && features && companions && companions.count==0 && [modality[@"form"] isEqual:@"takeover"];
    for(id capability in features){
        id requested=features[capability];
        BOOL boolean=[requested isKindOfClass:NSNumber.class] && CFGetTypeID((__bridge CFTypeRef)requested)==CFBooleanGetTypeID();
        if(!boolean || ([requested boolValue] && ![@[@"input.touch",@"text.glyphs.baked"] containsObject:capability]))admitted=NO;
    }
    NSArray *screens=[modality[@"screens"] isKindOfClass:NSArray.class]?modality[@"screens"]:nil;
    NSDictionary *screen=screens.count==1 && [screens[0] isKindOfClass:NSDictionary.class]?screens[0]:nil;
    NSArray *screenSize=[screen[@"logical"] isKindOfClass:NSArray.class]?screen[@"logical"]:nil;
    NSUInteger sw=0,sh=0;
    id analog=modality[@"analog"];
    BOOL noAnalog=[analog isKindOfClass:NSNumber.class] && CFGetTypeID((__bridge CFTypeRef)analog)!=CFBooleanGetTypeID() && [analog doubleValue]==0;
    if(admitted)admitted=screen && [screen[@"role"] isEqual:@"primary"] && screenSize.count==2 && boundedInteger(screenSize[0],1024,&sw) && boundedInteger(screenSize[1],1024,&sh) && sw==width && sh==height && exactBoolean(screen[@"touch"],YES) && exactBoolean(screen[@"resizable"],NO) && [@[@"portrait",@"landscape"] containsObject:screen[@"orientation"]] && [modality[@"touch"] isEqual:@"primary"] && [modality[@"pointer"] isEqual:@"none"] && exactBoolean(modality[@"buttons"],NO) && noAnalog;
    if(!admitted){if(error)*error=[NSError errorWithDomain:@"MiniPackage" code:2 userInfo:@{NSLocalizedDescriptionKey:@"Authenticated build plan is incompatible with this host"}];return nil;}
    _config=(MpConfig){sizeof(MpConfig),1,(uint32_t)width,(uint32_t)height,(uint32_t)density,24*1024*1024,1};
    return self;
}
@end
