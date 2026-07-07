# Cloud Run APK 빌드 오프로딩 — 개발 문서

Android APK Gradle 빌드를 **Google Cloud Run Job**으로 오프로딩하는 실개발 스펙. 마일스톤(1~4차)을 잘게 쪼개
각 단계의 산출물·완료 기준·불변식을 정의한다.

> 범위: 이 문서는 **APK 빌드 오프로딩만** 다룬다. Cloudflare Pages 이전은 별도 트랙.
> 상위 아키텍처·결정 근거: [android-build-cloud-run-plan.md](android-build-cloud-run-plan.md) · 413/payload:
> [android-export-413-plan.md](android-export-413-plan.md)

## 용어

- **빌더(Builder)**: SDK+JDK+Gradle을 담은 Cloud Run Job 컨테이너.
- **입력 번들(input bundle)**: 빌드에 필요한 옵션·manifest·사용자 파일 묶음(GCS 저장).
- **정산(settlement)**: `complete_export_job`/`fail_export_job`로 크레딧 확정/환불 + `export_jobs` 종료 전이.

## 마일스톤 (4차 목표)

| 목표 | 정의 | 완료 기준 |
|---|---|---|
| **1차** | 빌더가 **로컬 Docker**에서 APK 생성 | 고정 입력으로 `docker run` → 설치 가능한 APK 산출 |
| **2차** | **GCS 입력/출력**으로 APK 생성 | GCS 입력 번들 → 빌더 → 출력 버킷에 APK+결과 메타 |
| **3차** | **Vercel API에서 Job 실행** | API 호출이 실제 Cloud Run Job 실행을 트리거 |
| **4차** | **폴링/status/크레딧 정산** | 큐잉→폴링→서명URL 다운로드, 성공 1회 차감·실패 1회 환불 |

---

## 불변식 (모든 단계에서 지켜야 함)

이 7가지는 마일스톤과 무관하게 항상 성립해야 하며, 아래 §추적표에서 각 항목이 어디서 강제되는지 명시한다.

1. **상태 전이 멱등성**: `export_jobs` 종료 전이(completed/failed)는 조건부 UPDATE(`WHERE status='pending'`)로
   **단 한 번만** 성공하고, 이후 중복 시도는 no-op.
2. **정산 멱등성**: `completeExportJob`/`failExportJob`(및 RPC `complete_export_job`/`fail_export_job`)는 **중복
   호출되어도 안전** — 이미 종료된 job이면 크레딧을 다시 차감/환불하지 않고 현재 잔액만 반환.
3. **정산 전 상태 확인**: status 엔드포인트는 완료/실패 정산을 실행하기 **전에 현재 정산 여부(status)를 확인**하고,
   `pending`일 때만 정산을 시도(경합은 §1 조건부 UPDATE가 최종 방어).
4. **환불 경로**: Job **실패/타임아웃/중단(크래시 포함)** 모든 경우에 환불 경로가 존재 — Job이 결과를 못 남긴
   경우도 워치독이 stale `pending`을 감지해 `failExportJob`.
5. **서명 URL 단명 + DB 비영구**: 다운로드는 **짧은 TTL의 GCS 서명 URL**로만 발급. DB에는 **영구 public URL을
   저장하지 않고** GCS 오브젝트 경로만 저장. 버킷은 비공개.
6. **소유권 있는 입력 번들**: 입력 번들에 `user_id`·`theme_id`·`export_job_id`를 포함하고, Job과 API가 **소유권을
   검증**(번들↔DB `export_jobs` row의 user_id 일치).
7. **로그 비밀 차단**: Job/서버 로그에 **service role key, 서명 URL, keystore password**가 출력되지 않도록
   구조적 로깅(허용 필드 화이트리스트 + 레드액션).

## 상태 머신 (`export_jobs`)

```
reserve → status=pending, stage=queued
            │  (Job 진행: idempotent stage 갱신, WHERE status='pending')
            ├─ preparing → building → packaging → finalizing
            ▼
   ┌─ complete_export_job → status=completed  (크레딧 확정, 1회)
   └─ fail_export_job     → status=failed     (크레딧 환불, 1회)
```

