# Cloudflare Workers/OpenNext 이전 계획 (Android 빌드 오프로딩 Phase 3)

웹 호스트를 Vercel → **Cloudflare Workers(OpenNext)** 로 이전하는 상세 계획. CF-0 스파이크로 실측 확인된 대로,
`@opennextjs/cloudflare`는 앱을 **Cloudflare Workers**(`wrangler.jsonc`의 `main` 필드가 가리키는
`.open-next/worker.js`)로 배포한다 — "Pages Functions"이 아니라 Worker 자체이므로 문서명·용어를 실제 배포
형태에 맞춰 정리한다.
상위 트랙: [../in-progress/android-build-cloud-run-plan.md](../in-progress/android-build-cloud-run-plan.md) Phase 3.

> 상태: **CF-0~CF-4 완료, 실제 프로덕션 배포로 검증 완료** — `cloudflare-pages-migration` 브랜치, Cloudflare
> Worker `talk-theme-maker`(`https://talk-theme-maker.jupi4784.workers.dev`)에 실배포됨. GCP WIF
> `cloudflare-provider`를 `vercel-pool`에 영구 생성하고, 프로덕션 서명 키로 JWT 서명→STS 교환→`vercel-builder`
> SA impersonation까지 실제로 성공 확인. Supabase/PayApp/GCP 빌드 시크릿 이전, `next.config.ts`의 죽은 Vercel
> 전용 트레이싱 설정 제거, 불필요한 `runtime="nodejs"` 정리까지 끝내고 재배포·회귀 확인 완료. **CF-5의 DNS
> 전환도 이미 완료**(`talktheme.shop`이 Cloudflare로 이관되어 실제로 Worker에 라우팅됨, 관측성 설정도 켜서
> `wrangler tail`로 로그 확인까지 됨). 남은 건 Workers CPU 관찰·PayApp 콜백 별도 검증·Vercel 롤백 관찰
> 기간뿐.
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
정적/RSC/페이지  →  Cloudflare Workers (OpenNext, workerd)
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

**GCP 인증 스파이크 — 완료, 성공 (프로덕션 `vercel-pool`은 건드리지 않고 격리해서 검증)**
- [x] 임시 풀·프로바이더로 격리해 검증: `cloudflare-spike-pool`(신규, `vercel-pool`과 완전 분리) +
      `cloudflare-spike-provider`를 로컬에서 생성한 RSA 키 JWKS로 `--jwk-json-path`(GCP가 공개 URL을 fetch할
      필요 없이 JWKS를 직접 등록하는 옵션) 지정해 생성
- [x] Node `crypto`로 RSA 키 쌍 생성 → JWKS(공개키) + RS256로 자체 서명한 JWT(iss/sub/aud/iat/exp, 5분 만료)
      준비
- [x] `https://sts.googleapis.com/v1/token`에 STS 토큰 교환(`urn:ietf:params:oauth:grant-type:token-exchange`)
      요청 — **성공**: federated access token(`token_type: Bearer`, `expires_in: 241`) 발급 확인
- [x] 정리: 프로바이더·풀 삭제(`DELETED` 상태 확인, ~30일 후 GCP가 완전 정리), 로컬 개인키·JWT 파일 삭제.
      `vercel-pool`은 검증 내내 조회만 하고 변경 없음(`ACTIVE` 그대로)
- **완료 기준 충족**: **GCP WIF가 자체 서명 OIDC를 실제로 신뢰하고 federated 토큰을 발급한다** — (B) 설계의
  핵심 전제가 실측으로 확인됨. CF-3에서 이 절차를 영구 리소스(`cloudflare-provider`, 기존 풀 구조 아래)로
  다시 만들면 됨.

**Workers Free CPU 10ms 한도**: 사전 실측 생략 — §비용 분석 참조(우선 Free로 시작, 체감 저하 시 Paid 전환).

- **완료 기준 전부 충족**: ~~Next 15 다운그레이드 회귀 통과~~ · ~~OpenNext 스파이크 통과~~ · ~~자체 서명
  JWT→STS 교환 스파이크 성공~~ — **CF-0 완료.**

### CF-1 — 웹 번들에서 Node 전용 빌드 코어 분리 (B1~B4)
- [x] `exportRoute.ts`를 동기/비동기로 분리 — 엣지 라우트가 `apk.ts`(→buildCore)를 **정적 import하지 않도록**.
      비동기 전용 엣지 핸들러 + (남긴다면) 동기 핸들러를 별 모듈로.
