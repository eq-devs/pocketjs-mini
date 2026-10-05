package dev.pjm.android;
import android.opengl.*;
import java.io.File;
final class NativeGpuCloseTest {
  private static void check(boolean value){if(!value)throw new AssertionError("Java EGL close ownership regression");}
  static void verify(VerifiedPackage admitted,File root)throws Exception{
    EGLDisplay display=EGL14.eglGetDisplay(EGL14.EGL_DEFAULT_DISPLAY);int[] version=new int[2];
    check(EGL14.eglInitialize(display,version,0,version,1));
    int[] attributes={EGL14.EGL_SURFACE_TYPE,EGL14.EGL_PBUFFER_BIT,EGL14.EGL_RENDERABLE_TYPE,EGL14.EGL_OPENGL_ES2_BIT,EGL14.EGL_RED_SIZE,8,EGL14.EGL_GREEN_SIZE,8,EGL14.EGL_BLUE_SIZE,8,EGL14.EGL_NONE};
    EGLConfig[] configs=new EGLConfig[1];int[] count=new int[1];
    check(EGL14.eglChooseConfig(display,attributes,0,configs,0,1,count,0)&&count[0]==1);
    EGLSurface surface=EGL14.eglCreatePbufferSurface(display,configs[0],new int[]{EGL14.EGL_WIDTH,64,EGL14.EGL_HEIGHT,64,EGL14.EGL_NONE},0);
    EGLContext context=EGL14.eglCreateContext(display,configs[0],EGL14.EGL_NO_CONTEXT,new int[]{EGL14.EGL_CONTEXT_CLIENT_VERSION,2,EGL14.EGL_NONE},0);
    check(surface!=EGL14.EGL_NO_SURFACE&&context!=EGL14.EGL_NO_CONTEXT);
    VerifiedContainer pool=new VerifiedContainer(root,new VerifiedContainer.Listener(){
      public void cleanup(VerifiedPackage value,long generation,byte[] record){}
      public void retired(VerifiedPackage value,long generation){}
    });
    try{
      check(EGL14.eglMakeCurrent(display,surface,surface,context));
      pool.activate(admitted,"{}".getBytes("UTF-8"));
      pool.gpuFrame(1,new int[0],new int[0],new byte[0],0,0,64,64,64,64);
      check(pool.gpuEpoch()==1);
      check(EGL14.eglMakeCurrent(display,EGL14.EGL_NO_SURFACE,EGL14.EGL_NO_SURFACE,EGL14.EGL_NO_CONTEXT));
      boolean rejected=false;try{pool.close();}catch(IllegalStateException expected){rejected=true;}
      check(rejected&&pool.gpuEpoch()==1);
      check(EGL14.eglMakeCurrent(display,surface,surface,context));
      pool.gpuFrame(1,new int[0],new int[0],new byte[0],0,0,64,64,64,64);
      pool.close();pool.close();
    }finally{
      EGL14.eglMakeCurrent(display,surface,surface,context);pool.close();
      EGL14.eglMakeCurrent(display,EGL14.EGL_NO_SURFACE,EGL14.EGL_NO_SURFACE,EGL14.EGL_NO_CONTEXT);
      EGL14.eglDestroyContext(display,context);EGL14.eglDestroySurface(display,surface);EGL14.eglTerminate(display);
    }
    System.out.println("Android Java/JNI rejected GPU close preserves ownership and recovers under original EGL context");
  }
}
