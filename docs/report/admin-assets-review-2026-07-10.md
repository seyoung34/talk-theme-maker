# AdminAssetsClient 코드 리뷰 보고서

> 종류: 코드 리뷰 스냅샷 (특정 시점 진단). 상태 전환 대상 아님.
> 대상: [`components/admin/AdminAssetsClient.tsx`](../../components/admin/AdminAssetsClient.tsx)
> 리뷰 일자: 2026-07-10
> 후속 계획: [../plans/in-progress/admin-assets-optimization-plan.md](../plans/in-progress/admin-assets-optimization-plan.md)

## 범위

관리자가 이미지 후보(에셋)를 추가·수정·삭제하는 `/admin/assets` 화면의 클라이언트 컴포넌트를 대상으로,
성능·로직 정합성·UX·코드 정리 관점에서 진단한다. 특정 시점의 코드 상태를 기록한 문서이며, 실제 개선은
후속 계획 문서에서 다룬다.

## 요약

- 목록 렌더 경로에서 동일 연산이 매 렌더 반복되고, `useMemo` 체인이 참조 불안정으로 사실상 무효화된다.
- 목록 새로고침에 요청 취소가 없어 종류/슬롯 빠른 전환 시 오래된 응답이 최신 목록을 덮어쓸 수 있다.
- 삭제·저장 후 목록을 첫 페이지로 리셋해, 페이지네이션으로 펼쳐 본 상태가 사라진다.
- 파일 형식·용량 검증이 얕아 비허용 형식·초대형 이미지가 분석/저장 경로로 넘어간다.
- 삭제 확인·알림이 나머지 Radix 기반 UI와 무드가 어긋난다.

## 1. 성능 — 렌더마다 중복 연산

### 1-1. `visibleAssets`가 `useMemo` 밖에 있어 `filteredAssets` 캐시가 무효화

