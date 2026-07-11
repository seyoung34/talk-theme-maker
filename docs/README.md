# docs 인덱스

문서를 어디에 두고 언제 상태를 바꾸는지는 [AGENTS.md](AGENTS.md)를 따른다. 이 파일은 목록만 관리한다.
문서를 추가/이동/상태 전환할 때는 이 인덱스도 같은 커밋에서 갱신한다.

## architecture — 설계 · 흐름 (상태 무관, 상시 참조)

| 문서 | 내용 |
|---|---|
| [architecture/roadmap.md](architecture/roadmap.md) | 제품 정의, 핵심 가치, 현재 상태 개요 |
| [architecture/theme-architecture.md](architecture/theme-architecture.md) | 테마 데이터 모델(Template/Platform/Section/...)·폴더 구조 설계 |
| [architecture/ux-flow.md](architecture/ux-flow.md) | `/template` → `/edit` 사용자 흐름 |

## setup — 환경 구성

| 문서 | 내용 |
|---|---|
| [setup/supabase-setup.md](setup/supabase-setup.md) | Supabase 환경변수·DB 설정 |

## report — 코드 리뷰 · 진단 스냅샷 (특정 시점 기록)

| 문서 | 내용 |
|---|---|
| [report/admin-assets-review-2026-07-10.md](report/admin-assets-review-2026-07-10.md) | `AdminAssetsClient` 성능·정합성·UX 진단 (후속: admin-assets-optimization-plan) |
| [report/project-importer-client-refactor-2026-07-10.md](report/project-importer-client-refactor-2026-07-10.md) | `ProjectImporterClient`(2007줄) 구조·상태·성능·UX 진단 + 8단계 점진적 분해 로드맵 |
| [report/ga4-introduction-plan-2026-07-11.md](report/ga4-introduction-plan-2026-07-11.md) | GA4 출시 전 도입 기획 — 동의 기반 익명 수집, 일간 퍼널·템플릿/플랫폼 대시보드, 에셋 분석 확장 |

## notes — 형식 없는 메모

[notes/scratch.md](notes/scratch.md) — 그때그때 떠오른 아이디어·가벼운 TODO. 분류/상태 규칙 대상 아님
(자세한 건 [AGENTS.md](AGENTS.md#notes--형식-없는-메모) 참조). 내용이 자주 바뀌므로 이 인덱스에 개별
항목을 나열하지 않는다.

## plans/planned — 기획 확정, 구현 착수 전

| 문서 | 상태 |
|---|---|
| [plans/planned/easy-guide-plan.md](plans/planned/easy-guide-plan.md) | 이미지 중심 "쉬운 가이드" 기획 확정. 스크린샷/GIF 에셋 준비 후 구현 착수 예정 |
| [plans/planned/system-template-lineup-plan.md](plans/planned/system-template-lineup-plan.md) | 첫인상·완성 경험용 시스템 템플릿(basic+overrides 8종)·에셋 팩 라인업. 활성화(Aha) 레버, 무료 스타터 3종부터 |

## plans/in-progress — 구현 진행중

| 문서 | 상태 |
|---|---|
| [plans/in-progress/color-picker-ux-improvement-plan.md](plans/in-progress/color-picker-ux-improvement-plan.md) | 공용 컬러 피커 Phase 1·2 구현 완료. 반응형·접근성 및 실기기 검증 진행 예정 |
| [plans/in-progress/android-build-cloud-run-plan.md](plans/in-progress/android-build-cloud-run-plan.md) | 비동기 Cloud Run Job 빌드 오프로딩은 완료. Cloudflare Pages 이전(Phase 3) 착수함 — 아래 문서 참조 |
| [plans/in-progress/cloud-run-apk-builder-dev.md](plans/in-progress/cloud-run-apk-builder-dev.md) | Cloud Run Job 빌드 오프로딩 마일스톤 1~4차 완료(실기기 검증 포함). 남은 것: `apk-zip`/`project` 비동기화(3.7) + 후속 튜닝 |
| [plans/in-progress/cloudflare-workers-opennext-migration-plan.md](plans/in-progress/cloudflare-workers-opennext-migration-plan.md) | Cloudflare Workers(OpenNext) 이전. CF-0~CF-2 완료, CF-3 자체 OIDC/JWKS 코드 반영 중. 남은 것: Cloudflare Secret/env 등록, GCP WIF provider 생성, STS/impersonation 실측 검증 |
| [plans/in-progress/project-importer-refactor-plan.md](plans/in-progress/project-importer-refactor-plan.md) | `ProjectImporterClient` 점진적 분해. R1~R6 완료, R7~R8 진행 예정 |
| [plans/in-progress/service-growth-plan.md](plans/in-progress/service-growth-plan.md) | GA4 기반 성장 기획. Phase 1 동의 기반 수집·크레딧 벽/결제/코드 리딤 퍼널과 인스타그램 프로모션을 구현 중 |

## plans/done — 구현·검증 완료

| 문서 | 내용 |
|---|---|
| [plans/done/admin-assets-optimization-plan.md](plans/done/admin-assets-optimization-plan.md) | `AdminAssetsClient` 성능·정합성·검증·UX 개선 Phase 1~5 구현 및 `/admin/assets` 실사용 QA 완료 |
| [plans/done/android-export-413-plan.md](plans/done/android-export-413-plan.md) | Android/iOS 내보내기 413(payload 초과) 수정 완료 — 실기기 검증까지 확인 |
| [plans/done/export-loading-ui-plan.md](plans/done/export-loading-ui-plan.md) | edit 창 내보내기 사전 준비 상태 UI 구현 완료 — 준비/제출 상태 분리, 다이얼로그 선오픈, 실패 재시도 및 로컬 검증 완료 |
| [plans/done/migration-plan.md](plans/done/migration-plan.md) | Vite → Next.js App Router 마이그레이션 완료 기록 |
