#ifndef MINI_TOUCH_SAMPLING_H
#define MINI_TOUCH_SAMPLING_H
#include <stdbool.h>
typedef struct { bool reported,finalReported; } MiniTouchSampling;
static inline bool mini_touch_initial(MiniTouchSampling state){return !state.reported;}
static inline bool mini_touch_drained(MiniTouchSampling state,bool live){return !live&&state.finalReported;}
static inline MiniTouchSampling mini_touch_sampled(MiniTouchSampling state,bool live){
  state.finalReported=state.reported&&!live;state.reported=true;return state;
}
#endif
