package dev.pjm.android;

import org.json.JSONObject;
import org.json.JSONArray;
import java.nio.charset.StandardCharsets;
import java.security.*;
import java.security.spec.X509EncodedKeySpec;
import java.util.*;

/** Uses only a host-provisioned raw publisher key. Missing crypto fails closed. */
final class PackageVerifier {
  static final class Policy {
    private final Set<String> domains,permissions;
    private Policy(JSONObject verified) throws Exception {
      domains=Collections.unmodifiableSet(new HashSet<>(list(verified,"domains",128)));
      permissions=Collections.unmodifiableSet(new HashSet<>(list(verified,"permissions",16)));
    }
    void authorizeUrl(String address) throws Exception {
      java.net.URI uri=new java.net.URI(address);
      String host=uri.getHost();
      require("https".equalsIgnoreCase(uri.getScheme()) && uri.getRawUserInfo()==null && (uri.getPort()==-1 || uri.getPort()==443) && host!=null && domains.contains(host.toLowerCase(Locale.ROOT)),"URL denied by authenticated package domain policy");
    }
    void authorizePermission(String permission,boolean hostGranted) throws Exception {
      require(permissions.contains(permission),"Permission not declared by authenticated package");
      require(hostGranted,"Permission denied by host or OS");
    }
  }
  static Policy verifyPolicy(byte[] payload,byte[] envelope,byte[] trustedKey,long abi,String target) throws Exception {
    return new Policy(verify(payload,envelope,trustedKey,abi,target));
  }
  private static void require(boolean valid,String reason) throws GeneralSecurityException {
    if(!valid)throw new GeneralSecurityException(reason);
  }
  private static String string(JSONObject object,String name) throws Exception {
    Object value=object.get(name);require(value instanceof String,name);return (String)value;
  }
  private static long integer(JSONObject object,String name) throws Exception {
    Object value=object.get(name);require(value instanceof Number,name);
    double number=((Number)value).doubleValue();
    require(number>=1 && number<=9007199254740991L && number==Math.floor(number),name);
    return ((Number)value).longValue();
  }
  private static List<String> list(JSONObject object,String name,int maximum) throws Exception {
    Object value=object.get(name);require(value instanceof JSONArray,name);
    JSONArray array=(JSONArray)value;require(array.length()<=maximum,name);
    List<String> result=new ArrayList<>();Set<String> seen=new HashSet<>();
    for(int i=0;i<array.length();i++){Object item=array.get(i);require(item instanceof String && seen.add((String)item),name);result.add((String)item);}
    return result;
  }
  static String canonical(Object value) throws Exception {
    if(value instanceof JSONObject){JSONObject object=(JSONObject)value;List<String> names=new ArrayList<>();Iterator<String> keys=object.keys();while(keys.hasNext())names.add(keys.next());Collections.sort(names);StringBuilder result=new StringBuilder("{");for(String name:names){if(result.length()>1)result.append(',');result.append(JSONObject.quote(name).replace("\\/", "/")).append(':').append(canonical(object.get(name)));}return result.append('}').toString();}
    if(value instanceof JSONArray){JSONArray array=(JSONArray)value;StringBuilder result=new StringBuilder("[");for(int i=0;i<array.length();i++){if(i>0)result.append(',');result.append(canonical(array.get(i)));}return result.append(']').toString();}
    if(value instanceof String)return JSONObject.quote((String)value).replace("\\/", "/");
    if(value==null || value==JSONObject.NULL)return "null";
    if(value instanceof Boolean)return value.toString();
    if(value instanceof Number){double number=((Number)value).doubleValue();require(!Double.isNaN(number) && !Double.isInfinite(number),"Non-finite canonical number");if(number==0)return "0";
      java.math.BigDecimal decimal=java.math.BigDecimal.valueOf(number).stripTrailingZeros();double magnitude=Math.abs(number);
      if(magnitude>=0.000001 && magnitude<1e21)return decimal.toPlainString();
      String text=decimal.toString().replace("E","e");int exponent=text.indexOf('e');if(exponent>=0 && text.charAt(exponent+1)!='-' && text.charAt(exponent+1)!='+')text=text.substring(0,exponent+1)+"+"+text.substring(exponent+1);return text;
    }
    throw new GeneralSecurityException("Unexpected canonical value");
  }
  static JSONObject verify(byte[] payload,byte[] envelope,byte[] trustedKey,long abi,String target) throws Exception {
    require(payload.length>0 && payload.length<=64*1024*1024 && envelope.length<=64*1024,"Package size");
    JSONObject object=new JSONObject(new String(envelope,StandardCharsets.UTF_8));
    Set<String> expected=new HashSet<>(Arrays.asList("appId","version","minHostAbi","entry","pages","permissions","domains","targets","format","sha256","signature"));
    Set<String> actual=new HashSet<>();Iterator<String> keys=object.keys();while(keys.hasNext())actual.add(keys.next());require(actual.equals(expected),"Manifest fields");
    String app=string(object,"appId"),version=string(object,"version");
    require(app.length()<=128 && app.matches("[a-zA-Z][a-zA-Z0-9_-]*(?:\\.[a-zA-Z][a-zA-Z0-9_-]*)+"),"App identity");
    require(version.length()<=64 && version.matches("(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)"),"Version");
    require(integer(object,"format")==1 && string(object,"entry").equals("main.pocket"),"Format or entry");
    long minimum=integer(object,"minHostAbi");
    List<String> pages=list(object,"pages",128);require(pages.contains("/"),"Entry page");for(String page:pages)require(page.matches("/(?:[a-zA-Z0-9_-]+(?:/[a-zA-Z0-9_-]+)*)?"),"Pages");
    for(String permission:list(object,"permissions",16))require(Arrays.asList("clipboard.read","media","location").contains(permission),"Permissions");
    for(String domain:list(object,"domains",128)){require(domain.length()<=253 && domain.matches("(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\\.)+[a-z]{2,63}"),"Domains");for(String part:domain.split("\\."))require(part.length()<=63,"Domain label");}
    List<String> targets=list(object,"targets",2);require(!targets.isEmpty(),"Targets");for(String item:targets)require(Arrays.asList("pjm-ios","pjm-android").contains(item),"Targets");
    String digest=string(object,"sha256"),signatureText=string(object,"signature");
    require(digest.matches("[a-f0-9]{64}") && signatureText.matches("[A-Za-z0-9+/]{86}=="),"Signature envelope");
    StringBuilder hash=new StringBuilder();for(byte b:MessageDigest.getInstance("SHA-256").digest(payload))hash.append(String.format(Locale.ROOT,"%02x",b&255));require(hash.toString().equals(digest),"Payload digest");
    require(trustedKey.length==32,"Trusted key");
    byte[] encoded=new byte[44],prefix={0x30,0x2a,0x30,0x05,0x06,0x03,0x2b,0x65,0x70,0x03,0x21,0};System.arraycopy(prefix,0,encoded,0,12);System.arraycopy(trustedKey,0,encoded,12,32);
    object.remove("signature");Signature verifier=Signature.getInstance("Ed25519");verifier.initVerify(KeyFactory.getInstance("Ed25519").generatePublic(new X509EncodedKeySpec(encoded)));verifier.update(canonical(object).getBytes(StandardCharsets.UTF_8));
    require(verifier.verify(android.util.Base64.decode(signatureText,android.util.Base64.NO_WRAP)),"Publisher signature");
    require(abi>=minimum && targets.contains(target),"Host compatibility");object.put("signature",signatureText);return object;
  }
}
