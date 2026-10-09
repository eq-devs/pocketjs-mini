#include "contact_latch.h"
#include <assert.h>
#include <stdio.h>
static int hit(float x,float y){(void)x;(void)y;return 17;}
int main(void){
  PocketContactLatch state={0};PocketRuntimeContactsInput frame={0};
  assert(pocket_contact_event(&state,POCKET_TOUCH_DOWN,0,195,650,390,844));
  pocket_contact_event(&state,POCKET_TOUCH_UP,0,195,200,390,844);
  assert(pocket_contact_event(&state,POCKET_TOUCH_DOWN,0,340,32,390,844));
  pocket_contacts_sample(&state,&frame,390,844,390,844,hit);
  assert(frame.contact_count==2&&frame.contacts[0].y==650&&frame.contacts[1].x==340);
  int old=frame.contacts[0].id;assert(old!=frame.contacts[1].id);
  pocket_contacts_sample(&state,&frame,390,844,390,844,hit);
  assert(frame.contact_count==2&&frame.contacts[0].id==old&&frame.contacts[0].y==200);
  pocket_contacts_sample(&state,&frame,390,844,390,844,hit);
  assert(frame.contact_count==1&&frame.contacts[0].id!=old);
  pocket_contacts_cancel(&state);pocket_contacts_sample(&state,&frame,390,844,390,844,hit);
  assert(frame.contact_count==0&&frame.cancelled_count==1);
  PocketContactLatch full={0};
  for(int id=0;id<POCKET_RUNTIME_MAX_CONTACTS;id++){
    assert(pocket_contact_event(&full,POCKET_TOUCH_DOWN,id,10,20,390,844));
    pocket_contact_event(&full,POCKET_TOUCH_UP,id,30,40,390,844);
  }
  pocket_contacts_sample(&full,&frame,390,844,390,844,hit);
  assert(!pocket_contact_event(&full,POCKET_TOUCH_DOWN,99,50,60,390,844));
  pocket_contacts_sample(&full,&frame,390,844,390,844,hit);
  for(unsigned i=0;i<frame.contact_count;i++)assert(frame.contacts[i].x==30&&frame.contacts[i].y==40);
  assert(pocket_contact_event(&full,POCKET_TOUCH_DOWN,99,50,60,390,844));
  PocketContactLatch pending={0};
  assert(pocket_contact_event(&pending,POCKET_TOUCH_DOWN,0,1,2,390,844));
  pocket_contacts_sample(&pending,&frame,390,844,390,844,hit);
  int cancelled=frame.contacts[0].id;pocket_contacts_cancel(&pending);
  // A later empty snapshot clears previous IDs, but cancellation is still queued.
  pending.previous_count=0;pending.next_id=(unsigned)cancelled;
  assert(pocket_contact_event(&pending,POCKET_TOUCH_DOWN,0,3,4,390,844));
  assert(pending.contacts[0].id!=cancelled);
  pocket_contacts_sample(&pending,&frame,390,844,390,844,hit);
  assert(frame.cancelled_count==1&&frame.cancelled[0]==cancelled&&frame.contacts[0].id!=cancelled);
  puts("Development contact displacement/reuse/cancellation passed");
}
