#import "GpuResourceBudget.h"
#include <assert.h>
int main(void){@autoreleasepool{
  MiniGpuResourceBudget *budget=[[MiniGpuResourceBudget alloc] initWithLimit:16];
  @autoreleasepool{MiniGpuReservation *first=[budget reserve:8],*second=[budget reserve:8];assert(first&&second&&budget.usedBytes==16);assert(![budget reserve:1]);first=nil;assert(budget.usedBytes==8);second=nil;}
  assert(budget.usedBytes==0);assert(![budget reserve:NSUIntegerMax]);assert(![budget reserve:0]);
  dispatch_apply(1000,dispatch_get_global_queue(QOS_CLASS_USER_INITIATED,0),^(size_t index){(void)index;@autoreleasepool{MiniGpuReservation *lease=[budget reserve:8];if(lease)assert(budget.usedBytes<=16);}});
  assert(budget.usedBytes==0);puts("GPU shared reservation capacity/release/concurrency passed");
}}
