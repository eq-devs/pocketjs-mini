#include <jni.h>
#include <stdlib.h>
#include <stdint.h>
#include "mini_core.h"
typedef struct {MpPool *pool;JNIEnv *env;jobject owner;jmethodID cleanup,retired;jthrowable failure;uint8_t records[32*4097];} Peer;
static Peer *peer(jlong value){return (Peer *)(intptr_t)value;}
static void error(JNIEnv *env){if(!(*env)->ExceptionCheck(env)){jclass type=(*env)->FindClass(env,"java/lang/IllegalStateException");if(type){(*env)->ThrowNew(env,type,"Retained native operation failed");(*env)->DeleteLocalRef(env,type);}}}
static jbyteArray copy(JNIEnv *env,const uint8_t *bytes,size_t length){jbyteArray result=(*env)->NewByteArray(env,(jsize)length);if(result && length)(*env)->SetByteArrayRegion(env,result,0,(jsize)length,(const jbyte *)bytes);return result;}
static void capture(Peer *p){JNIEnv *env=p->env;if((*env)->ExceptionCheck(env)){jthrowable thrown=(*env)->ExceptionOccurred(env);(*env)->ExceptionClear(env);if(!p->failure)p->failure=(*env)->NewGlobalRef(env,thrown);(*env)->DeleteLocalRef(env,thrown);}}
static void finish(Peer *p,JNIEnv *env){if(p->failure){(*env)->Throw(env,p->failure);(*env)->DeleteGlobalRef(env,p->failure);p->failure=NULL;}}
static void cleanup(void *context,const uint8_t *id,size_t length,uint64_t generation,const uint8_t *line,size_t size){Peer *p=context;JNIEnv *env=p->env;jbyteArray name=copy(env,id,length),record=copy(env,line,size);if(name && record && !(*env)->ExceptionCheck(env))(*env)->CallVoidMethod(env,p->owner,p->cleanup,name,(jlong)generation,record);if(name)(*env)->DeleteLocalRef(env,name);if(record)(*env)->DeleteLocalRef(env,record);capture(p);}
static void retired(void *context,const uint8_t *id,size_t length,uint64_t generation){Peer *p=context;JNIEnv *env=p->env;jbyteArray name=copy(env,id,length);if(name && !(*env)->ExceptionCheck(env))(*env)->CallVoidMethod(env,p->owner,p->retired,name,(jlong)generation);if(name)(*env)->DeleteLocalRef(env,name);capture(p);}
JNIEXPORT jlong JNICALL Java_dev_pjm_android_VerifiedContainer_create(JNIEnv *env,jobject self){
  Peer *p=calloc(1,sizeof(*p));if(!p)return 0;p->env=env;p->owner=(*env)->NewGlobalRef(env,self);jclass type=(*env)->GetObjectClass(env,self);
  p->cleanup=(*env)->GetMethodID(env,type,"onNativeCleanup","([BJ[B)V");p->retired=(*env)->GetMethodID(env,type,"onNativeRetired","([BJ)V");(*env)->DeleteLocalRef(env,type);
  if(p->owner && p->cleanup && p->retired && !(*env)->ExceptionCheck(env))p->pool=mp_pool_create(3);
  if(!p->pool){if(p->owner)(*env)->DeleteGlobalRef(env,p->owner);free(p);return 0;}
  mp_pool_set_cleanup(p->pool,cleanup,p);mp_pool_set_retirement(p->pool,retired,p);return (jlong)(intptr_t)p;
}
static jbyte *bytes(JNIEnv *env,jbyteArray value,jsize maximum,jsize *length){if(!value)return NULL;*length=(*env)->GetArrayLength(env,value);if(*length>maximum){error(env);return NULL;}return (*env)->GetByteArrayElements(env,value,NULL);}
JNIEXPORT jlong JNICALL Java_dev_pjm_android_VerifiedContainer_generation(JNIEnv *env,jclass type,jlong value,jbyteArray identity){(void)type;jsize size=0;jbyte *id=bytes(env,identity,128,&size);if(!id)return 0;uint64_t result=mp_pool_generation(peer(value)->pool,(uint8_t *)id,(size_t)size);(*env)->ReleaseByteArrayElements(env,identity,id,JNI_ABORT);return (jlong)result;}
JNIEXPORT void JNICALL Java_dev_pjm_android_VerifiedContainer_activate(JNIEnv *env,jclass type,jlong value,jbyteArray identity,jbyteArray js,jbyteArray pak,jbyteArray launch,jint width,jint height,jint density){
  (void)type;Peer *p=peer(value);jsize a=0,b=0,c=0,d=0;jbyte *id=bytes(env,identity,128,&a),*source=NULL,*assets=NULL,*data=NULL;
  if(id)source=bytes(env,js,16*1024*1024,&b);if(source)assets=bytes(env,pak,64*1024*1024,&c);if(assets)data=bytes(env,launch,4096,&d);
  MpConfig config={sizeof(config),1,(uint32_t)width,(uint32_t)height,(uint32_t)density,24*1024*1024,2};
  if(data && mp_pool_activate(p->pool,(uint8_t *)id,(size_t)a,&config,(uint8_t *)source,(size_t)b,(uint8_t *)assets,(size_t)c,(uint8_t *)data,(size_t)d)!=0)error(env);
  if(data)(*env)->ReleaseByteArrayElements(env,launch,data,JNI_ABORT);if(assets)(*env)->ReleaseByteArrayElements(env,pak,assets,JNI_ABORT);if(source)(*env)->ReleaseByteArrayElements(env,js,source,JNI_ABORT);if(id)(*env)->ReleaseByteArrayElements(env,identity,id,JNI_ABORT);finish(p,env);
}
JNIEXPORT jobject JNICALL Java_dev_pjm_android_VerifiedContainer_advance(JNIEnv *env,jclass type,jlong value,jintArray contacts,jintArray hits,jbyteArray cancelled){
  (void)type;Peer *p=peer(value);if(!contacts || !hits || !cancelled){error(env);return NULL;}
  jsize count=(*env)->GetArrayLength(env,contacts),hit_count=(*env)->GetArrayLength(env,hits),cancel_count=(*env)->GetArrayLength(env,cancelled);if(count>8 || count!=hit_count || cancel_count>8){error(env);return NULL;}
  MpInput input={0};input.size=sizeof(input);input.count=(uint32_t)count;input.cancelled_count=(uint32_t)cancel_count;
  (*env)->GetIntArrayRegion(env,contacts,0,count,(jint *)input.contacts);(*env)->GetIntArrayRegion(env,hits,0,count,(jint *)input.hits);(*env)->GetByteArrayRegion(env,cancelled,0,cancel_count,(jbyte *)input.cancelled);
  MpFrame frame={0};MpDamage damage={0};damage.size=sizeof(damage);if((*env)->ExceptionCheck(env))return NULL;
  if(mp_pool_frame_input(p->pool,&input)!=0 || mp_pool_render_damage(p->pool,&frame,&damage)!=0){error(env);return NULL;}
  jbyteArray pixels=copy(env,frame.pixels,frame.length);jintArray regions=(*env)->NewIntArray(env,(jsize)(damage.count*4));if(regions && damage.count)(*env)->SetIntArrayRegion(env,regions,0,(jsize)(damage.count*4),(jint *)damage.regions);
  jclass cls=(*env)->FindClass(env,"dev/pjm/android/VerifiedContainer$Frame");jobject result=NULL;if(cls && pixels && regions && !(*env)->ExceptionCheck(env)){jmethodID init=(*env)->GetMethodID(env,cls,"<init>","([BIII[I)V");if(init)result=(*env)->NewObject(env,cls,init,pixels,(jint)frame.width,(jint)frame.height,(jint)frame.stride,regions);}
  if(cls)(*env)->DeleteLocalRef(env,cls);if(pixels)(*env)->DeleteLocalRef(env,pixels);if(regions)(*env)->DeleteLocalRef(env,regions);return result;
}
JNIEXPORT jbyteArray JNICALL Java_dev_pjm_android_VerifiedContainer_effects(JNIEnv *env,jclass type,jlong value){(void)type;Peer *p=peer(value);ptrdiff_t count=mp_pool_svc_take(p->pool,p->records,sizeof(p->records));if(count<0){error(env);return NULL;}return copy(env,p->records,(size_t)count);}
JNIEXPORT void JNICALL Java_dev_pjm_android_VerifiedContainer_draw(JNIEnv *env,jclass type,jlong value,jlong epoch,jintArray contacts,jintArray hits,jbyteArray cancelled,jint x,jint y,jint width,jint height,jint window_width,jint window_height){
  (void)type;Peer *p=peer(value);
  if(!contacts || !hits || !cancelled || epoch<=0){error(env);return;}
  jsize count=(*env)->GetArrayLength(env,contacts),hit_count=(*env)->GetArrayLength(env,hits),cancel_count=(*env)->GetArrayLength(env,cancelled);
  if(count>8 || count!=hit_count || cancel_count>8){error(env);return;}
  MpInput input={0};input.size=sizeof(input);input.count=(uint32_t)count;input.cancelled_count=(uint32_t)cancel_count;
  (*env)->GetIntArrayRegion(env,contacts,0,count,(jint *)input.contacts);(*env)->GetIntArrayRegion(env,hits,0,count,(jint *)input.hits);(*env)->GetByteArrayRegion(env,cancelled,0,cancel_count,(jbyte *)input.cancelled);
  if((*env)->ExceptionCheck(env))return;
  MpGlesFrame frame={sizeof(frame),x,y,width,height,window_width,window_height};
  if(mp_pool_frame_input(p->pool,&input)!=0 || mp_pool_gles_render(p->pool,(uint64_t)epoch,&frame)!=0)error(env);
}
JNIEXPORT void JNICALL Java_dev_pjm_android_VerifiedContainer_contextLost(JNIEnv *env,jclass type,jlong value,jlong epoch){
  (void)type;if(epoch<=0 || mp_pool_gles_lost(peer(value)->pool,(uint64_t)epoch)!=0)error(env);
}
JNIEXPORT void JNICALL Java_dev_pjm_android_VerifiedContainer_releaseGpu(JNIEnv *env,jclass type,jlong value,jlong epoch){
  (void)type;if(epoch<=0 || mp_pool_gles_release(peer(value)->pool,(uint64_t)epoch)!=0)error(env);
}
JNIEXPORT jlong JNICALL Java_dev_pjm_android_VerifiedContainer_gpuEpoch(JNIEnv *env,jclass type,jlong value){
  (void)env;(void)type;return (jlong)mp_pool_gles_epoch(peer(value)->pool);
}
JNIEXPORT jint JNICALL Java_dev_pjm_android_VerifiedContainer_hitTest(JNIEnv *env,jclass type,jlong value,jfloat x,jfloat y){(void)type;int32_t hit=0;if(mp_pool_hit_test(peer(value)->pool,x,y,&hit)!=0)error(env);return hit;}
JNIEXPORT void JNICALL Java_dev_pjm_android_VerifiedContainer_post(JNIEnv *env,jclass type,jlong value,jbyteArray identity,jlong generation,jbyteArray record){(void)type;jsize a=0,b=0;jbyte *id=bytes(env,identity,128,&a),*data=NULL;if(id)data=bytes(env,record,4096,&b);if(data && mp_pool_svc_post(peer(value)->pool,(uint8_t *)id,(size_t)a,(uint64_t)generation,(uint8_t *)data,(size_t)b)!=0)error(env);if(data)(*env)->ReleaseByteArrayElements(env,record,data,JNI_ABORT);if(id)(*env)->ReleaseByteArrayElements(env,identity,id,JNI_ABORT);}
JNIEXPORT void JNICALL Java_dev_pjm_android_VerifiedContainer_control(JNIEnv *env,jclass type,jlong value,jint operation,jbyteArray identity){
  (void)type;Peer *p=peer(value);int status=-1;
  if(operation==1)status=mp_pool_background(p->pool);else if(operation==2)status=mp_pool_resume(p->pool);else if(operation==3)status=mp_pool_memory_warning(p->pool);else if(operation==4){jsize length=0;jbyte *id=bytes(env,identity,128,&length);if(id){status=mp_pool_close(p->pool,(uint8_t *)id,(size_t)length);(*env)->ReleaseByteArrayElements(env,identity,id,JNI_ABORT);}}
  finish(p,env);if(status)error(env);
}

JNIEXPORT void JNICALL Java_dev_pjm_android_VerifiedContainer_destroy(JNIEnv *env,jclass type,jlong value,jbooleanArray consumed){
  (void)type;Peer *p=peer(value);
  if(!consumed || (*env)->GetArrayLength(env,consumed)!=1){error(env);return;}
  if(mp_pool_destroy(p->pool)!=0){error(env);return;}
  jboolean transferred=JNI_TRUE;
  (*env)->SetBooleanArrayRegion(env,consumed,0,1,&transferred);
  finish(p,env); /* Retirement exceptions are reported after ownership transfer. */
  (*env)->DeleteGlobalRef(env,p->owner);free(p);
}
