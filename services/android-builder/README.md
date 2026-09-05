# Android Builder

Reusable Docker builder for generating KakaoTalk Android theme APKs outside the Next.js runtime.

Milestone 1 supports local Docker execution. Milestone 2 adds GCS input/output mode. The container reads an input bundle, reuses the shared Android build core, runs Gradle inside the image, and writes an APK either to `/out` or to a GCS output prefix.

## Directory Layout

- `Dockerfile`: JDK 17, Android SDK, Node, project files, and Gradle cache warmup.
- `entrypoint.ts`: local bundle loader and APK build entrypoint.
- `warm-gradle-cache.ts`: image-build-time Gradle warmup.
- `tsconfig.json`: service-only TypeScript emit config.
- `fixtures/basic/bundle.json`: local sample input for smoke testing.
- `fixtures/gcs/bundle.json`: GCS-mode bundle shape for upload testing.

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
The warmup step uses a longer Gradle timeout than runtime because the first image build may need to download the Gradle distribution and dependencies.

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

## GCS Mode

GCS mode is enabled by setting both:

- `GCS_INPUT_URI`: `gs://<input-bucket>/<export_job_id>` or `gs://<input-bucket>/<export_job_id>/bundle.json`
- `GCS_OUTPUT_URI`: `gs://<output-bucket>` or `gs://<output-bucket>/<export_job_id>`

The input prefix must contain:

```text
bundle.json
files/<field>
```

The builder writes:

```text
gs://<output-bucket>/<export_job_id>/<fileName>.apk
gs://<output-bucket>/<export_job_id>/result.json
```

Example:

```powershell
docker run --rm `
  -e GCS_INPUT_URI="gs://my-input-bucket/local-gcs-sample" `
  -e GCS_OUTPUT_URI="gs://my-output-bucket/local-gcs-sample" `
  -e GOOGLE_APPLICATION_CREDENTIALS="/secrets/adc.json" `
  -v "$env:APPDATA\gcloud\application_default_credentials.json:/secrets/adc.json:ro" `
  kakaotalk-android-builder:m1
```

In Cloud Run Job, prefer the job service account and Application Default Credentials over mounting a key file.

## Expected Input

Local mode reads `/in/bundle.json`. GCS mode reads `bundle.json` from `GCS_INPUT_URI`.

```json
{
  "export_job_id": "local-gcs-sample",
  "user_id": "user-local-gcs",
  "theme_id": "theme-local-gcs",
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

In GCS mode, the builder uploads the APK and a `result.json` file under `GCS_OUTPUT_URI`. The APK is generated from `android-sample-theme/apeach-26.1.0-source` with bundle overrides applied before Gradle runs.

## Known Limitations

- `apk` mode only.
- No Cloud Run Job trigger.
- No DB ownership verification.
- No export status polling or credit settlement.
- Installation verification still requires a connected emulator or physical Android device outside Docker.
- GCS bucket creation, IAM, and lifecycle policy are infrastructure steps outside this image.
- The private input bucket shared by Android and iOS must retain each export prefix for at least 3 days so the export sweep can inspect and retry an interrupted enqueue. Keep the output bucket's existing 7-day policy. Apply the input policy in the production GCP project before enabling recovery; this repository does not change bucket lifecycle settings automatically.

The repository keeps the intended input policy in `input-bucket-lifecycle.json`. After checking the current production rules, an operator can apply it with `gcloud storage buckets update gs://<input-bucket> --lifecycle-file=services/android-builder/input-bucket-lifecycle.json`. This command replaces the bucket lifecycle configuration, so preserve any unrelated rules before applying it.

## Notes

- Runtime Gradle is invoked with `--offline`; missing cache entries should fail during local validation instead of downloading at runtime.
- The entrypoint logs structured event names only and does not print bundle contents, GCS URIs, credential paths, signed URLs, or secrets.
- The shared build core keeps the existing `apk.ts` public API intact while allowing this service to import project preparation and Gradle helpers directly.
- GCS failures write `result.json` with `status: "failed"` when the output prefix is known.
