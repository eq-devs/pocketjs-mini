#define _GNU_SOURCE
#include <jni.h>
#include <fcntl.h>
#include <sys/stat.h>
#include <sys/file.h>
#include <unistd.h>
#include <errno.h>
#include <string.h>
#include <stdlib.h>
#include <stdio.h>
static void failure(JNIEnv *e){int code=errno;char message[96];snprintf(message,sizeof(message),"Secure package file operation failed (errno %d)",code);if(!(*e)->ExceptionCheck(e)){jclass c=(*e)->FindClass(e,"java/io/IOException");if(c){(*e)->ThrowNew(e,c,message);(*e)->DeleteLocalRef(e,c);}}}
static char *string(JNIEnv *e,jbyteArray data,int maximum){if(!data){failure(e);return NULL;}jsize n=(*e)->GetArrayLength(e,data);if(n<1 || n>maximum){failure(e);return NULL;}char *s=malloc((size_t)n+1);if(!s){failure(e);return NULL;}(*e)->GetByteArrayRegion(e,data,0,n,(jbyte *)s);s[n]=0;if((*e)->ExceptionCheck(e) || memchr(s,0,(size_t)n)){free(s);failure(e);return NULL;}return s;}
/* Walk from / using held FDs. A renamed or symlink-replaced ancestor cannot
   redirect a subsequent openat/mkdirat into the symlink's destination. */
