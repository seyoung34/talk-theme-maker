# Android APK 빌드 이전 — 비동기 Cloud Run Job + Cloudflare Pages

Vercel 서버리스에는 Android SDK/JDK/Gradle이 없어 `lib/theme/android/apk.ts`의 `gradlew assembleDebug`
실행이 불가능하다. 또 Vercel Hobby는 상업적 이용이 제한된다. 두 문제를 함께 해결한다:

- 빌드는 **Cloud Run Job**(비동기 배치)으로 이전, 결과는 **GCS**에 저장하고 클라이언트가 **폴링**.
- 웹 호스트는 **Cloudflare Pages**로 이전(비용 유리 + 본문 한도 여유).

> 상태: **Phase 0~2(인프라 준비·Cloud Run Job 빌더·웹 큐잉/폴링) 완료**, 실기기 검증 포함 —
> [cloud-run-apk-builder-dev.md](cloud-run-apk-builder-dev.md) 참조. 단 Phase 1의 `apk-zip`/`project`(zip) 모드
> Job 위임은 아직 미완료(현재 비동기는 `apk` 모드만). **Phase 3(Cloudflare Pages 이전)은 미착수** — 현재도
> Vercel에서 서비스 중이며 OIDC 토큰 조회는 `@vercel/oidc`로 해결(Vercel 유지 전제로 조정됨). Phase 4(후속 튜닝·
> iOS 비동기화)도 미착수.
> 참고: payload/413은 별도 해결 완료 → [../done/android-export-413-plan.md](../done/android-export-413-plan.md)

## 결정 로그

- **동기(Service) vs 비동기(Job)** → **비동기.** Gradle 빌드는 수분이라 웹 함수 시간 예산에 묶이면 안 됨.
  비동기면 Cloudflare 엣지/짧은 예산에서도 동작.
- **플랫폼** → **Cloudflare Pages.** Vercel Hobby 상업 제한 회피 + 요청 본문 한도가 훨씬 큼(413 부류 해소).
- **마이그레이션 순서** → **빌드 오프로딩 먼저**, 그다음 웹 Cloudflare 이전(변경 표면 분리).
- **크레딧 정산** → **폴링 status 엔드포인트**가 done/failed 전이에서 정산(결제 로직 웹에 일원화).
- **`project`(zip) 모드** → **Job으로 통합**(엣지엔 fs가 없으므로 'gradle 없이 zip만' 모드로 Job이 처리).
- **Next 어댑터** → **OpenNext**(`@opennextjs/cloudflare`).
- **GCP 인증** → **Workload Identity Federation(OIDC) 전용.** SA JSON 키를 발급·저장하지 않는다.

## 목표 아키텍처 (비동기)

```
브라우저
  │  ① POST /api/export/android  (빌드 입력)
  ▼
Cloudflare Pages Function
  ├─ 인증(Supabase) · 크레딧 예약 · applicationId/versionName 발급
  ├─ 입력 번들을 GCS(입력 버킷)에 저장
  ├─ export job 레코드 생성(status=queued, Supabase)
  ├─ Cloud Run Job 실행 트리거(jobId·입력경로를 override로 전달)
  └─ ⇒ 즉시 { exportJobId } 반환 (엣지 시간 예산과 무관)

Cloud Run Job (SDK+Gradle 컨테이너)
  ├─ GCS에서 입력 번들 로드 + 기본 에셋은 이미지 내장분으로 해결
  ├─ prepareAndroidProject → gradlew assembleDebug (apk.ts 로직 재사용)
  ├─ APK를 GCS(출력 버킷)에 업로드
  └─ status=done/failed 보고 (아래 '상태·크레딧 정산' 참조)

브라우저 (폴링)
  │  ② GET /api/export/android/status?jobId=...
  ▼
Cloudflare Pages Function → { status, downloadUrl? }
  └─ done이면 GCS 서명 URL로 직접 다운로드 (APK 바이트가 함수를 거치지 않음)
```

## Cloud Run Job 설계

### 컨테이너 이미지 (샘플 프로젝트 실측 버전 고정)

`android-sample-theme/apeach-26.1.0-source` 기준:
- AGP `8.7.2`, Kotlin `1.9.25`, Gradle wrapper `8.10.2`
- `compileSdk = 35`, `buildToolsVersion = "35.0.0"`, `minSdk = 28`, `targetSdk = 35`
- `JavaVersion.VERSION_17`, `jvmTarget = "17"`, `org.gradle.jvmargs=-Xmx1536m`

