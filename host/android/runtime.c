#include <jni.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>
#include <pthread.h>
#include <GLES2/gl2.h>
#include "pocket_runtime.h"
#include "pocket_input.h"
#include "contact_latch.h"
#include "mini_core.h"

typedef struct {
  MpInstance *engine;
  GLuint program,texture;
  int texture_initialized,unload_prepared;
  uint8_t *upload_scratch,*capture;
  size_t upload_capacity,capture_size;
  int logical_width,logical_height,surface_width,surface_height,ready,test_mode;
  unsigned long frames,touches;
  uint32_t pixel_hash;
  PocketContactLatch contacts;
  pthread_mutex_t mutex;
} Host;
static jfieldID host_field(JNIEnv *env,jobject self){
  jclass type=(*env)->GetObjectClass(env,self);
  jfieldID field=(*env)->GetFieldID(env,type,"nativeHost","J");(*env)->DeleteLocalRef(env,type);return field;
}
static Host *get_host(JNIEnv *env,jobject self){jfieldID field=host_field(env,self);return field?(Host*)(intptr_t)(*env)->GetLongField(env,self,field):NULL;}
static void set_host(JNIEnv *env,jobject self,Host *host){jfieldID field=host_field(env,self);if(field)(*env)->SetLongField(env,self,field,(jlong)(intptr_t)host);}
JNIEXPORT jlong JNICALL Java_dev_pjm_android_MiniActivity_createHost(JNIEnv *env,jobject self){
  (void)env;(void)self;Host *host=calloc(1,sizeof(*host));if(!host)return 0;
  if(pthread_mutex_init(&host->mutex,NULL)!=0){free(host);return 0;}
  host->surface_width=host->surface_height=1;return (jlong)(intptr_t)host;
}