- 기존 `updateExportJobStage`는 이미 `WHERE status='pending'` 게이트 → **재사용**.
- **감사 완료(불변식 1·2 충족)**: RPC `complete_export_job`/`fail_export_job`는 `SELECT … FOR UPDATE` 행 잠금 +
  분기로 **이미 멱등**하다 — `status='succeeded'`(complete)/`'failed'`(fail)면 금액 변화 없이 현재 잔액 반환,
  그 외 비-`pending`이면 `export_job_not_pending` 예외. 마이그레이션 불필요. Phase 4 status 엔드포인트는
  `export_job_not_pending`을 **"이미 정산됨"** 으로 처리한다.
- **`theme_id` 갭**: `export_jobs`에는 `theme_id` 컬럼이 없다(reserve RPC 미저장). 불변식 6의 `theme_id` 대조는
  DB로 불가 → 처리 방침은 아래 §미결정 참조.

## 입력 번들 스펙

GCS 입력 버킷에 `export_job_id` 기준 경로로 저장.

```
gs://<input-bucket>/<export_job_id>/bundle.json
gs://<input-bucket>/<export_job_id>/files/<field>       # 사용자 업로드·나인패치 바이트
```

`bundle.json`:
```jsonc
{
  "export_job_id": "…",
  "user_id": "…",
  "theme_id": "…",
  "options": { "mode": "apk|apk-zip|project", "exportName": "…", "versionName": "…", "applicationId": "…" },
  "manifest": [
    { "path": "src/main/theme/…", "field": "files/file-0" },        // 바이트 첨부
    { "path": "src/main/theme/…", "serverAsset": "/template-assets/…" } // 빌더 내장분으로 해결
  ]
}
```

- 기본 에셋은 `serverAsset` 참조만 → **빌더 이미지 내장 `template-assets`로 해결**(웹은 `node:fs` 불필요).
- 사용자 업로드·나인패치 결과만 실제 바이트.
- **소유권 검증**: (API) 요청 유저가 `theme_id` 소유·`export_job_id`가 그 유저 예약분인지 확인. (Job) bundle의
  `export_job_id`+`user_id`가 DB `export_jobs` row와 일치하는지 확인(3차부터 DB 대조).

## GCS 레이아웃 · 서명 URL

- 입력 버킷 / 출력 버킷 분리, 둘 다 **비공개**.
- 출력: `gs://<output-bucket>/<export_job_id>/<fileName>.apk` + `result.json`(status, output_path, bytes, error?).
- DB에는 **오브젝트 경로만** 저장. 다운로드 시 **단명 서명 URL(예 5분)** 온디맨드 발급.
- 버킷 lifecycle: 입력/출력 모두 N시간 후 자동 삭제.

## 보안 · 로깅

- 구조적 로깅: 허용 필드(event, export_job_id, stage, mode, durationMs, elapsedMs, errorCode)만. 임의 객체 덤프 금지.
- 절대 로그 금지: GCP 자격증명·액세스 토큰(OIDC/교환 토큰), 서명 URL(서명 토큰 포함), keystore password,
  bundle 내용 원문.
- 서명 URL은 발급 즉시 클라이언트로만 전달, 서버/Job 로그·DB 미기록.

---

## Phase 세부 (마일스톤별)

### 1차 — 로컬 Docker에서 APK
- [x] 1.1 `services/android-builder/` 스캐폴드(Dockerfile + 엔트리 + README)
- [x] 1.2 Base 이미지 `eclipse-temurin:17-jdk`
- [x] 1.3 SDK 설치: cmdline-tools + `sdkmanager`로 `platform-tools`, `platforms;android-35`,
      `build-tools;35.0.0` + 라이선스 accept, `ANDROID_SDK_ROOT` 설정
