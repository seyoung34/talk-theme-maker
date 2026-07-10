# GA4 도입 기획 보고서

> 종류: 출시 전 분석 수집·운영 계획. 상태 전환 대상 아님.
> 작성일: 2026-07-11
> 대상: `/template` → `/edit` → 저장·내보내기 흐름

## 목적

서비스 개시 전 Google Analytics 4(GA4) 수집 기반을 마련한다. 첫 목표는 제품 개선 실험이 아니라,
**쿠키 동의한 익명 사용자의 일간 이용 흐름과 템플릿·플랫폼 성과를 안정적으로 관측**하는 것이다.
출시 후에는 관리형 에셋의 선택·내보내기 포함률까지 확장한다.

## 의사결정 요약

- 분석은 쿠키 동의 후에만 시작한다. 동의 전에는 GA 태그·페이지뷰·커스텀 이벤트를 실행하지 않는다.
- 로그인 User-ID, 이메일, 파일명, 업로드 이미지 URL, 자유 입력 텍스트, 오류 원문을 GA에 보내지 않는다.
- 기본 분석 단위는 익명 세션이다. 사용자 저장 템플릿은 개별 ID 대신 `user_template`으로 묶는다.
- 초기 운영 화면은 일간 대시보드와 템플릿·Android/iOS 비교다. 인기 에셋 분석은 관리형 에셋만 대상으로 2단계에서 추가한다.

GA의 Consent Mode는 동의 배너 자체가 아니라 배너의 선택을 태그에 전달하는 방식이다. 분석 쿠키에는
`analytics_storage` 동의가 필요하다. [Consent Mode 안내](https://support.google.com/analytics/answer/10000067?hl=en),
[동의 유형](https://support.google.com/analytics/answer/12334711?hl=en)

## 측정 설계

| 제품 단계 | 이벤트 | 전송 파라미터 |
|---|---|---|
| 템플릿 탐색 | `template_viewed` | `template_key`, `template_source` |
| 시작 선택 | `template_started` | `template_key`, `platform` |
| 에디터 준비 | `editor_ready` | `template_source`, `platform` |
| 슬롯 편집 완료 | `slot_upload_completed`, `candidate_selected`, `color_changed` | `slot_role`, `section`, `asset_source` |
| 말풍선 편집 완료 | `bubble_edit_completed` | `slot_role`, `edit_type` |
| 저장 완료 | `template_save_completed` | `save_mode`, `platform` |
| 내보내기 | `export_started`, `export_completed`, `export_failed` | `platform`, `export_mode`, `failure_reason` |

- 색상 입력 중 매 키 입력, 드래그 중간값 등은 전송하지 않고 선택 확정·업로드 완료·저장/내보내기 완료 시점만 기록한다.
- `template_key`는 기본/시스템 템플릿의 제한된 안정 키만 허용한다. 맞춤 측정기준으로는
  `platform`, `template_source`, `export_mode`, `slot_role`, `asset_source`를 우선 등록한다.
- GA4의 자동·향상 측정 외 제품 행동은 권장 또는 커스텀 이벤트를 명시적으로 설정해야 한다.
  [GA4 이벤트 설정](https://developers.google.com/analytics/devguides/collection/ga4/events?hl=en)

## 운영 대시보드

출시 후에는 GA4 탐색 보고서 또는 Looker Studio에서 아래를 일간 확인한다.

1. 동의 사용자 수와 세션 수, 플랫폼별 비중
2. `template_viewed → template_started → editor_ready → export_completed` 퍼널
3. 템플릿별 시작 수·내보내기 완료 수·완료율
4. Android/iOS별 저장·내보내기 성공률과 실패 사유
5. 슬롯 역할별 업로드·후보 선택 빈도

2단계에서는 관리형/관리자 에셋에만 `asset_key`를 추가해 선택 수와 실제 내보내기 포함률을 연결한다.
개인 업로드 에셋은 분석 대상에서 제외한다.

## 구현 및 검증 순서

1. GA4 속성과 웹 데이터 스트림을 만들고 `NEXT_PUBLIC_GA_MEASUREMENT_ID`로 측정 ID를 주입한다.
2. 쿠키 동의 UI와 로컬 동의 상태를 구현한다. 동의 철회 시 태그 로드와 이벤트 전송을 중지한다.
3. 동의 후에만 로드되는 GA 클라이언트와 공통 `trackEvent` 래퍼를 만든다.
4. 페이지 전환, 템플릿 시작, 에디터 준비, 저장, 내보내기 이벤트부터 연결한다.
5. 출시 전 GA DebugView에서 동의/비동의, Android/iOS, 성공/실패 흐름을 각각 확인한다.
6. 출시 후 2주간 이벤트 중복·누락과 파라미터 값의 개인정보 유입 여부를 점검한다.

## 데이터 거버넌스

- GA4 사용자·이벤트 수준 데이터 보관 기간은 14개월로 설정한다. 표준 GA4 속성의 선택지는 2개월과
  14개월이며, 이 설정은 탐색 및 퍼널 분석에 영향을 준다.
  [GA4 데이터 보관](https://support.google.com/analytics/answer/7667196?hl=en)
- GA를 법적 동의의 유일한 근거로 간주하지 않는다. 실제 배너 문구·동의 기록·개인정보 처리방침은
  운영 국가와 법률 자문에 맞춰 별도 확정한다.
- 실패 이벤트는 코드화된 `failure_reason`만 기록하며 API 응답·스택 트레이스는 보내지 않는다.

## 완료 기준

- 동의 전에는 GA 네트워크 요청과 분석 이벤트가 없다.
- 동의 후 핵심 퍼널 이벤트가 중복 없이 수집된다.
- 운영자가 일간 대시보드에서 플랫폼·템플릿별 시작/완료율을 확인할 수 있다.
- 사용자 이미지와 개인 식별 정보가 이벤트 payload에 포함되지 않는다.
