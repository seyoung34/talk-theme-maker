# ProjectImporterClient 리팩토링 · 개선 진단 보고서

> 종류: 코드 리뷰 스냅샷 (특정 시점 진단). 상태 전환 대상 아님.
> 대상: [`components/project/ProjectImporterClient.tsx`](../../components/project/ProjectImporterClient.tsx) (2007줄)
> 관련: [`hooks/useProjectExport.ts`](../../components/project/hooks/useProjectExport.ts), [`hooks/useProjectAutoColors.ts`](../../components/project/hooks/useProjectAutoColors.ts), [`hooks/useProjectAssetUploads.ts`](../../components/project/hooks/useProjectAssetUploads.ts), [`projectModel.ts`](../../components/project/projectModel.ts)
> 리뷰 일자: 2026-07-10
> 후속 계획: [../plans/planned/project-importer-refactor-plan.md](../plans/planned/project-importer-refactor-plan.md)

## 범위

`/edit`(및 관리자 `/edit`) 에디터를 총괄하는 `ProjectImporterClient`가 2007줄로 비대해져 코드 파악과
유지보수가 어렵다는 문제를 다룬다. 구조·상태 관리·성능·UX/접근성·버그 관점에서 진단하고, `AGENTS.md`의
"큰 파일은 전면 재작성이 아니라 좁은 패치·작은 추출" 원칙에 맞춘 **점진적 분해 로드맵**을 제시한다.

## 요약

- 메인 컴포넌트 함수 하나가 **약 1200줄**(100~1305), 그 안에 40개 이상의 `useState`, 20개 이상의 핸들러,
  6개의 인라인 다이얼로그가 뒤섞여 있다.
- 편집 도메인 상태(`uploads`/`colors`/`candidateSelections`/`bubble*`)가 개별 `useState`로 흩어져 있고,
  `state`와 `ref`를 **수동으로 이중 동기화**하는 코드가 버그 위험을 만든다.
- "슬롯을 드러내고 · 선택하고 · remote ref를 지우는" 동일 패턴이 6곳 이상 복붙되어 있다.
- 다이얼로그 구현 방식이 Radix와 수제 `fixed` div로 **혼재**해 포커스 트랩·Esc·접근성이 제각각이다.
- 파생값과 패널 JSX가 매 렌더 새로 생성되어 하위 패널의 불필요한 리렌더를 유발한다.
- `useProjectExport` 훅은 이미 잘 분리된 좋은 경계다 — **나머지 분해의 기준 패턴**으로 삼을 수 있다.

## 현황 지표

