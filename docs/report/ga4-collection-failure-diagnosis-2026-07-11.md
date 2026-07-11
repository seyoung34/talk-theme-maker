# GA4 클라이언트 수집 실패 진단 보고서

> 종류: 진단 스냅샷 (특정 시점 기록). 상태 전환 대상 아님.
> 대상: [`components/analytics/AnalyticsProvider.tsx`](../../components/analytics/AnalyticsProvider.tsx),
> [`lib/analytics/ga4.ts`](../../lib/analytics/ga4.ts)
> 작성일: 2026-07-11
> 관련 문서: [ga4-introduction-plan-2026-07-11.md](ga4-introduction-plan-2026-07-11.md)

## 증상

배포 사이트(`https://www.talktheme.shop`)에서 분석 쿠키 동의 배너의 "동의" 버튼을 눌러도 GA4 실시간
보고서에 아무 데이터도 잡히지 않았다. `gtag.js` 스크립트 자체는 정상 로드(HTTP 200)됐지만, 실제 이벤트
전송(`collect` 요청)이 전혀 발생하지 않았다. localhost에서는 (겉보기에) 정상 동작하는 것으로 보였다.

## 조사 경과

### 1. 배포 환경변수 점검 — 원인 아님

Cloudflare Workers(OpenNext, `wrangler.jsonc`)는 런타임 환경변수와 빌드 시점 환경변수를 구분한다.
`NEXT_PUBLIC_GA_MEASUREMENT_ID`는 `next build` 시점에 클라이언트 번들에 인라인되므로 런타임 전용
변수로 넣으면 빌드 결과물엔 반영되지 않는다. 사용자가 빌드 변수로 옮기고 재배포한 뒤에도 증상이
재현되어, 이 경로는 원인에서 제외했다.

### 2. `dataLayer` 큐 순서 버그 — 발견 및 수정 (커밋 `9fdd8f8` 이후 세션에서 수정)

`AnalyticsProvider`에서 React는 자식(`AnalyticsPageTracker`)의 effect를 부모의 effect보다 먼저
실행한다. `initializeAnalytics`(gtag `config` 푸시)가 별도의 부모 effect(`useEffect(..., [consent,
measurementId])`)에 있었기 때문에, 동의 직후 `AnalyticsPageTracker`가 `config`보다 먼저(또는
`window.gtag`가 아직 없는 채로) `page_view` 이벤트를 밀어 넣으려다 조용히 무시됐다.

**조치**: `initializeAnalytics` 호출을 `chooseConsent`/최초 마운트 effect 안에서 `setConsent`보다
먼저, 동기적으로 실행하도록 순서를 재배치했다. 이 수정 이후 `dataLayer` 순서 자체는 정상화됐으나
(`config` → `event/page_view` 순서 확인됨), **여전히 `collect` 네트워크 요청은 발생하지 않았다** —
즉 이건 실재하는 버그였지만 이번 증상의 근본 원인은 아니었다.

### 3. 클라이언트/네트워크 요인 배제

아래를 순서대로 검증했고 모두 무관함을 확인했다:

- 측정 ID 오타/불일치 — GA4 관리자 화면의 측정 ID와 `.env.local` 값이 정확히 일치 (`G-08DYYZDY6D`)
- 브라우저 확장 프로그램 — 시크릿 모드, 확장 프로그램 없는 스마트폰에서도 동일하게 재현
- Consent Mode 기본 거부 — 콘솔에서 수동으로 `gtag('consent','default',{...granted})`를 먼저 호출해도
  변화 없음
- Service Worker — 프로젝트에 서비스 워커 자체가 없음
- GA4 속성/스트림 설정 — 데이터 필터, 동의 설정("이 속성에서 감지된 문제 없음") 모두 정상

### 4. GA4 Measurement Protocol 직접 검증 — 속성은 완전히 정상

브라우저를 완전히 배제하기 위해 서버(이 세션)에서 GA4 Measurement Protocol로 직접 이벤트를 전송했다.

```bash
curl -X POST "https://www.google-analytics.com/mp/collect?measurement_id=G-08DYYZDY6D&api_secret=..." \
  -d '{"client_id":"555.123","events":[{"name":"server_side_debug_test","params":{"debug_mode":1}}]}'
# → HTTP 204
```

GA4 실시간 보고서에 해당 이벤트가 즉시(활성 사용자 1명, `server_side_debug_test` 1건) 반영됨을
확인했다. **이로써 측정 ID·속성·스트림·필터·동의 설정 전부 정상이며, 문제는 100% 브라우저의
`gtag.js` 클라이언트 쪽 전송 실패로 좁혀졌다.**

### 5. 순정 `gtag.js` 스니펫 A/B 테스트 — 결정적 단서

`debug/vanilla-gtag-test` 브랜치에서 Google이 제공하는 기본 스니펫을 `app/layout.tsx`의 `<head>`에
그대로(동의 여부와 무관하게, 페이지 로드 즉시) 삽입해 배포·비교했다.

- **순정 스니펫**: `collect` 요청 정상 발생 (사용자 실제 브라우저에서 확인)
- **기존 앱 코드**: 동일 배포 사이트에서 `collect` 요청 미발생

두 코드의 핵심 차이는 다음과 같았다:

| | 순정 스니펫 | 기존 앱 코드 |
|---|---|---|
| 스크립트 로드 시점 | 페이지 로드 즉시, 무조건 | 동의 완료 후에만 |
| `config` 호출 | 로드 즉시 (`send_page_view` 기본값) | 동의 이후, `send_page_view: false` |
| 실제 히트 발생 방식 | `config`의 자동 page_view | 별도 `event` 수동 push |

## 근본 원인

