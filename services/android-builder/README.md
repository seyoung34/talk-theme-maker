# Android Builder

Reusable Docker builder for generating KakaoTalk Android theme APKs outside the Next.js runtime.

Milestone 1 supports local Docker execution only. The container reads a local input bundle from `/in`, reuses the shared Android build core, runs Gradle inside the image, and writes an APK to `/out`.

## Directory Layout

- `Dockerfile`: JDK 17, Android SDK, Node, project files, and Gradle cache warmup.
- `entrypoint.ts`: local bundle loader and APK build entrypoint.
- `warm-gradle-cache.ts`: image-build-time Gradle warmup.
- `tsconfig.json`: service-only TypeScript emit config.
- `fixtures/basic/bundle.json`: local sample input for smoke testing.

## Local Build Instructions

Run from the repository root.

```powershell
docker build -f services/android-builder/Dockerfile -t kakaotalk-android-builder:m1 .
```

The image build installs:

- `eclipse-temurin:17-jdk`
- Android cmdline tools
- `platform-tools`
- `platforms;android-35`
- `build-tools;35.0.0`
- project npm dependencies used to compile the builder entrypoint

The Docker build also runs `gradlew assembleDebug` once to warm Gradle, Android Gradle Plugin, Kotlin, and dependency caches.

## Docker Run

Create an output directory, then mount an input bundle and output directory:

```powershell
New-Item -ItemType Directory -Force .\tmp\android-builder-out
docker run --rm -v "${PWD}\services\android-builder\fixtures\basic:/in:ro" -v "${PWD}\tmp\android-builder-out:/out" kakaotalk-android-builder:m1
```

Expected output:

```text
tmp/android-builder-out/local-builder-sample_1.0.0.apk
```

## Expected Input

`/in/bundle.json`:

```json
{
  "options": {
    "mode": "apk",
    "exportName": "local-builder-sample",
    "versionName": "1.0.0",
    "applicationId": "com.kakaotalk.theme.builder.local"
  },
  "manifest": [
    {
      "path": "src/main/theme/drawable-xxhdpi/theme_profile_01_image.png",
      "serverAsset": "/template-assets/basic/android/theme_profile_01_image.png"
    },
    {
      "path": "src/main/theme/drawable-xxhdpi/custom_image.png",
      "field": "files/custom_image.png"
    }
  ]
}
```

Manifest items support exactly one of:

- `serverAsset`: a file under the image's built-in `/workspace/public/template-assets`.
- `field`: a file under `/in/files`. Both `files/name.png` and `name.png` resolve inside `/in/files`.

## Expected Output

The builder writes one APK to `/out` named:

```text
<exportName>_<versionName>.apk
```

The APK is generated from `android-sample-theme/apeach-26.1.0-source` with local bundle overrides applied before Gradle runs.

## Known Limitations

- Local `apk` mode only.
- No GCS input or output.
- No Cloud Run Job trigger.
- No DB ownership verification.
- No export status polling or credit settlement.
- Installation verification still requires a connected emulator or physical Android device outside Docker.

## Notes

- Runtime Gradle is invoked with `--offline`; missing cache entries should fail during local validation instead of downloading at runtime.
- The entrypoint logs structured event names only and does not print bundle contents.
- The shared build core keeps the existing `apk.ts` public API intact while allowing this service to import project preparation and Gradle helpers directly.