- [x] `apk.ts`/`buildCore.ts`/`request.ts`의 Node 의존부가 엣지 라우트 그래프에 포함되지 않음을 번들 분석으로 확인
- [x] `/api/export/android`가 비동기 경로만으로 동작(플래그 강제 on 전제) 확인
- **규칙 — 엣지 대상 파일의 Node import 금지 (재발 방지)**: 엣지에서 서빙되는 라우트/모듈
  (`app/api/export/android/route.ts`+`exportRoute.ts`의 비동기 분기, `app/api/export/ios/route.ts`,
  `app/api/billing/**`, `app/api/theme-assets/**`, `app/api/admin/**`, `app/api/me`, `app/api/session`,
  `middleware.ts`+`lib/supabase/middleware.ts`)는 `node:child_process`·`node:fs`·`node:os`·`node:tls`·
  `node:net` 등 Node 전용 모듈을 **직접 import든 다른 모듈을 거친 transitive import든 금지**한다. B3에서
  손으로 한 번 분리해도, 나중에 다른 사람이 무심코 `apk.ts`나 `buildCore.ts`를 엣지 라우트에서 다시
  import하면 조용히 재발할 수 있다 — 이 문서에만 적어두지 말고 `scripts/verify-*.mjs` 관례를 따라
  `scripts/verify-edge-safe-imports.mjs` 같은 체크 스크립트를 만들어 `package.json`의 `check:*` 계열에
  추가하는 걸 CF-1의 산출물로 포함한다(엣지 대상 파일 목록에서 시작해 import 그래프를 훑어 금지 모듈이
  나오면 실패시키는 정도로 충분).
- **완료 기준**: 엣지 대상 라우트 번들에 `child_process`/`node:fs`/`node:os` 참조가 없다(정적 분석/빌드 로그로
  증명). 위 재발 방지 체크 스크립트가 존재하고 통과한다.
- **CF-1 구현 메모**: `/api/export/android`는 `exportRouteAsync.ts`만 import하고, 동기 빌드 경로는 기존
  `exportRoute.ts`에 남겼다. `requestShared.ts`/`validation.ts`는 Node import 없이 비동기 경로가 공유하는
  manifest·검증 로직을 제공한다. `scripts/verify-edge-safe-imports.mjs` 추가 및 `check:edge-imports` 등록 완료.
  CF-2에서 `app/api/export/ios/route.ts`까지 `check:edge-imports` 대상에 포함했다.

### CF-2 — iOS 기본 에셋 읽기 대체 (B5)
- [x] `app/api/export/ios/route.ts`의 `readFile`(디스크) → 확정 대안(HTTP fetch 권장)으로 교체
- [x] 경로 화이트리스트/`..` 차단 로직 유지(엣지 버전으로 포팅)
- **완료 기준**: iOS 내보내기가 `node:fs` 없이 기본 에셋을 해결하고, 아래 두 가지를 모두 만족한다 —
  1. [x] **파일 해시가 이전과 동일**(전환 전/후 같은 입력으로 만든 `.ktheme`/zip의 SHA-256 비교. "바이트 동일"과
     같은 뜻이지만 해시 비교가 실제 검증 방법이라 이렇게 명시): 디스크 읽기 → HTTP fetch로 바꾼 게 바이트를
     조용히 바꾸지 않았다는 기계적 증명.
  2. [x] **iOS 내보내기 기능 동작 확인**: 원래 기준은 실제 카카오톡 앱 import였지만, 현재 개발 환경에서는
     실기기 import를 당장 확인할 수 없다. 대신 iOS 내보내기 기능이 정상 동작하는 것을 확인했고, 카카오톡 앱
     import는 배포/실기기 검수 때 다시 확인할 메모로 남긴다.
- **CF-2 구현 메모**: `/api/export/ios`는 `/template-assets/...` 서버 에셋을 같은 origin HTTP `fetch()`로 읽고,
  `node:fs`/`node:path`/`runtime="nodejs"` 선언을 제거했다. 로컬 정적 서버로 `public/template-assets` 전체
  38개 파일의 디스크 SHA-256과 HTTP 응답 SHA-256이 동일함을 확인했다. `check:edge-imports`, `tsc`,
  `cf:build` 통과. 실기기 카카오톡 import 확인은 현재 환경에서 즉시 수행하지 못했으므로 배포/실기기 검수 때
  다시 확인한다.