`gtag.js` 로드 및 `config` 호출을 **동의 완료 시점까지 지연**시키는 기존 구조가 실제 배포
환경(Cloudflare Workers + Next.js `next/script`)에서 `collect` 전송 자체를 무발생시키는 것으로
재현·확정됐다. 정확한 내부 메커니즘(Google 서버 또는 `gtag.js` 내부 로직)까지는 특정하지 못했으나,
"스크립트를 늦게 주입하고 수동으로 이벤트를 push하는" 조합이 실패 조건이라는 것은 A/B 테스트로 명확히
검증됐다.

Google이 공식 권장하는 패턴은애초에 "동의 전 스크립트 미로드"가 아니라 **"스크립트는 항상 즉시 로드하고,
Consent Mode 신호(`gtag('consent', ...)`)로 수집 여부를 제어"**하는 방식이다. 기존 구현은 이 권장
패턴에서 벗어나 있었다.

## 조치

### 커밋 이력 (`main` 브랜치, 병합·푸시 완료)

1. `0641f1b` — 디버그용 순정 `gtag.js` 스니펫 추가 (진단 목적, 이후 제거됨)
2. `03b9fab` — `fix(analytics): load gtag.js unconditionally and gate collection via Consent Mode`
   - [`app/layout.tsx`](../../app/layout.tsx): 디버그 스니펫 제거
   - [`lib/analytics/ga4.ts`](../../lib/analytics/ga4.ts): `initializeAnalytics`가 `gtag('consent',
     'default', {...})`를 먼저 호출하도록 변경, `updateAnalyticsConsent` 함수 추가
   - [`components/analytics/AnalyticsProvider.tsx`](../../components/analytics/AnalyticsProvider.tsx):
     `<Script>`를 동의 여부와 무관하게 항상 렌더링. 동의 선택 시 `gtag('consent','update',...)`만 호출.
     동의 철회 시 페이지 새로고침하던 임시 로직 제거(더 이상 스크립트를 조건부 마운트하지 않으므로 불요)

### 로컬에 남아있는 미커밋 수정 (⚠️ 아직 `main`에 반영되지 않음)

`AnalyticsProvider.tsx`의 `<Script>`/`AnalyticsPageTracker`가 항상 마운트되도록 바뀌면서, 동의가
"granted"로 바뀌는 시점에 `AnalyticsPageTracker`의 effect가 다시 실행되지 않아(의존성이 `pathname`
뿐이라) `page_view` 이벤트가 누락되는 회귀가 로컬 테스트에서 발견됐다. `consent`를 prop으로 받아 effect
의존성 배열에 추가해 동의 전환 시점에도 `page_view`가 발행되도록 수정했고, 로컬(`localhost`, Claude
Browser 도구)에서 `dataLayer` 순서(`consent default` → `js` → `config` → `consent update` →
`event/page_view`)가 정상임을 확인했다. **단, 이 로컬 브라우저 도구 자체가 분석 도메인으로의 실제
네트워크 전송을 검증할 수 없는 환경으로 보여, 실제 `collect` 발생 여부는 배포 후 재확인이 필요하다.**

## 검증 상태

| 항목 | 상태 |
|---|---|
| GA4 속성/측정 ID/스트림 정상 | ✅ 확인 (Measurement Protocol 직접 테스트) |
| `dataLayer` 큐 순서 (consent → config → event) | ✅ 확인 (로컬) |
| 배포 사이트에서 실제 `collect` 요청 발생 | ⏳ 미확인 (Consent Mode 리팩터 이후 재검증 필요) |
| `page_view` 타이밍 회귀 수정 | ⏳ 로컬 수정 완료, 커밋/푸시 대기 중 |

## 남은 작업

1. `AnalyticsPageTracker` 의 `page_view` 타이밍 수정(consent prop 추가분)을 커밋하고 `main`에
   병합·푸시한다.
2. 배포 완료 후 `https://www.talktheme.shop`에서 동의 → 콘솔에서 아래 두 가지를 재확인한다.
   - `window.dataLayer`에 `event/page_view`가 올바른 순서로 포함되는지
   - `performance.getEntriesByType('resource')`에 `google-analytics`/`collect` 관련 항목이 실제로
     나타나는지 (네트워크 탭이 beacon 요청을 놓칠 수 있어 이 API가 더 신뢰도 높음)
3. 실제 전송이 확인되면 GA4 실시간 보고서에서도 최종 확인한다.
4. 진단용으로 만든 GA4 측정 프로토콜 API 비밀번호(`debug-test-secret`)를 GA4 관리자 화면에서 삭제한다
   (데이터 스트림 → talktheme → 측정 프로토콜 API 비밀번호).

## 후속 구현 (로컬 작업, 2026-07-11)

- Consent Mode 기본값이 외부 `gtag.js`보다 먼저 등록되도록 루트 `<head>`의 단일 인라인 부트스트랩으로
  이동했다. 기본값과 `config`를 큐에 넣은 직후 같은 부트스트랩이 async `gtag.js`를 생성하므로 Next.js의
  태그 재정렬 영향을 받지 않으며, `send_page_view: false`를 유지한다.
- 동의 전환 시 현재 경로의 `page_view`를 한 번 보내고, 거부·철회 후에는 제품 이벤트를 차단한다.
- 분석 이벤트 이름과 필수 파라미터를 타입 계약으로 제한했다. `template_key`·`template_source`·`platform`
  문맥을 세션에 유지해 편집·저장·내보내기·결제 퍼널을 같은 템플릿 기준으로 비교할 수 있게 했다.
- 이 변경은 아직 배포 검증 전이다. 위 남은 작업 중 배포 `collect`/DebugView 확인과 진단용 비밀번호 삭제는
  계속 유효하다.
