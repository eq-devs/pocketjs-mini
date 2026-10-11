# Pinned Android media parser

AndroidX ExifInterface 1.4.2 replaces the platform stream constructor in the
bounded media decoder. Its original AAR manifest declares minSdk 21. Input byte,
pixel/sample and output JPEG limits remain enforced by the host before/after
parsing and decoding; EXIF is used only to determine orientation.

`lock.json` records the official Google Maven artifact URL/AAR hash and hashes
of the extracted parser jar, original manifest/POM/license, JSpecify 1.0.0 jar
and original POM, and its Apache 2.0 license. The parser's annotation dependency
is supplied by the existing verified annotation-jvm 1.10.0 shared runtime.
The AAR has no resource IDs, so no extra resource linking is required.

`bin/android-media.ts` verifies every consumed file and rejects redirected,
missing or altered inputs. Both development and installed APKs copy the verified
jars and metadata/licenses into their offline dependency directory. No Gradle
resolution or network fetch is needed during builds or exports.

`tests/android-media-runtime.test.ts` checks artifact integrity and exports.
`PJM_MEDIA_MODES=codec,service bun tests/media-development-controlled-android.ts`
executes native normalization and resource ownership checks on an owned emulator.
The artifact's declared minimum does not establish full host API-23 acceptance;
the complete runtime/dependency audit and minimum-version execution remain open.