static GLuint shader(GLenum type,const char *source) {
  GLuint value=glCreateShader(type);glShaderSource(value,1,&source,NULL);glCompileShader(value);
  GLint ok=0;glGetShaderiv(value,GL_COMPILE_STATUS,&ok);if(!ok){glDeleteShader(value);return 0;}return value;
}
static int initialize_gl(Host *host) {
  GLuint vertex=shader(GL_VERTEX_SHADER,"attribute vec2 p;varying vec2 uv;void main(){gl_Position=vec4(p,0.,1.);uv=vec2((p.x+1.)*.5,(1.-p.y)*.5);}");
  GLuint fragment=shader(GL_FRAGMENT_SHADER,"precision mediump float;varying vec2 uv;uniform sampler2D image;void main(){gl_FragColor=texture2D(image,uv).bgra;}");
  if(!vertex || !fragment){if(vertex)glDeleteShader(vertex);if(fragment)glDeleteShader(fragment);return 0;}
  host->program=glCreateProgram();glAttachShader(host->program,vertex);glAttachShader(host->program,fragment);glBindAttribLocation(host->program,0,"p");glLinkProgram(host->program);glDeleteShader(vertex);glDeleteShader(fragment);
  GLint ok=0;glGetProgramiv(host->program,GL_LINK_STATUS,&ok);if(!ok)return 0;
  glGenTextures(1,&host->texture);glBindTexture(GL_TEXTURE_2D,host->texture);
  glTexParameteri(GL_TEXTURE_2D,GL_TEXTURE_MIN_FILTER,GL_LINEAR);glTexParameteri(GL_TEXTURE_2D,GL_TEXTURE_MAG_FILTER,GL_LINEAR);
  glTexParameteri(GL_TEXTURE_2D,GL_TEXTURE_WRAP_S,GL_CLAMP_TO_EDGE);glTexParameteri(GL_TEXTURE_2D,GL_TEXTURE_WRAP_T,GL_CLAMP_TO_EDGE);
  return glGetError()==GL_NO_ERROR;
}
static int empty_hit(float x,float y){(void)x;(void)y;return 0;}
static jstring engine_error(JNIEnv *env,Host *host){const char *error=mp_last_error(host->engine);return (*env)->NewStringUTF(env,error?error:"Shared engine failed");}
static int prepare_unload(Host *host){
  if(!host->ready || !host->engine || host->unload_prepared)return 0;
  host->unload_prepared=1;
  int status=mp_resume(host->engine);
  if(!status)status=mp_lifecycle(host->engine,MP_UNLOAD);
  if(!status)status=mp_frame(host->engine,NULL,0);
  if(status)host->ready=0;
  return status;
}
JNIEXPORT jstring JNICALL Java_dev_pjm_android_MiniActivity_prepareUnload(JNIEnv *env,jobject self){
  Host *host=get_host(env,self);
  if(host && prepare_unload(host))return engine_error(env,host);
  return (*env)->NewStringUTF(env,"");
}
JNIEXPORT jstring JNICALL Java_dev_pjm_android_MiniActivity_boot(JNIEnv *env,jobject self,jbyteArray js,jbyteArray pak,jint width,jint height,jint density,jboolean testing) {
  Host *host=get_host(env,self);if(!host){return (*env)->NewStringUTF(env,"Native host is closed");}
  prepare_unload(host);
  if(glGetString(GL_VERSION))glFinish();
  host->ready=0;
  if(mp_destroy(host->engine)!=0)return (*env)->NewStringUTF(env,"Engine owner thread changed; restart the host");host->engine=NULL;
  if(host->program)glDeleteProgram(host->program);if(host->texture)glDeleteTextures(1,&host->texture);host->program=host->texture=0;host->texture_initialized=0;
  free(host->upload_scratch);host->upload_scratch=NULL;host->upload_capacity=0;
  free(host->capture);host->capture=NULL;host->capture_size=0;host->pixel_hash=0;host->test_mode=testing;
  jsize pak_length=(*env)->GetArrayLength(env,pak),js_length=(*env)->GetArrayLength(env,js);
  if(pak_length>64*1024*1024 || js_length>16*1024*1024)return (*env)->NewStringUTF(env,"Guest artifact exceeds budget");
  uint8_t *pack=malloc(pak_length?(size_t)pak_length:1),*code=malloc(js_length?(size_t)js_length:1);
  if(!pack || !code){free(pack);free(code);return (*env)->NewStringUTF(env,"Native allocation failed");}
  (*env)->GetByteArrayRegion(env,pak,0,pak_length,(jbyte*)pack);(*env)->GetByteArrayRegion(env,js,0,js_length,(jbyte*)code);
  if((*env)->ExceptionCheck(env)){free(pack);free(code);return NULL;}
  MpConfig config={sizeof(config),1,(uint32_t)width,(uint32_t)height,(uint32_t)density,24*1024*1024,2};host->engine=mp_create(&config);
  int status=host->engine?mp_boot(host->engine,code,(size_t)js_length,pack,(size_t)pak_length):-1;free(code);free(pack);
  host->unload_prepared=0;
  host->logical_width=width;host->logical_height=height;
  pthread_mutex_lock(&host->mutex);memset(&host->contacts,0,sizeof host->contacts);host->touches=0;pthread_mutex_unlock(&host->mutex);host->frames=0;
  if(status)return engine_error(env,host);
  const char *launch="{\"source\":\"development\",\"query\":{}}";
  if(mp_launch(host->engine,(const uint8_t*)launch,strlen(launch))!=0 || mp_lifecycle(host->engine,MP_SHOW)!=0)return engine_error(env,host);
  host->ready=initialize_gl(host);return (*env)->NewStringUTF(env,host->ready?"":"GLES initialization failed");
}
JNIEXPORT jboolean JNICALL Java_dev_pjm_android_MiniActivity_contextCreated(JNIEnv *env,jobject self) {
  Host *host=get_host(env,self);if(!host){return JNI_FALSE;}
  host->program=host->texture=0;host->texture_initialized=0;
  host->ready=host->ready && host->engine && mp_resume(host->engine)==0 && initialize_gl(host);
  return host->ready?JNI_TRUE:JNI_FALSE;
}
JNIEXPORT void JNICALL Java_dev_pjm_android_MiniActivity_size(JNIEnv *env,jobject self,jint width,jint height) {
  Host *host=get_host(env,self);if(!host){return;}
  
  pthread_mutex_lock(&host->mutex);host->surface_width=width;host->surface_height=height;pthread_mutex_unlock(&host->mutex);
}
JNIEXPORT void JNICALL Java_dev_pjm_android_MiniActivity_touch(JNIEnv *env,jobject self,jint action,jint id,jfloat x,jfloat y) {
  Host *host=get_host(env,self);if(!host){return;}
  
  pthread_mutex_lock(&host->mutex);
  if(action==3) pocket_contacts_cancel(&host->contacts);
  else {
    PocketTouchPhase phase=action==0?POCKET_TOUCH_DOWN:action==1?POCKET_TOUCH_UP:POCKET_TOUCH_MOVE;
    if(pocket_contact_event(&host->contacts,phase,id,x,y,host->surface_width,host->surface_height) && action==0) host->touches++;
  }
  pthread_mutex_unlock(&host->mutex);
}
JNIEXPORT jstring JNICALL Java_dev_pjm_android_MiniActivity_frame(JNIEnv *env,jobject self) {
  Host *host=get_host(env,self);if(!host){return (*env)->NewStringUTF(env,"");}
  
  if(!host->ready) return (*env)->NewStringUTF(env,"");
  PocketRuntimeContactsInput input;memset(&input,0,sizeof input);
  pthread_mutex_lock(&host->mutex);
  int width=host->surface_width,height=host->surface_height;
  // Capture committed DOWN facts per host before using the pinned sampler.
  for(unsigned i=0;i<POCKET_RUNTIME_MAX_CONTACTS;i++){
    PocketLatchedContact *contact=&host->contacts.contacts[i];
    if(contact->used && !contact->hit_ready){
      int32_t hit=0;
      mp_hit_test(host->engine,(float)(int)(contact->start_x*host->logical_width/width),(float)(int)(contact->start_y*host->logical_height/height),&hit);
      contact->hit=hit;contact->hit_ready=1;
    }
  }
  pocket_contacts_sample(&host->contacts,&input,width,height,host->logical_width,host->logical_height,empty_hit);
  pthread_mutex_unlock(&host->mutex);
  MpInput sampled={0};sampled.size=sizeof(sampled);sampled.count=input.contact_count;sampled.cancelled_count=input.cancelled_count;
  for(unsigned i=0;i<input.contact_count;i++){sampled.contacts[i]=pocket_runtime_pack_contact(&input.contacts[i]);sampled.hits[i]=input.contacts[i].hit;}
  for(unsigned i=0;i<input.cancelled_count;i++)sampled.cancelled[i]=(uint8_t)input.cancelled[i];
  if(mp_frame_input(host->engine,&sampled)!=0){host->ready=0;return engine_error(env,host);}
  MpDamage damage={0};damage.size=sizeof(damage);
  MpFrame pixels;if(mp_render_damage(host->engine,&pixels,&damage)!=0){host->ready=0;return engine_error(env,host);}
  glViewport(0,0,width,height);glDisable(GL_BLEND);glDisable(GL_DEPTH_TEST);glUseProgram(host->program);
  glActiveTexture(GL_TEXTURE0);glBindTexture(GL_TEXTURE_2D,host->texture);
  if(!host->texture_initialized || damage.full_redraw){
    glTexImage2D(GL_TEXTURE_2D,0,GL_RGBA,(GLsizei)pixels.width,(GLsizei)pixels.height,0,GL_RGBA,GL_UNSIGNED_BYTE,pixels.pixels);host->texture_initialized=1;
  }else for(unsigned i=0;i<damage.count;i++){
    uint32_t x=damage.regions[i][0],y=damage.regions[i][1],w=damage.regions[i][2],h=damage.regions[i][3];
    if(x>pixels.width || y>pixels.height || w>pixels.width-x || h>pixels.height-y){host->ready=0;return (*env)->NewStringUTF(env,"Invalid damage bounds");}
    if(!w || !h)continue;
    size_t bytes=(size_t)w*h*4;
    if(bytes>host->upload_capacity){uint8_t *next=realloc(host->upload_scratch,bytes);if(!next){host->ready=0;return (*env)->NewStringUTF(env,"Damage upload allocation failed");}host->upload_scratch=next;host->upload_capacity=bytes;}
    for(uint32_t row=0;row<h;row++)memcpy(host->upload_scratch+(size_t)row*w*4,pixels.pixels+(size_t)(y+row)*pixels.stride+(size_t)x*4,(size_t)w*4);
    glTexSubImage2D(GL_TEXTURE_2D,0,(GLint)x,(GLint)y,(GLsizei)w,(GLsizei)h,GL_RGBA,GL_UNSIGNED_BYTE,host->upload_scratch);
  }
  glUniform1i(glGetUniformLocation(host->program,"image"),0);
  const GLfloat quad[]={-1,-1,1,-1,-1,1,1,1};glBindBuffer(GL_ARRAY_BUFFER,0);glEnableVertexAttribArray(0);glVertexAttribPointer(0,2,GL_FLOAT,GL_FALSE,0,quad);glDrawArrays(GL_TRIANGLE_STRIP,0,4);
  if(glGetError()!=GL_NO_ERROR){host->ready=0;return (*env)->NewStringUTF(env,"GLES frame submission failed");}
  host->frames++;
  return (*env)->NewStringUTF(env,"");
}
JNIEXPORT jlongArray JNICALL Java_dev_pjm_android_MiniActivity_receipt(JNIEnv *env,jobject self) {
  Host *host=get_host(env,self);if(!host){return (*env)->NewLongArray(env,7);}
  
  if(host->test_mode && host->frames%30==0 && host->surface_width>0 && host->surface_height>0 && host->surface_width<=4096 && host->surface_height<=4096) {
    size_t bytes=(size_t)host->surface_width*(size_t)host->surface_height*4;
    if(bytes!=host->capture_size) {free(host->capture);host->capture=malloc(bytes);host->capture_size=host->capture?bytes:0;}
    if(host->capture) {
      glReadPixels(0,0,host->surface_width,host->surface_height,GL_RGBA,GL_UNSIGNED_BYTE,host->capture);
      if(glGetError()==GL_NO_ERROR) {
        uint32_t hash=2166136261u;for(size_t i=0;i<bytes;i++)hash=(hash^host->capture[i])*16777619u;
        host->pixel_hash=hash;
      } else host->pixel_hash=0;
    }
  }
  pthread_mutex_lock(&host->mutex);
  jlong values[7]={(jlong)host->frames,(jlong)host->touches,host->logical_width,host->logical_height,
    0,0,host->pixel_hash};
  pthread_mutex_unlock(&host->mutex);
  jlongArray result=(*env)->NewLongArray(env,7);(*env)->SetLongArrayRegion(env,result,0,7,values);return result;
}
JNIEXPORT jbyteArray JNICALL Java_dev_pjm_android_MiniActivity_serviceRequests(JNIEnv *env,jobject self) {
  Host *host=get_host(env,self);if(!host){return (*env)->NewByteArray(env,0);}
  
  // A failed boot/frame must never dispatch guest effects under an old identity.
  if(!host->ready)return (*env)->NewByteArray(env,0);
  uint8_t records[8192];ptrdiff_t count=mp_svc_take(host->engine,records,sizeof records);size_t length=count>0?(size_t)count:0;
  jbyteArray result=(*env)->NewByteArray(env,(jsize)length);
  if(result) {(*env)->SetByteArrayRegion(env,result,0,(jsize)length,(jbyte*)records);}
  return result;
}
JNIEXPORT jboolean JNICALL Java_dev_pjm_android_MiniActivity_serviceReply(JNIEnv *env,jobject self,jbyteArray reply) {
  Host *host=get_host(env,self);if(!host){return JNI_FALSE;}
  jsize length=(*env)->GetArrayLength(env,reply);if(length<1 || length>4096)return JNI_FALSE;
  char line[4096];(*env)->GetByteArrayRegion(env,reply,0,length,(jbyte*)line);
  if((*env)->ExceptionCheck(env))return JNI_FALSE;
  return host->ready && mp_svc_post(host->engine,(const uint8_t*)line,(size_t)length)==0?JNI_TRUE:JNI_FALSE;
}