이미지 구성:
- Base `eclipse-temurin:17-jdk` (AGP 8.7.2 → JDK 17 필수)
- Android SDK(cmdline-tools + `sdkmanager`) + 라이선스 accept: `platform-tools`, `platforms;android-35`,
  `build-tools;35.0.0`
- `ANDROID_SDK_ROOT` 설정 → **`apk.ts:resolveAndroidSdkDir`가 이미 이 변수를 지원**하므로 빌드 코어 수정 불필요.
- 샘플 Gradle 프로젝트 + **`public/template-assets` 기본 에셋을 이미지에 내장.** 이미지 빌드 시
  `gradlew assembleDebug` 1회로 AGP·의존성·Gradle 배포본 캐시 워밍 → 런타임 `--offline`, 콜드스타트 후
  재다운로드 없음.

### 입력/출력 (GCS 경유)

- **입력 번들**: `{ options(mode, exportName, versionName, applicationId), manifest, 사용자 파일 }`.
  - 기본 에셋(`/template-assets/...`)은 바이트 대신 **manifest 참조**만 → Job이 이미지 내장분으로 해결.
    (이로써 웹 함수가 `node:fs`로 기본 에셋을 읽을 필요가 없어져 **Cloudflare 엣지 호환** 확보.)
  - 사용자 업로드·나인패치 처리 결과만 실제 바이트로 저장(소량).
- **출력**: APK(또는 apk-zip)를 출력 버킷에 저장. 다운로드는 **GCS 서명 URL(짧은 TTL)** 로 클라이언트 직접
  다운로드 → 대용량 APK가 Cloudflare 함수를 통과하지 않음.
- **버킷 수명주기**: 입력/출력 모두 N시간 후 자동 삭제 lifecycle 설정.

### Job 트리거 · 인증

- Cloudflare 함수 → GCP: **Workload Identity Federation(OIDC)로 확정.** 호스트(Vercel/Cloudflare)가 발급한
  OIDC 토큰을 GCP가 신뢰하도록 워크로드 아이덴티티 풀/프로바이더를 구성하고, **단명 액세스 토큰을
  토큰 교환으로 획득**한다. **SA JSON 키는 발급하지 않는다**(장기 비밀 제거).
- 트리거: Cloud Run Admin API `jobs.run` + 컨테이너 **override**(args/env)로 `jobId`·입력 GCS 경로 전달.
- 동시성: Job 실행은 요청마다 태스크 1개. 과부하 제어는 큐/최대 동시 실행 수로(기존 `maxConcurrentAndroidBuilds`
  가드 대체).

## 상태 · 크레딧 정산

기존 크레딧 로직(`reserveCreditForExport`/`completeExportJob`/`failExportJob`, Supabase)을 권위 소스로 유지.

- 예약: 웹 함수가 큐잉 시 `reserveCreditForExport`.
- 정산(완료/환불): **(b) 폴링 status 엔드포인트 방식으로 확정.** Job은 GCS/Supabase에 결과(성공/실패)만
  기록하고, 폴링 status 엔드포인트가 **done/failed 최초 전이에서** `completeExportJob`/`failExportJob`를 호출한다.
  결제 로직을 웹/엣지 한 곳에 유지.
- 진행 스테이지: Job이 preparing/building/finalizing를 Supabase job 레코드에 갱신 → 폴링에서 표시.

## Cloudflare Pages 이전

- **런타임**: Workers(V8 isolate). `node:child_process`·`node:fs`·`node:os` 없음.
  - **빌드 코어(`apk.ts`)를 웹 번들에서 완전 분리** — Cloud Run Job 이미지에만 존재. `exportRoute`는 더 이상
    `buildAndroidApk`를 import하지 않고 **Job 트리거 클라이언트**만 호출.
  - 413 해결책의 `node:fs`(public 읽기)는 위 '입력' 설계로 제거(기본 에셋을 Job이 소유).
- **Next 어댑터**: **`@opennextjs/cloudflare`(OpenNext)로 확정** — App Router 전체 기능 지원 우선.
- **본문 한도**: Cloudflare는 훨씬 큼(무료 ~100MB급) → Vercel 4.5MB 고유의 413 압박이 사라짐. (그래도 입력은
  참조화로 이미 소량.)
