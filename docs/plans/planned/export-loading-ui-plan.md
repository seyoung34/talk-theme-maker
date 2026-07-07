# 내보내기 준비 상태 UI 기획안

권장안은 `내보내기 준비 중` 상태를 별도로 두는 것이다.

**문제 정의**
- 현재 `내보내기` 클릭 후 바로 진행 UI가 뜨지 않는다.
- 이유는 `openExportDialog()`가 먼저 버전 정보와 계정 상태를 조회한 뒤에야 다이얼로그를 열기 때문이다.
- 실제 로딩 UI는 `submitExport()`에서만 시작된다.

관련 위치:
- 버튼: [`ProjectImporterClient.tsx:1111`](C:\Users\jupi4\Desktop\VS Code\kakaotalk-theme-maker\components\project\ProjectImporterClient.tsx#L1111)
- 사전 준비: [`useProjectExport.ts:72`](C:\Users\jupi4\Desktop\VS Code\kakaotalk-theme-maker\components\project\hooks\useProjectExport.ts#L72)
- 실제 내보내기 로딩 시작: [`useProjectExport.ts:101`](C:\Users\jupi4\Desktop\VS Code\kakaotalk-theme-maker\components\project\hooks\useProjectExport.ts#L101)

**권장 방향**
1. `preparing export` 상태를 `isExporting`과 분리한다.
2. 클릭 즉시 버튼 레벨 피드백을 준다.
3. 준비가 길어지면 다이얼로그를 먼저 열고 내부에서 준비 상태를 이어 보여준다.
4. 실제 제출 후에는 기존 `isExporting` 진행 UI로 자연스럽게 전환한다.

**현재 흐름**
- 상단/모바일 `내보내기` 버튼은 [`ProjectImporterClient.tsx:1111`](C:\Users\jupi4\Desktop\VS Code\kakaotalk-theme-maker\components\project\ProjectImporterClient.tsx#L1111)에서 `openExportDialog()`를 호출한다.
- `openExportDialog()`는 [`useProjectExport.ts:72`](C:\Users\jupi4\Desktop\VS Code\kakaotalk-theme-maker\components\project\hooks\useProjectExport.ts#L72)에서
  - 버전 정보 조회
  - 계정/크레딧 조회
  - 그 다음에야 다이얼로그 오픈
  순서로 처리한다.
- 실제 로딩 UI는 [`useProjectExport.ts:101`](C:\Users\jupi4\Desktop\VS Code\kakaotalk-theme-maker\components\project\hooks\useProjectExport.ts#L101) 이후 `submitExport()`에서만 켜진다.
- 따라서 사용자가 체감하는 공백은 "내보내기 클릭 후 다이얼로그가 늦게 뜨는 구간"이다.

**기획 방향**
1. `isPreparingExport`와 `isExporting`을 분리한다.
2. 클릭 즉시 버튼 상태를 `내보내기 준비 중…`으로 바꾼다.
3. 가능하면 다이얼로그를 먼저 열고 내부에서 준비 중 UI를 보여준다.
4. 준비 완료 후 기존 폼으로 전환한다.
5. 제출 후에는 지금의 `isExporting` 진행 UI를 그대로 쓴다.

**왜 이 방식이 맞는가**
- 버튼만 비활성화하는 것보다 사용자가 “정상 동작 중”임을 더 확실히 이해한다.
- 준비 실패 시 에러를 같은 다이얼로그 맥락에서 보여주기 쉽다.
- 이후 준비 단계가 늘어나도 확장성이 좋다.

**권장 UX**
- 버튼 문구
  - 준비 중: `내보내기 준비 중…`
  - 제출 중: `내보내는 중…`
- 다이얼로그 준비 화면 문구 예시
  - 제목: `내보내기 정보를 준비하는 중입니다`
  - 설명: `버전 정보와 계정 상태를 확인하고 있습니다.`

**진행 단계 표현**
- 준비 단계는 퍼센트보다 문장형이 적합
- 예:
  - `버전 정보를 불러오는 중`
  - `크레딧 상태를 확인하는 중`
- 실제 내보내기 단계는 기존 `getExportProgressSteps()` 유지

**구현 포인트**
- [`useProjectExport.ts`](C:\Users\jupi4\Desktop\VS Code\kakaotalk-theme-maker\components\project\hooks\useProjectExport.ts)
  - `isPreparingExport` 추가
  - `openExportDialog()` 시작 시 즉시 `setIsPreparingExport(true)`
  - 준비가 길다면 `setExportDialogOpen(true)`를 먼저 호출
- [`ProjectImporterClient.tsx:1108`](C:\Users\jupi4\Desktop\VS Code\kakaotalk-theme-maker\components\project\ProjectImporterClient.tsx#L1108)
  - 데스크톱 버튼 disabled/문구에 `isPreparingExport` 반영
- [`MobileEditActionBar.tsx:59`](C:\Users\jupi4\Desktop\VS Code\kakaotalk-theme-maker\components\project\MobileEditActionBar.tsx#L59)
  - 모바일도 동일하게 반영
- [`ProjectImporterClient.tsx:1682`](C:\Users\jupi4\Desktop\VS Code\kakaotalk-theme-maker\components\project\ProjectImporterClient.tsx#L1682)
  - `ExportDialog`에 준비 상태 UI 분기 추가

**주의점**
- 준비 단계에서 다이얼로그를 먼저 열면 닫기 허용 여부를 정해야 한다.
- 권장:
  - `preparing` 중에는 닫기 가능
  - `submitting` 중에는 지금처럼 닫기 불가
- `openExportDialog()` 중복 클릭 방지도 필요하다. `exportSubmittingRef`와 별도로 `prepareRef` 또는 단순 boolean 가드가 있으면 안전하다.

**정리**
- “클라이언트 UI를 먼저 로딩 표시하는 것”은 맞는 방향이다.
- 다만 버튼 스피너만 넣기보다, `preparing export` 상태를 분리하고 다이얼로그까지 즉시 열어주는 쪽이 더 완성도 높다.

**추천 결론**
- 단순 버튼 스피너만 넣는 것보다, `preparing` 상태를 따로 두고 다이얼로그를 먼저 열어 준비 중 UI를 보여주는 방식이 더 맞다.
- 이 문제는 서버가 느린 것이 아니라 "첫 반응이 비어 있는 UX"가 핵심이므로, 클라이언트에서 즉시 상태 전환을 만들어 주는 것이 효과적이다.
