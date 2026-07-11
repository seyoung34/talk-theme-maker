# 서비스 성장 분석 기획 — GA4 기반

GA4 도입 문서가 "동의 기반 익명 수집 인프라"를 다룬다면, 이 문서는 그 위에서 **무엇을 성장시킬지와
어떻게 측정·판단할지**를 다룬다. 즉 관측(observability)이 아니라 성장(growth) 기획이다.

> 상태: Phase 1(동의 기반 GA4·출시 프로모션/결제 퍼널) 구현 진행 중. DebugView 검증과 실제 인스타그램 코드 발급이 남아 있다.
> 참고: GA4 수집 인프라·프라이버시 원칙 → [../../report/ga4-introduction-plan-2026-07-11.md](../../report/ga4-introduction-plan-2026-07-11.md)

## 배경과 문제의식

기존 GA4 문서의 퍼널은 `template_viewed → template_started → editor_ready → export_completed`에서
끝난다. 그러나 이 제품은 **크레딧 소비형**이다.

- 내보내기는 크레딧을 예약·소비한다(`reserveCreditForExport` → `completeExportJob`, 부족 시 `insufficient_credits` 402).
- 충전 경로: PayApp 결제(`billing/payapp`)와 코드 리딤(`credits/redeem`).

따라서 성장의 핵심 루프인 **"내보내기 시도 → 크레딧 부족 → 충전/리딤 → 재시도 → 완료"** 와
**유입 채널 → 유료 전환**이 현재 측정 밖에 있다. 이 문서는 그 공백을 성장 관점에서 메운다.

프라이버시·동의 게이팅·PII 배제 원칙은 GA4 도입 문서를 그대로 상속한다. 아래 신규 이벤트도
모두 동의 후에만, 개인 식별 정보·결제 식별자 없이 수집한다.

## North Star Metric와 KPI 트리

- **North Star: 주간 내보내기 완료 수(WEC, Weekly Export Completions). — 확정.**
  제품 가치가 실현되는 순간이자 크레딧 소비(=매출)와 직접 연결된다. 초기 성장·PMF 검증기에는
  무료 완성 경험까지 포함해 "가치를 주는지"부터 키운다. 유료 전환율·ARPPU는 아래 KPI 트리의
  Revenue 단계에서 하위 지표로 나란히 추적하고, 수익화기 진입 시 North Star 무게 이동을 재검토한다(Phase 3).
- 성장 레버는 AARRR로 정리한다.

| 단계 | 핵심 지표 | 대표 이벤트 |
|---|---|---|
| Acquisition(획득) | 채널별 세션, 랜딩 진입 | `session_start` + UTM/`landing_page` |
| Activation(활성화) | 에디터 도달률, 첫 세션 편집 시작률("Aha") | `editor_ready`, `slot_upload_completed` |
| Retention(리텐션) | 재방문·프로젝트 재개, D1/D7/D30 | `project_resumed`, 신규/재방문 세그먼트 |
| Revenue(매출) | 유료 전환율, ARPPU, 크레딧 벽 이탈률 | `purchase`, `export_blocked_insufficient_credits` |
| Referral(추천) | 공유 발생·공유 유입 | `theme_shared`(도입 시) |

첫 내보내기가 유료이므로 "Aha 순간"을 첫 세션의 `export_completed`로 두면 결제 장벽과 제품 가치 확인이
섞인다. 초기 활성화 기준은 **첫 세션의 `editor_ready` 도달**로 두고, `export_completed`는 유료 전환과
가치 실현 지표로 별도 관측한다.

## 측정 설계 보완 (신규 이벤트)

GA4 도입 문서의 기존 이벤트 표에 아래를 추가한다.

### 수익화 퍼널 (최우선)

| 단계 | 이벤트 | 파라미터 |
|---|---|---|
| 크레딧 부족으로 내보내기 차단 | `export_blocked_insufficient_credits` | `platform`, `export_mode`, `credits_remaining` |
| 충전 화면 진입 | `credit_purchase_viewed` | `entry_point`(export_block/menu), `provider` |
| 결제 시작 | `begin_checkout` | `provider`(payapp), `items`, `value`, `currency` |
| 결제 완료 | GA4 표준 `purchase` | `transaction_id`(분석 전용 UUID), `items`, `value`, `currency` |
| 코드 리딤 완료 | `credit_redeem_completed` | `credits_granted`, `source`(안정 캠페인 키 또는 direct) |

- `purchase`는 GA4 표준 스키마(`transaction_id`, `items`, `value`, `currency`)로 보내 수익 리포트를 그대로 활용한다.
- `transaction_id`는 DB가 생성한 분석 전용 UUID다. 결제 ID·주문번호·PG 거래번호와 분리해 중복을 막는다.
- **결제 금액·상품 키만 보내고 카드·주문번호·PG 원문 응답·실제 거래 식별자는 GA에 보내지 않는다.**
  실패는 코드화된 `failure_reason`만 기록한다(기존 원칙 상속).

