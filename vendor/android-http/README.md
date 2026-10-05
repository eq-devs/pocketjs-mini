# Pinned Android HTTP runtime

OkHttp Android 5.5.0, Okio JVM 3.18.1, Kotlin stdlib 2.1.21, JetBrains
annotations 13.0, AndroidX annotation JVM 1.10.0, Startup 1.2.0 and Tracing 1.0.0.
All artifacts are published under Apache-2.0; the license is included.
The jars retain their original embedded metadata and license notices.

lock.json records HTTPS Maven source URLs, archive hashes and extracted runtime
file hashes. AAR classes.jar files are renamed, without modifying their contents.
The OkHttp AAR asset PublicSuffixDatabase.list must be packaged in APK assets.
The export validates file hashes and copies the complete offline runtime.

Android initialization must call OkHttp.INSTANCE.initialize(applicationContext)
when the AndroidX Startup manifest initializer is disabled. This project uses
explicit initialization rather than merging a library-owned startup provider.
The HTTP provider and device acceptance are separate work; inclusion of these
files alone does not prove native HTTP support or older Android compatibility.
