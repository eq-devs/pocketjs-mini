#import "MediaImage.h"
#import <ImageIO/ImageIO.h>
#import <CoreGraphics/CoreGraphics.h>
#define MiniMediaSourceBytes (8*1024*1024)
#define MiniMediaResourceBytes (1024*1024)
@interface MiniMediaImage ()
@property(nonatomic,readwrite,copy) NSData *jpeg;
@property(nonatomic,readwrite) NSUInteger width;
@property(nonatomic,readwrite) NSUInteger height;
@end
static id MiniMediaFailure(NSError **error,NSString *message){if(error)*error=[NSError errorWithDomain:@"MiniMedia" code:1 userInfo:@{NSLocalizedDescriptionKey:message}];return nil;}
static BOOL MiniMediaInteger(id value,double maximum){return [value isKindOfClass:NSNumber.class] && CFGetTypeID((__bridge CFTypeRef)value)!=CFBooleanGetTypeID() && isfinite([value doubleValue]) && [value doubleValue]>=1 && [value doubleValue]<=maximum && floor([value doubleValue])==[value doubleValue];}
typedef struct {CFMutableDataRef data;BOOL overflow;} MiniMediaOutput;
static size_t MiniMediaWrite(void *context,const void *bytes,size_t count){MiniMediaOutput *output=context;CFIndex length=CFDataGetLength(output->data);if(count>MiniMediaResourceBytes-(size_t)length){output->overflow=YES;return 0;}CFDataAppendBytes(output->data,bytes,(CFIndex)count);return count;}
static void MiniMediaRelease(void *context){MiniMediaOutput *output=context;CFRelease(output->data);}
@implementation MiniMediaImage
+ (instancetype)decode:(NSData *)source maxDimension:(NSUInteger)dimension quality:(NSUInteger)quality error:(NSError **)error {
 if(![source isKindOfClass:NSData.class] || !source.length || source.length>MiniMediaSourceBytes || dimension<64 || dimension>1024 || quality<25 || quality>90)return MiniMediaFailure(error,@"Media source or options exceed limits");
 CGImageSourceRef images=CGImageSourceCreateWithData((__bridge CFDataRef)source,(__bridge CFDictionaryRef)@{(__bridge NSString *)kCGImageSourceShouldCache:@NO});
 if(!images)return MiniMediaFailure(error,@"Unsupported media image");
 NSString *kind=(__bridge NSString *)CGImageSourceGetType(images);NSDictionary *properties=CFBridgingRelease(CGImageSourceCopyPropertiesAtIndex(images,0,NULL));
 id width=properties[(__bridge NSString *)kCGImagePropertyPixelWidth],height=properties[(__bridge NSString *)kCGImagePropertyPixelHeight];
 BOOL allowed=[@[@"public.jpeg",@"public.png",@"public.heic",@"public.heif",@"org.webmproject.webp"] containsObject:kind] && MiniMediaInteger(width,8192) && MiniMediaInteger(height,8192) && [width unsignedLongLongValue]*[height unsignedLongLongValue]<=16*1024*1024;
 if(!allowed){CFRelease(images);return MiniMediaFailure(error,@"Media image dimensions or format exceed limits");}
 NSDictionary *options=@{(__bridge NSString *)kCGImageSourceCreateThumbnailFromImageAlways:@YES,(__bridge NSString *)kCGImageSourceCreateThumbnailWithTransform:@YES,(__bridge NSString *)kCGImageSourceThumbnailMaxPixelSize:@(dimension),(__bridge NSString *)kCGImageSourceShouldCacheImmediately:@YES};
 CGImageRef image=CGImageSourceCreateThumbnailAtIndex(images,0,(__bridge CFDictionaryRef)options);CFRelease(images);
 if(!image)return MiniMediaFailure(error,@"Media image decode failed");
 size_t w=CGImageGetWidth(image),h=CGImageGetHeight(image);if(!w || !h || w>dimension || h>dimension){CGImageRelease(image);return MiniMediaFailure(error,@"Decoded media image exceeds dimensions");}
 CGColorSpaceRef colors=CGColorSpaceCreateDeviceRGB();CGContextRef flattened=CGBitmapContextCreate(NULL,w,h,8,w*4,colors,(CGBitmapInfo)kCGImageAlphaNoneSkipLast);CGColorSpaceRelease(colors);
 if(!flattened){CGImageRelease(image);return MiniMediaFailure(error,@"Media normalization unavailable");}
 CGContextSetRGBFillColor(flattened,1,1,1,1);CGContextFillRect(flattened,CGRectMake(0,0,w,h));CGContextDrawImage(flattened,CGRectMake(0,0,w,h),image);CGImageRelease(image);image=CGBitmapContextCreateImage(flattened);CGContextRelease(flattened);
 if(!image)return MiniMediaFailure(error,@"Media normalization failed");
 NSMutableData *jpeg=[NSMutableData new];MiniMediaOutput output={(CFMutableDataRef)CFRetain((__bridge CFTypeRef)jpeg),NO};CGDataConsumerCallbacks callbacks={MiniMediaWrite,MiniMediaRelease};
 CGDataConsumerRef consumer=CGDataConsumerCreate(&output,&callbacks);if(!consumer){CFRelease(output.data);CGImageRelease(image);return MiniMediaFailure(error,@"Media output unavailable");}
 CGImageDestinationRef destination=CGImageDestinationCreateWithDataConsumer(consumer,CFSTR("public.jpeg"),1,NULL);
 BOOL completed=NO;if(destination){CGImageDestinationAddImage(destination,image,(__bridge CFDictionaryRef)@{(__bridge NSString *)kCGImageDestinationLossyCompressionQuality:@(quality/100.0)});completed=CGImageDestinationFinalize(destination);CFRelease(destination);}CGDataConsumerRelease(consumer);CGImageRelease(image);
 if(!completed || output.overflow || !jpeg.length)return MiniMediaFailure(error,@"Media JPEG exceeds resource budget or encoding failed");
 MiniMediaImage *result=[MiniMediaImage new];result.jpeg=jpeg;result.width=w;result.height=h;return result;
}
@end
