package dev.pjm.android;
import java.nio.charset.StandardCharsets;
import okhttp3.*;

/** Test-only controlled transport. Never copied into installed host exports. */
public final class HttpSurfaceActivity extends InstalledActivity {
  @Override protected VerifiedHttp createHttp(){
    OkHttp.INSTANCE.initialize(getApplicationContext());
    OkHttpClient client=new OkHttpClient.Builder().addInterceptor(chain->{
      Request request=chain.request();String path=request.url().encodedPath(),location=null;int status=200;byte[] bytes="hello".getBytes(StandardCharsets.UTF_8);
      if(path.equals("/")){bytes=new byte[4097];java.util.Arrays.fill(bytes,(byte)255);}
      if(path.equals("/big"))bytes=new byte[1537];
      if(path.equals("/denied")){status=302;location="https://denied.example/";}
      if(path.equals("/redirect")){status=302;location="https://example.com/final";}
      if(path.equals("/final") && request.header("Authorization")!=null)throw new AssertionError("Redirect leaked authorization");
      Response.Builder response=new Response.Builder().request(request).protocol(Protocol.HTTP_1_1).code(status).message("fixture").body(ResponseBody.create(bytes,null));if(location!=null)response.header("Location",location);return response.build();
    }).build();
    return new VerifiedHttp(client);
  }
}
