#include <jni.h>
#include <unistd.h>
extern ssize_t pjm_randx(void *,size_t,unsigned) __attribute__((weak));
extern pid_t pjmtid(void) __attribute__((weak));
JNIEXPORT jboolean JNICALL Java_dev_pjm_android_NativeWeakImportsTest_missing(JNIEnv *env,jclass type){
  (void)env;(void)type;
  return pjm_randx==NULL && pjmtid==NULL ? JNI_TRUE : JNI_FALSE;
}
