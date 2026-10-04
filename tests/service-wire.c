#include "svcwire.h"
#include <assert.h>
#include <string.h>
int main(void) {
  char output[8192], message[4097];
  svcwire_shutdown();assert(!svcwire_open("evil"));assert(!svcwire_open(NULL));
  svcwire_send_line("{}",2);assert(!pjm_services_take(output,sizeof output));
  assert(svcwire_open("mini"));
  svcwire_send_line("first",5);svcwire_send_line("second\n",7);
  assert(!pjm_services_take(output,5));
  size_t bytes=pjm_services_take(output,6);assert(bytes==6 && !memcmp(output,"first\n",6));
  bytes=pjm_services_take(output,sizeof output);assert(bytes==7 && !memcmp(output,"second\n",7));
  memset(message,'a',sizeof message);
  svcwire_send_line(message,sizeof message);svcwire_send_line("a\nb",3);svcwire_send_line("a\0b",3);svcwire_send_line(NULL,1);
  assert(!pjm_services_take(output,sizeof output));
  for(int i=0;i<33;i++)svcwire_send_line("{}",2);
  bytes=pjm_services_take(output,sizeof output);assert(bytes==32*3);
  for(int i=0;i<32;i++)assert(pjm_services_reply("{}",2));
  assert(!pjm_services_reply("{}",2));assert(!svcwire_recv_lines(output,2));
  bytes=svcwire_recv_lines(output,sizeof output);assert(bytes==32*3);
  assert(pjm_services_reply("\xf0\x9f\x98\x80",4));bytes=svcwire_recv_lines(output,sizeof output);assert(bytes==5 && !memcmp(output,"\xf0\x9f\x98\x80\n",5));
  assert(pjm_services_reply("stale",5));svcwire_send_line("stale",5);svcwire_shutdown();
  assert(!pjm_services_take(output,sizeof output));assert(!svcwire_recv_lines(output,sizeof output));assert(!pjm_services_reply("{}",2));
  return 0;
}