### 유입(Acquisition)

- UTM(`utm_source/medium/campaign`) 수집 규칙을 정하고, `landing_page`와 `referrer`(**호스트만**,
  쿼리스트링 제거)를 맞춤 측정기준으로 등록한다.
- 채널별로 시작률 → 내보내기 완료율 → 유료 전환율까지 연결해 본다.

### 리텐션(Retention)

- `project_resumed`: 저장된 프로젝트를 다시 여는 흐름. 신규/재방문 세그먼트와 함께 재개율을 본다.
- GA4 코호트 탐색으로 D1/D7/D30, 주간 리텐션을 관측한다.

### 이탈·성능 신호

- 각 퍼널 단계 도달 후 무행동 이탈, `export_failed`의 `failure_reason` 분포를 이탈 사유로 연결한다.
- 이미 코드에 있는 내보내기 `durationMs`와 Core Web Vitals(LCP/INP/CLS)를 수집해
  **"느린 세션의 완료율 저하"** 를 관측한다(성능 = 전환).

## 운영 대시보드 확장

GA4 도입 문서의 일간 대시보드에 아래를 더한다.

1. **수익화 퍼널**: 내보내기 시도 → 크레딧 벽 → 충전 진입 → 결제 완료, 단계별 이탈률.
2. **유료 전환**: 채널별 유료 전환율, PayApp 결제 완료율, ARPPU.
3. **North Star(WEC)** 추이와 신규/재방문 기여 분해.
4. **리텐션 코호트**: 주간 코호트 D1/D7/D30, 프로젝트 재개율.
5. **활성화**: 첫 세션 내보내기 도달률(Aha), 유입 채널별 활성화율.

각 지표에는 **초기 목표치/벤치마크를 함께 기입**해 대시보드가 "보는 도구"가 아니라 "판단 도구"가
되게 한다(목표치는 출시 후 2주 실측으로 1차 캘리브레이션).

## 거버넌스 추가 원칙

GA4 도입 문서의 원칙을 상속하고, 결제 관련만 명시적으로 덧붙인다.

- 결제 이벤트는 금액·통화·상품 키와 분석 전용 UUID만 보낸다. 카드/계좌/주문번호/PG 응답 원문·실제 거래 식별자는 제외한다.
- `referrer`는 호스트만 저장하고 쿼리스트링·경로는 버린다(유입 페이지 내 PII 유출 방지).
- UTM 값은 마케팅이 정의한 안정 키만 허용하고 자유 입력 텍스트를 그대로 싣지 않는다.

## 단계별 로드맵

- [ ] **Phase 1A — 출시 전, 분석 기반**: 동의 게이팅 + 페이지뷰 + 핵심 행동 퍼널 + 유입 채널(UTM/랜딩).
- [ ] **Phase 1B — 출시 전, 수익화·프로모션**: 크레딧 벽 → `/credits?returnTo=/edit` → 결제/코드 리딤 → 편집 복귀를 연결한다. `payments.analytics_transaction_id`와 GA4 `begin_checkout`/`purchase`/리딤 이벤트를 추가하고, 개인 인스타그램용 코드를 총 30회·코드별 계정당 1회·발급 뒤 7일로 만든다.
- [ ] **Phase 2 — 출시 직후**: 리텐션/재개 + North Star 대시보드 + 목표치 1차 캘리브레이션.
- [ ] **Phase 3 — 성장기**: 관리형 에셋 포함률, 세그먼트별 코호트, 공유/바이럴, 실험 프레임워크(이벤트 스키마 사전 설계). North Star를 유료 전환 중심으로 옮길지 재검토.

## 완료 기준

- 수익화 퍼널 이벤트(`export_blocked_insufficient_credits` → `begin_checkout`/`purchase` 또는 리딤)가 중복·누락 없이 수집된다.
- 운영자가 대시보드에서 **채널별 유료 전환율과 North Star(WEC) 추이**를 확인할 수 있다.
- 첫 세션 내보내기 도달률(Aha)과 주간 리텐션 코호트를 확인할 수 있다.
- 결제·개인 식별 정보(카드/주문번호/PG 원문)가 이벤트 payload에 포함되지 않는다.
- Phase 2 지표에 초기 목표치가 부여되어 대시보드에서 실측과 비교된다.

## 다음 단계

1. (구현 중, Phase 1B) 크레딧 벽·`billing/*`·`credits/redeem` 경로에 수익화 이벤트 연결 → `purchase` 표준 스키마 매핑.
2. (운영 준비) 발급 코드의 해시를 DB에 등록한다: 총 30회, 사용자별 한 번, 발급 시점부터 7일. 인스타그램 링크에는 원문 코드가 아닌 `campaign=instagram_personal_launch`만 넣는다.
3. (검증) DebugView에서 동의 전 무수집, 크레딧 부족→충전/리딤→`/edit` 복귀, `purchase` 중복 방지와 payload의 PII 미포함을 확인한다.
