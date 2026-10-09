#include "recording_input.h"
#include <assert.h>
#include <string.h>
#include <limits.h>
int main(void){
  MpInput input={0};input.size=sizeof input;char output[1024];
  size_t length=mini_recording_input(&input,output,sizeof output);
  assert(length==strlen(output));puts(output);
  input.count=2;input.contacts[0]=0x803fffffu;input.contacts[1]=0x00040203u;
  input.hits[0]=INT_MIN;input.hits[1]=INT_MAX;input.cancelled_count=2;input.cancelled[0]=0;input.cancelled[1]=255;
  length=mini_recording_input(&input,output,sizeof output);assert(length==strlen(output));puts(output);
  input.count=8;input.cancelled_count=8;
  for(unsigned i=0;i<8;i++){input.contacts[i]=0x80000000u|(i<<20)|0xfffffu;input.hits[i]=-(int)i;input.cancelled[i]=(uint8_t)i;}
  length=mini_recording_input(&input,output,sizeof output);assert(length>0 && length<1024);puts(output);
  memset(output,'x',sizeof output);assert(!mini_recording_input(&input,output,1023));assert(output[0]=='x');
  input.count=9;assert(!mini_recording_input(&input,output,sizeof output));input.count=0;input.cancelled_count=9;
  assert(!mini_recording_input(&input,output,sizeof output));assert(!mini_recording_input(NULL,output,sizeof output));
  return 0;
}
