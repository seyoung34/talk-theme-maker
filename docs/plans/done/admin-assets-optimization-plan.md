# AdminAssetsClient 최적화 · UX 개선 계획

> 상태: Phase 1~5 구현 및 로컬 자동 검증(`npx tsc --noEmit`·`npm run check:text`) 완료, `/admin/assets` 실사용 수동 QA 확인 완료. 후속 과제: `notice` 성공/실패 색 구분(범위 밖으로 분리, 아래 Phase 4 참조).
> 참고: 진단 근거 → [../../report/admin-assets-review-2026-07-10.md](../../report/admin-assets-review-2026-07-10.md)

## 목적

관리자가 이미지 후보를 추가·관리하는 `/admin/assets` 화면의 **렌더 성능**, **목록 데이터 정합성**,
**조작 UX**를 개선한다. 관리자가 종류·슬롯을 자주 오가고 다수 후보를 다뤄도 목록이 어긋나지 않고,
삭제·저장 후에도 작업 맥락(스크롤·페이지)이 유지되어야 한다.

## 근거와 문제

상세 진단은 [코드 리뷰 보고서](../../report/admin-assets-review-2026-07-10.md)에 있다. 핵심만 요약한다.

1. `visibleAssets`가 `useMemo` 밖이라 `filteredAssets` 캐시가 매 렌더 무효화된다.
2. 목록 warnings(`getAdminAssetGuidance`)를 필터·렌더 단계에서 이중 계산한다.
3. `refreshAssets`에 요청 취소가 없어 빠른 전환 시 오래된 응답이 최신 목록을 덮어쓴다.
4. 삭제·저장 후 목록이 첫 페이지로 리셋되어 펼쳐 본 상태가 사라진다.
5. 파일 형식·용량 검증이 얕아 비허용 형식·초대형 이미지가 분석/저장으로 넘어간다.
6. 삭제 확인(`window.confirm`)·알림(`notice`)이 나머지 Radix UI와 무드가 어긋난다.

## 구현 계획

### Phase 1 — 렌더 성능 (저위험, 우선)

- [x] `visibleAssets`를 `useMemo(..., [assets, selectedSlot])`로 감싸 `filteredAssets` `useMemo` 체인을 복원한다.
- [x] `filteredAssets`를 `{ asset, warnings }` 형태로 한 번만 계산하고, `AdminAssetCard`에는 계산된 warnings를
      그대로 전달해 렌더 단계의 중복 `getAdminAssetGuidance` 호출을 제거한다.
- 완료 기준: 목록 렌더 경로에서 asset당 `getAdminAssetGuidance` 호출이 1회로 줄고, `assets`/`selectedSlot`이
  바뀌지 않는 리렌더에서 `filteredAssets`가 재계산되지 않는다.

### Phase 2 — 목록 데이터 정합성

- [x] `refreshAssets`를 호출하는 effect에 `cancelled` 플래그(또는 요청 시퀀스 토큰)를 도입해 마지막 요청만
      state에 반영한다.
- [x] 삭제를 낙관적 업데이트로 바꾼다: 성공 시 로컬 `assets`에서 해당 항목만 제거하고 커서·페이지 상태를 유지한다.
- [x] 저장 성공 후 전체 리셋 대신 첫 페이지 prepend(또는 부분 갱신)로 방금 추가한 후보가 현재 목록 맥락에서
      보이게 한다.
- 완료 기준: 종류/슬롯을 빠르게 전환해도 목록이 현재 선택과 일치하고, 여러 페이지를 펼친 상태에서 삭제·저장해도
  스크롤·페이지 맥락이 유지된다.

### Phase 3 — 입력 검증

- [x] 드롭·붙여넣기·파일선택 공통 검증 함수를 만들어 MIME 화이트리스트(png/jpeg/webp)와 `maxSize` 상한을 적용한다.
- [x] 거절 시 사유(형식/용량)를 알림으로 사용자에게 피드백한다.
- 완료 기준: 비허용 형식·상한 초과 파일이 `analyzeImageFile`·저장 경로에 진입하지 않고, 거절 사유가 화면에 표시된다.

### Phase 4 — 조작 UX 일관화

- [x] 삭제 확인을 `window.confirm`에서 커스텀 Radix Dialog로 교체한다
      ([`SiteHeader.tsx`](../../../components/layout/SiteHeader.tsx) 로그아웃 확인 패턴 재사용).
- [x] `notice`에 auto-dismiss(3.5초)를 적용한다.
- [ ] (후속) `notice`를 성공/실패 색 구분이 가능한 구조로 리팩터한다 — 현재 `string` 단일 상태를 tone 포함 객체로
      바꿔야 하고 호출부가 많아, 본 계획에서는 분리한다.
- 완료 기준: 삭제 확인 UI가 나머지 화면과 동일한 Radix Dialog 무드를 따르고, 알림이 3.5초 후 자동으로 사라진다.

### Phase 5 — 코드 정리 (선택)

- [x] 종류 배열을 `assetKindOrder` 상수로 단일화(select 하드코딩 배열 제거).
- [x] `formatAdminAssetTargets`/`formatAdminAssetTargetInput`의 platformLabel 계산을 공용 헬퍼로 통합.
- [x] 드롭존에 `role`/`aria-label` 및 키보드(Enter/Space)로 파일 선택 트리거를 추가한다.
- 완료 기준: 종류 배열 정의가 한 곳이고, 드롭존을 키보드로 조작할 수 있다.

## 검증 명령

- `npx tsc --noEmit` (TypeScript 로직 변경)
- `npm run check:text` (한국어 UI 텍스트 변경 시)
- `/admin/assets`에서 종류·슬롯 빠른 전환, 다중 페이지 로드 후 삭제·저장, 비허용/대용량 파일 업로드 수동 검증

## 범위 밖

- 서버측 에셋 저장 API·스키마 변경 (본 계획은 클라이언트 컴포넌트 한정)
- 다중 선택 일괄 삭제, 정렬 옵션 등 신규 기능 (성능·정합성 안정화 후 별도 계획으로 분리)
- `InlineBubbleAdjuster`·`ImageEditDialog` 내부 로직 개선