JNIEXPORT jstring JNICALL Java_dev_pjm_android_MiniActivity_lifecycle(JNIEnv *env,jobject self,jboolean active) {
  Host *host=get_host(env,self);if(!host){return (*env)->NewStringUTF(env,"");}
  if(!host->ready || !host->engine)return (*env)->NewStringUTF(env,"");
  int status;
  if(active){status=mp_resume(host->engine);if(!status)status=mp_lifecycle(host->engine,MP_SHOW);}
  else {
    MpInput cancelled={0};cancelled.size=sizeof(cancelled);
    pthread_mutex_lock(&host->mutex);
    pocket_contacts_cancel(&host->contacts);
    for(unsigned i=0;i<host->contacts.cancelled_count;i++)cancelled.cancelled[cancelled.cancelled_count++]=(uint8_t)host->contacts.cancelled[i];
    memset(&host->contacts,0,sizeof host->contacts);
    pthread_mutex_unlock(&host->mutex);
    status=cancelled.cancelled_count?mp_frame_input(host->engine,&cancelled):0;
    if(!status)status=mp_lifecycle(host->engine,MP_HIDE);
    if(!status)status=mp_suspend(host->engine);
  }
  if(status){host->ready=0;return engine_error(env,host);}return (*env)->NewStringUTF(env,"");
}

