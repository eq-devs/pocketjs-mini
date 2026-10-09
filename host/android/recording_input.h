#ifndef MINI_RECORDING_INPUT_H
#define MINI_RECORDING_INPUT_H
#include "mini_core.h"
#include <stdio.h>
#include <stddef.h>
/* Exact packed input facts; do not resample coordinates or recompute hits. */
static size_t mini_recording_input(const MpInput *input,char *json,size_t capacity){
  if(!input || !json || capacity<1024 || input->count>8 || input->cancelled_count>8)return 0;
  size_t at=0;
  at+=(size_t)snprintf(json+at,capacity-at,"{\"kind\":\"frame\",\"contacts\":[");
  for(uint32_t i=0;i<input->count;i++)at+=(size_t)snprintf(json+at,capacity-at,"%s%u",i?",":"",input->contacts[i]);
  at+=(size_t)snprintf(json+at,capacity-at,"],\"hits\":[");
  for(uint32_t i=0;i<input->count;i++)at+=(size_t)snprintf(json+at,capacity-at,"%s%d",i?",":"",input->hits[i]);
  at+=(size_t)snprintf(json+at,capacity-at,"],\"cancelled\":[");
  for(uint32_t i=0;i<input->cancelled_count;i++)at+=(size_t)snprintf(json+at,capacity-at,"%s%u",i?",":"",input->cancelled[i]);
  at+=(size_t)snprintf(json+at,capacity-at,"]}");
  return at<capacity?at:0;
}
#endif
