package dev.pjm.android;
import org.json.*;
import java.nio.file.*;
import java.nio.charset.StandardCharsets;
import android.util.Base64;
public final class NativePackageTest {
  public static void main(String[] args) throws Exception {
    JSONArray cases=new JSONArray(new String(Files.readAllBytes(Paths.get(args[0])),StandardCharsets.UTF_8));
    for(int i=0;i<cases.length();i++){
      JSONObject item=cases.getJSONObject(i);boolean accepted=false;
      try {
        PackageVerifier.Policy policy=PackageVerifier.verifyPolicy(Base64.decode(item.getString("payload"),Base64.NO_WRAP),item.getJSONObject("manifest").toString().getBytes(StandardCharsets.UTF_8),Base64.decode(item.getString("key"),Base64.NO_WRAP),item.getLong("abi"),item.getString("target"));
        accepted=true;
        policy.authorizeUrl("https://example.com/path");policy.authorizeUrl("https://EXAMPLE.com:443/path");
        for(String address:new String[]{"http://example.com","https://other.com","https://sub.example.com","https://example.com:444","https://user:secret@example.com","file:///example.com","https://example.com.attacker.com"}){
          boolean rejected=false;try{policy.authorizeUrl(address);}catch(Exception denied){rejected=true;}if(!rejected)throw new AssertionError(address);
        }
        policy.authorizePermission("media",true);
        boolean denied=false;try{policy.authorizePermission("media",false);}catch(Exception expected){denied=true;}if(!denied)throw new AssertionError("OS denial");
        denied=false;try{policy.authorizePermission("location",true);}catch(Exception expected){denied=true;}if(!denied)throw new AssertionError("Undeclared permission");
      } catch(Exception error) {
        if(item.getBoolean("valid"))throw error;
      }
      if(accepted!=item.getBoolean("valid"))throw new AssertionError("Package case "+i);
    }
    System.out.println("Native Android package verification: "+cases.length()+" interoperability and rejection cases passed");
  }
}
