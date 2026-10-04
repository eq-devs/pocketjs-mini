#include "svcwire.h"
#include <pthread.h>
#include <string.h>
/* Whole records only. No guest-controlled allocation or filesystem paths. */
#define MESSAGE_BYTES 4096
#define QUEUE_RECORDS 32
typedef struct { char records[QUEUE_RECORDS][MESSAGE_BYTES + 1]; size_t lengths[QUEUE_RECORDS]; unsigned count; } Queue;
static Queue requests, replies;
static int opened;
static pthread_mutex_t lock = PTHREAD_MUTEX_INITIALIZER;
static int append(Queue *queue, const char *line, size_t length) {
  if (!line) return 0;
  if (length && line[length-1]=='\n') length--;
  if (!length || length>MESSAGE_BYTES || queue->count==QUEUE_RECORDS || memchr(line,'\n',length) || memchr(line,'\0',length)) return 0;
  memcpy(queue->records[queue->count],line,length);
  queue->records[queue->count][length]='\n';queue->lengths[queue->count]=length+1;queue->count++;
  return 1;
}
static size_t drain(Queue *queue, char *out, size_t capacity) {
  if (!out) return 0;
  size_t bytes=0;unsigned records=0;
  while(records<queue->count && queue->lengths[records]<=capacity-bytes) {
    memcpy(out+bytes,queue->records[records],queue->lengths[records]);bytes+=queue->lengths[records++];
  }
  if(records) {
    memmove(queue->records,queue->records+records,(queue->count-records)*sizeof queue->records[0]);
    memmove(queue->lengths,queue->lengths+records,(queue->count-records)*sizeof queue->lengths[0]);queue->count-=records;
  }
  return bytes;
}
int svcwire_open(const char *name) {
  pthread_mutex_lock(&lock);int accepted=name && strcmp(name,"mini")==0;if(accepted)opened=1;pthread_mutex_unlock(&lock);return accepted;
}
void svcwire_pump(void) {}
void svcwire_send_line(const char *line,size_t length) {
  pthread_mutex_lock(&lock);if(opened)append(&requests,line,length);pthread_mutex_unlock(&lock);
}
size_t svcwire_recv_lines(char *out,size_t capacity) {
  pthread_mutex_lock(&lock);size_t bytes=drain(&replies,out,capacity);pthread_mutex_unlock(&lock);return bytes;
}
size_t pjm_services_take(char *out,size_t capacity) {
  pthread_mutex_lock(&lock);size_t bytes=drain(&requests,out,capacity);pthread_mutex_unlock(&lock);return bytes;
}
int pjm_services_reply(const char *line,size_t length) {
  pthread_mutex_lock(&lock);int accepted=opened && append(&replies,line,length);pthread_mutex_unlock(&lock);return accepted;
}
void svcwire_shutdown(void) {
  pthread_mutex_lock(&lock);opened=0;requests.count=0;replies.count=0;pthread_mutex_unlock(&lock);
}