### CF-3 — GCP 인증 엣지화 (자체 OIDC/JWKS 구현)
- [x] 서명 키 쌍 생성 스크립트 추가(`scripts/generate-cloudflare-oidc-keypair.mjs`) — **실제 운영 키를 생성해
      Cloudflare Secret으로 등록 완료**(`CLOUDFLARE_OIDC_PRIVATE_JWK`), 로컬 사본은 즉시 삭제
- [x] `/.well-known/jwks.json` Worker 라우트로 공개키 노출(+ `/.well-known/openid-configuration` discovery 응답)
      — 실배포에서 둘 다 정상 응답 확인
- [x] GCP WIF에 `cloudflare-provider`(issuer=`https://talk-theme-maker.jupi4784.workers.dev`, JWKS는
      `--jwk-json-path`로 직접 등록) **`vercel-pool`에 영구 생성 완료**. 대상 SA(`vercel-builder`) 신뢰는
      기존 `principalSet://.../workloadIdentityPools/vercel-pool/*`(풀 전체) 바인딩이 이미 커버해 추가
      바인딩 불필요했음(확인 완료).
- [x] `buildJobClient.ts`의 `getVercelOidcToken()` 의존 제거 → 자체 서명 JWT 발급 함수로 교체
      (`crypto.subtle.sign`, RS256/ES256, 5분 이내 단명)
- [x] `@vercel/oidc` 의존성 제거
- [x] 관리자 전용 zip 내보내기 임시 비활성화 적용(§동기 경로 처리 확정 반영)

**실제 검증 결과 (2026-07-08, 프로덕션)**: 프로덕션 서명 키로 JWT 서명 → `sts.googleapis.com` 토큰 교환 →
`vercel-builder` SA impersonation까지 전 구간 성공(`iamcredentials.googleapis.com:generateAccessToken`으로
액세스 토큰 발급 확인). (B) 설계가 스파이크 수준이 아니라 실제 운영 경로로 검증됨.

**CF-3 코드 구현 메모**
- 새 환경변수/시크릿:
  - `CLOUDFLARE_OIDC_PRIVATE_JWK`: RS256 private JWK JSON. **Secret으로 등록, 저장소에 커밋 금지.**
  - `CLOUDFLARE_OIDC_PUBLIC_JWKS`: 공개 JWKS JSON. `/.well-known/jwks.json`이 private 필드를 제거해 노출.
  - `CLOUDFLARE_OIDC_ISSUER`: 실제 Worker origin. 예: `https://kakaotalk-theme-maker.<subdomain>.workers.dev`
    또는 커스텀 도메인. GCP provider `--issuer-uri`와 JWT `iss`가 정확히 같아야 한다.
  - `CLOUDFLARE_OIDC_SUBJECT`: 기본값 `cloudflare-worker-prod`. GCP `attribute-condition`과 맞춘다.
- 키 생성:
  ```powershell
  node scripts/generate-cloudflare-oidc-keypair.mjs cf-oidc-202607
  ```
  출력된 private JWK는 Cloudflare Secret에 넣고, public JWKS는 Cloudflare env/secret 및 GCP `--jwk-json-path`
  파일로 사용한다. private JWK는 로컬 파일이나 저장소에 남기지 않는다.
- GCP provider 생성 예시(값은 실제 프로젝트/도메인으로 치환):
  ```powershell
  gcloud iam workload-identity-pools providers create-oidc cloudflare-provider `
    --project="$env:GCP_PROJECT_ID" `
    --location="global" `
    --workload-identity-pool="vercel-pool" `
    --issuer-uri="$env:CLOUDFLARE_OIDC_ISSUER" `
    --attribute-mapping="google.subject=assertion.sub" `
    --attribute-condition="assertion.sub == 'cloudflare-worker-prod'" `
    --jwk-json-path="cloudflare-jwks.json"
  ```
- 대상 서비스 계정 impersonation 바인딩 예시:
  ```powershell
  gcloud iam service-accounts add-iam-policy-binding "$env:GCP_BUILDER_SA_EMAIL" `
    --project="$env:GCP_PROJECT_ID" `
    --role="roles/iam.workloadIdentityUser" `
    --member="principal://iam.googleapis.com/projects/$env:GCP_PROJECT_NUMBER/locations/global/workloadIdentityPools/vercel-pool/subject/cloudflare-worker-prod"
  ```