- [x] 1.4 샘플 프로젝트(`android-sample-theme/apeach-26.1.0-source`) + `public/template-assets` 이미지 내장
- [x] 1.5 이미지 빌드 시 `gradlew assembleDebug` 1회로 캐시 워밍(런타임 `--offline` 목표)
- [x] 1.6 `apk.ts` 빌드 코어 분리 — Next 비의존 순수 Node 모듈로 빌더가 import
      (`prepareAndroidProject`/`runGradle`/`buildAndroidApk` 재사용, `resolveAndroidSdkDir`는 `ANDROID_SDK_ROOT`
      지원하므로 수정 불필요)
- [x] 1.7 엔트리(로컬 모드): 로컬 디렉터리의 `bundle.json`+`files/` → build core → 로컬 APK 출력
- [x] 1.8 `docker run -v <입력>:/in -v <출력>:/out` 로 APK 산출
- [x] 1.9 산출 APK 에뮬/실기기 설치 확인
- **완료 기준**: 고정 샘플 입력으로 컨테이너가 설치 가능한 APK를 만든다. (GCS·DB·크레딧 미개입)

### 2차 — GCS 입력/출력
- [x] 2.1 입력 번들 스펙 확정(위 §입력 번들) + 로컬 fixture 작성
- [x] 2.2 GCS 입력/출력 버킷 생성 + IAM(빌더 SA read/write) + lifecycle
      (`kt-theme-build-input`/`-output` + `-dev` 변형, ASIA-NORTHEAST3. `vercel-builder@…` SA가 프로젝트 레벨
      `storage.objectAdmin`으로 read/write 확인됨. prod 버킷 lifecycle 추가: input 1일, output 7일 — dev와 동일)
- [x] 2.3 엔트리(GCS 모드): `bundle.json`+`files/` 다운로드
- [x] 2.4 manifest `serverAsset` → 내장 `template-assets`로 해결(경로 화이트리스트·`..` 차단)
- [x] 2.5 번들 자체 정합성 검증(필수 필드 존재·경로 안전) — DB 대조는 3차
- [x] 2.6 APK를 출력 버킷 업로드(`<export_job_id>/…`)
- [x] 2.7 `result.json` 기록(success/fail, output_path, bytes, errorCode?)
- [x] 2.8 로깅 레드액션 적용(불변식 7) — 서명 URL/SA/keystore pw 미출력 확인
- **완료 기준**: GCS 입력 번들 → 빌더 → 출력 버킷에 APK+`result.json`. 로그에 비밀 없음.

### 3차 — Vercel API에서 Job 실행
- [x] 3.1 **Workload Identity Federation(OIDC)** — 풀(`vercel-pool`)/프로바이더(`vercel-provider`, issuer
      `oidc.vercel.com`) + `vercel-builder@…` SA `workloadIdentityUser` 바인딩 구성 완료. 코드는 env로 소비.
- [x] **인프라**: 빌더 이미지 `asia-northeast3-docker.pkg.dev/…/theme-builder/android-builder:v1` 푸시 +
      Cloud Run Job `android-builder`(asia-northeast3, SA `vercel-builder@…`, 4Gi/2CPU/task-timeout 900/retries 0)
      생성. **E2E 스모크 통과**: GCS 입력 번들 → Job → 출력 버킷에 APK(3.28MB)+`result.json{status:success}`.
      (Supabase env 미설정 → 3.5/3.6 skip 상태로 검증)
- [x] 3.2 `lib/theme/android/buildJobClient.ts`: OIDC→STS 교환→SA impersonation(단명 토큰)로 번들 GCS 업로드
      (`<export_job_id>/bundle.json` + `files/`) — fetch만 사용(엣지 안전), SA 키 미사용
- [x] 3.3 buildJobClient: Cloud Run Job 실행 트리거(`jobs.run` v2 + `GCS_INPUT_URI`/`GCS_OUTPUT_URI` override)
- [x] 3.4 `exportRoute.ts`: **`ANDROID_EXPORT_ASYNC` 플래그**로 비동기 경로 추가(기본 동기 유지). reserve →
      `readAndroidBundleUpload`(serverAsset 참조 통과, 업로드 바이트만 수집) → 번들 업로드 → Job 트리거 →
      `202 { exportJobId }`. 큐잉 실패 시 `failExportJob` 즉시 환불. theme_id는 추적용 통과(결정 A). 현재 `apk` 모드만.