static int walk(char *path,int create){
  if(path[0]!='/'){errno=EINVAL;return -1;}int fd=open("/",O_PATH|O_DIRECTORY|O_CLOEXEC);if(fd<0)return -1;
  char *cursor=path+1;while(*cursor){char *slash=strchr(cursor,'/');if(slash)*slash=0;
    if(!*cursor || !strcmp(cursor,".") || !strcmp(cursor,"..") || strlen(cursor)>255){close(fd);errno=EINVAL;return -1;}
    int next=openat(fd,cursor,O_PATH|O_DIRECTORY|O_NOFOLLOW|O_CLOEXEC);
    if(next<0 && errno==ENOENT && create){int made=mkdirat(fd,cursor,0700);if(made!=0 && errno!=EEXIST){close(fd);return -1;}if(made==0){int syncfd=openat(fd,".",O_RDONLY|O_DIRECTORY|O_CLOEXEC);if(syncfd<0){close(fd);return -1;}int status=fsync(syncfd);close(syncfd);if(status){close(fd);return -1;}}next=openat(fd,cursor,O_PATH|O_DIRECTORY|O_NOFOLLOW|O_CLOEXEC);}
    close(fd);if(next<0)return -1;fd=next;
    if(!slash)break;cursor=slash+1;if(!*cursor){close(fd);errno=EINVAL;return -1;}
  }int result=openat(fd,".",O_RDONLY|O_DIRECTORY|O_CLOEXEC);close(fd);return result;
}
static int parent(JNIEnv *e,jbyteArray input,char **owned,char **name){*owned=string(e,input,4096);if(!*owned)return -1;char *slash=strrchr(*owned,'/');if(!slash || !slash[1] || !strcmp(slash+1,".") || !strcmp(slash+1,"..") || strlen(slash+1)>255){failure(e);free(*owned);*owned=NULL;return -1;}*name=slash+1;if(slash==*owned){int fd=open("/",O_PATH|O_DIRECTORY|O_CLOEXEC);if(fd<0)failure(e);return fd;}*slash=0;int fd=walk(*owned,0);if(fd<0)failure(e);return fd;}
JNIEXPORT void JNICALL Java_dev_pjm_android_PackageFiles_directory(JNIEnv *e,jclass c,jbyteArray input){(void)c;char *path=string(e,input,4096);if(!path)return;int fd=walk(path,1);if(fd<0)failure(e);else close(fd);free(path);}
JNIEXPORT void JNICALL Java_dev_pjm_android_PackageFiles_sync(JNIEnv *e,jclass c,jbyteArray input){(void)c;char *path=string(e,input,4096);if(!path)return;int fd=walk(path,0);if(fd<0)failure(e);else{if(fsync(fd))failure(e);close(fd);}free(path);}
JNIEXPORT jbyteArray JNICALL Java_dev_pjm_android_PackageFiles_read(JNIEnv *e,jclass c,jbyteArray input,jint maximum,jboolean missing){
  (void)c;if(maximum<0 || maximum>64*1024*1024){failure(e);return NULL;}char *owned=NULL,*name=NULL;int dir=parent(e,input,&owned,&name);if(dir<0){free(owned);return NULL;}
  int fd=openat(dir,name,O_RDONLY|O_NOFOLLOW|O_NONBLOCK|O_CLOEXEC);close(dir);free(owned);if(fd<0){if(!(missing && errno==ENOENT))failure(e);return NULL;}
  struct stat st;jbyteArray result=NULL;if(fstat(fd,&st) || !S_ISREG(st.st_mode) || st.st_size<0 || st.st_size>maximum){failure(e);goto done;}
  result=(*e)->NewByteArray(e,(jsize)st.st_size);if(!result)goto done;unsigned char buffer[8192];size_t offset=0;
  while(offset<(size_t)st.st_size){size_t wanted=(size_t)st.st_size-offset;if(wanted>sizeof(buffer))wanted=sizeof(buffer);ssize_t n=read(fd,buffer,wanted);if(n<0 && errno==EINTR)continue;if(n<=0){failure(e);goto done;}(*e)->SetByteArrayRegion(e,result,(jsize)offset,(jsize)n,(jbyte *)buffer);if((*e)->ExceptionCheck(e))goto done;offset+=(size_t)n;}
  ssize_t n;do{n=read(fd,buffer,1);}while(n<0 && errno==EINTR);if(n!=0)failure(e);
 done:close(fd);return result;
}
JNIEXPORT void JNICALL Java_dev_pjm_android_PackageFiles_write(JNIEnv *e,jclass c,jbyteArray input,jbyteArray data,jbyteArray temporary){
  (void)c;char *owned=NULL,*name=NULL,*temp=NULL;int dir=parent(e,input,&owned,&name);if(dir<0){free(owned);return;}temp=string(e,temporary,64);
  if(!temp || strncmp(temp,".write-",7) || strchr(temp,'/') || !data || (*e)->GetArrayLength(e,data)>64*1024*1024){failure(e);goto done;}
  struct stat st;if(fstatat(dir,name,&st,AT_SYMLINK_NOFOLLOW)==0){if(!S_ISREG(st.st_mode)){failure(e);goto done;}}else if(errno!=ENOENT){failure(e);goto done;}
  int fd=openat(dir,temp,O_WRONLY|O_CREAT|O_EXCL|O_NOFOLLOW|O_CLOEXEC,0600);if(fd<0){failure(e);goto done;}
  unsigned char buffer[8192];jsize length=(*e)->GetArrayLength(e,data),offset=0;int ok=1;
  while(offset<length){jsize wanted=length-offset;if(wanted>(jsize)sizeof(buffer))wanted=sizeof(buffer);(*e)->GetByteArrayRegion(e,data,offset,wanted,(jbyte *)buffer);if((*e)->ExceptionCheck(e)){ok=0;break;}size_t written=0;while(written<(size_t)wanted){ssize_t n=write(fd,buffer+written,(size_t)wanted-written);if(n<0 && errno==EINTR)continue;if(n<=0){ok=0;break;}written+=(size_t)n;}if(!ok)break;offset+=wanted;}
  if(ok && fsync(fd))ok=0;close(fd);if(ok && renameat(dir,temp,dir,name))ok=0;if(ok && fsync(dir))ok=0;if(!ok)failure(e);unlinkat(dir,temp,0);
 done:close(dir);free(owned);free(temp);
}
JNIEXPORT void JNICALL Java_dev_pjm_android_PackageFiles_rename(JNIEnv *e,jclass c,jbyteArray source,jbyteArray destination){
  (void)c;char *a=NULL,*b=NULL,*from=NULL,*to=NULL;int left=parent(e,source,&a,&from),right=-1;if(left>=0)right=parent(e,destination,&b,&to);
  if(left>=0 && right>=0){struct stat st;if(fstatat(left,from,&st,AT_SYMLINK_NOFOLLOW) || !S_ISDIR(st.st_mode))failure(e);else if(fstatat(right,to,&st,AT_SYMLINK_NOFOLLOW)==0 || errno!=ENOENT)failure(e);else if(renameat(left,from,right,to) || fsync(left) || fsync(right))failure(e);}
  if(left>=0)close(left);if(right>=0)close(right);free(a);free(b);
}
JNIEXPORT void JNICALL Java_dev_pjm_android_PackageFiles_remove(JNIEnv *e,jclass c,jbyteArray input,jboolean directory){(void)c;char *owned=NULL,*name=NULL;int dir=parent(e,input,&owned,&name);if(dir>=0){int status=unlinkat(dir,name,directory?AT_REMOVEDIR:0);if(status==0){if(fsync(dir))failure(e);}else if(errno!=ENOENT)failure(e);close(dir);}free(owned);}
JNIEXPORT jint JNICALL Java_dev_pjm_android_PackageFiles_lockFile(JNIEnv *e,jclass c,jbyteArray input,jbyteArray filename){
  (void)c;char *name=string(e,filename,32);if(!name)return -1;if(strcmp(name,".package-lock") && strcmp(name,".storage-lock")){free(name);failure(e);return -1;}char *path=string(e,input,4096);if(!path){free(name);return -1;}int dir=walk(path,0);free(path);if(dir<0){free(name);failure(e);return -1;}int fd=openat(dir,name,O_RDWR|O_CREAT|O_NOFOLLOW|O_NONBLOCK|O_CLOEXEC,0600);free(name);close(dir);if(fd<0){failure(e);return -1;}
  struct stat st;if(fstat(fd,&st) || !S_ISREG(st.st_mode)){close(fd);failure(e);return -1;}
  if(flock(fd,LOCK_EX|LOCK_NB)){int busy=errno==EWOULDBLOCK || errno==EAGAIN;close(fd);if(!busy)failure(e);return -1;}return fd;
}
JNIEXPORT void JNICALL Java_dev_pjm_android_PackageFiles_unlock(JNIEnv *e,jclass c,jint fd){(void)c;if(fd<0){failure(e);return;}if(flock(fd,LOCK_UN))failure(e);close(fd);}
