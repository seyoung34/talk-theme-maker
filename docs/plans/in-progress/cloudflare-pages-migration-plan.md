# Cloudflare Pages 이전 계획 (Android 빌드 오프로딩 Phase 3)

웹 호스트를 Vercel → **Cloudflare Pages(OpenNext)** 로 이전하는 상세 계획.
상위 트랙: [../in-progress/android-build-cloud-run-plan.md](../in-progress/android-build-cloud-run-plan.md) Phase 3.

> 상태: **착수함 — `cloudflare-pages-migration` 브랜치.** 5가지 핵심 결정 완료. CF-0 중 **Next 15 다운그레이드
> 완료 + OpenNext 빌드/프리뷰 스파이크 성공**(캐치-22 재현 안 됨, 실기기 아닌 로컬 workerd 검증). 남은 건
> **GCP 자체 OIDC 인증 스파이크**뿐(실제 GCP WIF 리소스 변경이 필요해 진행 전 확인 필요).
> **이전의 진짜 동기는 Vercel Hobby의 상업적 이용 금지 조항이다** — 413 payload 문제는 비동기 Cloud Run Job
> 경로로 이미 해소됐지만([../done/android-export-413-plan.md](../done/android-export-413-plan.md)), 그것과
> 무관하게 상업 서비스를 Hobby 플랜에서 계속 운영하면 약관 위반이라 반드시 유료 플랜이 필요하다. 즉 실제
> 선택지는 "이전하냐 마느냐"가 아니라 **"Vercel Pro($20/월~)로 업그레이드 vs Cloudflare로 이전"**이었다.
> **현재 서비스는 아직 상업 오픈 전(트래픽·결제 없음)이라 컴플라이언스 급박성은 없음** — Pro를 임시로 결제할
> 필요 없이 이 계획대로 착수해도 된다.
>
> **확정된 결정 (2026-07)**:
> 1. **Cloudflare→GCP 인증 = (B) 자체 OIDC(JWKS) 발급으로 완전 이전.** (A) 부분 이전은 Next.js App Router가
>    페이지/API를 한 배포 단위로 묶고 있어 실제로는 역방향 프록시+이중 배포가 필요한데도 Vercel Pro 기본료는
>    그대로 남아 비용 절감 효과가 없다는 게 재검토로 드러나 **기각**. (C)는 SA 키 미발급 불변식 위반으로 기각.
> 2. **관리자 전용 동기 내보내기(`apk-zip`/`project` zip 모드)는 Cloudflare 이전 시점에 일시 비활성화.**
>    zip 비동기화는 별도 후속 기능으로 미룬 상태.
> 3. **iOS 기본 에셋 읽기는 (i) HTTP fetch.**
> 4. **Next 16 `proxy.ts`가 OpenNext 어댑터와 부딪히는 알려진 캐치-22를 피하려 Next 15 + `middleware.ts`로
>    다운그레이드**한다(§Next 버전 전략). 다운그레이드 비용은 사실상 없음(Next 16 전용 API 미사용 확인됨).
>    **단, 2026-10-21 Next 15 Maintenance LTS 종료 전 재상향 필요 — 시한부 결정.**
> 5. GCP 관련 비용(Cloud Run Job/GCS)은 호스팅 선택과 무관하게 동일하게 발생 — 이전 자체가 발생시키는 추가
>    운영비 아님.
>
> §비용 분석 결과 Cloudflare가 연 15~27만원 저렴할 것으로 추정된다.
> 완료 기준: Cloudflare Preview에서 로그인 · Android 비동기 내보내기(큐잉→폴링→서명URL 다운로드) · iOS 내보내기 ·
> 결제/크레딧 전 경로가 회귀 없이 동작하고 실기기 검증까지 통과.

## 이 문서의 범위

- **다룬다**: 웹 앱을 Cloudflare Workers 런타임에서 돌리기 위한 코드/설정 변경, Node 전용 의존성 제거,
  Cloudflare→GCP 인증 방식 확정, 라우트별 이전 전략, 검증.
- **안 다룬다**: Cloud Run Job 빌더 자체(이미 완료). `apk-zip`/`project`(zip) 비동기화(별도 후속 — 아래 §동기
  경로 처리에서 의존성만 언급). iOS 내보내기 비동기화(별도 트랙).

## 비용 분석 (2026-07 기준, 공식 요금 페이지 실측)

