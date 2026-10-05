package dev.pjm.android;
import org.json.*;
import java.nio.file.*;
import java.nio.charset.StandardCharsets;
import android.util.Base64;
public final class NativePackageTest {
  private static java.security.Provider hashProvider;
  public static final class PreservedSha256 extends java.security.MessageDigestSpi {
    private final java.security.MessageDigest delegate;
    public PreservedSha256(){try{delegate=java.security.MessageDigest.getInstance("SHA-256",hashProvider);}catch(Exception error){throw new IllegalStateException(error);}}
    protected void engineUpdate(byte value){delegate.update(value);}
    protected void engineUpdate(byte[] bytes,int offset,int length){delegate.update(bytes,offset,length);}
    protected byte[] engineDigest(){return delegate.digest();}
    protected void engineReset(){delegate.reset();}
  }
  private static void removeSignatureProviders()throws Exception{
    hashProvider=java.security.MessageDigest.getInstance("SHA-256").getProvider();
    for(java.security.Provider provider:java.security.Security.getProviders())if(provider.getService("Signature","Ed25519")!=null)java.security.Security.removeProvider(provider.getName());
    java.security.Security.addProvider(new java.security.Provider("PJMFixtureHash",1.0,"Preserves fixture SHA-256 only"){{put("MessageDigest.SHA-256",PreservedSha256.class.getName());}});
    try{java.security.Signature.getInstance("Ed25519");throw new AssertionError("Fixture retained an Ed25519 provider");}catch(java.security.NoSuchAlgorithmException expected){}
  }
  public static void main(String[] args) throws Exception {
    removeSignatureProviders();
    JSONArray cases=new JSONArray(new String(Files.readAllBytes(Paths.get(args[0])),StandardCharsets.UTF_8));
    for(int i=0;i<cases.length();i++){
      JSONObject item=cases.getJSONObject(i);boolean accepted=false;
      try {
        PackageVerifier.Policy policy=PackageVerifier.verifyPolicy(Base64.decode(item.getString("payload"),Base64.NO_WRAP),(item.has("rawEnvelopeBase64")?Base64.decode(item.getString("rawEnvelopeBase64"),Base64.NO_WRAP):item.getJSONObject("manifest").toString().getBytes(StandardCharsets.UTF_8)),Base64.decode(item.getString("key"),Base64.NO_WRAP),item.getLong("abi"),item.getString("target"));
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
