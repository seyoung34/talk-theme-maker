# ProjectImporterClient 점진적 분해 리팩토링 계획

> 상태: R1 다이얼로그/패널 분리 완료. R2 세션 유틸 분리와 R3 반복 헬퍼·테스트가 남아 있다.
> 참고: 진단 근거 → [../../report/project-importer-client-refactor-2026-07-10.md](../../report/project-importer-client-refactor-2026-07-10.md)

## 목적

2007줄로 비대해진 [`components/project/ProjectImporterClient.tsx`](../../../components/project/ProjectImporterClient.tsx)를
**동작을 바꾸지 않고**(behavior-preserving) 파일 이동·헬퍼 추출·커스텀 훅으로 분해해, 코드 파악과 유지보수를
쉽게 만든다. `AGENTS.md`의 "큰 파일은 전면 재작성이 아니라 좁은 패치·작은 추출" 원칙을 따른다.

## 전제 — 안전망 확보 완료

리팩토링 착수 전에 필요한 회귀 안전망이 이미 준비됐다(커밋 `b0a3239`).

- Vitest + `@testing-library/react` 도입, `lib/theme/color.ts` 단위 테스트 존재.
- ESLint 9 flat config 도입 — 미사용 변수·hook 의존성 문제를 자동 감지.

각 단계는 **독립 커밋**하고, 커밋 전 `npm test`·`npm run lint`·`npx tsc --noEmit`로 회귀를 확인한다.
로직을 추출할 때는 가능하면 그 로직에 대한 `*.test.ts`를 먼저/함께 추가한다(특히 Phase 3의 순수 헬퍼).

## 근거와 문제 (요약)

상세는 [진단 보고서](../../report/project-importer-client-refactor-2026-07-10.md)에 있다.

1. 메인 컴포넌트 함수 하나가 ~1200줄, 40+ `useState`, 20+ 핸들러, 6개 인라인 다이얼로그.
2. 편집 도메인 상태(`uploads`/`colors`/`candidateSelections`/`bubble*`)가 개별 `useState`로 파편화되고
   `state`↔`ref` 수동 이중 동기화가 버그 위험을 만든다.
3. "슬롯 노출 / 선택+펄스 / remote ref 제거" 동일 패턴이 6곳 이상 복붙.
4. 다이얼로그가 Radix와 수제 `fixed` div로 혼재 → 포커스 트랩·접근성 편차.
5. 파생값·패널 JSX가 매 렌더 새로 생성되어 하위 리렌더 유발.

`useProjectExport` 훅이 이미 잘 분리된 좋은 경계이므로, 나머지 훅 추출의 기준 패턴으로 삼는다.

## 구현 계획

각 Phase의 완료 기준은 공통으로 "동작 동일 + `npm test`/`npm run lint`/`tsc` 통과"를 포함한다.
아래에는 그 외 Phase별 산출물 기준을 적는다.

### Phase 1 (R1) — 다이얼로그/패널 파일 추출 · 저위험

- [x] `ExportDialog`, `SystemTemplateSaveDialog`, `SaveTemplateDialog`, `ExitConfirmDialog`,
      `InitialTemplateLoadingPanel`+`InitialTemplateErrorPanel`을 `components/project/dialogs/`로 이동한다(로직 변경 없음).
- [x] 관련 라벨 상수(`systemTemplate*Labels`)와 `SelectField`도 함께 옮긴다.
- 완료 기준: `ProjectImporterClient.tsx`가 약 700줄 감소하고, 각 다이얼로그가 자체 파일에서 props로만 구동된다.

### Phase 2 (R2) — 세션 유틸 분리 · 저위험

- [ ] `takeTemplateStartPayload`/`persistEditorSession`/`editorSessionStorageKey`를 `components/project/editorSession.ts`로 옮긴다.
- 완료 기준: 세션 저장/복원 경로가 한 모듈에 모이고, 컴포넌트는 이를 import만 한다.

### Phase 3 (R3) — 반복 패턴 헬퍼 추출 · 저위험

- [ ] `revealSlot(slot)`(섹션/그룹 노출), `focusSlot(slotId)`(선택 + 펄스),
      `dropRemoteUploadRef(slotId)`, 단일 슬롯 기본 후보 헬퍼를 추출한다.
- [ ] 순수 헬퍼(`mergeSlotUploads`/`keepCurrentRemoteUploads`/`getMissingRemoteUploadSlotIds` 등)에 단위 테스트를 추가한다.
- 완료 기준: 6곳 이상의 복붙이 헬퍼 호출로 대체되고, 추출한 순수 헬퍼에 테스트가 붙는다.

### Phase 4 (R4) — 저장 로직 훅 추출 · 중위험

- [ ] `saveCurrentTemplate`/`saveSystemTemplate`와 관련 로딩/에러 상태를 `useTemplatePersistence` 훅으로 옮긴다.
- 완료 기준: 저장 흐름이 `useProjectExport`와 대칭 구조가 되고, 컴포넌트에서 저장 관련 `useState`가 사라진다.