진짜 비교 대상은 **Vercel Pro vs Cloudflare**다(Hobby는 상업 이용 자체가 약관 위반이라 선택지가 아님).

| 경로 | 월 비용 | 근거 |
|---|---|---|
| **Vercel Pro** | **$20**(사용자 1명) + GCP $1~3 ≈ **$21~23** | 기본 $20/월. Edge Requests 1000만/월·전송 1TB/월 포함 — 내부 도구 트래픽이면 이 안에서 끝날 가능성이 높아 초과 과금 없이 사실상 고정비 |
| **Cloudflare** | **$0~5** + GCP $1~3 ≈ **$1~8** | Pages(정적)는 무료·무제한. API(Workers 런타임)는 Free 플랜(하루 10만 요청)이 **상업적 이용 허용** — 대부분 이 안에서 끝날 것으로 추정. 초과 시 Workers Paid $5/월(요청 1000만 건 포함)로 전환 |
| **GCP (Cloud Run Job 빌더)** | **$1~3** — 호스팅 선택과 무관, 이미 발생 중 | 빌드 1건당 컴퓨트 비용 $0.01 미만(Seoul 무료 티어로 대부분 흡수) + GCS/Artifact Registry 소액 |

**추정 절감액: 연 약 $150~270(20~35만원)** — Vercel Pro를 거치지 않고 바로 Cloudflare로 가는 편이 유리.

Workers **Free 플랜의 요청당 CPU 10ms 한도**는 사전 실측 없이 **일단 Free로 시작하고, 실제로 느리다고
체감되면 그때 Workers Paid($5/월)로 업그레이드**하기로 확정했다(사전 스파이크 항목에서 제외 — 결정
근거: 넘어가도 Paid가 여전히 Vercel Pro보다 훨씬 저렴해서 미리 재는 것보다 운영하면서 판단하는 편이
합리적). 반응이 느려지거나 Cloudflare 대시보드에 CPU 초과 관련 에러가 보이면 그게 업그레이드 신호다.

## 현재 상태 감사 (2026-07 기준, 코드 실측)

Cloudflare Workers 런타임은 `node:child_process`·`node:fs`·`node:os`·`tmpdir`을 제공하지 않는다
(`nodejs_compat`를 켜도 `child_process`는 불가). 아래는 이전 대상 코드의 런타임 적합성 실측 결과다.

### 이미 엣지 안전 (사전 작업 완료분)

| 대상 | 근거 |
|---|---|
| `lib/theme/android/buildJobClient.ts` | fetch만 사용(STS 교환·SA impersonation·GCS 업로드·Job 트리거), SA 키 없음 |
| `lib/theme/android/androidExportStatus.ts` | fetch + `crypto.subtle`(Web Crypto) + 순수 JS base64(Buffer 미사용). 파일 주석에 "엣지 이전 대상"으로 명시됨 |
| `lib/theme/project/zip.ts` (`createStoredZipBytes`) | 순수 JS(TextEncoder만). iOS zip 조립은 엣지에서 그대로 동작 |
| Supabase 인증 (`@supabase/ssr`, `lib/supabase/{server,proxy}.ts`) | 코드 자체는 엣지 호환(fetch 기반, Node API 미사용). Next 15 다운그레이드로 `middleware.ts` 재사용 확정(아래 §Next 버전 전략) |
| Supabase 데이터/스토리지 라우트 (`me`, `session`, `theme-assets/*`, `billing/*`, `credits`, `admin/*`) | `@supabase/supabase-js` fetch 기반 + `crypto.randomUUID`. 엣지 호환(개별 회귀 확인 필요) |

### Node 전용 — 이전 블로커

| # | 대상 | Node 의존 | 처리 방향 |
|---|---|---|---|
| B1 | `lib/theme/android/buildCore.ts` | `child_process`(gradle), `fs`, `os`, `tmpdir` | **엣지에서 실행 불가.** Cloud Run Job 이미지에만 존재해야 함. 웹 번들에서 완전 분리 |
| B2 | `lib/theme/android/apk.ts` | `node:fs`, `node:path`, buildCore import | 동기 빌드 코어. 웹 라우트가 import하지 않도록 분리 |
| B3 | `lib/theme/android/exportRoute.ts` | B2를 **정적 import** (`buildAndroidApk` 등) | 이 정적 import 때문에 비동기 분기만 써도 그래프에 child_process가 딸려옴. **동기/비동기 핸들러 분리 필수** |
| B4 | `lib/theme/android/request.ts` | `node:fs`(동기 경로의 serverAsset 디스크 읽기) | 동기 경로 전용. B3 분리 시 함께 격리 |
| B5 | `app/api/export/ios/route.ts` | `node:fs`(기본 에셋 `readFile`), `node:path` | iOS zip 자체는 순수 JS라 OK. **기본 에셋 디스크 읽기만** 대체 필요(아래 §iOS) |
| B6 | `app/api/export/android-apk`, `android-project` (route) | `runtime="nodejs"` + 동기 gradle | 관리자/레거시 동기 경로. Cloudflare에선 실행 불가 → §동기 경로 처리 |

