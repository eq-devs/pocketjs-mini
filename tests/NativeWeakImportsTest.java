package dev.pjm.android;
/** Runs the normal native matrix in the same process as the absent-import proof. */
public final class NativeWeakImportsTest {
  private static native boolean missing();
  public static void main(String[] args)throws Exception {
    System.loadLibrary("pocketjs");
    if(!missing())throw new AssertionError("Optional test imports unexpectedly resolved");
    System.out.println("WEAK_IMPORTS missing-getrandom missing-gettid loader-passed");
    NativePackageLoadTest.main(args);
  }
}
