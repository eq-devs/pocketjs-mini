#include "TouchSampling.h"
#include <assert.h>
#include <stdio.h>
int main(void){
  MiniTouchSampling compressed={0};
  assert(mini_touch_initial(compressed));assert(!mini_touch_drained(compressed,false));
  compressed=mini_touch_sampled(compressed,false);
  assert(!mini_touch_initial(compressed));assert(!mini_touch_drained(compressed,false));
  compressed=mini_touch_sampled(compressed,false);assert(mini_touch_drained(compressed,false));
  MiniTouchSampling live={0};live=mini_touch_sampled(live,true);
  for(int frame=0;frame<20;frame++){assert(!mini_touch_drained(live,true));live=mini_touch_sampled(live,true);}
  assert(!mini_touch_drained(live,false));live=mini_touch_sampled(live,false);assert(mini_touch_drained(live,false));
  puts("iOS touch initial/final sampling regression passed");
}