| 항목 | 값 | 비고 |
|---|---|---|
| 파일 총 라인 | 2007 | |
| 메인 컴포넌트 함수 | ~1200 (100~1305) | 단일 함수 |
| `useState` 수 | 40+ | [103~139](../../components/project/ProjectImporterClient.tsx#L103) |
| `useRef` 수 | 6 | state 동기화용 ref 2개 포함 |
| 인라인 다이얼로그/패널 컴포넌트 | 6 | Export, SystemSave, SaveTemplate, ExitConfirm, InitialLoading, InitialError |
| 파일 하단 헬퍼 함수 | 10+ | 세션·업로드 병합·포커스 등 |

## 1. 구조 — 관심사 분리 부재 (핵심)

### 1-1. 1200줄 단일 컴포넌트

메인 함수([100](../../components/project/ProjectImporterClient.tsx#L100)~[1305](../../components/project/ProjectImporterClient.tsx#L1305))가
부트스트랩·편집 상태·저장·내보내기 연결·모바일 시트·데스크톱 레이아웃·6개 다이얼로그 배선을 한 곳에서 담당한다.
한 화면에서 전체 흐름을 읽을 수 없고, 어떤 변경이든 이 거대한 함수를 건드려야 한다.

### 1-2. 인라인 다이얼로그 6개가 같은 파일

`ExportDialog`([1688](../../components/project/ProjectImporterClient.tsx#L1688), ~230줄),
`SystemTemplateSaveDialog`([1531](../../components/project/ProjectImporterClient.tsx#L1531), ~110줄),
`SaveTemplateDialog`([1449](../../components/project/ProjectImporterClient.tsx#L1449)),
`ExitConfirmDialog`([1428](../../components/project/ProjectImporterClient.tsx#L1428)),
`InitialTemplateLoadingPanel`([1307](../../components/project/ProjectImporterClient.tsx#L1307)),
`InitialTemplateErrorPanel`([1356](../../components/project/ProjectImporterClient.tsx#L1356))이 모두 이 파일에 있다.
각 컴포넌트는 자체 props로 이미 독립적이라 **파일 이동만으로 즉시 ~700줄 감량**이 가능하다.

### 1-3. 초기 로드 로직 140줄이 effect 안에 인라인

`loadStartedTemplate`([235](../../components/project/ProjectImporterClient.tsx#L235)~[376](../../components/project/ProjectImporterClient.tsx#L376))는
① 시스템 템플릿 로드 ② 시스템 템플릿 플랫폼 변환 ③ 사용자 템플릿 로드의 세 분기를 하나의 async 함수에 담고,
각 분기가 10개 안팎의 `setState`를 순차 호출한다. 부트스트랩 정책이 렌더 함수 본문에 묻혀 있다.

## 2. 상태 관리

### 2-1. 편집 도메인 상태의 파편화

한 덩어리로 다뤄야 할 편집 상태가 7개의 개별 `useState`로 흩어져 있다:
`uploads`, `remoteUploadRefs`, `colors`, `candidateSelections`, `bubbleMarkers`, `bubbleInsets`, `bubbleStretch`
([110](../../components/project/ProjectImporterClient.tsx#L110)~[139](../../components/project/ProjectImporterClient.tsx#L139)).
그 결과 `uploadSlot`·`selectAdminAsset` 같은 핸들러 하나가 4~5개의 setter를 연쇄 호출한다
([579](../../components/project/ProjectImporterClient.tsx#L579), [712](../../components/project/ProjectImporterClient.tsx#L712)).
→ `useThemeDraft`(또는 `useReducer`)로 편집 상태와 그 갱신 액션을 한 모듈에 모으면 일관성이 강제된다.

### 2-2. state ↔ ref 수동 이중 동기화 (버그 위험)

`uploadsRef`/`remoteUploadRefsRef`를 effect로 미러링하면서
([148](../../components/project/ProjectImporterClient.tsx#L148)~[154](../../components/project/ProjectImporterClient.tsx#L154)),
핸들러 안에서는 `remoteUploadRefsRef.current`를 **직접** 수정하기도 한다
([591](../../components/project/ProjectImporterClient.tsx#L591), [625](../../components/project/ProjectImporterClient.tsx#L625), [722](../../components/project/ProjectImporterClient.tsx#L722)).
같은 값을 setter와 ref 두 경로로 갱신하므로, 한쪽을 빠뜨리면 hydration이 최신 상태를 놓친다.
→ 최신값 참조가 필요하면 `useThemeDraft` 내부에 캡슐화하거나 함수형 setter로 일원화한다.

### 2-3. 반복 패턴 (복붙 6곳 이상)

세 가지 패턴이 여러 핸들러에 그대로 반복된다.

- **슬롯 노출**: `if (!isSlotVisibleInSection(...)) setActiveSection(...); if (!isSlotVisibleInGroup(...)) setActiveGroup(...)`
  — [597](../../components/project/ProjectImporterClient.tsx#L597), [631](../../components/project/ProjectImporterClient.tsx#L631), [739](../../components/project/ProjectImporterClient.tsx#L739), [1178](../../components/project/ProjectImporterClient.tsx#L1178), [1224](../../components/project/ProjectImporterClient.tsx#L1224) 등
- **선택 + 펄스**: `setSelectedSlotId(slot.id); setSelectionPulseKey((c) => c + 1)`
- **remote ref 제거**: `setRemoteUploadRefs((c) => { const n = {...c}; delete n[slot.id]; remoteUploadRefsRef.current = n; return n; })`
  — [588](../../components/project/ProjectImporterClient.tsx#L588), [622](../../components/project/ProjectImporterClient.tsx#L622), [641](../../components/project/ProjectImporterClient.tsx#L641), [719](../../components/project/ProjectImporterClient.tsx#L719)

→ `revealSlot(slot)`, `focusSlot(slotId)`, `dropRemoteUploadRef(slotId)` 헬퍼로 추출하면 중복이 사라지고
누락 실수를 막는다. `getInitialSlotCandidateSelections([slot], ...)[slot.id]`로 단일 슬롯 기본값을 얻는
패턴([649](../../components/project/ProjectImporterClient.tsx#L649), [668](../../components/project/ProjectImporterClient.tsx#L668))도 헬퍼화 대상이다.

### 2-4. 저장 로직이 컴포넌트에 인라인

`saveCurrentTemplate`([750](../../components/project/ProjectImporterClient.tsx#L750))·`saveSystemTemplate`([808](../../components/project/ProjectImporterClient.tsx#L808))는
`useProjectExport`와 성격이 같은 "부수효과 + 로딩/에러 상태" 로직인데 컴포넌트에 남아 있다.
→ `useTemplatePersistence` 훅으로 빼면 `useProjectExport`와 대칭이 되어 구조가 예측 가능해진다.

## 3. 성능

- **파생값이 매 렌더 재계산**: `activeTemplate`([384](../../components/project/ProjectImporterClient.tsx#L384)),
  `completion`([440](../../components/project/ProjectImporterClient.tsx#L440)), `selectedFile`([437](../../components/project/ProjectImporterClient.tsx#L437))이
  `useMemo` 없이 호출된다. `activeTemplate`은 `analysis` `useMemo`의 의존성이라
  ([399](../../components/project/ProjectImporterClient.tsx#L399)), 반환 참조가 안정적이지 않으면 analysis 캐시가 매번 깨진다.
- **패널 JSX/props 객체가 매 렌더 새로 생성**: `previewProps`([881](../../components/project/ProjectImporterClient.tsx#L881)),
  `quickEditPanel`([899](../../components/project/ProjectImporterClient.tsx#L899)), `mobileEditPanel`([943](../../components/project/ProjectImporterClient.tsx#L943))이
  매 렌더 새 객체/엘리먼트라, 하위 패널이 `memo`여도 리렌더를 피하기 어렵다. 인라인 화살표 콜백도 다수다.
- → 편집 상태를 훅으로 모으면서 핸들러를 `useCallback`으로 안정화하고, 핵심 파생값을 `useMemo`로 감싼다.

## 4. UX/UI · 접근성

- **다이얼로그 구현 혼재**: `ExportDialog`만 Radix `Dialog`(포커스 트랩·Esc·포털 제공)를 쓰고,
  `SaveTemplateDialog`·`SystemTemplateSaveDialog`·`ExitConfirmDialog`는 수제 `fixed` div다
  ([1472](../../components/project/ProjectImporterClient.tsx#L1472), [1576](../../components/project/ProjectImporterClient.tsx#L1576), [1430](../../components/project/ProjectImporterClient.tsx#L1430)).
  후자는 포커스 트랩·Esc 닫기·바깥 클릭 처리가 없어 접근성과 동작이 데스크톱 모바일 시트
  ([156](../../components/project/ProjectImporterClient.tsx#L156)~[202](../../components/project/ProjectImporterClient.tsx#L202)에 별도 구현된 수제 트랩)와도 어긋난다.
  → 모든 모달을 Radix `Dialog` 기반 공통 컴포넌트로 통일하면 코드량과 접근성 편차가 함께 줄어든다.
- **모바일 포커스 트랩이 손으로 구현**됨([156](../../components/project/ProjectImporterClient.tsx#L156)): 잘 작성돼 있으나
  `useFocusTrap`/`useBodyScrollLock` 훅으로 빼면 재사용·검증이 쉬워진다.
- **알림이 2.5초 고정 자동 소멸**([1405](../../components/project/ProjectImporterClient.tsx#L1405)): 에러 tone도 동일하게 사라져
  실패 메시지를 놓치기 쉽다. tone별 지속시간(에러는 유지/수동 닫기)을 고려할 여지가 있다.

## 5. 버그 · 사소한 오류

- **미사용 변수(dead code)**: `openSaveDialog`의 `fallbackName`([744](../../components/project/ProjectImporterClient.tsx#L744))은
  선언 후 쓰이지 않는다(`setSaveName`은 다른 문자열 사용).
- **오타**: `SaveTemplateDialog` 설명 "이 브라우저의에만 저장합니다"([1477](../../components/project/ProjectImporterClient.tsx#L1477)) — "이 브라우저에만".
- **effect 의존성 취약**: 초기 로드 effect가 `deps: []`([382](../../components/project/ProjectImporterClient.tsx#L382))로,
  내부에서 참조하는 `mode`·`hydrateSystemTemplateUploads`·`hydrateUploadSlotsWithProgress`가 마운트 시점 클로저로 고정된다.
  현재는 `mode`가 라우트별 고정이고 hydrate가 ref 기반이라 동작하지만, 부트스트랩을 훅으로 추출하면서 의존성을
  명시적으로 정리하는 편이 안전하다.

## 리팩토링 로드맵 (점진적, 위험도 낮은 순)

각 단계는 독립적으로 커밋 가능하며, 완료 시마다 동작은 동일해야 한다(behavior-preserving).

| 단계 | 작업 | 감량/효과 | 위험 |
|---|---|---|---|
| R1 | 다이얼로그/패널 6개를 `components/project/dialogs/`로 파일 이동 (로직 변경 없음) | ~700줄 감량 | 낮음 |
| R2 | 세션 유틸(`takeTemplateStartPayload`/`persistEditorSession`/`editorSessionStorageKey`)을 `editorSession.ts`로 분리 | 경계 명확화 | 낮음 |
| R3 | 반복 패턴을 `revealSlot`/`focusSlot`/`dropRemoteUploadRef`/단일슬롯 기본값 헬퍼로 추출 | 중복 제거·버그 예방 | 낮음 |
| R4 | 저장 로직을 `useTemplatePersistence` 훅으로 추출 (`useProjectExport`와 대칭) | 컴포넌트 축소 | 중간 |
| R5 | 초기 로드 로직을 `useEditorBootstrap` 훅으로 추출, 의존성 명시화 | effect 정리 | 중간 |
| R6 | 편집 상태 7종 + 핸들러를 `useThemeDraft`(useReducer 권장)로 통합, state/ref 이중관리 제거 | 상태 일원화 | 높음 |
| R7 | 다이얼로그를 Radix 기반 공통 모달로 통일 + `useFocusTrap` 추출 | 접근성 일관화 | 중간 |
| R8 | 파생값·패널 `useMemo`/`useCallback` 안정화 | 리렌더 절감 | 중간 |

R1~R3은 즉시 착수 가능한 저위험 작업으로, 이것만으로도 파일이 절반 이하로 줄고 가독성이 크게 개선된다.
R6은 가장 효과가 크지만 회귀 위험이 높으므로 R1~R5로 표면적을 줄인 뒤 마지막에 진행한다.

## 목표 구조 (예시)

```
components/project/
├── ProjectImporterClient.tsx      # 배선/레이아웃만 (~300줄 목표)
├── editorSession.ts               # 세션 persist/restore (R2)
├── dialogs/
│   ├── ExportDialog.tsx           # (R1)
│   ├── SystemTemplateSaveDialog.tsx
│   ├── SaveTemplateDialog.tsx
│   ├── ExitConfirmDialog.tsx
│   └── InitialTemplatePanels.tsx  # Loading + Error
├── hooks/
│   ├── useProjectExport.ts        # (기존, 기준 패턴)
│   ├── useTemplatePersistence.ts  # (R4)
│   ├── useEditorBootstrap.ts      # (R5)
│   ├── useThemeDraft.ts           # (R6) 편집 상태 + 액션
│   └── useFocusTrap.ts            # (R7)
```

## 참고 원칙

`components/project/AGENTS.md`는 "큰 파일은 전면 재작성이 아니라 좁은 패치·작은 추출", "지속/내보내기 값은
`lib/theme/project` 형태로", "내보내기는 기존 export client/model/hook 경계를 따를 것"을 명시한다.
본 로드맵은 이 원칙 안에서 파일 이동과 훅 추출만으로 구성했고, 새 상태 형태를 만들지 않는다.