JNIEXPORT jstring JNICALL Java_dev_pjm_android_MiniActivity_shutdown(JNIEnv *env,jobject self) {
  Host *host=get_host(env,self);if(!host){return (*env)->NewStringUTF(env,"");}
  prepare_unload(host);
  if(glGetString(GL_VERSION))glFinish();
  host->ready=0;
  if(mp_destroy(host->engine)!=0)return (*env)->NewStringUTF(env,"Teardown requires the engine owner thread");
  host->engine=NULL;
  // The platform may already have destroyed the EGL surface/context.
  if(glGetString(GL_VERSION)){if(host->program)glDeleteProgram(host->program);if(host->texture)glDeleteTextures(1,&host->texture);}
  host->program=host->texture=0;host->texture_initialized=0;
  free(host->upload_scratch);host->upload_scratch=NULL;host->upload_capacity=0;
  free(host->capture);host->capture=NULL;host->capture_size=0;host->pixel_hash=0;
  pthread_mutex_lock(&host->mutex);memset(&host->contacts,0,sizeof host->contacts);host->touches=0;pthread_mutex_unlock(&host->mutex);
  host->frames=0;
  set_host(env,self,NULL);pthread_mutex_destroy(&host->mutex);free(host);
  return (*env)->NewStringUTF(env,"");
}

JNIEXPORT jstring JNICALL Java_dev_pjm_android_MiniActivity_memoryWarning(JNIEnv *env,jobject self) {
  Host *host=get_host(env,self);
  if(!host || !host->ready || !host->engine)return (*env)->NewStringUTF(env,"");
  if(mp_lifecycle(host->engine,MP_MEMORY_WARNING)!=0){host->ready=0;return engine_error(env,host);}
  return (*env)->NewStringUTF(env,"");
}