- 코드 기본값은 `GCP_WIF_PROVIDER_ID=cloudflare-provider`, `GCP_WIF_POOL_ID=vercel-pool`이다. 다른 풀/프로바이더를
  쓰면 env로 명시한다.

**OIDC 클레임 (고정, 실제 배포 값)**
- `iss`: `https://talk-theme-maker.jupi4784.workers.dev`(CF-0 스파이크에서 쓴
  `https://kakaotalk-theme-maker-spike.workers.dev`는 테스트용이었고 실제 배포 도메인으로 교체 완료).
  Worker 이름이 최종적으로 GitHub 저장소 이름과 맞춰 `talk-theme-maker`로 확정됨(§Worker 이름 확정 참조).
- `sub`: `cloudflare-worker-prod`(고정) — 이 Worker 배포 하나를 가리키는 값, 요청마다 바뀌지 않음.
- `aud`: `//iam.googleapis.com/projects/779222832316/locations/global/workloadIdentityPools/vercel-pool/providers/cloudflare-provider`.
- `iat`/`exp`: 요청 시점 기준 발급, **5분 이내 단명**(스파이크와 동일).

**attribute-condition** — [x] 프로바이더 생성 시 `--attribute-condition="assertion.sub == 'cloudflare-worker-prod'"`
지정 완료(CF-0 스파이크는 검증용이라 이 조건 없이 만들었지만, 실제 `cloudflare-provider` 생성 시에는 반영함).

**키 로테이션 절차**
- [x] GCP WIF의 `--jwk-json-path`는 `keys` 배열에 여러 키를 동시에 등록할 수 있다는 점을 이용:
      1) 새 키 쌍 생성 → 2) 새 `kid`를 기존 JWKS 배열에 **추가**(기존 키 유지, 둘 다 신뢰됨) → 3) Worker의
      서명 로직을 새 `kid`로 전환 → 4) 안전 기간(예 7일) 지켜본 뒤 기존 키를 JWKS 배열에서 제거.
      한 번에 스왑하지 않고 이렇게 하는 이유: 전환 도중 서명/검증 키가 잠깐이라도 어긋나면 빌드 큐잉이 전부
      실패하기 때문(무중단 로테이션).
- [x] 로테이션 주기: 정기 로테이션은 연 1회, 키 유출 의심 시 즉시. 실제 로테이션은 위 무중단 절차로 리허설한다.

**롤백 경로 (이 인증 메커니즘이 배포 후 깨질 경우)**
- [ ] **사용자 영향 최소화**: 인증이 깨져도 `enqueueAndroidBuild`가 실패하면 기존 `failExportJob`(멱등, 즉시
      환불) 경로를 그대로 타므로 크레딧 손실은 없다 — 사용자는 "빌드 시작 실패" 에러만 보고 재시도 가능.
- [ ] **Worker 버전 롤백**: Cloudflare Workers는 이전 배포로 즉시 롤백 가능 — 이 인증 코드가 원인으로
      의심되면 direct 원인 조사 전에 우선 이전 버전으로 되돌려 서비스 영향을 끊는다.
- [ ] **DNS/호스트 롤백**: CF-5의 DNS 전환 항목과 연결 — Cloudflare 컷오버 후에도 일정 기간 Vercel 배포를
      바로 폐기하지 않고 유지해, 이 인증 메커니즘 자체가 구조적으로 막히면 DNS를 Vercel로 되돌리는 최후
      수단을 쓸 수 있게 한다.
- **완료 기준 충족**: 자체 서명 JWT→STS 교환→impersonation이 프로덕션 배포에서 실제로 성공(2026-07-08 확인).
  `attribute-condition` 반영 완료. 남은 것: 키 로테이션 리허설(설계는 완료, 실제 1회 실행은 아직 안 해봄),
  다른 `sub` 값 토큰이 실제로 거부되는지의 음성 테스트(원한다면 후속으로 확인 가능).

### Worker 이름 확정 + 배포 파이프라인 연결 (CF-4 착수 중 실제로 겪은 과정)

CF-3 검증을 실제 배포로 하는 과정에서 CF-4의 상당 부분이 자연스럽게 앞당겨졌다. 겪은 순서대로 기록:

