#include "mini_core.h"
#include <assert.h>
#include <string.h>
#include <pthread.h>
#include <stdio.h>
#include <stdlib.h>
#include <math.h>
static uint8_t *read_file(const char *path,size_t *length){
  FILE *file=fopen(path,"rb");assert(file);assert(fseek(file,0,SEEK_END)==0);long count=ftell(file);assert(count>=0 && count<=64*1024*1024);rewind(file);
  uint8_t *data=malloc(count?count:1);assert(data && fread(data,1,count,file)==(size_t)count);fclose(file);*length=(size_t)count;return data;
}
static void *wrong_thread(void *handle){assert(mp_frame(handle,NULL,0)==-1);assert(mp_suspend(handle)==-1 && mp_resume(handle)==-1);assert(mp_lifecycle(handle,MP_SHOW)==-1);return NULL;}
static void *wrong_pool_thread(void *handle){assert(mp_pool_frame(handle,NULL,0)==-1);assert(mp_pool_background(handle)==-1);assert(mp_pool_destroy(handle)==-1);return NULL;}
typedef struct { unsigned calls,retirements;uint64_t first_generation;MpPool *pool; } CleanupReceipt;
static void pool_retire(void *context,const uint8_t *id,size_t id_len,uint64_t generation){
  CleanupReceipt *receipt=context;assert(receipt->calls==receipt->retirements+1);
  assert(mp_pool_destroy(receipt->pool)==-1 && mp_pool_background(receipt->pool)==-1);
  assert(mp_pool_last_error(receipt->pool)==NULL);
  assert(id_len==1 && id[0]==(receipt->retirements==0?'a':'b') && generation>0);receipt->retirements++;
}
static void pool_cleanup(void *context,const uint8_t *id,size_t id_len,uint64_t generation,const uint8_t *line,size_t length){
  CleanupReceipt *receipt=context;assert(id_len==1 && id[0]==(receipt->calls==0?'a':'b'));
  assert(mp_pool_close(receipt->pool,id,id_len)==-1);
  assert(mp_pool_destroy(receipt->pool)==-1 && mp_pool_last_error(receipt->pool)==NULL);
  assert(generation>0 && length==7 && memcmp(line,"cleanup",7)==0);
  if(!receipt->calls)receipt->first_generation=generation;else assert(generation>receipt->first_generation);
  receipt->calls++;
}
int main(int argc,char **argv){
  if(argc!=1 && argc!=7){fprintf(stderr,"Usage: core-ffi-test [app.js app.pak width height density target]\n");return 2;}
  assert(mp_abi_version()==1);
  MpConfig config={sizeof(config),1,64,64,1,24*1024*1024,2};
  assert(mp_pool_create(0)==NULL && mp_pool_create(4)==NULL);
  MpPool *pool=mp_pool_create(3);assert(pool);
  const char *pool_source="let n=0;globalThis.frame=()=>{let r=ui.svcPoll();ui.svcSend(r?r.trim():''+ ++n)}";
  uint8_t pool_output[128];
  for(const char *id="abc";*id;id++){
    assert(mp_pool_activate(pool,(const uint8_t*)id,1,&config,(const uint8_t*)pool_source,strlen(pool_source),NULL,0,NULL,0)==0);
    assert(mp_pool_frame(pool,NULL,0)==0);assert(mp_pool_svc_take(pool,pool_output,sizeof(pool_output))==2 && pool_output[0]=='1');
  }
  uint64_t old_b_generation=mp_pool_generation(pool,(const uint8_t*)"b",1);assert(old_b_generation>0);
  uint64_t a_generation=mp_pool_generation(pool,(const uint8_t*)"a",1);assert(a_generation>0);
  assert(mp_pool_svc_post(pool,(const uint8_t*)"a",1,a_generation,(const uint8_t*)"routed",6)==0);
  assert(mp_pool_activate(pool,(const uint8_t*)"a",1,&config,NULL,0,NULL,0,NULL,0)==0);
  assert(mp_pool_generation(pool,(const uint8_t*)"a",1)==a_generation);
  assert(mp_pool_frame(pool,NULL,0)==0);assert(mp_pool_svc_take(pool,pool_output,sizeof(pool_output))==7 && memcmp(pool_output,"routed\n",7)==0);
  assert(mp_pool_frame(pool,NULL,0)==0);assert(mp_pool_svc_take(pool,pool_output,sizeof(pool_output))==2 && pool_output[0]=='2');
  assert(mp_pool_activate(pool,(const uint8_t*)"d",1,&config,(const uint8_t*)pool_source,strlen(pool_source),NULL,0,NULL,0)==0);
  assert(mp_pool_activate(pool,(const uint8_t*)"b",1,&config,(const uint8_t*)pool_source,strlen(pool_source),NULL,0,NULL,0)==0);
  uint64_t new_b_generation=mp_pool_generation(pool,(const uint8_t*)"b",1);assert(new_b_generation>old_b_generation);
  assert(mp_pool_svc_post(pool,(const uint8_t*)"b",1,old_b_generation,(const uint8_t*)"stale",5)==-1);
  assert(mp_pool_frame(pool,NULL,0)==0);assert(mp_pool_svc_take(pool,pool_output,sizeof(pool_output))==2 && pool_output[0]=='1');
  assert(mp_pool_background(pool)==0 && mp_pool_frame(pool,NULL,0)==-1);
  assert(mp_pool_resume(pool)==0 && mp_pool_frame(pool,NULL,0)==0);
  assert(mp_pool_svc_take(pool,pool_output,sizeof(pool_output))==2 && pool_output[0]=='2');
  assert(mp_pool_memory_warning(pool)==0);
  MpFrame pool_frame;assert(mp_pool_render(pool,&pool_frame)==0 && pool_frame.length==64*64*4);
  pthread_t pool_thread;assert(pthread_create(&pool_thread,NULL,wrong_pool_thread,pool)==0);assert(pthread_join(pool_thread,NULL)==0);
  assert(mp_pool_destroy(pool)==0);
  MpPool *input_pool=mp_pool_create(1);assert(input_pool);
  MpConfig scaled_config=config;scaled_config.density=3;
  const char *pool_input_source="globalThis.frame=(k,a,c,h)=>ui.svcSend(JSON.stringify([c,h]))";
  assert(mp_pool_activate(input_pool,(const uint8_t*)"input",5,&scaled_config,(const uint8_t*)pool_input_source,strlen(pool_input_source),NULL,0,NULL,0)==0);
  MpInput pool_input={0};pool_input.size=sizeof(pool_input);pool_input.count=1;pool_input.contacts[0]=(1u<<18)|10;pool_input.hits[0]=321;
  assert(mp_pool_frame_input(input_pool,&pool_input)==0);
  const char *pool_input_expected="[[262154],[321]]\n";
  ptrdiff_t pool_count=mp_pool_svc_take(input_pool,pool_output,sizeof(pool_output));assert(pool_count==(ptrdiff_t)strlen(pool_input_expected) && memcmp(pool_output,pool_input_expected,pool_count)==0);
  pool_input.count=9;assert(mp_pool_frame_input(input_pool,&pool_input)==-1);pool_input.count=0;
  pool_input.cancelled_count=1;pool_input.cancelled[0]=1;assert(mp_pool_frame_input(input_pool,&pool_input)==0);
  const char *pool_cancel_expected="[[1074003968],[]]\n";
  pool_count=mp_pool_svc_take(input_pool,pool_output,sizeof(pool_output));assert(pool_count==(ptrdiff_t)strlen(pool_cancel_expected) && memcmp(pool_output,pool_cancel_expected,pool_count)==0);
  MpDamage pool_damage={0};pool_damage.size=sizeof(pool_damage);
  assert(mp_pool_render_damage(input_pool,&pool_frame,&pool_damage)==0);
  assert(pool_frame.width==192 && pool_frame.height==192 && pool_frame.stride==768 && pool_frame.length==192*192*4);
  assert(pool_damage.full_redraw && pool_damage.count==1 && pool_damage.regions[0][2]==192 && pool_damage.regions[0][3]==192);
  assert(mp_pool_render(input_pool,&pool_frame)==0 && pool_frame.width==192 && pool_frame.stride==768);
  assert(mp_pool_render_damage(input_pool,&pool_frame,&pool_damage)==0 && pool_damage.count==0);
  int32_t pool_hit;assert(mp_pool_hit_test(input_pool,10,10,&pool_hit)==0);
  assert(mp_pool_destroy(input_pool)==0);
  MpPool *cleanup_pool=mp_pool_create(1);assert(cleanup_pool);CleanupReceipt cleanup_receipt={0};cleanup_receipt.pool=cleanup_pool;
  assert(mp_pool_set_cleanup(cleanup_pool,pool_cleanup,&cleanup_receipt)==0);
  assert(mp_pool_set_retirement(cleanup_pool,pool_retire,&cleanup_receipt)==0);
  const char *cleanup_source="globalThis.frame=()=>{};globalThis.__miniLifecycle=e=>{if(e==='unload')ui.svcSend('cleanup')}";
  assert(mp_pool_activate(cleanup_pool,(const uint8_t*)"a",1,&config,(const uint8_t*)cleanup_source,strlen(cleanup_source),NULL,0,NULL,0)==0);
  assert(mp_pool_activate(cleanup_pool,(const uint8_t*)"b",1,&config,(const uint8_t*)cleanup_source,strlen(cleanup_source),NULL,0,NULL,0)==0);
  assert(cleanup_receipt.calls==1);
  assert(mp_pool_close(cleanup_pool,(const uint8_t*)"b",1)==0);
  assert(mp_pool_close(cleanup_pool,(const uint8_t*)"b",1)==0);
  assert(mp_pool_destroy(cleanup_pool)==0 && cleanup_receipt.calls==2 && cleanup_receipt.retirements==2);
  cleanup_pool=mp_pool_create(1);assert(cleanup_pool);
  cleanup_receipt=(CleanupReceipt){0};cleanup_receipt.pool=cleanup_pool;
  assert(mp_pool_set_cleanup(cleanup_pool,pool_cleanup,&cleanup_receipt)==0);
  assert(mp_pool_set_retirement(cleanup_pool,pool_retire,&cleanup_receipt)==0);
  assert(mp_pool_activate(cleanup_pool,(const uint8_t*)"a",1,&config,(const uint8_t*)cleanup_source,strlen(cleanup_source),NULL,0,NULL,0)==0);
  assert(mp_pool_destroy(cleanup_pool)==0 && cleanup_receipt.calls==1 && cleanup_receipt.retirements==1);
  MpInstance *first=mp_create(&config),*second=mp_create(&config);assert(first && second && first!=second);
  const char *a="globalThis.frame=()=>{let r=ui.svcPoll();ui.svcSend(r ? 'first:'+r.trim():'first')}",*b="globalThis.frame=()=>ui.svcSend('second 😀')";
  assert(mp_boot(first,(const uint8_t*)a,strlen(a),NULL,0)==0);
  assert(mp_boot(second,(const uint8_t*)b,strlen(b),NULL,0)==0);
  assert(mp_lifecycle(first,0)==-1);
  assert(mp_lifecycle(first,MP_LAUNCH)==0 && mp_lifecycle(first,MP_SHOW)==0);
  uint8_t output[256];assert(mp_svc_take(first,output,sizeof(output))==0);
  assert(mp_frame(first,NULL,0)==0 && mp_frame(second,NULL,0)==0);
  assert(mp_svc_take(second,output,2)==-1);
  assert(strstr(mp_last_error(second),"buffer")!=NULL);
  ptrdiff_t count=mp_svc_take(second,output,sizeof(output));assert(count==(ptrdiff_t)strlen("second 😀\n"));assert(memcmp(output,"second 😀\n",count)==0);
  count=mp_svc_take(first,output,sizeof(output));assert(count==6 && memcmp(output,"first\n",6)==0);
  assert(mp_svc_post(first,(const uint8_t*)"reply",5)==0 && mp_frame(first,NULL,0)==0);
  count=mp_svc_take(first,output,sizeof(output));assert(count==12 && memcmp(output,"first:reply\n",12)==0);
  MpFrame damage_frame;MpDamage damage={0};damage.size=sizeof(damage);
  assert(mp_render_damage(first,&damage_frame,&damage)==0 && damage.full_redraw==1 && damage.count==1);
  assert(damage.regions[0][2]==64 && damage.regions[0][3]==64);
  assert(mp_render_damage(first,&damage_frame,&damage)==0 && damage.count==0);
  damage.size=0;assert(mp_render_damage(first,&damage_frame,&damage)==-1);
  MpFrame frame_a,frame_b;assert(mp_render(first,&frame_a)==0 && mp_render(second,&frame_b)==0);
  assert(frame_a.pixels!=frame_b.pixels && frame_a.length==64*64*4 && frame_b.width==64);
  assert(mp_suspend(first)==0 && mp_suspend(first)==0);
  assert(mp_frame(first,NULL,0)==-1 && mp_svc_take(first,output,sizeof(output))==-1);
  assert(mp_resume(first)==0 && mp_resume(first)==0);
  pthread_t thread;assert(pthread_create(&thread,NULL,wrong_thread,first)==0);assert(pthread_join(thread,NULL)==0);
  assert(mp_frame(first,NULL,0)==0);assert(mp_destroy(first)==0);
  assert(mp_frame(second,NULL,0)==0 && mp_destroy(second)==0);
  MpInstance *lifecycle_guest=mp_create(&config);assert(lifecycle_guest);
  const char *lifecycle_source="globalThis.frame=()=>{};globalThis.__miniLifecycle=e=>ui.svcSend(e)";
  assert(mp_boot(lifecycle_guest,(const uint8_t*)lifecycle_source,strlen(lifecycle_source),NULL,0)==0);
  assert(mp_lifecycle(lifecycle_guest,MP_LAUNCH)==0 && mp_lifecycle(lifecycle_guest,MP_SHOW)==0);
  count=mp_svc_take(lifecycle_guest,output,sizeof(output));assert(count==12 && memcmp(output,"launch\nshow\n",12)==0);
  assert(mp_lifecycle(lifecycle_guest,MP_HIDE)==0 && mp_suspend(lifecycle_guest)==0);
  assert(mp_resume(lifecycle_guest)==0 && mp_lifecycle(lifecycle_guest,MP_SHOW)==0);
  assert(mp_lifecycle(lifecycle_guest,MP_MEMORY_WARNING)==0 && mp_lifecycle(lifecycle_guest,MP_UNLOAD)==0);
  const char *expected_lifecycle="hide\nshow\nmemoryWarning\nunload\n";
  count=mp_svc_take(lifecycle_guest,output,sizeof(output));assert(count==(ptrdiff_t)strlen(expected_lifecycle) && memcmp(output,expected_lifecycle,count)==0);
  assert(mp_destroy(lifecycle_guest)==0);
  MpInstance *launch_guest=mp_create(&config);assert(launch_guest);
  const char *launch_source="globalThis.frame=()=>ui.svcSend('alive');globalThis.__miniLifecycle=(e,d)=>{if(e==='launch')ui.svcSend(d.source+':'+d.path+':'+d.query.id)}";
  assert(mp_boot(launch_guest,(const uint8_t*)launch_source,strlen(launch_source),NULL,0)==0);
  const char *launch_json="{\"source\":\"qr\",\"path\":\"/detail\",\"query\":{\"id\":\"123\"}}";
  assert(mp_launch(launch_guest,(const uint8_t*)launch_json,strlen(launch_json))==0);
  assert(mp_launch(launch_guest,(const uint8_t*)launch_json,strlen(launch_json))==-1);
  count=mp_svc_take(launch_guest,output,sizeof(output));assert(count==15 && memcmp(output,"qr:/detail:123\n",15)==0);
  assert(mp_frame(launch_guest,NULL,0)==0);count=mp_svc_take(launch_guest,output,sizeof(output));assert(count==6 && memcmp(output,"alive\n",6)==0);
  assert(mp_destroy(launch_guest)==0);
  MpInstance *input_guest=mp_create(&config);assert(input_guest);
  const char *input_source="globalThis.frame=(buttons,analog,touches,hits)=>ui.svcSend(JSON.stringify([touches,hits]))";
  assert(mp_boot(input_guest,(const uint8_t*)input_source,strlen(input_source),NULL,0)==0);
  MpInput input={0};input.size=sizeof(input);input.count=1;input.contacts[0]=(7u<<18)|12u|(13u<<9);input.hits[0]=1234;
  input.cancelled_count=1;input.cancelled[0]=255;
  assert(mp_frame_input(input_guest,&input)==0);
  count=mp_svc_take(input_guest,output,sizeof(output));assert(count>0 && count<256);output[count]=0;
  char expected[128];snprintf(expected,sizeof(expected),"[[%u,%u],[1234]]\n",input.contacts[0],0x40000000u|(255u<<18));
  assert(strcmp((const char*)output,expected)==0);
  input.count=9;assert(mp_frame_input(input_guest,&input)==-1);
  input.count=1;input.contacts[0]=0x40000000u;assert(mp_frame_input(input_guest,&input)==-1);
  input.contacts[0]=0;input.size=0;assert(mp_frame_input(input_guest,&input)==-1);
  int32_t hit=99;assert(mp_hit_test(input_guest,1,1,&hit)==0);
  assert(mp_hit_test(input_guest,1,1,NULL)==-1);
  assert(mp_hit_test(input_guest,NAN,1,&hit)==-1);
  input.size=sizeof(input);input.count=8;input.cancelled_count=8;
  for(unsigned i=0;i<8;i++){input.contacts[i]=(i<<18)|1;input.hits[i]=(int32_t)i;input.cancelled[i]=(uint8_t)(i+8);}
  assert(mp_frame_input(input_guest,&input)==0);
  count=mp_svc_take(input_guest,output,sizeof(output));assert(count>0 && count<256);output[count]=0;
  assert(strstr((const char*)output,"1077673984")!=NULL); /* final cancelled ID 15 */
  assert(mp_frame(input_guest,NULL,0)==0 && mp_destroy(input_guest)==0);
  config.size=0;assert(mp_create(&config)==NULL);
  if(argc==7){
    size_t js_len,pak_len;uint8_t *js=read_file(argv[1],&js_len),*pak=read_file(argv[2],&pak_len);
    config=(MpConfig){sizeof(config),1,(uint32_t)atoi(argv[3]),(uint32_t)atoi(argv[4]),(uint32_t)atoi(argv[5]),24*1024*1024,(uint32_t)atoi(argv[6])};
    first=mp_create(&config);second=mp_create(&config);assert(first && second);
    int status=mp_boot(first,js,js_len,pak,pak_len);if(status)fprintf(stderr,"Compiled guest failed: %s\n",mp_last_error(first));assert(status==0);
    assert(mp_boot(second,js,js_len,pak,pak_len)==0);free(js);free(pak);
    for(int i=0;i<30;i++){assert(mp_frame(first,NULL,0)==0);assert(mp_frame(second,NULL,0)==0);}
    assert(mp_render(first,&frame_a)==0 && mp_render(second,&frame_b)==0);
    assert(frame_a.length==frame_b.length && frame_a.pixels!=frame_b.pixels && memcmp(frame_a.pixels,frame_b.pixels,frame_a.length)==0);
    uint32_t hash=2166136261u;for(size_t i=0;i<frame_a.length;i++)hash=(hash^frame_a.pixels[i])*16777619u;
    assert(mp_destroy(first)==0 && mp_frame(second,NULL,0)==0 && mp_destroy(second)==0);
    printf("Compiled TSX guest: two identical independent frames, %ux%u pixels, hash=%u\n",frame_a.width,frame_a.height,hash);
  }
  puts("Shared C ABI: independent guests, framebuffers, queues, UTF-8 records, buffer retry, owner thread, latched hits, cancellation and teardown passed");
}
