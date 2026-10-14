package dev.pjm.android;
import java.io.*;
import java.security.*;
import java.security.cert.*;
import javax.net.ssl.*;
import okhttp3.*;
/** Test-only explicit temporary certificate anchor; default hostname verification. */
final class UpdateTLS {
 static OkHttpClient client(android.content.Context owner)throws Exception {
  java.security.cert.Certificate certificate;try(InputStream input=owner.getAssets().open("tls-cert.der")){certificate=CertificateFactory.getInstance("X.509").generateCertificate(input);}
  KeyStore trust=KeyStore.getInstance(KeyStore.getDefaultType());trust.load(null,null);trust.setCertificateEntry("owned-test-server",certificate);
  TrustManagerFactory factory=TrustManagerFactory.getInstance(TrustManagerFactory.getDefaultAlgorithm());factory.init(trust);X509TrustManager manager=null;for(TrustManager value:factory.getTrustManagers())if(value instanceof X509TrustManager)manager=(X509TrustManager)value;if(manager==null)throw new IOException("Missing trust manager");
  SSLContext context=SSLContext.getInstance("TLS");context.init(null,new TrustManager[]{manager},null);return new OkHttpClient.Builder().sslSocketFactory(context.getSocketFactory(),manager).build();
 }
}
