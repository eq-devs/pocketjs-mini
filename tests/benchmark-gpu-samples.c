// Same deterministic guest/input sequence as the GLES parity fixture. This
// diagnostic reports geometry/texels; optional GLES probes measure real shader output.
#include "mini_core.h"
#include <math.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#define CHECK(x) do{if(!(x)){fprintf(stderr,"Failed %d: %s\n",__LINE__,#x);exit(1);}}while(0)
#if PJM_SAMPLE_GLES
#include <EGL/egl.h>
#include <GLES2/gl2.h>
static EGLDisplay display;static EGLSurface surface;static EGLContext context;
enum {PROBE_MODES=5};
static GLuint programs[PROBE_MODES],buffer;
static GLuint shader(GLenum kind,const char *source){GLuint name=glCreateShader(kind);CHECK(name);glShaderSource(name,1,&source,NULL);glCompileShader(name);GLint ok=0;glGetShaderiv(name,GL_COMPILE_STATUS,&ok);if(!ok){char log[2048]={0};glGetShaderInfoLog(name,sizeof(log),NULL,log);fprintf(stderr,"Shader: %s\n",log);}CHECK(ok);return name;}
static void graphics_init(void){
 display=eglGetDisplay(EGL_DEFAULT_DISPLAY);CHECK(display!=EGL_NO_DISPLAY&&eglInitialize(display,NULL,NULL));EGLint attrs[]={EGL_SURFACE_TYPE,EGL_PBUFFER_BIT,EGL_RENDERABLE_TYPE,EGL_OPENGL_ES2_BIT,EGL_RED_SIZE,8,EGL_GREEN_SIZE,8,EGL_BLUE_SIZE,8,EGL_ALPHA_SIZE,8,EGL_NONE};EGLConfig config;EGLint count;CHECK(eglChooseConfig(display,attrs,&config,1,&count)&&count==1);EGLint dims[]={EGL_WIDTH,1170,EGL_HEIGHT,2532,EGL_NONE},version[]={EGL_CONTEXT_CLIENT_VERSION,2,EGL_NONE};surface=eglCreatePbufferSurface(display,config,dims);context=eglCreateContext(display,config,EGL_NO_CONTEXT,version);CHECK(surface!=EGL_NO_SURFACE&&context!=EGL_NO_CONTEXT&&eglMakeCurrent(display,surface,surface,context));
 const char *vertex="attribute vec2 a_position;attribute vec2 a_uv;attribute vec4 a_color;uniform vec2 u_viewport;varying mediump vec2 v_uv;varying lowp vec4 v_color;void main(){vec2 ndc=vec2(a_position.x*2.0/u_viewport.x-1.0,1.0-a_position.y*2.0/u_viewport.y);gl_Position=vec4(ndc,0,1);v_uv=a_uv;v_color=a_color;}";
 const char *fragments[]={
  "precision mediump float;uniform sampler2D u_texture;varying mediump vec2 v_uv;varying lowp vec4 v_color;void main(){gl_FragColor=texture2D(u_texture,v_uv)*v_color;}",
  "precision mediump float;varying lowp vec4 v_color;void main(){gl_FragColor=v_color;}",
  "precision mediump float;uniform vec2 u_texture_size;varying mediump vec2 v_uv;void main(){gl_FragColor=vec4(vec2(0.5)+(fract(v_uv*u_texture_size)-vec2(0.5))*32.0,0,1);}",
  "precision mediump float;uniform sampler2D u_texture;varying mediump vec2 v_uv;void main(){gl_FragColor=vec4(texture2D(u_texture,v_uv).aaa,1);}",
  "precision highp float;uniform sampler2D u_texture;uniform vec2 u_texture_size;varying mediump vec2 v_uv;varying lowp vec4 v_color;void main(){vec2 uv=floor(v_uv*u_texture_size*256.0+0.5)/(u_texture_size*256.0);gl_FragColor=texture2D(u_texture,uv)*v_color;}"
 };
 for(unsigned mode=0;mode<PROBE_MODES;mode++){GLuint vs=shader(GL_VERTEX_SHADER,vertex),fs=shader(GL_FRAGMENT_SHADER,fragments[mode]),program=glCreateProgram();CHECK(program);glAttachShader(program,vs);glAttachShader(program,fs);glBindAttribLocation(program,0,"a_position");glBindAttribLocation(program,1,"a_uv");glBindAttribLocation(program,2,"a_color");glLinkProgram(program);GLint ok=0;glGetProgramiv(program,GL_LINK_STATUS,&ok);CHECK(ok);glDeleteShader(vs);glDeleteShader(fs);programs[mode]=program;}
 glGenBuffers(1,&buffer);CHECK(buffer);glDisable(GL_DITHER);glDisable(GL_BLEND);glEnable(GL_SCISSOR_TEST);glViewport(0,0,1170,2532);CHECK(glGetError()==GL_NO_ERROR);
}
static void fragment_samples(FILE *out,const MpGpuSnapshot *frame,const MpGpuVertex *vertices,const MpGpuTexture *texture,unsigned x,unsigned y){
 GLuint image;glGenTextures(1,&image);CHECK(image);glActiveTexture(GL_TEXTURE0);glBindTexture(GL_TEXTURE_2D,image);glPixelStorei(GL_UNPACK_ALIGNMENT,1);GLint filter=texture&&texture->linear?GL_LINEAR:GL_NEAREST;glTexParameteri(GL_TEXTURE_2D,GL_TEXTURE_MIN_FILTER,filter);glTexParameteri(GL_TEXTURE_2D,GL_TEXTURE_MAG_FILTER,filter);glTexParameteri(GL_TEXTURE_2D,GL_TEXTURE_WRAP_S,GL_CLAMP_TO_EDGE);glTexParameteri(GL_TEXTURE_2D,GL_TEXTURE_WRAP_T,GL_CLAMP_TO_EDGE);const unsigned char white[]={255,255,255,255};glTexImage2D(GL_TEXTURE_2D,0,GL_RGBA,texture?(GLsizei)texture->width:1,texture?(GLsizei)texture->height:1,0,GL_RGBA,GL_UNSIGNED_BYTE,texture?texture->pixels:white);
 glBindBuffer(GL_ARRAY_BUFFER,buffer);glBufferData(GL_ARRAY_BUFFER,3*sizeof(*vertices),vertices,GL_STREAM_DRAW);glEnableVertexAttribArray(0);glEnableVertexAttribArray(1);glEnableVertexAttribArray(2);glVertexAttribPointer(0,2,GL_FLOAT,GL_FALSE,sizeof(*vertices),NULL);glVertexAttribPointer(1,2,GL_FLOAT,GL_FALSE,sizeof(*vertices),(void *)8);glVertexAttribPointer(2,4,GL_UNSIGNED_BYTE,GL_TRUE,sizeof(*vertices),(void *)16);glScissor((GLint)x,2531-(GLint)y,1,1);
 fprintf(out,",\"glesModes\":[");for(unsigned mode=0;mode<PROBE_MODES;mode++){glUseProgram(programs[mode]);glUniform2f(glGetUniformLocation(programs[mode],"u_viewport"),frame->width,frame->height);glUniform1i(glGetUniformLocation(programs[mode],"u_texture"),0);glUniform2f(glGetUniformLocation(programs[mode],"u_texture_size"),texture?texture->width:1,texture?texture->height:1);glClearColor(0,0,0,0);glClear(GL_COLOR_BUFFER_BIT);glDrawArrays(GL_TRIANGLES,0,3);unsigned char pixel[4];glReadPixels(x,2531-y,1,1,GL_RGBA,GL_UNSIGNED_BYTE,pixel);CHECK(glGetError()==GL_NO_ERROR);fprintf(out,"%s[%u,%u,%u,%u]",mode?",":"",pixel[0],pixel[1],pixel[2],pixel[3]);}fprintf(out,"]");glDeleteTextures(1,&image);
}
static void graphics_close(void){glDeleteBuffers(1,&buffer);for(unsigned mode=0;mode<PROBE_MODES;mode++)glDeleteProgram(programs[mode]);CHECK(eglMakeCurrent(display,EGL_NO_SURFACE,EGL_NO_SURFACE,EGL_NO_CONTEXT));CHECK(eglDestroyContext(display,context)&&eglDestroySurface(display,surface)&&eglTerminate(display));}
#endif
static const unsigned points[][2]={{368,607},{392,607},{108,808},{108,812},{59,961},{72,970}};
static unsigned clampi(int x,unsigned high){return x<0?0:(unsigned)x>high?high:(unsigned)x;}
static unsigned lerp8(unsigned a,unsigned b,unsigned f){return (a*(256-f)+b*f)>>8;}
static int32_t inspect(void *context,const MpGpuSnapshot *frame){
 FILE *out=context;CHECK(frame&&frame->size==sizeof(*frame));fprintf(out,"{\"width\":%g,\"height\":%g,\"samples\":[",frame->width,frame->height);unsigned records=0;
 for(unsigned p=0;p<sizeof(points)/sizeof(points[0]);p++){
  double x=(points[p][0]+0.5)/3.,y=(points[p][1]+0.5)/3.;
  for(size_t ci=0;ci<frame->command_count;ci++){
   const MpGpuCommand *command=frame->commands+ci;if(x<command->x||y<command->y||x>=command->x+command->width||y>=command->y+command->height)continue;
   const MpGpuTexture *texture=NULL;for(size_t ti=0;ti<frame->texture_count;ti++)if(frame->textures[ti].handle==command->texture)texture=frame->textures+ti;
   for(int vertex=command->first;vertex<command->first+command->count;vertex+=3){
    const MpGpuVertex *a=frame->vertices+vertex,*b=a+1,*c=a+2;
    double area=(b->position[0]-a->position[0])*(c->position[1]-a->position[1])-(b->position[1]-a->position[1])*(c->position[0]-a->position[0]);if(fabs(area)<1e-9)continue;
    double wb=((x-a->position[0])*(c->position[1]-a->position[1])-(y-a->position[1])*(c->position[0]-a->position[0]))/area;
    double wc=((b->position[0]-a->position[0])*(y-a->position[1])-(b->position[1]-a->position[1])*(x-a->position[0]))/area,wa=1-wb-wc;if(wa<-1e-7||wb<-1e-7||wc<-1e-7)continue;
    float u=(float)(wa*a->uv[0]+wb*b->uv[0]+wc*c->uv[0]),v=(float)(wa*a->uv[1]+wb*b->uv[1]+wc*c->uv[1]);unsigned corners[4][4];unsigned fx=0,fy=0;double tx=0,ty=0;
    if(texture){
     CHECK(texture->width&&texture->height&&texture->length==(size_t)texture->width*texture->height*4);
     int uf=(int)(u*texture->width*256.f)-128,vf=(int)(v*texture->height*256.f)-128;unsigned x0=clampi(uf>>8,texture->width-1),y0=clampi(vf>>8,texture->height-1),x1=clampi((int)x0+1,texture->width-1),y1=clampi((int)y0+1,texture->height-1);fx=(unsigned)(uf&255);fy=(unsigned)(vf&255);unsigned xs[]={x0,x1,x0,x1},ys[]={y0,y0,y1,y1};
     for(unsigned n=0;n<4;n++)for(unsigned ch=0;ch<4;ch++)corners[n][ch]=texture->pixels[((size_t)ys[n]*texture->width+xs[n])*4+ch];
     double sx=(double)u*texture->width-.5,sy=(double)v*texture->height-.5;tx=sx-floor(sx);ty=sy-floor(sy);
    }else for(unsigned n=0;n<4;n++)for(unsigned ch=0;ch<4;ch++)corners[n][ch]=255;
    if(records++)fputc(',',out);CHECK(records<=1024);
    fprintf(out,"{\"pixel\":[%u,%u],\"command\":%zu,\"vertex\":%d,\"texture\":%u,\"linear\":%s,\"textureSize\":[%u,%u],\"uv\":[%.10g,%.10g],\"vertices\":[[%g,%g],[%g,%g],[%g,%g]],\"color\":%u,\"sameVertexColors\":%s,\"weights8\":[%u,%u],\"corners\":[",points[p][0],points[p][1],ci,vertex,command->texture,texture&&texture->linear?"true":"false",texture?texture->width:1,texture?texture->height:1,u,v,a->position[0],a->position[1],b->position[0],b->position[1],c->position[0],c->position[1],a->color,a->color==b->color&&a->color==c->color?"true":"false",fx,fy);
    for(unsigned n=0;n<4;n++)fprintf(out,"%s[%u,%u,%u,%u]",n?",":"",corners[n][0],corners[n][1],corners[n][2],corners[n][3]);
    fprintf(out,"],\"integerLinear\":[");for(unsigned ch=0;ch<4;ch++)fprintf(out,"%s%u",ch?",":"",lerp8(lerp8(corners[0][ch],corners[1][ch],fx),lerp8(corners[2][ch],corners[3][ch],fx),fy));
    fprintf(out,"],\"floatLinear\":[");for(unsigned ch=0;ch<4;ch++)fprintf(out,"%s%.8f",ch?",":"",(corners[0][ch]*(1-tx)+corners[1][ch]*tx)*(1-ty)+(corners[2][ch]*(1-tx)+corners[3][ch]*tx)*ty);fprintf(out,"]");
#if PJM_SAMPLE_GLES
    fragment_samples(out,frame,a,texture,points[p][0],points[p][1]);
#endif
    fprintf(out,"}");
   }
  }
 }
 fprintf(out,"]}\n");return 0;
}
int main(int argc,char **argv){
 CHECK(argc==3);
#if PJM_SAMPLE_GLES
 graphics_init();
#endif
 FILE *file=fopen(argv[1],"rb");CHECK(file);CHECK(fseek(file,0,SEEK_END)==0);long length=ftell(file);CHECK(length>0&&length<=64*1024*1024);rewind(file);unsigned char *payload=malloc((size_t)length);CHECK(payload&&fread(payload,1,(size_t)length,file)==(size_t)length);CHECK(fclose(file)==0);MpPackageInputs inputs={0};inputs.size=sizeof(inputs);const char *id="dev.pjm.benchmark";CHECK(mp_package_select(payload,(size_t)length,2,(const uint8_t *)id,strlen(id),&inputs)==0);
 MpConfig config={sizeof(config),1,390,844,3,32*1024*1024,2};MpInstance *guest=mp_create(&config);CHECK(guest&&mp_boot(guest,inputs.js,inputs.js_len,inputs.pak,inputs.pak_len)==0&&mp_launch(guest,(const uint8_t *)"{}",2)==0&&mp_lifecycle(guest,MP_SHOW)==0);MpInput input={0};input.size=sizeof(input);CHECK(mp_frame_input(guest,&input)==0);
 for(unsigned swipe=0;swipe<6;swipe++){
  int32_t hit=0;CHECK(mp_hit_test(guest,195,650,&hit)==0&&hit!=0);
  for(unsigned sample=0;sample<60;sample++){unsigned y=(unsigned)lround(650.-450.*sample/59.),identifier=swipe+2;input.count=1;input.contacts[0]=y>511?0x80000000u|(identifier<<20)|(y<<10)|195:(identifier<<18)|(y<<9)|195;input.hits[0]=hit;CHECK(mp_frame_input(guest,&input)==0);}input.count=0;CHECK(mp_frame_input(guest,&input)==0);
 }
 for(unsigned idle=0;idle<120;idle++)CHECK(mp_frame_input(guest,&input)==0);
 const unsigned taps[][2]={{340,32},{195,140},{195,208},{195,276}};for(unsigned i=0;i<4;i++){int32_t hit=0;unsigned x=taps[i][0],y=taps[i][1];CHECK(mp_hit_test(guest,x,y,&hit)==0&&hit!=0);input.count=1;input.contacts[0]=((40+i)<<18)|(y<<9)|x;input.hits[0]=hit;for(unsigned step=0;step<3;step++){if(step)input.count=0;CHECK(mp_frame_input(guest,&input)==0);}}
 char path[1024];CHECK(snprintf(path,sizeof(path),"%s-samples.json",argv[2])>0);file=fopen(path,"w");CHECK(file&&mp_gpu_snapshot(guest,16384,inspect,file)==0&&fclose(file)==0);MpFrame frame={0};CHECK(mp_render(guest,&frame)==0&&frame.length==1170*2532*4);CHECK(snprintf(path,sizeof(path),"%s-cpu.bgra",argv[2])>0);file=fopen(path,"wb");CHECK(file&&fwrite(frame.pixels,1,frame.length,file)==frame.length&&fclose(file)==0);CHECK(mp_destroy(guest)==0);free(payload);
#if PJM_SAMPLE_GLES
 graphics_close();
#endif
 return 0;
}