- **라우트 정리**: `export const runtime="nodejs"`/`maxDuration` 선언은 Cloudflare에서 무의미 → 재검토.
- **시크릿/환경변수**: GCP는 **WIF/OIDC(키 없음)** — 워크로드 아이덴티티 풀·프로바이더·대상 SA·프로젝트/버킷
  ID 등 **비밀 아닌 설정값만** 환경변수로. Supabase 키·기타 시크릿은 Cloudflare 시크릿으로.
- **이전 전 감사**: 전 라우트에서 Node 전용 API 사용처 점검(auth `@supabase/ssr`는 엣지 동작), 이미지·서명 URL·
  세션 처리 회귀 확인.

## 코드 변경

1. `lib/theme/android/apk.ts` — 빌드 코어. **웹 번들에서 분리**해 Cloud Run Job 이미지 전용으로. `ANDROID_SDK_ROOT`
   지원 이미 존재 → 로직 수정 최소.
2. 신규 `services/android-builder/`(가칭) — Dockerfile + Job 엔트리(§입력 로드 → 빌드 코어 → GCS 업로드 →
   상태 보고) + 빌드 코어 재사용.
3. 신규 `lib/theme/android/buildJobClient.ts`(가칭, 엣지 안전) — 입력 GCS 업로드 + Job 트리거 + jobId 반환.
4. `app/api/export/android/route.ts` + `exportRoute.ts` — 동기 빌드 호출 제거, **큐잉+트리거**로 교체. 신규
   `app/api/export/android/status` 폴링 엔드포인트가 done/failed 최초 전이에서 크레딧 정산. `project`(zip)도
   같은 큐잉 경로로 Job에 위임('zip만' 모드).
5. 클라이언트(`useProjectExport`) — 단일 POST(응답=blob) → **큐잉 후 폴링 + 서명 URL 다운로드**로 변경.
6. `next.config.ts` — `outputFileTracingIncludes`의 `android-sample-theme`·(가능하면)`template-assets` 제거.
7. iOS도 동일 구조 필요 여부 검토(별도 트랙).

## 작업 목록 (Task List)

### Phase 0 — 인프라 준비
- [x] GCP 프로젝트 + Artifact Registry(이미지 저장소) 생성
- [x] GCS 버킷 2개(입력/출력) 생성 + lifecycle(N시간 후 삭제) 규칙
- [x] Cloud Run Job 리소스 + 대상 서비스 계정(GCS 읽기/쓰기, Job 실행 권한) 생성 — **키는 발급하지 않음**
- [x] Workload Identity Federation 풀/프로바이더 구성(호스트 OIDC 발급자 신뢰) + 대상 SA에 impersonation 허용
- **완료** — 상세 근거: [cloud-run-apk-builder-dev.md](cloud-run-apk-builder-dev.md) 2.2, 3.1.

### Phase 1 — Cloud Run Job 빌더 (빌드 오프로딩 먼저)
- [x] `services/android-builder/` 스캐폴드(Dockerfile + Job 엔트리)
- [x] Dockerfile: `eclipse-temurin:17-jdk` + SDK(`platform-tools`, `platforms;android-35`, `build-tools;35.0.0`) + 라이선스 accept + `ANDROID_SDK_ROOT`
- [x] 샘플 프로젝트 + `public/template-assets` 이미지 내장, 빌드 시 `gradlew assembleDebug` 1회로 캐시 워밍
- [x] `apk.ts` 빌드 코어를 웹 번들에서 분리(Job에서 import, 엣지 번들엔 미포함)
- [x] Job 엔트리: GCS 입력 로드 → manifest `serverAsset`를 내장 에셋으로 해결 → `prepareAndroidProject` → `runGradle` → APK를 출력 버킷 업로드 → 상태 기록
- [ ] `project`(zip) 'gradle 없이 zip만' 모드 Job 처리 — **미완료**, 현재 비동기 경로는 `apk` 모드만 지원(하위
      [cloud-run-apk-builder-dev.md](cloud-run-apk-builder-dev.md) 3.7과 동일 항목)
- [x] 로컬 Docker로 빌더 단독 검증(가짜 입력 → APK)