1. **이메일 인증**: 첫 `wrangler deploy`가 `You need to verify your email address` (코드 10034)로 실패 —
   Cloudflare 계정 이메일 인증 필요(사용자가 직접 처리).
2. **workers.dev 서브도메인 등록**: 계정에 서브도메인이 없어 배포 실패 — 대시보드 온보딩에서 등록(사용자가
   직접 처리, 계정 단위 1회성 선택이라 대신할 수 없었음).
3. **Cloudflare Git 연동(Workers Builds) 발견**: 사용자가 온보딩 중 GitHub 저장소를 연결하면서 Cloudflare의
   자체 Git 기반 자동배포가 생성됨(프로젝트명 `talk-theme-maker` — GitHub 저장소 `seyoung34/talk-theme-maker`
   에서 자동으로 따온 이름). 이게 CF-4의 "배포 파이프라인 구성"을 사실상 대신함.
4. **브랜치 불일치**: 이 자동배포가 기본으로 `main`을 빌드해 Next 16 `proxy.ts` 캐치-22가 그대로 재현됨(우리가
   Next 15로 피했던 바로 그 문제) — Cloudflare 프로젝트 설정에서 빌드 브랜치를 `cloudflare-pages-migration`
   으로 변경해 해결.
5. **빌드 명령 불일치**: 대시보드가 자동 감지한 `Build command: npm run build`(순수 `next build`)로는
   `.open-next/worker.js`가 안 만들어짐 — `npm run cf:build`(`opennextjs-cloudflare build`)로 변경.
6. **Worker 이름 불일치**: `wrangler.jsonc`의 `name`이 스파이크 때 임시로 붙인 `kakaotalk-theme-maker`로
   남아있어서, 실제 앱이 사용자가 보는 `talk-theme-maker` 프로젝트가 아니라 별도의 안 보이는 Worker로
   배포되고 있었음(그래서 `talk-theme-maker.jupi4784.workers.dev`는 초기 "Hello world" 그대로였음) —
   `wrangler.jsonc`의 `name`/`services[0].service`를 `talk-theme-maker`로 통일해 해결.
7. **시크릿 이전**: Supabase/PayApp/GCP 빌드 설정 12개를 `wrangler secret put`으로 이전(§CF-4 체크리스트).
   `NEXT_PUBLIC_SITE_URL`은 빌드 타임에 번들에 박히는 값이라 `.env.local`의 `localhost:3000`이 아니라
   `https://talk-theme-maker.jupi4784.workers.dev`로 오버라이드해서 재빌드.

결과: `https://talk-theme-maker.jupi4784.workers.dev`에서 실제 앱이 렌더링되고, `/api/me`·`/api/session`이
정상 응답하며, 클라이언트 번들에 실제 Supabase URL이 박혀 있음을 확인(로그인 자체는 브라우저에서 최종 확인
필요).

### CF-4 — OpenNext 도입 + 설정 정리
> CF-0 스파이크에서 `@opennextjs/cloudflare`/`wrangler` 설치 + 최소 `wrangler.jsonc`/`open-next.config.ts`는
> 이미 만들어져 있었고, 위 과정에서 실제 배포·시크릿 이전까지 끝났다. 남은 건 Vercel 전용 설정 정리뿐.
- [x] `@opennextjs/cloudflare` 도입, 빌드/배포 파이프라인(Cloudflare Workers) 구성 — Cloudflare Workers
      Builds(Git 연동)로 `cloudflare-pages-migration` 브랜치 push마다 자동배포되도록 완료
- [x] `next.config.ts`에서 Vercel 전용 항목 정리: `outputFileTracingIncludes`/`Excludes`(android-sample-theme·
      template-assets 트레이싱) **삭제 완료**. CF-1에서 `exportRoute.ts`(동기 빌드 코어 경로)가 완전히
      unimport 상태가 된 걸 확인 — 웹 번들이 더 이상 `android-sample-theme`/`template-assets`를 디스크로
      안 읽으므로 트레이싱 힌트 자체가 죽은 설정이었음.