- 위치: [AdminAssetsClient.tsx:67](../../components/admin/AdminAssetsClient.tsx#L67)
- `visibleAssets`는 매 렌더마다 `assets.filter(...)`로 **새 배열**을 만든다. 이 배열이 아래
  `filteredAssets` `useMemo`의 의존성이라, 참조가 매번 바뀌어 `useMemo`를 걸어둬도 캐시가 되지 않는다.
- `isAdminAssetVisibleForAdminSlot`은 `targets` 순회 + `isAdminAssetRecommendedForSlot` 호출을 포함해
  가볍지 않다. 목록이 커질수록 비용이 선형으로 누적된다.
- 개선 방향: `visibleAssets`를 `useMemo(..., [assets, selectedSlot])`로 감싸 `useMemo` 체인을 복원한다.

### 1-2. `getAdminAssetGuidance`(warnings) 이중 계산

- 위치: 필터 단계 [71](../../components/admin/AdminAssetsClient.tsx#L71), 렌더 단계 [551](../../components/admin/AdminAssetsClient.tsx#L551)
- 같은 warnings를 필터 계산에서 한 번, 카드 렌더에서 `AdminAssetCard`에 넘기려고 또 한 번 계산한다.
  카드 N개 × 2회.
- 개선 방향: `filteredAssets`를 `{ asset, warnings }` 형태로 한 번만 계산해 카드에 그대로 전달한다.
  연산 절반 감소 + 판정 로직 단일화.

## 2. 로직 · 정합성 버그

### 2-1. `refreshAssets` race condition

- 위치: 트리거 [120](../../components/admin/AdminAssetsClient.tsx#L120), 본체 [138](../../components/admin/AdminAssetsClient.tsx#L138)
- `assetKind`/`selectedSlot.role` 변경 시 `refreshAssets`를 호출하지만, 이미지 분석
  effect([97](../../components/admin/AdminAssetsClient.tsx#L97))와 달리 **취소 플래그가 없다.**
- 종류·슬롯을 빠르게 전환하면 여러 요청이 병렬 진행되고, 늦게 시작한 요청이 먼저 끝난 오래된 응답을
  덮어써 목록이 현재 선택과 어긋날 수 있다.
- 개선 방향: effect 내부 `cancelled` 플래그 또는 요청 시퀀스 토큰으로 마지막 요청만 반영한다.

### 2-2. 삭제·저장 후 목록이 첫 페이지로 리셋 (UX 후퇴)

- 위치: 저장 [185](../../components/admin/AdminAssetsClient.tsx#L185), 삭제 [202](../../components/admin/AdminAssetsClient.tsx#L202)
- 두 흐름 모두 종료 시 `refreshAssets()`를 커서 없이 호출한다. "에셋 더 보기"로 여러 페이지를 펼쳐 본
  상태에서 항목 하나를 지우면 목록이 처음 24개로 되돌아간다.
- 개선 방향: 삭제는 로컬 state에서 해당 항목만 제거(낙관적 업데이트), 저장은 첫 페이지 prepend 또는 부분 갱신.

### 2-3. 파일 형식·용량 검증 부재

- 위치: 붙여넣기 [126](../../components/admin/AdminAssetsClient.tsx#L126), 드롭 [212](../../components/admin/AdminAssetsClient.tsx#L212), 파일선택 [402](../../components/admin/AdminAssetsClient.tsx#L402)
- 세 경로 모두 `type.startsWith("image/")`만 확인한다. `<input accept>`는 png/jpeg/webp지만 드롭·붙여넣기로는
  gif·svg·bmp가 통과하고, **용량 상한이 없어** 초대형 이미지가 `analyzeImageFile`(캔버스 로드)과 서버 저장으로
  그대로 넘어간다.
- 개선 방향: MIME 화이트리스트 + `maxSize` 체크 후 거절 사유를 사용자에게 피드백.

## 3. UX 개선

### 3-1. 삭제 확인이 `window.confirm`

- 위치: [196](../../components/admin/AdminAssetsClient.tsx#L196)
- 나머지 UI는 전부 Radix Dialog인데 삭제만 브라우저 기본 팝업이라 무드가 깨진다.
- 개선 방향: [`components/layout/SiteHeader.tsx`](../../components/layout/SiteHeader.tsx)의 로그아웃 확인 다이얼로그
  패턴을 재사용해 커스텀 확인 다이얼로그로 통일한다.

### 3-2. `notice`가 자동으로 사라지지 않음

- 위치: [248](../../components/admin/AdminAssetsClient.tsx#L248)
- 타이머 clear가 없어 이전 알림이 헤더에 계속 남는다.
- 개선 방향: 성공/실패 색 구분 + auto-dismiss(3~4초) 토스트.

### 3-3. 에셋 종류 선택 UI 이중화

- 위치: 사이드바 버튼 [260](../../components/admin/AdminAssetsClient.tsx#L260), 패널 내 `<select>` [339](../../components/admin/AdminAssetsClient.tsx#L339)
- 두 컨트롤이 같은 `assetKind` 상태를 조작해 조작 지점이 분산되고 혼란스럽다.
- 개선 방향: 한쪽으로 통일하거나 역할을 분리한다.

## 4. 코드 정리 (사소)

- **종류 배열 중복**: 상수 `assetKindOrder`([33](../../components/admin/AdminAssetsClient.tsx#L33))와 select의 하드코딩
  배열([340](../../components/admin/AdminAssetsClient.tsx#L340))이 동일 → 상수 재사용(DRY).
- **`formatAdminAssetTargets` / `formatAdminAssetTargetInput`** 의 platformLabel 계산 중복 → 헬퍼 하나로.
- **드롭존 접근성**: `tabIndex={0}`([353](../../components/admin/AdminAssetsClient.tsx#L353))인데 `role`/`aria-label`이 없고
  키보드(Enter/Space)로 파일 선택이 트리거되지 않는다.

## 우선순위

| 순위 | 항목 | 근거 |
|---|---|---|
| 1 | 1-1 `visibleAssets` memo화 | 목록이 커질수록 렌더 비용 직접 절감, 변경 범위 작음 |
| 2 | 2-1 race condition | 실제 데이터 꼬임 버그 |
| 3 | 2-2 낙관적 업데이트 | 체감 UX 후퇴 해소 |
| 4 | 2-3 파일 검증 | 안정성/저장 실패 예방 |
| 5 | 3-1·3-2 확인·알림 UI | 완성도·일관성 |
| 6 | 1-2 warnings 단일화 + 4장 정리 | 유지보수성 |

## 다음 단계

본 진단을 기반으로 한 단계별 구현 계획은
[../plans/in-progress/admin-assets-optimization-plan.md](../plans/in-progress/admin-assets-optimization-plan.md)에서 다룬다.
