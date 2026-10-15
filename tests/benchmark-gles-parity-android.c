#include <EGL/egl.h>
#include <GLES2/gl2.h>
#include <math.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "mini_core.h"
#define CHECK(x) do { if (!(x)) { fprintf(stderr,"Failed line %d: %s\n",__LINE__,#x); exit(1); } } while(0)
static void save(const char *prefix,const char *suffix,const void *bytes,size_t length){
  char path[1024];CHECK(snprintf(path,sizeof(path),"%s%s",prefix,suffix)>0);FILE *file=fopen(path,"wb");CHECK(file);CHECK(fwrite(bytes,1,length,file)==length);CHECK(fclose(file)==0);
}
static unsigned probe_border(const MpGlesFrame *frame){
  unsigned errors=0;const int rows[]={8,32,822};
  for(size_t i=0;i<sizeof(rows)/sizeof(rows[0]);i++){
    unsigned char rgba[4]={0};int y=rows[i]*frame->height/844;
    glReadPixels(frame->x+8,frame->window_height-1-frame->y-y,1,1,GL_RGBA,GL_UNSIGNED_BYTE,rgba);
    CHECK(glGetError()==GL_NO_ERROR);
    if(abs((int)rgba[0]-15)>1 || abs((int)rgba[1]-23)>1 || abs((int)rgba[2]-42)>1 || rgba[3]!=255)errors++;
  }
  return errors;
}
int main(int argc,char **argv){
  CHECK(argc>=3 && argc<=5);if(argc>=4)CHECK(strcmp(argv[3],"phone")==0||strcmp(argv[3],"native")==0);if(argc==5)CHECK(strcmp(argv[4],"form")==0);const int form=argc==5;FILE *file=fopen(argv[1],"rb");CHECK(file);CHECK(fseek(file,0,SEEK_END)==0);long length=ftell(file);CHECK(length>0 && length<=64*1024*1024);rewind(file);unsigned char *payload=malloc((size_t)length);CHECK(payload && fread(payload,1,(size_t)length,file)==(size_t)length);CHECK(fclose(file)==0);
  MpPackageInputs inputs={0};inputs.size=sizeof(inputs);const char *id="dev.pjm.benchmark";CHECK(mp_package_select(payload,(size_t)length,2,(const uint8_t*)id,strlen(id),&inputs)==0);
  EGLDisplay display=eglGetDisplay(EGL_DEFAULT_DISPLAY);CHECK(display!=EGL_NO_DISPLAY && eglInitialize(display,NULL,NULL));
  EGLint attributes[]={EGL_SURFACE_TYPE,EGL_PBUFFER_BIT,EGL_RENDERABLE_TYPE,EGL_OPENGL_ES2_BIT,EGL_RED_SIZE,8,EGL_GREEN_SIZE,8,EGL_BLUE_SIZE,8,EGL_ALPHA_SIZE,8,EGL_NONE};EGLConfig config;EGLint count;CHECK(eglChooseConfig(display,attributes,&config,1,&count) && count==1);
  const int phone=argc>=4&&strcmp(argv[3],"phone")==0,width=phone?1008:1170,height=phone?2077:2532,target_x=phone?24:0,target_width=phone?960:1170;EGLint dimensions[]={EGL_WIDTH,width,EGL_HEIGHT,height,EGL_NONE},context_attributes[]={EGL_CONTEXT_CLIENT_VERSION,2,EGL_NONE};EGLSurface surface=eglCreatePbufferSurface(display,config,dimensions);EGLContext context=eglCreateContext(display,config,EGL_NO_CONTEXT,context_attributes);CHECK(surface!=EGL_NO_SURFACE && context!=EGL_NO_CONTEXT && eglMakeCurrent(display,surface,surface,context));
  const int dither_initial=glIsEnabled(GL_DITHER)==GL_TRUE;
#if PJM_GLES_DIAGNOSTIC_NO_DITHER
  glDisable(GL_DITHER);
#endif
  GLint fragment_range[2]={0},fragment_precision=0;glGetShaderPrecisionFormat(GL_FRAGMENT_SHADER,GL_HIGH_FLOAT,fragment_range,&fragment_precision);CHECK(glGetError()==GL_NO_ERROR);
  MpConfig options={sizeof(options),1,390,844,3,32*1024*1024,2};MpInstance *guest=mp_create(&options);CHECK(guest);CHECK(mp_boot(guest,inputs.js,inputs.js_len,inputs.pak,inputs.pak_len)==0);CHECK(mp_launch(guest,(const uint8_t*)"{}",2)==0);CHECK(mp_lifecycle(guest,MP_SHOW)==0);CHECK(mp_gles_attach(guest,1)==0);
  unsigned transient_mismatches=0;MpGlesFrame frame={sizeof(frame),target_x,0,target_width,height,width,height};MpInput input={0};input.size=sizeof(input);CHECK(mp_frame_input(guest,&input)==0);CHECK(mp_gles_render(guest,1,&frame)==0);transient_mismatches+=probe_border(&frame);
  for(unsigned swipe=0;swipe<6;swipe++){
    int32_t hit=0;CHECK(mp_hit_test(guest,195,650,&hit)==0 && hit!=0);
    for(unsigned sample=0;sample<60;sample++){
      unsigned y=(unsigned)lround(650.-450.*sample/59.),identifier=swipe+2;input.count=1;input.contacts[0]=y>511?0x80000000u|(identifier<<20)|(y<<10)|195:(identifier<<18)|(y<<9)|195;input.hits[0]=hit;
      CHECK(mp_frame_input(guest,&input)==0);CHECK(mp_gles_render(guest,1,&frame)==0);transient_mismatches+=probe_border(&frame);
    }
    input.count=0;CHECK(mp_frame_input(guest,&input)==0);CHECK(mp_gles_render(guest,1,&frame)==0);transient_mismatches+=probe_border(&frame);
  }
  // Include idle fling settling, rather than ending on the release sample.
  for(unsigned idle=0;idle<120;idle++){CHECK(mp_frame_input(guest,&input)==0);CHECK(mp_gles_render(guest,1,&frame)==0);transient_mismatches+=probe_border(&frame);}
  if(form){
    const unsigned points[][2]={{340,32},{195,140},{195,208},{195,276}};
    for(unsigned index=0;index<4;index++){
      int32_t hit=0;unsigned x=points[index][0],y=points[index][1];CHECK(mp_hit_test(guest,x,y,&hit)==0&&hit!=0);input.count=1;input.contacts[0]=((40+index)<<18)|(y<<9)|x;input.hits[0]=hit;
      for(unsigned step=0;step<3;step++){if(step)input.count=0;CHECK(mp_frame_input(guest,&input)==0);CHECK(mp_gles_render(guest,1,&frame)==0);transient_mismatches+=probe_border(&frame);}
    }
    unsigned char *tree=calloc(1,4*1024*1024+1);CHECK(tree);ptrdiff_t size=mp_debug_tree(guest,tree,4*1024*1024);CHECK(size>0);save(argv[2],"-tree.json",tree,(size_t)size);
    CHECK(strstr((const char*)tree,"\"text\":\"Latin form fixture\"")&&strstr((const char*)tree,"\"text\":\"Pro\"")&&strstr((const char*)tree,"\"text\":\"Yes\"")&&strstr((const char*)tree,"\"text\":\"Saved: \"")&&strstr((const char*)tree,"\"text\":\"enabled\""));free(tree);
  }
  size_t bytes=(size_t)width*height*4;unsigned char *gpu=malloc(bytes);CHECK(gpu);glReadPixels(0,0,width,height,GL_RGBA,GL_UNSIGNED_BYTE,gpu);CHECK(glGetError()==GL_NO_ERROR);save(argv[2],"-gles.rgba",gpu,bytes);
  MpFrame cpu={0};CHECK(mp_render(guest,&cpu)==0 && cpu.width==1170 && cpu.height==2532 && cpu.length==1170*2532*4);save(argv[2],"-cpu.bgra",cpu.pixels,cpu.length);
  // The same guest turn feeds both renderers. Compare stationary header/footer
  // interiors away from text, rounded edges and list antialiasing.
  unsigned mismatches=0,samples=0;
  for(int y=0;y<height;y++)if(y<(phone?24:48) || y>=height-(phone?12:24))for(int x=target_x;x<target_x+target_width;x++){
    const unsigned char *a=gpu+((size_t)(height-1-y)*width+x)*4,*b=cpu.pixels+((size_t)((long)y*2532/height)*1170+(long)(x-target_x)*1170/target_width)*4;samples++;
    if(abs((int)a[0]-b[2])>1 || abs((int)a[1]-b[1])>1 || abs((int)a[2]-b[0])>1 || abs((int)a[3]-b[3])>1)mismatches++;
  }
  size_t full_different=0,full_over_one=0;unsigned full_maximum=0;uint64_t full_sum=0;
  if(!phone)for(int y=0;y<height;y++)for(int x=0;x<width;x++){
    const unsigned char *a=gpu+((size_t)(height-1-y)*width+x)*4,*b=cpu.pixels+((size_t)y*width+x)*4;const unsigned map[]={2,1,0,3};unsigned delta=0;
    for(unsigned channel=0;channel<4;channel++){unsigned difference=(unsigned)abs((int)a[map[channel]]-b[channel]);if(difference>delta)delta=difference;full_sum+=difference;}
    if(delta)full_different++;if(delta>1)full_over_one++;if(delta>full_maximum)full_maximum=delta;
  }
  printf("{\"ditherInitiallyEnabled\":%s,\"ditherEnabledAtReadback\":%s,\"fragmentHighFloatPrecision\":%d,\"formControlsVerified\":%s,\"sameGuestTurn\":true,\"width\":%d,\"height\":%d,\"borderSamples\":%u,\"borderMismatches\":%u,\"transientBorderMismatches\":%u,\"fullFrameCompared\":%s,\"fullFramePixels\":%zu,\"differentPixels\":%zu,\"pixelsOverOneChannelLevel\":%zu,\"maxChannelDelta\":%u,\"absoluteChannelDeltaSum\":%llu}\n",dither_initial?"true":"false",glIsEnabled(GL_DITHER)?"true":"false",fragment_precision,form?"true":"false",width,height,samples,mismatches,transient_mismatches,phone?"false":"true",phone?0:(size_t)width*height,full_different,full_over_one,full_maximum,(unsigned long long)full_sum);
  CHECK(mp_gles_release(guest,1)==0 && mp_destroy(guest)==0);free(gpu);free(payload);CHECK(eglMakeCurrent(display,EGL_NO_SURFACE,EGL_NO_SURFACE,EGL_NO_CONTEXT));CHECK(eglDestroyContext(display,context) && eglDestroySurface(display,surface) && eglTerminate(display));
  CHECK(mismatches==0 && transient_mismatches==0 && full_over_one==0);return 0;
}
