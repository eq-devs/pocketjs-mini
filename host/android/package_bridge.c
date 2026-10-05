#include <jni.h>
#include <stdlib.h>
#include <stdint.h>
#include "mini_core.h"
/* Structural selection is private to VerifiedPackage, after whole-payload auth.
 * Return copied Java-owned slices; never expose Rust borrowed pointers. */
JNIEXPORT jobjectArray JNICALL Java_dev_pjm_android_VerifiedPackage_selectPackage(JNIEnv *env,jclass type,jbyteArray payload,jbyteArray identity){
  (void)type;if(!payload || !identity)return NULL;
  jsize length=(*env)->GetArrayLength(env,payload),id_length=(*env)->GetArrayLength(env,identity);
  if(length<=0 || length>64*1024*1024 || id_length<=0 || id_length>128)return NULL;
  uint8_t *bytes=malloc((size_t)length),id[128];if(!bytes)return NULL;
  (*env)->GetByteArrayRegion(env,payload,0,length,(jbyte *)bytes);(*env)->GetByteArrayRegion(env,identity,0,id_length,(jbyte *)id);
  MpPackageInputs inputs={0};inputs.size=sizeof(inputs);jobjectArray result=NULL;
  if(!(*env)->ExceptionCheck(env) && mp_package_select(bytes,(size_t)length,2,id,(size_t)id_length,&inputs)==0){
    jclass array_type=(*env)->FindClass(env,"[B");if(array_type){result=(*env)->NewObjectArray(env,3,array_type,NULL);(*env)->DeleteLocalRef(env,array_type);}
    const uint8_t *parts[3]={inputs.js,inputs.pak,inputs.plan};size_t lengths[3]={inputs.js_len,inputs.pak_len,inputs.plan_len};
    for(int index=0;result && index<3 && !(*env)->ExceptionCheck(env);index++){
      jbyteArray part=(*env)->NewByteArray(env,(jsize)lengths[index]);if(!part){result=NULL;break;}
      if(lengths[index])(*env)->SetByteArrayRegion(env,part,0,(jsize)lengths[index],(const jbyte *)parts[index]);
      (*env)->SetObjectArrayElement(env,result,index,part);(*env)->DeleteLocalRef(env,part);
    }
  }
  free(bytes);return (*env)->ExceptionCheck(env)?NULL:result;
}

/* Bound host-only signature verification, independent of Android JCA providers. */
JNIEXPORT jboolean JNICALL Java_dev_pjm_android_PackageVerifier_verifySignature(JNIEnv *env,jclass type,jbyteArray key,jbyteArray signature,jbyteArray message){
  (void)type;if(!key || !signature || !message || (*env)->GetArrayLength(env,key)!=32 || (*env)->GetArrayLength(env,signature)!=64)return JNI_FALSE;
  jsize length=(*env)->GetArrayLength(env,message);if(length>65536)return JNI_FALSE;uint8_t public_key[32],proof[64];uint8_t *bytes=malloc(length?(size_t)length:1);if(!bytes)return JNI_FALSE;
  (*env)->GetByteArrayRegion(env,key,0,32,(jbyte *)public_key);(*env)->GetByteArrayRegion(env,signature,0,64,(jbyte *)proof);if(length)(*env)->GetByteArrayRegion(env,message,0,length,(jbyte *)bytes);
  int result=-1;if(!(*env)->ExceptionCheck(env))result=mp_ed25519_verify(public_key,32,proof,64,bytes,(size_t)length);free(bytes);return result==0?JNI_TRUE:JNI_FALSE;
}