### Next 버전 전략 — 확정: Next 15로 다운그레이드 + `middleware.ts` (시한부 결정)

Next 16의 새 `proxy.ts` 방식은 OpenNext Cloudflare 어댑터와 정확히 부딪히는 알려진 캐치-22가 있다:
[cloudflare/workers-sdk#13755](https://github.com/cloudflare/workers-sdk/issues/13755).

- `proxy.ts`를 edge 런타임으로 두면 빌드가 "Node.js middleware is not currently supported"로 실패.
- edge 런타임을 빼면 반대로 "Proxy always runs on Node.js runtime"이라며 edge 전환을 요구 — **양쪽 다 막히는
  캐치-22.**
- 실제 보고 사례: 번들에 `async_hooks`(Node 전용)가 딸려 들어가 **전체 API 라우트가 500**.
- 이 이슈는 리포터 무응답으로 닫혔을 뿐 **수정 확인은 없음**. `@opennextjs/cloudflare` npm 페이지는 "Next 16
  지원됨"이라 적어놨지만 이 이슈와 배치된다.

**확정: 이 캐치-22를 검증/우회하는 대신 Next 15 + `middleware.ts`로 다운그레이드해 원천 회피한다.**
OpenNext 공식 호환 목록상 Next 14/15의 최신 마이너가 16보다 훨씬 성숙하게 지원되고(오래 검증된 경로),
이 프로젝트는 init 커밋부터 Next 16이라 **다운그레이드 비용이 사실상 없다** — 코드 전체에 Next 16 전용 API
(`unstable_after`, `cacheLife`, `"use cache"`, `turbopack`/`reactCompiler` 실험 옵션 등)가 전혀 없음을
확인했다. 실제 변경은 두 곳뿐:
1. `proxy.ts` → `middleware.ts`(파일명), `export async function proxy` → `export async function middleware`
   (시그니처 동일, `NextRequest` API 변화 없음).
2. `next.config.ts`: `experimental.proxyClientMaxBodySize` → `experimental.middlewareClientMaxBodySize`(15의
   이름, 동작 동일).

**⚠ 이건 영구 결정이 아니라 시한부 다리다.** Next 15는 Maintenance LTS이고 **2026-10-21 지원 종료**다(공식
지원 정책 확인). 그 전에 그 시점의 최신 지원 버전(아마 16.x 패치판 — proxy.ts 이슈가 그때쯤 고쳐졌을 가능성)
으로 다시 올려야 한다. 이 재상향 작업은 `docs/notes/scratch.md`에 기한과 함께 남겨 잊지 않도록 한다.

### Vercel 종속 설정 (무의미/폐기 대상)

- `next.config.ts`: `outputFileTracingIncludes`/`Excludes`(android-sample·template-assets), `experimental.proxyClientMaxBodySize`.
- 라우트별 `export const runtime = "nodejs"` / `export const maxDuration`.
- `@vercel/oidc` 의존성(`getVercelOidcToken`) — Cloudflare엔 `x-vercel-oidc-token`이 없다(§결정 게이트).

## 결정 게이트 — Cloudflare→GCP 인증 (**확정: (B) 자체 OIDC(JWKS) 발급**)

비동기 경로는 지금 `@vercel/oidc`의 `getVercelOidcToken()`으로 OIDC 토큰을 얻어 WIF(STS 교환→SA
impersonation)로 GCP에 접근한다. **Cloudflare Workers에는 이 Vercel OIDC 토큰이 없다.** WIF는 신뢰된 발급자의
OIDC 토큰을 요구하는데, Cloudflare는 Vercel처럼 아웃바운드용 OIDC 토큰을 워크로드에 자동 주입하지 않는다.

### 검토했던 대안과 기각 사유

- **(A) API는 Vercel 유지, 정적/페이지만 Cloudflare** — 처음엔 "리스크 격리용 중간 단계"로 제안했으나 재검토
  결과 **기각**. Next.js App Router는 페이지/API가 한 배포 단위라 실제로 A를 하려면 같은 코드베이스를
  Vercel(`/api/*`만)과 Cloudflare(그 외 전부)에 **이중 배포**하고 Cloudflare가 `/api/*`를 Vercel로 **투명
  프록시**해야 쿠키(Supabase 세션)가 깨지지 않는다 — 운영 복잡도만 늘어난다. 게다가 API가 여전히 Vercel에서
  상업적으로 서빙되는 한 **Vercel Pro 기본료 $20/월은 그대로 남아** 비용 절감 효과가 없다. A는 B로 가기 위한
  임시 우회로일 뿐 그 자체로 끝낼 목적지가 아니다.
- **(C) GCP SA JSON 키를 Cloudflare 시크릿으로** — 가장 단순하지만 **SA 키 미발급 불변식 위반.** 기각.
- **(D) 이전 보류, Vercel Pro로 업그레이드** — 기술적 이유로 (B)가 막힐 경우의 대안으로만 남겨둔다(§비용
  분석상 연 15~27만원 더 비쌈).

### 확정: (B) 자체 OIDC(JWKS) 발급 설계

Cloudflare Worker가 GCP WIF가 신뢰할 수 있는 OIDC 발급자 역할을 직접 한다 — GCP WIF는 임의의 issuer+JWKS를
신뢰하도록 구성할 수 있는 공식 지원 패턴이라 기술적으로 막힌 문제는 아니다.

1. **키 쌍 1회 생성**(RSA 또는 EC) — 개인키는 **Cloudflare Workers Secret**으로 저장(코드/로그에 노출 안 됨,
   GCP로 전송되지도 않음). "장기 비밀 제거" 불변식은 *GCP 쪽에 자격증명을 두지 않는다*는 의미이므로, 서명키가
   Cloudflare에만 있고 GCP는 매번 STS로 교환된 단명 액세스 토큰만 받는 이 구조는 불변식과 상충하지 않는다.
2. **`/.well-known/jwks.json` Worker 라우트**로 공개키를 공개.
3. **GCP WIF 프로바이더 추가**(`cloudflare-provider`, 지금의 `vercel-provider`와 나란히) — 이 issuer/JWKS를
   신뢰하도록 구성.
4. **요청마다 Worker가 짧은 수명(예 5분) JWT를 자체 서명** — `crypto.subtle.sign`(Web Crypto, 이미
   `androidExportStatus.ts`에서 같은 패턴 사용 중) 사용, RS256/ES256.
5. 이후는 지금과 **동일한 흐름 재사용**: STS 토큰 교환 → SA impersonation → GCS 업로드/Job 트리거.

`buildJobClient.ts`의 `getVercelOidcToken()` 호출부만 이 자체 서명 로직으로 교체하면 되고, STS 교환·
impersonation·업로드·Job 트리거 코드는 손대지 않는다.

## 동기(gradle) 경로 처리 — 확정: Cloudflare 이전 시점에 일시 비활성화

`child_process`가 없으므로 **Cloudflare에서 Android 빌드는 비동기 경로만 가능**하다. 따라서:

- `/api/export/android`는 **`ANDROID_EXPORT_ASYNC`를 강제 on** 전제로만 동작. 동기 분기(B2·B3·B4)는 웹
  번들에서 제거.
- `apk-zip`/`project`(zip) 모드(관리자 전용)는 **아직 비동기화 미완료**이고 별도 후속 기능으로 미룬 상태다.
  **확정: Cloudflare 이전 시점에 이 두 모드의 관리자 내보내기 기능을 일시 비활성화한다**(라우트/버튼 숨김 또는
  명확한 안내 응답). zip 비동기화가 나중에 끝나면 같은 엣지 배포에서 다시 활성화한다.

## iOS 기본 에셋 읽기 처리 (B5) — 확정: (i) HTTP fetch

iOS는 gradle이 없어 zip 조립(`createStoredZipBytes`)은 엣지에서 그대로 되지만, 기본 에셋(`/template-assets/...`)을
`node:fs`로 디스크에서 읽는 부분만 막힌다.

**확정**: 같은 배포의 `/template-assets/...`를 `fetch(new URL(asset, origin))`로 읽는 **HTTP fetch** 방식을
쓴다. 추가 인프라 없이 413 참조화 설계와 일관되며, 요청당 왕복 비용은 소량이라 무시 가능한 수준이다.
(검토했던 대안: (ii) 번들 임베드는 Workers 번들 크기 한도에 영향, (iii) iOS 오프로딩은 과대 투자로 기각.)

## 목표 아키텍처

```
정적/RSC/페이지  →  Cloudflare Pages (OpenNext, workerd)
API 라우트
  ├─ 엣지 안전(auth·billing·assets·android status/enqueue·ios)  →  Cloudflare Workers
  └─ 동기 gradle(apk-zip/project 관리자)  →  Cloudflare 이전 시점에 일시 비활성화
GCP 접근(WIF)  →  Cloudflare 자체 OIDC(JWKS) 발급 (§결정 게이트 확정)
Cloud Run Job 빌더  →  변경 없음(이미 완료)
```

## 작업 목록 (Phase 세부)

### CF-0 — 기술 스파이크 (정책 결정은 완료, 재현 검증만 남음)
- [x] Cloudflare→GCP 인증 방식 확정: **(B) 자체 OIDC(JWKS)**
- [x] 동기 경로(apk-zip/project) 처리 방식 확정: **Cloudflare 이전 시점에 일시 비활성화**
- [x] iOS 기본 에셋 읽기 방식 확정: **(i) HTTP fetch**
- [x] Next 버전 전략 확정: **Next 15 + `middleware.ts`로 다운그레이드**(시한부, 2026-10-21 전 재상향 필요)

**Next 15 다운그레이드 (선행 — 아래 OpenNext 스파이크보다 먼저 한다) — 완료**
- [x] `package.json`의 `next`를 `^15.5.20`(2026-07 기준 최신 안정 마이너)으로 다운그레이드.
      `react`/`react-dom` ^19.0.0은 15.5.20 피어 의존성 범위(`^18.2.0 || ^19.0.0`) 안이라 변경 불필요
- [x] `proxy.ts` → `middleware.ts`, `export async function proxy` → `export async function middleware`.
      내부 헬퍼도 함께 정리: `lib/supabase/proxy.ts` → `lib/supabase/middleware.ts`(유일한 호출부인 루트
      `middleware.ts`의 import만 변경, 다른 참조 없음 확인)
- [x] `next.config.ts`: `experimental.proxyClientMaxBodySize` → `experimental.middlewareClientMaxBodySize`
- [x] `npx tsc --noEmit` + `npm run build` + dev 서버로 `/`, `/login`, `/api/me`, `/api/session`, `/template`
      실제 요청 — 전부 200, 빌드 로그에 `ƒ Middleware 90.4 kB`로 정상 컴파일 확인, 에러 없음
- **예상 못 했던 추가 발견 2건** (계획에 없었지만 다운그레이드 중 실제로 걸림):
  - `npm run build`가 **`tsconfig.json`의 `jsx`를 `"react-jsx"` → `"preserve"`로 자동 수정**함(Next 15가
    App Router에 요구하는 값 — Next 자체 SWC 변환과 충돌 방지 목적, 정상 동작이라 그대로 둠).
  - `npx tsc --noEmit`이 `app/layout.tsx`의 `import "./globals.css"`에서 **`TS2882`(side-effect import에 대한
    타입 선언 없음)** 로 실패 — TypeScript 6.0.3의 신규 진단이 Next 16의 내장 TS 플러그인에서는 흡수됐지만
    Next 15 플러그인엔 그 대응이 없는 것으로 보임. 저장소 어디에도 plain `*.css` ambient 선언이 없었던 게
    원인 → 신규 [css.d.ts](../../../css.d.ts)에 `declare module "*.css";` 한 줄 추가로 해결(표준적인 해법,
    Next 16 전용 동작에 의존하던 부분 아님).
  - `next-env.d.ts`: Next 15의 dev 서버는 **`.next/dev/types/`를 만들지 않고 `.next/types/`만 사용**(Next 16과
    다른 지점 — AGENTS.md의 "빌드 후 `.next/dev/types/routes.d.ts`로 복원" 관례는 Next 16 전용이었음, Next
    15에서는 `.next/types/routes.d.ts` 참조가 맞는 상태이고 `next dev` 실행 후 자동으로 그 값으로 유지됨).
- **완료 기준 충족**: Next 15에서 기존 기능이 전과 동일하게 동작(로그인·세션 갱신 포함) — 로컬 검증 완료.

**OpenNext × Next 15 호환성 스파이크 — 완료, 성공**
- [x] `@opennextjs/cloudflare@1.20.1`+`wrangler@4.107.1` 설치, `wrangler.jsonc`(`nodejs_compat`,
      `compatibility_date: 2026-07-07`) + `open-next.config.ts` 추가, `npx opennextjs-cloudflare build` 실행
      — **빌드 성공**, 빌드 로그에 `ƒ Middleware 90.4 kB`로 정상 컴파일 확인. 걱정했던 `proxy.ts` 캐치-22 자체가
      발생하지 않음(Next 15 다운그레이드로 원천 회피됐다는 게 실측으로 확인됨).
- [x] `wrangler dev`(workerd 런타임, 실제 Cloudflare Workers 로컬 에뮬레이션)로 기동 후 `/`, `/login`,
      `/api/me`, `/api/session`, `/template` 실제 요청 — **전부 200, 에러 로그 없음**. `/login` 응답 본문에
      "카카오" 텍스트 확인(에러 페이지가 200으로 위장한 게 아니라 실제 렌더링 확인).
- **완료 기준 충족**: OpenNext 빌드 성공 + Cloudflare Workers 로컬 프리뷰에서 로그인 요청이 500 없이 응답.
- **주의**: `opennextjs-cloudflare`가 "Windows에 완전히 호환되지 않음, WSL 권장"이라는 경고를 냄 — 지금은
  문제없이 동작했지만 향후 실제 배포 파이프라인(CI 등)에서 재확인 필요.
- 스파이크용 파일(`wrangler.jsonc`, `open-next.config.ts`, `package.json`의 `cf:build`/`cf:preview` 스크립트,
  `.gitignore`의 `.open-next/`/`.wrangler/`)은 이번 CF-0 커밋에 그대로 남겨둠 — 이후 CF-4에서 이 설정을
  다시 다듬는다.

**GCP 인증 스파이크 — 아직 미착수(실제 GCP WIF 인프라 변경 필요, 사용자 확인 후 진행 예정)**
- [ ] GCP WIF에 `cloudflare-provider`(자체 OIDC issuer+JWKS) 추가 전, 로컬/스테이징에서 자체 서명 JWT →
      STS 교환 성공을 먼저 스파이크로 검증(운영 GCP 리소스 건드리기 전 격리 확인)

**Workers Free CPU 10ms 한도**: 사전 실측 생략 — §비용 분석 참조(우선 Free로 시작, 체감 저하 시 Paid 전환).

- **완료 기준**: ~~Next 15 다운그레이드 회귀 통과~~(완료), ~~OpenNext 스파이크(Next 15 기준) 통과~~(완료), 자체
  서명 JWT→STS 교환 스파이크 성공 — 이거 하나만 남음.

### CF-1 — 웹 번들에서 Node 전용 빌드 코어 분리 (B1~B4)
- [ ] `exportRoute.ts`를 동기/비동기로 분리 — 엣지 라우트가 `apk.ts`(→buildCore)를 **정적 import하지 않도록**.
      비동기 전용 엣지 핸들러 + (남긴다면) 동기 핸들러를 별 모듈로.
- [ ] `apk.ts`/`buildCore.ts`/`request.ts`의 Node 의존부가 엣지 라우트 그래프에 포함되지 않음을 번들 분석으로 확인
- [ ] `/api/export/android`가 비동기 경로만으로 동작(플래그 강제 on 전제) 확인
- **완료 기준**: 엣지 대상 라우트 번들에 `child_process`/`node:fs`/`node:os` 참조가 없다(정적 분석/빌드 로그로 증명).

### CF-2 — iOS 기본 에셋 읽기 대체 (B5)
- [ ] `app/api/export/ios/route.ts`의 `readFile`(디스크) → 확정 대안(HTTP fetch 권장)으로 교체
- [ ] 경로 화이트리스트/`..` 차단 로직 유지(엣지 버전으로 포팅)
- **완료 기준**: iOS 내보내기가 `node:fs` 없이 기본 에셋을 해결하고, 결과물(.ktheme/zip)이 이전과 바이트 동일.

### CF-3 — GCP 인증 엣지화 (자체 OIDC/JWKS 구현)
- [ ] 서명 키 쌍 생성, 개인키를 Cloudflare Workers Secret으로 등록
- [ ] `/.well-known/jwks.json` Worker 라우트로 공개키 노출
- [ ] GCP WIF에 `cloudflare-provider`(issuer=자체 발급자, JWKS URL) 추가 + 대상 SA에 신뢰 바인딩
- [ ] `buildJobClient.ts`의 `getVercelOidcToken()` 의존 제거 → 자체 서명 JWT 발급 함수로 교체
      (`crypto.subtle.sign`, RS256/ES256, 5분 이내 단명)
- [ ] `@vercel/oidc` 의존성 제거
- [ ] 관리자 전용 zip 내보내기 임시 비활성화 적용(§동기 경로 처리 확정 반영)
- **완료 기준**: Cloudflare Workers에서 자체 서명 JWT→STS 교환→impersonation→GCS/Job 트리거가 SA 키 없이 성공.

### CF-4 — OpenNext 도입 + 설정 정리
- [ ] `@opennextjs/cloudflare` 도입, 빌드/배포 파이프라인(Pages) 구성
- [ ] `next.config.ts`에서 Vercel 전용 항목 정리: `outputFileTracingIncludes/Excludes`, `proxyClientMaxBodySize`
- [ ] 라우트 `runtime="nodejs"`/`maxDuration` 선언 재검토(엣지에선 무의미) — 잔류 Node 라우트에만 유지
- [ ] 시크릿/환경변수 이전: WIF 설정값·GCP 버킷/Job·Supabase 시크릿·PayApp 키를 Cloudflare 시크릿/변수로
- **완료 기준**: `npx tsc --noEmit` 통과 + OpenNext 빌드 성공 + Cloudflare Preview 부팅.

### CF-5 — 전 경로 회귀 감사 + 검증
- [ ] Node 전용 API 사용처 최종 감사(전 라우트) — 특히 export 그래프에서 buildCore 완전 분리 재확인
- [ ] Supabase auth/session·이미지·서명 URL·CORS(출력 버킷)·결제(PayApp) 엣지 동작 회귀
- [ ] Cloudflare Preview E2E: 로그인 → Android 비동기 내보내기(큐잉→폴링→서명URL) → iOS 내보내기 → 크레딧
      예약/완료/환불 → 실기기 APK 설치
- [ ] DNS/도메인 전환(정상 확인 후)
- **완료 기준**: 위 E2E 전 항목 통과, 실기기 검증 완료. 이 문서를 `plans/done/`으로 이동.

## 미결정 (스파이크 결과로만 확정 가능 — 정책 결정 5가지는 완료)

- **Next 15 다운그레이드 회귀** — `middleware.ts` 전환·설정 rename 이후 로그인/세션 등 기존 동작이 실제로
  안 깨지는지는 CF-0 다운그레이드 단계에서 실측 전까지 미확정(다만 Next 16 전용 API 미사용 확인으로 위험은 낮음).
- **자체 서명 JWT → GCP STS 교환 스파이크** — CF-0에서 격리 검증 전까지는 (B) 설계가 이론상 타당하다는
  수준. 실제로 GCP WIF가 커스텀 issuer를 기대대로 신뢰하는지는 실측 전까지 미확정.
- **Next 15 → 재상향 시점** — 2026-10-21(Maintenance LTS 종료) 전에 그때 시점의 최신 지원 버전으로 다시
  올려야 함. `docs/notes/scratch.md`에 기한 메모 추가 예정.
- **Workers Free CPU 10ms 한도** — 사전 실측 안 함(결정 완료). 운영 중 체감 저하 시 Paid 전환.
- Cloud Run Job `max-retries`, 버킷 lifecycle 최종값 등 상위 트랙([cloud-run-apk-builder-dev.md](../in-progress/cloud-run-apk-builder-dev.md))의 기존 미결정 항목은 이 이전과 무관하게 별도로 남아 있음.

## 검증 (요약)

1. 로컬/스파이크: OpenNext 최소 앱 Cloudflare Preview 부팅, 엣지 라우트 번들에 Node 의존 부재.
2. Preview E2E: 로그인·Android 비동기 내보내기·iOS 내보내기·크레딧 3경로(예약/완료/환불)·서명 URL TTL·CORS.
3. 실기기: Android APK 설치 확인.
4. 회귀: 결제(PayApp) 왕복, 관리자 크레딧 코드, 테마 에셋 서명 URL.
