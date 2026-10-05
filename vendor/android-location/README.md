# Android location runtime

`runtime-lock.json` records 27 resolved artifacts, official Maven URLs, original
artifact SHA-256/byte sizes and SHA-256/byte sizes for every extracted file.
The runtime was resolved using Gradle 8.13 with `resolve.gradle`; its full
module selection is retained in `gradle.lockfile`. Use an isolated Gradle user
home when reproducing resolution. No dynamic versions are requested.

The AndroidX manifests, resource XML and original published POM metadata are
retained. Java library jars preserve their original embedded metadata. Original
AAR class jars are renamed using their artifact/version; resources remain grouped
by artifact so the APK builder can compile and overlay them without losing files.

Kotlin stdlib 2.1.21 and annotation-jvm 1.10.0 are byte-identical to the HTTP
runtime and are shared. Resolution selects JetBrains annotations 23.0.0 for
coroutines; installed export removes the old HTTP annotations 13.0 jar to avoid
duplicate classes. Kotlin jdk7/jdk8 1.8.20 artifacts are retained as resolved.

Original license declarations are in `metadata/*.pom`; AndroidX resource XML
retains its copyright notices. Google Play Services POMs refer to the Android SDK
license terms. Retaining these files does not establish distribution approval.

The builder includes the inspected AndroidX core component factory, Google API
activity and Google Play Services version metadata. These correspond to the
application entries in the locked AAR manifests. A dependency update must review
all manifest entries and resource namespaces again.

`compile-lock.json` and `tests/fused-location-types.sh` retain a separate check
against the four checksum-pinned cached Google API AARs. That older compile-only
check does not substitute for this runtime closure or for device acceptance.

Unsigned APK packaging passes, including an export moved into a folder with
spaces. D8 reports invalid upstream local-variable debug information and an
upstream companion-object warning. Runtime compatibility, native permission
dialogs and actual fused-location results still require device checks. Devices
must provide compatible Google Play Services; iOS uses a separate provider.
