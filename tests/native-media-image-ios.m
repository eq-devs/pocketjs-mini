#import "MediaImage.h"
#import <ImageIO/ImageIO.h>
#import <CoreGraphics/CoreGraphics.h>
#include <assert.h>
#undef assert
#define assert(...) do{if(!(__VA_ARGS__)){fprintf(stderr,"Media image assertion at line %d\n",__LINE__);abort();}}while(0)
static NSData *fixture(size_t width,size_t height,BOOL jpeg,NSUInteger orientation){
 CGColorSpaceRef colors=CGColorSpaceCreateDeviceRGB();CGContextRef context=CGBitmapContextCreate(NULL,width,height,8,width*4,colors,(CGBitmapInfo)kCGImageAlphaPremultipliedLast);CGColorSpaceRelease(colors);assert(context);
 // Half transparent, half red. JPEG input also carries deliberately private metadata.
 CGContextSetRGBFillColor(context,1,0,0,1);CGContextFillRect(context,CGRectMake(0,0,width/2,height));CGImageRef image=CGBitmapContextCreateImage(context);CGContextRelease(context);
 NSMutableData *data=[NSMutableData new];CGImageDestinationRef destination=CGImageDestinationCreateWithData((__bridge CFMutableDataRef)data,jpeg?CFSTR("public.jpeg"):CFSTR("public.png"),1,NULL);assert(destination);
 NSDictionary *metadata=@{(__bridge NSString *)kCGImagePropertyOrientation:@(orientation),(__bridge NSString *)kCGImagePropertyGPSDictionary:@{(__bridge NSString *)kCGImagePropertyGPSLatitude:@43.25,(__bridge NSString *)kCGImagePropertyGPSLatitudeRef:@"N"}};
 CGImageDestinationAddImage(destination,image,(__bridge CFDictionaryRef)metadata);assert(CGImageDestinationFinalize(destination));CFRelease(destination);CGImageRelease(image);return data;
}
int main(void){@autoreleasepool{
 NSError *error=nil;MiniMediaImage *image=[MiniMediaImage decode:fixture(320,160,NO,1) maxDimension:64 quality:80 error:&error];assert(image && !error && image.width==64 && image.height==32 && image.jpeg.length>0 && image.jpeg.length<=1048576);
 CGImageSourceRef source=CGImageSourceCreateWithData((__bridge CFDataRef)image.jpeg,NULL);assert(source && CFEqual(CGImageSourceGetType(source),CFSTR("public.jpeg")));
 NSDictionary *metadata=CFBridgingRelease(CGImageSourceCopyPropertiesAtIndex(source,0,NULL));assert(!metadata[(__bridge NSString *)kCGImagePropertyGPSDictionary]);CGImageRef decoded=CGImageSourceCreateImageAtIndex(source,0,NULL);assert(decoded);CFRelease(source);
 CGColorSpaceRef colors=CGColorSpaceCreateDeviceRGB();uint8_t pixels[64*32*4]={0};CGContextRef bitmap=CGBitmapContextCreate(pixels,64,32,8,64*4,colors,(CGBitmapInfo)kCGImageAlphaNoneSkipLast);CGColorSpaceRelease(colors);CGContextDrawImage(bitmap,CGRectMake(0,0,64,32),decoded);CGContextRelease(bitmap);CGImageRelease(decoded);size_t white=(16*64+55)*4;assert(pixels[white]>240 && pixels[white+1]>240 && pixels[white+2]>240);
 NSData *oriented=fixture(320,160,YES,6);source=CGImageSourceCreateWithData((__bridge CFDataRef)oriented,NULL);metadata=CFBridgingRelease(CGImageSourceCopyPropertiesAtIndex(source,0,NULL));assert(metadata[(__bridge NSString *)kCGImagePropertyGPSDictionary]);CFRelease(source);
 image=[MiniMediaImage decode:oriented maxDimension:64 quality:90 error:&error];assert(image && image.width==32 && image.height==64);source=CGImageSourceCreateWithData((__bridge CFDataRef)image.jpeg,NULL);metadata=CFBridgingRelease(CGImageSourceCopyPropertiesAtIndex(source,0,NULL));assert(!metadata[(__bridge NSString *)kCGImagePropertyGPSDictionary]);CFRelease(source);
 for(NSData *invalid in @[[NSData data],[@"not an image" dataUsingEncoding:NSUTF8StringEncoding],[NSMutableData dataWithLength:8*1024*1024+1]]){error=nil;assert(![MiniMediaImage decode:invalid maxDimension:64 quality:80 error:&error] && error);}
 error=nil;assert(![MiniMediaImage decode:fixture(16,8,NO,1) maxDimension:63 quality:80 error:&error] && error);
 error=nil;assert(![MiniMediaImage decode:fixture(16,8,NO,1) maxDimension:64 quality:91 error:&error] && error);
 error=nil;assert(![MiniMediaImage decode:fixture(8193,1,NO,1) maxDimension:64 quality:80 error:&error] && error);
 puts("Native ImageIO media: bounded JPEG, resize, EXIF rotation, metadata stripping, white alpha and malformed/oversized rejection passed");
}return 0;}