- [x] 3.5 빌더(`entrypoint.ts`): **DB 대조 소유권 검증** — gcs+Supabase 설정 시 `export_jobs.user_id`가 번들
      `user_id`와 일치하는지 확인(`export_job_not_found`/`ownership_mismatch` 시 즉시 실패)
- [x] 3.6 빌더: 스테이지 갱신(preparing/building/finalizing) — `WHERE status='pending'` 게이트, best-effort(실패해도
      빌드 진행). service-role 사용
- [ ] 3.7 `apk-zip`/`project`(zip) 모드도 같은 비동기 경로로 Job 위임 (현재 비동기는 `apk`만)
- **완료 기준**: API 호출이 실제 Job 실행을 트리거하고, 소유권 불일치 요청은 거부된다.

**웹→GCP 필요 env(비밀 아님, WIF)**: `GCP_PROJECT_ID`, `GCP_PROJECT_NUMBER`, `GCP_BUILDER_SA_EMAIL`,
`GCP_BUILD_INPUT_BUCKET`, `GCP_BUILD_OUTPUT_BUCKET`, `GCP_BUILD_JOB_REGION`(=`asia-northeast3`),
`GCP_BUILD_JOB_NAME`, `ANDROID_EXPORT_ASYNC=1`. (`VERCEL_OIDC_TOKEN`은 런타임 자동 주입)
선택: `ANDROID_EXPORT_WATCHDOG_MS`(기본 1500000=25분, 4.5 워치독 임계값).

