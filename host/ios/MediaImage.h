#import <Foundation/Foundation.h>
@interface MiniMediaImage : NSObject
@property(nonatomic,readonly) NSData *jpeg;
@property(nonatomic,readonly) NSUInteger width;
@property(nonatomic,readonly) NSUInteger height;
// Pure bounded codec; providers own consent, timeout, cancellation and handles.
+ (instancetype)decode:(NSData *)source maxDimension:(NSUInteger)dimension quality:(NSUInteger)quality error:(NSError **)error;
@end