### Phase 5 (R5) — 초기 로드 훅 추출 · 중위험

- [ ] `loadStartedTemplate`(3분기: 시스템 로드 / 플랫폼 변환 / 사용자 템플릿)을 `useEditorBootstrap` 훅으로 옮기고
      effect 의존성을 명시적으로 정리한다.
- 완료 기준: 부트스트랩 정책이 렌더 함수 밖으로 나가고, ESLint hook-deps 경고가 새로 생기지 않는다.

### Phase 6 (R6) — 편집 상태 통합 · 고위험 (마지막)

- [ ] 편집 상태 7종(`uploads`/`remoteUploadRefs`/`colors`/`candidateSelections`/`bubbleMarkers`/`bubbleInsets`/`bubbleStretch`)과
      그 갱신 핸들러를 `useThemeDraft`(`useReducer` 권장)로 통합한다.
- [ ] `state`↔`ref` 수동 이중 동기화를 훅 내부 캡슐화로 제거한다.
- 완료 기준: 편집 상태 변경이 단일 액션 경로를 통하고, 컴포넌트에서 편집용 `useState`/미러 `ref`가 사라진다.
      (Immer 도입은 이 단계에서 별도 판단 — 불변 업데이트 보일러플레이트가 크면 채택.)

### Phase 7 (R7) — 다이얼로그 Radix 통일 · 접근성 · 중위험

- [ ] 수제 `fixed` div 다이얼로그(`SaveTemplateDialog`/`SystemTemplateSaveDialog`/`ExitConfirmDialog`)를
      Radix `Dialog` 기반 공통 모달로 통일한다.
- [ ] 모바일 시트의 수제 포커스 트랩을 `useFocusTrap`(+`useBodyScrollLock`)으로 추출해 재사용한다.
- 완료 기준: 모든 모달이 동일한 포커스 트랩·Esc·바깥 클릭 동작을 갖는다.

### Phase 8 (R8) — 렌더 성능 안정화 · 중위험

- [ ] 핵심 파생값(`activeTemplate`/`completion`/`selectedFile` 등)을 `useMemo`로, 핸들러를 `useCallback`으로 안정화한다.
- [ ] `previewProps`/`quickEditPanel`/`mobileEditPanel` 생성을 메모이즈한다.
- 완료 기준: 편집 상태가 바뀌지 않는 리렌더에서 하위 패널이 불필요하게 리렌더되지 않는다.

## 자잘한 정리 (진행 중 함께 처리)

- 미사용 변수 `fallbackName`([`openSaveDialog`](../../../components/project/ProjectImporterClient.tsx#L744)) 제거.
- 오타 "이 브라우저의에만" → "이 브라우저에만"([1477](../../../components/project/ProjectImporterClient.tsx#L1477)).
- ESLint가 보고하는 기타 미사용 import 정리(해당 파일을 만질 때).

## 진행 순서 원칙

- **R1~R3(저위험)을 먼저** 끝낸다 — 이것만으로 파일이 절반 이하로 줄고 가독성이 크게 오른다.
- R6(편집 상태 통합)은 회귀 위험이 가장 크므로 R1~R5로 표면적을 줄인 뒤 **마지막에** 진행한다.
- Phase는 순서대로가 기본이나 R1~R3은 서로 독립적이라 순서를 바꿔도 된다.

## 목표 구조

```
components/project/
├── ProjectImporterClient.tsx      # 배선/레이아웃만 (~300줄 목표)
├── editorSession.ts               # (Phase 2)
├── dialogs/                       # (Phase 1)
│   ├── ExportDialog.tsx
│   ├── SystemTemplateSaveDialog.tsx
│   ├── SaveTemplateDialog.tsx
│   ├── ExitConfirmDialog.tsx
│   └── InitialTemplatePanels.tsx
├── hooks/
│   ├── useProjectExport.ts        # 기존(기준 패턴)
│   ├── useTemplatePersistence.ts  # (Phase 4)
│   ├── useEditorBootstrap.ts      # (Phase 5)
│   ├── useThemeDraft.ts           # (Phase 6)
│   └── useFocusTrap.ts            # (Phase 7)
```

## 검증 명령

- 단계마다: `npm test` · `npm run lint` · `npx tsc --noEmit`
- 편집 흐름 수동 확인: `/edit`에서 업로드·색상·후보 선택·말풍선 조정·저장·내보내기, `/edit` 관리자 모드 시스템 템플릿 저장
- 내보내기/슬롯 매핑을 건드리면 `npm run check:ios-slots`·`npm run check:android-colors`

## 범위 밖

- 새 편집 기능 추가(다중 선택, undo/redo 등) — 구조 안정화 후 별도 계획.
- `lib/theme/project` 상태 형태 변경 — 본 계획은 컴포넌트 계층 분해에 한정한다.
- `ProjectQuickEditPanel`/`MobileQuickEditPanel` 내부 리팩토링(별도 진단 필요).
