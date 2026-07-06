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
- **감사 필요**: RPC `complete_export_job`/`fail_export_job`가 종료 전이를 조건부(pending→terminal)로 하고,
  이미 terminal이면 **금액 변화 없이 현재 잔액 반환**하는지 확인. 아니면 SQL에 `WHERE status='pending'` +
  분기 추가(마이그레이션). → 불변식 1·2.

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
- [ ] 2.2 GCS 입력/출력 버킷 생성 + IAM(빌더 SA read/write) + lifecycle
- [x] 2.3 엔트리(GCS 모드): `bundle.json`+`files/` 다운로드
- [x] 2.4 manifest `serverAsset` → 내장 `template-assets`로 해결(경로 화이트리스트·`..` 차단)
- [x] 2.5 번들 자체 정합성 검증(필수 필드 존재·경로 안전) — DB 대조는 3차
- [x] 2.6 APK를 출력 버킷 업로드(`<export_job_id>/…`)
- [x] 2.7 `result.json` 기록(success/fail, output_path, bytes, errorCode?)
- [x] 2.8 로깅 레드액션 적용(불변식 7) — 서명 URL/SA/keystore pw 미출력 확인
- **완료 기준**: GCS 입력 번들 → 빌더 → 출력 버킷에 APK+`result.json`. 로그에 비밀 없음.

### 3차 — Vercel API에서 Job 실행
- [ ] 3.1 **Workload Identity Federation(OIDC)** 구성 — 호스트(Vercel/Cloudflare) OIDC 토큰을 신뢰하는
      워크로드 아이덴티티 풀/프로바이더 + 대상 SA(최소권한: GCS·`jobs.run`) impersonation. **SA JSON 키 미발급.**
      런타임은 호스트 OIDC 토큰 → GCP 토큰 교환으로 단명 액세스 토큰 획득
- [ ] 3.2 `lib/theme/android/buildJobClient.ts`: 번들 GCS 업로드(user_id/theme_id/export_job_id 포함)
- [ ] 3.3 buildJobClient: Cloud Run Job 실행 트리거(`jobs.run` + override로 bundle 경로 전달)
- [ ] 3.4 `route.ts`/`exportRoute.ts`: 동기 `buildAndroidApk` 제거 → reserve → 번들 업로드 → Job 트리거 →
      `{ exportJobId }` 반환. **API 소유권 검증**(유저↔theme_id, 예약↔user_id)
- [ ] 3.5 빌더: **DB 대조 소유권 검증**(bundle.export_job_id/user_id ↔ `export_jobs` row) — 불일치 시 즉시 실패
- [ ] 3.6 빌더: 스테이지 갱신 `updateExportJobStage`(preparing/building/…) — idempotent(`WHERE status='pending'`)
- [ ] 3.7 `project`(zip) 모드도 같은 경로로 Job 위임('gradle 없이 zip만')
- **완료 기준**: API 호출이 실제 Job 실행을 트리거하고, 소유권 불일치 요청은 거부된다.

### 4차 — 폴링 / status / 크레딧 정산
- [ ] 4.1 `app/api/export/android/status?jobId=` 엔드포인트: `export_jobs` + GCS `result.json` 조회
- [ ] 4.2 **정산 전 상태 확인**(불변식 3): status가 `pending`일 때만 정산 시도
- [ ] 4.3 완료 전이: `result.json=success` → `completeExportJob`(멱등, 중복 안전)
- [ ] 4.4 실패 전이: `result.json=failed` → `failExportJob` 환불(멱등)
- [ ] 4.5 **워치독**(불변식 4): 결과 없이 임계시간 초과한 stale `pending` → `failExportJob` 환불
      (status 엔드포인트 내 판정 or 스케줄 스윕)
- [ ] 4.6 다운로드: 완료 시 **단명 서명 URL** 발급(불변식 5), DB엔 경로만
- [ ] 4.7 `useProjectExport`: 단일 POST→blob → **큐잉+폴링+서명URL 다운로드**로 변경
- [ ] 4.8 경합 테스트: 동시 다중 폴링에서 `complete`/`fail`이 **정확히 1회만** 정산(불변식 1·2)
- **완료 기준**: E2E 큐잉→폴링→다운로드. 성공 1회 차감, 실패/타임아웃 1회 환불, 동시 폴링 안전.

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

- Cloud Run Job task timeout / `max-retries`(재시도 시 멱등 전제) / 병렬 실행 상한.
- 워치독 방식: status 엔드포인트 판정 vs 스케줄 스윕(cron) — stale 임계시간 값.
- 서명 URL TTL, 버킷 lifecycle 보관 시간, 폴링 주기.
- `complete_export_job`/`fail_export_job` RPC의 현재 멱등성 여부(감사 결과에 따라 마이그레이션 필요할 수 있음).