**빌더(Cloud Run Job) 필요 env**: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`(3.5/3.6용, 미설정 시 DB 단계 skip).
GCS 접근은 Job의 서비스 계정 IAM으로(키 없음).

### 4차 — 폴링 / status / 크레딧 정산
- [x] 4.1 `app/api/export/android/status?jobId=` 엔드포인트(`androidExportStatus.ts` + route) — `export_jobs` 조회
      (소유권 `user_id` 필터 포함) + GCS `result.json` 조회
- [x] 4.2 **정산 전 상태 확인**(불변식 3): `row.status`가 `pending`일 때만 result.json 조회·정산 시도. 이미
      `succeeded`/`failed`면 정산 재호출 없이 서명 URL/에러만 반환
- [x] 4.3 완료 전이: `result.json.status="success"` → `completeExportJob` 호출(`export_job_not_pending`이면
      이미 정산된 것으로 간주하고 계속 진행 — 멱등)
- [x] 4.4 실패 전이: `result.json.status="failed"` → `failExportJob` 환불(동일 멱등 처리)
- [x] 4.5 **워치독**(불변식 4): `result.json` 없이 `created_at` 기준 임계시간(`ANDROID_EXPORT_WATCHDOG_MS`,
      기본 25분 — Job task-timeout 900초보다 여유 있게) 초과한 stale `pending` → status 엔드포인트가 직접
      `failExportJob` 환불
- [x] 4.6 다운로드: **GCS V4 서명 URL**(TTL 300초)을 signBlob(IAM Credentials API, SA 키 없이 impersonation
      토큰으로 서명)으로 온디맨드 생성. DB에는 `file_name`만 저장(영구 URL 미저장)
      **로컬 테스트 중 발견·수정한 이슈**:
      (a) `signBlob` 호출은 대상 SA가 **자기 자신에게 `roles/iam.serviceAccountTokenCreator`** 를 부여해야
      동작(별도 self-binding 필요, `workloadIdentityUser`만으로는 불가) — `vercel-builder` SA에 적용 완료.
      (b) 서명 URL 생성 시 `exportJobId/fileName` 전체를 한 번에 `encodeURIComponent`하면 `/`까지 `%2F`로
      이스케이프되어 실제 오브젝트 경로와 어긋남 — 경로 세그먼트별로만 인코딩하도록 수정.
      (c) 브라우저가 `storage.googleapis.com`으로 크로스 오리진 `fetch()`를 하므로 **출력 버킷에 CORS 설정
      필요**(GET, `localhost:3000`+배포 도메인 허용) — `kt-theme-build-output`/`-dev` 양쪽에 적용 완료.
- [x] 4.7 `useProjectExport`/`exportClient.ts`: 응답이 `202`(큐잉)이면 `pollAndroidExportStatus`로 3초 간격
      폴링(클라이언트 상한 12분, 서버 워치독이 최종 방어) → 완료 시 서명 URL로 다운로드. 실패 시 에러 표시 +
      계정 상태 새로고침(환불 반영)
- [x] 4.8 경합 안전성: 별도 락 코드 없이 **RPC 자체의 `SELECT … FOR UPDATE` + 상태 분기에 위임**(코드 감사로
      이미 멱등 확인됨 — 동시 폴링이 `complete_export_job`/`fail_export_job`을 동시 호출해도 첫 호출만 실제
      전이하고 이후 호출은 잔액만 반환)
- **완료 기준 충족 + 실기기 검증 완료**: 로컬(`npm run dev` + `vercel env pull`로 받은 `VERCEL_OIDC_TOKEN`)에서
  큐잉→폴링→서명URL 다운로드 E2E 성공, **APK를 안드로이드 실기기에 설치까지 확인**. 애초 이 작업의 발단이었던
  "실기기에서 413으로 내보내기 실패" 문제가 해소됨. 실제 동시성 부하 테스트는 별도 후속 검증 권장.

---

## 요구사항 추적표

| 요구사항 | 강제 위치 |
|---|---|
| 1. 상태 전이 멱등 | `export_jobs` 조건부 UPDATE(`WHERE status='pending'`), RPC 감사(§상태 머신) · 4.2/4.8 |
| 2. complete/fail 중복 안전 | RPC 멱등 감사 · 4.3/4.4/4.8 |
| 3. 정산 전 상태 확인 | status 엔드포인트 4.2 |
| 4. 실패/타임아웃/중단 환불 | 빌더 `result.json=failed` 4.4 + 워치독 4.5 |
| 5. 단명 서명 URL·DB 비영구 | GCS 레이아웃 · 4.6 |
| 6. 번들 소유권 검증 | 입력 번들 스펙 · API 3.4 · 빌더 3.5 |
| 7. 로그 비밀 차단 | 보안·로깅 · 2.8 |

## 검증 (마일스톤별)

- 1차: `docker run` 산출 APK 설치·실행. 빌드 코어 단위 동작.
- 2차: GCS 왕복 E2E, `result.json` 정확성, 로그 레드액션 확인(grep로 비밀 부재 검증).
- 3차: API→Job 트리거, 소유권 불일치 거부, 스테이지 idempotent.
- 4차: 정상/실패/타임아웃 3경로 × 동시 폴링 → 정산 1회 불변 검증. 서명 URL TTL 만료 후 접근 차단 확인.

## 미결정 (구현 중 확정)

- ~~RPC 멱등성 감사~~ → **해소: 이미 멱등**(위 §상태 머신). 마이그레이션 불필요.
- **`theme_id` 소유권 처리(불변식 6)** → **확정: API 계층 검증 + 빌더는 `export_job_id↔user_id`만 대조**
  (마이그레이션 없음). `theme_id`는 번들에 유지해 추적/로깅용으로만 사용.
- **라우트 컷오버(3.4)** → **확정: `ANDROID_EXPORT_ASYNC` 피처 플래그로 비동기 경로 추가**(기본은 기존 동기 유지).
- ~~워치독 방식~~ → **해소: status 엔드포인트 내 판정**(스케줄 스윕 없음, `created_at` 기준).
- ~~서명 URL TTL·폴링 주기~~ → **해소: TTL 300초, 폴링 3초 간격(클라이언트 상한 12분)**.
- **남은 것**: Cloud Run Job `max-retries`(현재 0 — 재시도 시 멱등 전제 재검토 필요), 버킷 lifecycle 보관 시간
  최종값(현재 dev와 동일 input 1일/output 7일 — 프로덕션 트래픽 기준 재조정 여지), 동시성 부하 테스트(4.8은
  코드 감사로 확인, 실전 동시 요청 테스트는 미실시), `apk-zip`/`project` 비동기화(3.7, 별도).