### Phase 2 — 웹 큐잉·폴링 전환 (아직 현재 호스트에서)
- [x] `lib/theme/android/buildJobClient.ts`(엣지 안전): 호스트 OIDC 토큰 → GCP 토큰 교환(단명 액세스 토큰) →
      입력 GCS 업로드 + Job 트리거 + `jobId` 반환
- [x] `route.ts`/`exportRoute.ts`: 큐잉+트리거 경로 추가 — 계획 원문과 달리 동기 호출을 제거하지 않고
      **`ANDROID_EXPORT_ASYNC` 피처 플래그**로 비동기 경로를 병행 추가함(기본은 동기 유지). 현재 `apk` 모드만.
- [x] `app/api/export/android/status`: 폴링 엔드포인트 + done/failed 최초 전이에서 `completeExportJob`/`failExportJob` + GCS 서명 URL 반환
- [x] `useProjectExport`: 단일 POST→blob → 큐잉+폴링+서명URL 다운로드로 변경
- [x] E2E 검증(큐잉→폴링→다운로드, 크레딧 예약·완료·환불 경로) — 실기기 설치까지 확인
- **완료** — 상세 근거: [cloud-run-apk-builder-dev.md](cloud-run-apk-builder-dev.md) 3.2~3.6, 4.1~4.8.

### Phase 3 — Cloudflare Workers(OpenNext) 이전
> **CF-0 완료, CF-1부터 진행 중(`cloudflare-pages-migration` 브랜치 — 브랜치명은 만들 당시 이름 그대로 유지,
> 실제 배포 대상은 Pages가 아니라 Workers임).** 상세 계획은 별도 문서로 분리:
> [cloudflare-workers-opennext-migration-plan.md](cloudflare-workers-opennext-migration-plan.md).
> 이전의 진짜 동기는 413(이미 해소됨)이 아니라 **Vercel Hobby 상업 이용 금지** — 상업 서비스는 Pro($20/월~)
> 아니면 다른 호스트가 필요하다. 비용 분석 결과 Cloudflare가 유리(연 15~27만원 절감 추정)해 **자체 OIDC(JWKS)
> 발급 + Next 15/middleware.ts 다운그레이드(시한부, 2026-10-21 전 재상향)로 완전 이전**하기로 확정했다(5개
> 정책 결정 모두 완료, CF-0 스파이크 3개 전부 성공). 아래는 원래 개괄 항목(상세·최신 진행 상태는 분리 문서 참조).
- [ ] OpenNext(`@opennextjs/cloudflare`) 도입 + 빌드/배포 파이프라인
- [ ] Node 전용 API 사용처 감사(전 라우트) — 특히 export 경로에서 `apk.ts` import 완전 분리 확인
- [ ] 413 `node:fs`(public 읽기) 제거 확인(기본 에셋은 Job 소유)
- [ ] 시크릿/환경변수 이전(WIF 설정값·Supabase 시크릿·버킷/Job 설정) — GCP는 키 없이 OIDC로
- [ ] 라우트 `runtime="nodejs"`/`maxDuration` 선언 재검토, `next.config` `outputFileTracingIncludes` 정리
- [ ] Supabase auth/session 엣지 동작 회귀
- [ ] Cloudflare Preview E2E + 실기기 확인 → DNS/도메인 전환

### Phase 4 — 후속/정리
- [ ] `min-instances`(0/1)·폴링 주기·서명 URL TTL·버킷 보관 시간 튜닝
- [ ] iOS 내보내기 비동기화(별도 트랙)

## 검증

1. 로컬: 빌더 컨테이너를 로컬 Docker로 실행 + 가짜 GCS(or 에뮬레이터)로 입력/출력 → APK 생성 확인.
2. 스테이징: Cloud Run Job 배포 + Cloudflare Preview에서 큐잉→폴링→서명URL 다운로드 E2E.
3. 회귀: `apk`/`apk-zip`/`project`(admin) 모드, id·버전 주입, 크레딧 예약·완료·환불(실패/타임아웃 경로 포함).

## 남은 소소한 미결정 (구현 중 정하면 됨)

- Cloud Run `min-instances` 0(비용 0, 콜드스타트) vs 1(웜 유지, 소액 고정비).
- 폴링 주기·타임아웃, GCS 서명 URL TTL, 버킷 lifecycle 보관 시간.
- iOS 내보내기 비동기화(별도 트랙) 착수 시점.