- [x] 라우트 `runtime="nodejs"`/`maxDuration` 선언 재검토 — 실제로 남아있던 건
      `app/api/export/android/status/route.ts`의 `runtime="nodejs"` 하나뿐이었고(이 라우트는 fetch+Web
      Crypto만 쓰는 순수 엣지 세이프 코드), 이건 기본값을 그대로 다시 적은 것뿐이라 제거. (참고: OpenNext는
      Next의 `runtime="edge"` 선언 자체를 지원하지 않으므로 — 항상 Node.js 런타임(`nodejs_compat`) 위에서
      돈다 — 이 정리는 "엣지로 바꾼다"는 뜻이 아니라 불필요한 명시적 선언을 지우는 것.) `maxDuration`은
      CF-1/CF-2 때 이미 다 제거돼 있었음(grep 결과 0건).
- [x] 시크릿/환경변수 이전: `SUPABASE_SECRET_KEY`, `PAYAPP_USER_ID/LINK_KEY/LINK_VALUE`, `GCP_PROJECT_ID`,
      `GCP_PROJECT_NUMBER`, `GCP_BUILDER_SA_EMAIL`, `GCP_BUILD_INPUT_BUCKET/OUTPUT_BUCKET/JOB_REGION/JOB_NAME`,
      `ANDROID_EXPORT_ASYNC`를 Cloudflare Worker 시크릿으로 이전 완료. `NEXT_PUBLIC_*`(빌드 타임 인라인)는
      실제 배포 URL로 오버라이드해 재빌드 완료.
- **완료 기준 충족**: `npx tsc --noEmit` 통과, OpenNext 빌드 성공, 실제 배포에 재배포해 `/`, `/login`,
  `/api/me`, `/api/session`, `/.well-known/jwks.json` 200 + `/api/export/android-apk`(비활성화 라우트) 410
  확인 — 정리 후 회귀 없음. **CF-4 완료.**
- **남은 선택 항목(블로킹 아님)**: `open-next.config.ts`에 R2 incremental cache 미설정 상태(배포 로그에
  `WARN Failed to set up cache for your project`) — ISR 캐싱이 아쉬운 정도지 기능 장애는 아니라 CF-5 이후
  필요하면 별도로 붙인다.

### CF-5 — 전 경로 회귀 감사 + 검증
- [x] Node 전용 API 사용처 최종 감사(전 라우트) — `rg` 기준 Node import는 `lib/theme/android/apk.ts`,
      `lib/theme/android/buildCore.ts`, `lib/theme/android/request.ts`, `lib/billing/creditCodes.server.ts`에만 남아 있고,
      실제 Cloudflare 경로인 `app/api/export/android/route.ts`는 `exportRouteAsync.ts`→`buildJobClient.ts`만 타서
      export 그래프에서 `buildCore`가 다시 섞이지 않음을 재확인.
- [ ] Supabase auth/session·이미지·서명 URL·CORS(출력 버킷)·결제(PayApp) 엣지 동작 회귀
- [ ] Cloudflare Preview E2E: 로그인 → Android 비동기 내보내기(큐잉→폴링→서명URL) → iOS 내보내기 → 크레딧
      예약/완료/환불 → 실기기 APK 설치
- [ ] **Workers CPU 시간 관찰** — §비용 분석에서 사전 실측을 미루기로 한 항목의 실제 확인 지점. 위 E2E를
      한 번 돌린 뒤 Cloudflare 대시보드에서 라우트별(특히 `theme-assets` 서명 URL 배치, `android/status` 폴링,
      `middleware.ts`) CPU 시간을 관찰해 Free 10ms 한도에 얼마나 가까운지 기록. 막는 기준은 아니고(§비용
      분석 결정 유지), Paid 전환 판단 근거 자료로 남긴다.
- [ ] **PayApp 콜백(`/api/billing/payapp/feedback`) 별도 검증** — 코드 자체는 이미 엣지 안전(Node 의존 없음,
      `request.formData()` + 순수 Web API/문자열 비교 helper만 사용)하지만, 이 라우트는
      **사용자 브라우저가 아니라 PayApp 서버가 직접 호출하는 웹훅**이라 위 "로그인→내보내기→크레딧" E2E로는
      전혀 exercise되지 않는다. 실결제 1건 또는 실제 페이로드 형태를 모사한 POST로 별도 확인 필요:
      1) PayApp 판매자 대시보드에 등록된 콜백 URL이 새 Cloudflare 도메인을 가리키도록 갱신됐는지,
      2) `payload.userid`/`linkkey`/`linkval` 매칭 → `payments` 테이블 조회 → `complete_credit_purchase` RPC
      호출까지 전 구간이 Workers에서 실패 없이 도는지.
