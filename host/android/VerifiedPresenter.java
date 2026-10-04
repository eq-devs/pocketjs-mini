package dev.pjm.android;

import android.opengl.GLES20;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.FloatBuffer;

/** GL-thread presentation of the verified container's copied BGRA frames. */
final class VerifiedPresenter {
  private int program,texture,width,height;
  private ByteBuffer upload;
  private final FloatBuffer vertices=ByteBuffer.allocateDirect(16*4).order(ByteOrder.nativeOrder()).asFloatBuffer();
  VerifiedPresenter(){vertices.put(new float[]{-1,-1,0,1, 1,-1,1,1, -1,1,0,0, 1,1,1,0}).position(0);}
  private int shader(int type,String source){
    int shader=GLES20.glCreateShader(type);GLES20.glShaderSource(shader,source);GLES20.glCompileShader(shader);
    int[] status=new int[1];GLES20.glGetShaderiv(shader,GLES20.GL_COMPILE_STATUS,status,0);
    if(status[0]==0){GLES20.glDeleteShader(shader);throw new IllegalStateException("Display shader compilation failed");}return shader;
  }
  void contextCreated(){
    // Previous object names belong to the lost context; never delete them here.
    program=0;texture=0;width=height=0;upload=null;
    int vertex=shader(GLES20.GL_VERTEX_SHADER,"attribute vec2 position;attribute vec2 uv;varying vec2 texcoord;void main(){gl_Position=vec4(position,0.,1.);texcoord=uv;}");
    int fragment=0;
    try{
      fragment=shader(GLES20.GL_FRAGMENT_SHADER,"precision mediump float;varying vec2 texcoord;uniform sampler2D pixels;void main(){gl_FragColor=texture2D(pixels,texcoord).bgra;}");
      program=GLES20.glCreateProgram();GLES20.glAttachShader(program,vertex);GLES20.glAttachShader(program,fragment);GLES20.glLinkProgram(program);
      int[] status=new int[1];GLES20.glGetProgramiv(program,GLES20.GL_LINK_STATUS,status,0);
      if(status[0]==0){GLES20.glDeleteProgram(program);program=0;throw new IllegalStateException("Display program linking failed");}
      int[] textures=new int[1];GLES20.glGenTextures(1,textures,0);texture=textures[0];
      GLES20.glBindTexture(GLES20.GL_TEXTURE_2D,texture);
      GLES20.glTexParameteri(GLES20.GL_TEXTURE_2D,GLES20.GL_TEXTURE_MIN_FILTER,GLES20.GL_NEAREST);
      GLES20.glTexParameteri(GLES20.GL_TEXTURE_2D,GLES20.GL_TEXTURE_MAG_FILTER,GLES20.GL_NEAREST);
      GLES20.glTexParameteri(GLES20.GL_TEXTURE_2D,GLES20.GL_TEXTURE_WRAP_S,GLES20.GL_CLAMP_TO_EDGE);
      GLES20.glTexParameteri(GLES20.GL_TEXTURE_2D,GLES20.GL_TEXTURE_WRAP_T,GLES20.GL_CLAMP_TO_EDGE);
    }finally{GLES20.glDeleteShader(vertex);if(fragment!=0)GLES20.glDeleteShader(fragment);}
  }
  void draw(VerifiedContainer.Frame frame,int surfaceWidth,int surfaceHeight){
    if(program==0 || texture==0)throw new IllegalStateException("Display context unavailable");
    long bytes=(long)frame.width*frame.height*4;
    if(frame.width<1 || frame.height<1 || bytes>16*1024*1024 || frame.stride!=frame.width*4 || frame.pixels.length!=bytes)throw new IllegalArgumentException("Invalid copied frame");
    if(upload==null || upload.capacity()!=bytes)upload=ByteBuffer.allocateDirect((int)bytes);
    upload.clear();upload.put(frame.pixels).flip();
    GLES20.glActiveTexture(GLES20.GL_TEXTURE0);GLES20.glBindTexture(GLES20.GL_TEXTURE_2D,texture);
    GLES20.glPixelStorei(GLES20.GL_UNPACK_ALIGNMENT,4);
    if(width!=frame.width || height!=frame.height){
      GLES20.glTexImage2D(GLES20.GL_TEXTURE_2D,0,GLES20.GL_RGBA,frame.width,frame.height,0,GLES20.GL_RGBA,GLES20.GL_UNSIGNED_BYTE,upload);width=frame.width;height=frame.height;
    }else GLES20.glTexSubImage2D(GLES20.GL_TEXTURE_2D,0,0,0,width,height,GLES20.GL_RGBA,GLES20.GL_UNSIGNED_BYTE,upload);
    GLES20.glViewport(0,0,surfaceWidth,surfaceHeight);GLES20.glClearColor(0,0,0,1);GLES20.glClear(GLES20.GL_COLOR_BUFFER_BIT);
    float scale=Math.min((float)surfaceWidth/width,(float)surfaceHeight/height);int fittedWidth=Math.round(width*scale),fittedHeight=Math.round(height*scale);
    GLES20.glViewport((surfaceWidth-fittedWidth)/2,(surfaceHeight-fittedHeight)/2,fittedWidth,fittedHeight);GLES20.glDisable(GLES20.GL_BLEND);GLES20.glDisable(GLES20.GL_DEPTH_TEST);GLES20.glUseProgram(program);
    int position=GLES20.glGetAttribLocation(program,"position"),uv=GLES20.glGetAttribLocation(program,"uv");
    vertices.position(0);GLES20.glVertexAttribPointer(position,2,GLES20.GL_FLOAT,false,16,vertices);GLES20.glEnableVertexAttribArray(position);
    vertices.position(2);GLES20.glVertexAttribPointer(uv,2,GLES20.GL_FLOAT,false,16,vertices);GLES20.glEnableVertexAttribArray(uv);
    GLES20.glUniform1i(GLES20.glGetUniformLocation(program,"pixels"),0);GLES20.glDrawArrays(GLES20.GL_TRIANGLE_STRIP,0,4);
    GLES20.glDisableVertexAttribArray(position);GLES20.glDisableVertexAttribArray(uv);
    if(GLES20.glGetError()!=GLES20.GL_NO_ERROR)throw new IllegalStateException("Frame presentation failed");
  }
  void finish(){GLES20.glFinish();}
  void close(){finish();if(texture!=0)GLES20.glDeleteTextures(1,new int[]{texture},0);if(program!=0)GLES20.glDeleteProgram(program);texture=program=0;upload=null;width=height=0;}
}
