# iOS Builder

Node 기반 Cloud Run Job builder입니다. Worker에서 ZIP을 만들지 않고 GCS 입력을 읽어 iOS 패키지를 검증·압축한 뒤 GCS 결과와 `result.json`을 기록합니다.

## Local smoke test

```powershell
docker build -f services/ios-builder/Dockerfile -t kakaotalk-ios-builder:m1 .
docker run --rm -v "${PWD}\services\ios-builder\fixtures\basic:/in:ro" -v "${PWD}\tmp\ios-builder-out:/out" kakaotalk-ios-builder:m1
```

## GCS mode

필수 환경 변수는 `GCS_INPUT_URI`, `GCS_OUTPUT_URI`입니다. Cloud Run Job에서는 서비스 계정의 Application Default Credentials를 사용합니다.

입력은 다음 구조입니다.

```text
<job-id>/bundle.json
<job-id>/files.bin
```

`files.bin`은 Worker가 만든 단일 입력 아카이브입니다. 이전 버전의
`<job-id>/files/<field>` 개별 파일 구조도 호환됩니다.

성공 시 다음을 기록합니다.

```text
<job-id>/<export-name>.ktheme 또는 .zip
<job-id>/result.json
```

`SUPABASE_URL`과 `SUPABASE_SERVICE_ROLE_KEY`가 설정되면 builder가 `export_jobs`의 소유자와 `platform='ios'`를 확인하고 작업 단계도 best-effort로 갱신합니다.
