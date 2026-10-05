#include <EGL/egl.h>
#include <GLES2/gl2.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "mini_core.h"
#define CHECK(x) do { if (!(x)) { fprintf(stderr,"Failed line %d: %s\n",__LINE__,#x); exit(1); } } while(0)
int main(void) {
  EGLDisplay display=eglGetDisplay(EGL_DEFAULT_DISPLAY);
  CHECK(display!=EGL_NO_DISPLAY && eglInitialize(display,NULL,NULL));
  EGLint attributes[]={EGL_SURFACE_TYPE,EGL_PBUFFER_BIT,EGL_RENDERABLE_TYPE,EGL_OPENGL_ES2_BIT,EGL_RED_SIZE,8,EGL_GREEN_SIZE,8,EGL_BLUE_SIZE,8,EGL_ALPHA_SIZE,8,EGL_NONE};
  EGLConfig config; EGLint count;
  CHECK(eglChooseConfig(display,attributes,&config,1,&count) && count==1);
  EGLint surface_attributes[]={EGL_WIDTH,32,EGL_HEIGHT,32,EGL_NONE};
  EGLSurface surface=eglCreatePbufferSurface(display,config,surface_attributes);
  EGLint context_attributes[]={EGL_CONTEXT_CLIENT_VERSION,2,EGL_NONE};
  EGLContext first=eglCreateContext(display,config,EGL_NO_CONTEXT,context_attributes);
  EGLContext second=eglCreateContext(display,config,EGL_NO_CONTEXT,context_attributes);
  CHECK(surface!=EGL_NO_SURFACE && first!=EGL_NO_CONTEXT && second!=EGL_NO_CONTEXT);
  MpConfig options={sizeof(options),1,32,32,1,8*1024*1024,2};
  MpInstance *guest=mp_create(&options); CHECK(guest);
  const char *js="ui.setProp(1,64,0xff00ff00);globalThis.frame=()=>{}";
  CHECK(mp_boot(guest,(const uint8_t*)js,strlen(js),NULL,0)==0);
  CHECK(mp_frame(guest,NULL,0)==0);
  CHECK(mp_gles_attach(guest,1)==-1); /* No current context. */
  CHECK(eglMakeCurrent(display,surface,surface,first));
  CHECK(mp_gles_attach(guest,1)==0);
  CHECK(mp_destroy(guest)==-1); /* Handle remains live. */
  MpGlesFrame frame={sizeof(frame),0,0,32,32,32,32};
  CHECK(mp_gles_render(guest,2,&frame)==-1);
  CHECK(mp_gles_render(guest,1,&frame)==0);
  unsigned char pixel[4]={0}; glReadPixels(16,16,1,1,GL_RGBA,GL_UNSIGNED_BYTE,pixel);
  CHECK(glGetError()==GL_NO_ERROR && pixel[0]<5 && pixel[1]>250 && pixel[2]<5 && pixel[3]>250);
  CHECK(eglMakeCurrent(display,surface,surface,second));
  CHECK(mp_gles_render(guest,1,&frame)==-1);
  CHECK(mp_gles_release(guest,1)==-1);
  CHECK(eglMakeCurrent(display,surface,surface,first));
  CHECK(mp_gles_release(guest,1)==0);
  CHECK(mp_gles_release(guest,1)==-1);
  CHECK(mp_gles_attach(guest,1)==-1);
  CHECK(mp_gles_attach(guest,2)==0);
  CHECK(eglMakeCurrent(display,EGL_NO_SURFACE,EGL_NO_SURFACE,EGL_NO_CONTEXT));
  CHECK(eglDestroyContext(display,first));
  CHECK(mp_gles_lost(guest,2)==0);
  CHECK(eglMakeCurrent(display,surface,surface,second));
  CHECK(mp_gles_attach(guest,3)==0);
  CHECK(mp_gles_render(guest,3,&frame)==0);
  glReadPixels(16,16,1,1,GL_RGBA,GL_UNSIGNED_BYTE,pixel);
  CHECK(glGetError()==GL_NO_ERROR && pixel[0]<5 && pixel[1]>250 && pixel[2]<5 && pixel[3]>250);
  CHECK(mp_gles_release(guest,3)==0 && mp_destroy(guest)==0);
  MpPool *pool=mp_pool_create(2); CHECK(pool);
  CHECK(mp_pool_gles_epoch(pool)==0);
  for (int i=0;i<3;i++) {
    const uint8_t id=(uint8_t)('a'+i);
    CHECK(mp_pool_activate(pool,&id,1,&options,(const uint8_t*)js,strlen(js),NULL,0,NULL,0)==0);
    CHECK(mp_pool_frame(pool,NULL,0)==0);
    CHECK(mp_pool_gles_render(pool,10,&frame)==0);
  } /* a evicted with an attached renderer. */
  const uint8_t b='b';
  CHECK(mp_pool_activate(pool,&b,1,&options,(const uint8_t*)js,strlen(js),NULL,0,NULL,0)==0);
  CHECK(mp_pool_gles_render(pool,11,&frame)==-1); /* Mixed epochs rejected. */
  CHECK(mp_pool_gles_render(pool,10,&frame)==0);
  CHECK(eglMakeCurrent(display,EGL_NO_SURFACE,EGL_NO_SURFACE,EGL_NO_CONTEXT));
  CHECK(mp_pool_memory_warning(pool)==-1 && mp_pool_destroy(pool)==-1);
  CHECK(strstr(mp_pool_last_error(pool),"Original EGL context"));
  CHECK(mp_pool_gles_lost(pool,11)==-1); /* No partial clearing. */
  CHECK(eglMakeCurrent(display,surface,surface,second));
  CHECK(mp_pool_gles_render(pool,10,&frame)==0);
  CHECK(mp_pool_memory_warning(pool)==0); /* c retired; b retained. */
  CHECK(mp_pool_close(pool,&b,1)==0);
  const uint8_t d='d';
  CHECK(mp_pool_activate(pool,&d,1,&options,(const uint8_t*)js,strlen(js),NULL,0,NULL,0)==0);
  CHECK(mp_pool_gles_render(pool,10,&frame)==0);
  CHECK(eglMakeCurrent(display,EGL_NO_SURFACE,EGL_NO_SURFACE,EGL_NO_CONTEXT));
  CHECK(eglDestroyContext(display,second));
  CHECK(mp_pool_gles_lost(pool,10)==0);
  second=eglCreateContext(display,config,EGL_NO_CONTEXT,context_attributes);
  CHECK(second!=EGL_NO_CONTEXT && eglMakeCurrent(display,surface,surface,second));
  CHECK(mp_pool_gles_render(pool,11,&frame)==0);
  CHECK(mp_pool_gles_release(pool,11)==0);
  CHECK(mp_pool_gles_epoch(pool)==0);
  CHECK(mp_pool_gles_render(pool,11,&frame)==-1);
  CHECK(mp_pool_frame(pool,NULL,0)==0);
  MpGlesFrame invalid=frame;invalid.width=-1;
  CHECK(mp_pool_gles_render(pool,12,&invalid)==-1);
  CHECK(mp_pool_gles_epoch(pool)==12); /* Attachment preceded viewport failure. */
  CHECK(mp_pool_gles_render(pool,12,&frame)==0);
  glReadPixels(16,16,1,1,GL_RGBA,GL_UNSIGNED_BYTE,pixel);
  CHECK(glGetError()==GL_NO_ERROR && pixel[1]>250 && pixel[0]<5 && pixel[2]<5);
  CHECK(mp_pool_destroy(pool)==0); /* Attached renderer released by retirement. */
  CHECK(eglMakeCurrent(display,EGL_NO_SURFACE,EGL_NO_SURFACE,EGL_NO_CONTEXT));
  CHECK(eglDestroyContext(display,second) && eglDestroySurface(display,surface));
  CHECK(eglTerminate(display));
  puts("GLES driver instance/pool lifecycle and green pixel passed");
  return 0;
}