- [x] **DNS 전환** — `talktheme.shop`을 Cloudflare 사이트로 추가, 네임서버를 Cloudflare로 교체(활성화 확인
      완료), Worker에 커스텀 도메인 연결 완료. 도중 겪은 문제: 온보딩이 기존 Vercel A/CNAME 레코드를 그대로
      가져와 있어서 "Hostname already has externally managed DNS records" 에러 발생 → 그 레코드(apex A,
      `www` CNAME)를 삭제한 뒤 Custom Domain 추가로 해결. `https://talktheme.shop/`이 실제로 200 응답하고
      Worker 로그에도 잡히는 것까지 확인(아래 §관측성 참조). `NEXT_PUBLIC_SITE_URL`도 실제 도메인으로
      재빌드·재배포 완료.
- [ ] **DNS 롤백 준비(여전히 필요)**: 전환은 됐지만 Vercel 배포를 아직 폐기하지 않고 **최소 며칠의 관찰
      기간**을 두는 것 — 문제가 생기면 Cloudflare DNS 레코드를 다시 Vercel 값(A `216.198.79.1`, `www` CNAME
      `dce5e5216a74f0d8.vercel-dns-017.com`)으로 되돌리는 게 유일한 롤백 동작이 되도록 이 값을 기억해둔다
      (되돌리기 기준: 에러율 급증, 결제/크레딧 불일치, 실기기 빌드 실패 등 §검증 항목의 회귀). 관찰 기간이
      끝나고서만 Vercel 배포를 실제로 내린다.

**관측성(observability) 설정** — `wrangler.jsonc`에 `observability.enabled: true` +
`observability.logs.{enabled, invocation_logs}: true` 추가. `wrangler tail`로 실시간 확인: workers.dev
주소와 `talktheme.shop` 양쪽 요청이 전부 정상적으로 로그에 잡힘(`GET .../  - Ok`, `POST
.../api/export/android-apk - Ok` 등). 이걸로 §Workers CPU 시간 관찰과 §PayApp 콜백 검증 때 실제로 로그를
들여다볼 준비가 됐다.

- **완료 기준**: 위 E2E 전 항목 통과, Workers CPU 시간 관찰 기록 남김, PayApp 콜백 별도 검증 통과, 실기기
  검증 완료, ~~DNS 전환~~(완료) 후 관찰 기간까지 무사히 지남. 이 문서를 `plans/done/`으로 이동.

## 미결정

CF-0의 3개 스파이크(Next 15 다운그레이드 회귀, OpenNext 빌드/프리뷰, 자체 서명 JWT→GCP STS 교환)는 모두
실측 완료. 남은 미결정은:

- **Next 15 → 재상향 시점** — 2026-10-21(Maintenance LTS 종료) 전에 그때 시점의 최신 지원 버전으로 다시
  올려야 함. `docs/notes/scratch.md`에 기한 메모 있음.
- **Workers Free CPU 10ms 한도** — 사전 실측 안 함(결정 완료). 운영 중 체감 저하 시 Paid 전환.
- **OpenNext Windows 호환 경고** — 이번 스파이크는 Windows에서 문제없이 통과했지만, 공식적으로 "완전 호환
  아님"이라 경고함. 실제 배포 파이프라인(CI 등)이 Windows가 아니라면 무관하지만, 로컬 개발 환경 기준으로는
  재확인 필요.
- Cloud Run Job `max-retries`, 버킷 lifecycle 최종값 등 상위 트랙([cloud-run-apk-builder-dev.md](../in-progress/cloud-run-apk-builder-dev.md))의 기존 미결정 항목은 이 이전과 무관하게 별도로 남아 있음.

## 검증 (요약)

1. 로컬/스파이크: OpenNext 최소 앱 Cloudflare Preview 부팅, 엣지 라우트 번들에 Node 의존 부재.
2. Preview E2E: 로그인·Android 비동기 내보내기·iOS 내보내기·크레딧 3경로(예약/완료/환불)·서명 URL TTL·CORS.
3. 실기기: Android APK 설치 확인.
4. 회귀: 결제(PayApp) 왕복(사용자 플로우) + **PayApp 콜백 웹훅 별도 검증**(브라우저 E2E로는 안 잡힘), 관리자
   크레딧 코드, 테마 에셋 서명 URL.
5. 운영 관찰: Workers CPU 시간(Free 한도 근접 여부), DNS 전환 후 롤백 가능 기간 확보.
