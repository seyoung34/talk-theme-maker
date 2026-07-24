# admin/assets 편집 워크스페이스 재설계 계획

> 상태: 리뷰 반영·계획 개정 완료(2026-07-25). 구현 착수 전.
>
> 대상: 관리자 1인이 사용하는 데스크톱 전용 에셋 제작·관리 워크스페이스.
>
> 핵심 범위: 전체화면 3-pane, 중앙 Stage, 하단 Library 도크, 생성·편집 통합, 최근 추가된 말풍선 빌더의 관리자 에셋 제작 흐름 통합.
>
> 주요 파일: `components/admin/AdminAssetsClient.tsx`, `app/admin/assets/page.tsx`, `lib/theme/adminAssets.ts`, `lib/theme/adminAssetDomain.ts`, `lib/theme/bubbleBuilder/*`, 관련 API와 forward-only Supabase migration.
>
> 관련 문서: `docs/plans/planned/admin-assets-workspace-plan-review.md`, `docs/plans/planned/bubble-builder-ux-plan.md`.

## 1. 목표

- 넓은 데스크톱 화면을 모두 사용하는 Figma형 편집 워크스페이스를 만든다.
- 좌 Navigator에서 슬롯을 고르고, 중앙 Stage에서 에셋을 만들거나 확인하며, 우 Inspector에서 저장 속성을 관리한다.
- 하단 Library 도크에서 현재 슬롯 후보를 보면서 즉시 불러와 수정한다.
- 신규 등록과 기존 후보 편집을 하나의 draft와 Stage 흐름으로 통합한다.
- 말풍선은 다음 두 제작 경로를 한 워크스페이스에서 제공한다.
  - **말풍선 빌더**: 반경·색·외곽선·복수 장식으로 말풍선을 새로 제작하고 Android/iOS 결과와 geometry를 자동 생성한다.
  - **업로드·고급 조정**: 기존 PNG/9-patch를 업로드하거나 기존 후보의 marker/inset/stretch를 `InlineBubbleAdjuster`로 조정한다.
- preview, 관리자 Library, 사용자 `/edit` 적용, export가 같은 저장 파일과 geometry를 사용하도록 한다.

## 2. 확정 결정

### 2.1 화면과 탐색

1. `/admin/assets`에서 `SiteHeader`를 제거하고 약 48px 높이의 슬림 툴바로 교체한다.
2. 툴바는 `◀ 관리자`, 페이지명, 현재 draft 저장 상태, 지속 오류를 표시한다.
3. 본문은 좌 Navigator, 중앙 Stage, 우 Inspector의 3-pane으로 구성한다.
4. Library는 하단 필름스트립 도크로 항상 노출하되 접을 수 있다.
5. 모바일 레이아웃은 만들지 않는다. 최소 지원 데스크톱 너비와 Windows 확대 배율은 QA에서 확정한다.

### 2.2 선택과 편집 상태

1. **선택 슬롯이 주도권을 가진다.** `assetKind`는 별도 state로 두지 않고 선택 슬롯에서 파생한다.
2. Android/iOS에서 같은 role을 가진 슬롯은 하나의 workspace slot으로 묶되 플랫폼별 metadata를 버리지 않는다.
3. 생성과 편집은 명시적인 discriminated union draft로 구분한다.
4. dirty draft가 있을 때 슬롯이나 후보를 바꾸면 확인 다이얼로그를 표시한다.
5. 저장 중에는 슬롯·후보 전환과 중복 저장을 막는다.
6. 비동기 원본 로드는 request token으로 식별하며 이전 후보의 늦은 응답이 현재 draft를 덮지 못하게 한다.

### 2.3 기존 후보의 파일 변경 범위

1. 일반 이미지 기존 후보는 이번 범위에서 원본 파일 교체와 재크롭을 지원하지 않는다.
2. 일반 이미지의 크롭은 create mode에서만 제공한다.
3. 기존 일반 후보는 이름, targets, enabled 상태만 수정한다.
4. 기존 수동 말풍선 후보는 이름, targets, marker/inset/stretch만 수정한다.
5. **말풍선 빌더로 만든 후보만 예외적으로 recipe를 다시 열어 Android/iOS 렌더 파일을 함께 재생성할 수 있다.**
6. recipe가 없는 기존 말풍선에서 빌더를 시작하면 기존 후보를 변환하지 않고 새 후보 create draft를 만든다.

### 2.4 말풍선 적용 범위

1. 최근 `/edit` 말풍선 빌더의 현재 동작과 동일하게 **선택한 말풍선 role 하나만** 제작한다.
2. `bubble_me_1`, `bubble_me_2`, `bubble_you_1`, `bubble_you_2`는 각각 독립 후보다.
3. 빌더 후보의 기본 target은 선택 role의 Android+iOS `exact_role`이다.
4. 빌더 후보를 모든 말풍선에 적용하는 `asset_kind` target으로 저장하지 않는다.
5. legacy 수동 후보의 기존 target은 편집 시 보존한다. 명시적으로 “선택 role 공통 대상으로 정리”를 선택한 경우에만 exact-role targets로 교체한다.

## 3. 현재 구조와 해결할 병목

현재 `AdminAssetsClient.tsx`는 약 1,260행이며 다음 책임을 한 컴포넌트에서 처리한다.

- kind/slot 선택
- 이미지 입력과 분석
- 생성 저장
- 목록 조회·검색·필터·페이지네이션
- 기존 후보 수정·삭제
- 말풍선 원본 비동기 로드
- `InlineBubbleAdjuster`
- target과 guidance 파생

현재 화면은 `max-w-7xl` 2-pane 안에서 등록 폼과 목록을 세로로 쌓으며 기존 후보 수정은 모달이다.

주요 문제:

- 넓은 화면의 가로 공간을 활용하지 못한다.
- 등록 폼과 목록을 오가는 세로 스크롤이 길다.
- 말풍선 geometry와 투명 이미지를 충분히 크게 볼 수 없다.
- kind 선택과 슬롯 선택이 분리되어 중복 상태 동기화가 필요하다.
- 기존 후보 수정 중 Library를 볼 수 없다.
- 목록은 서버에서 kind만 자른 뒤 현재 슬롯과 검색을 클라이언트에서 필터링하므로 결과와 cursor가 부정확하다.
- update 후 target/bubble spec 최종 상태를 다시 읽지 않아 저장 직후 stale candidate가 반환될 수 있다.
- 현재 관리자 후보는 파일 하나만 저장하지만 말풍선 빌더는 Android 9-patch와 iOS PNG를 별도로 생성한다.
- 말풍선 빌더 recipe와 복수 장식 원본을 관리자 후보에 보존하는 계약이 없다.

## 4. 목표 레이아웃

```text
┌ 툴바  ◀ 관리자 | 에셋 관리 | 저장되지 않음·저장 중·저장됨·실패          ~48px
├──────────────┬────────────────────────────────────────────┬───────────────┐
│ NAVIGATOR    │ STAGE                                      │ INSPECTOR      │
│ 종류▸슬롯 트리│                                            │ 후보 이름      │
│              │ 일반 이미지                                │ 플랫폼별 분석  │
│ ▾ 말풍선      │  체커보드 preview / drop / paste / crop     │ guidance       │
│  • 내 1       │                                            │ 적용 targets   │
│  • 내 2       │ 말풍선                                    │ 저장 상태      │
│  • 상대 1     │  [빌더] [업로드·고급 조정]                  │ [저장] [삭제]  │
│  • 상대 2     │  빌더 canvas 또는 InlineBubbleAdjuster      │               │
│              │  [Android] [iOS] 실제 결과 preview          │               │
│ ▸ 배경        │                                            │               │
│ ▸ 아이콘      │                                            │               │
│ ▸ 프로필·런처 │                                            │               │
│ ▸ 잠금        │                                            │               │
├──────────────┴────────────────────────────────────────────┴───────────────┤
│ LIBRARY  현재 슬롯 후보 | 검색 | 전체·정확·확인·빌더 | [▢][▢][▢]… | 더 보기 │
└────────────────────────────────────────────────────────────────────────────┘
```

### 4.1 툴바

- 관리자 화면으로 돌아가는 링크
- 현재 draft 상태:
  - `저장되지 않은 변경사항`
  - `저장 중`
  - `저장됨`
  - `저장 실패 — 재시도 필요`
- 성공 notice는 잠시 후 사라질 수 있지만 dirty 표시와 오류는 자동으로 사라지지 않는다.

### 4.2 Navigator

- `종류 헤더 ▸ 슬롯` 접이식 트리
- 슬롯 수 badge
- 슬롯 선택이 유일한 kind 진입점
- 선택 슬롯이 속한 kind는 자동으로 펼친다.
- 종류 헤더 클릭은 펼침/접힘만 수행한다. 의도하지 않은 draft 전환을 피하기 위해 첫 슬롯을 자동 선택하지 않는다.

### 4.3 Stage

#### 일반 이미지

- 큰 체커보드 투명 배경
- drop, paste, 파일 선택
- create mode에서만 크롭
- Android/iOS 토글에 따라 해당 플랫폼 slot constraints와 guidance 표시
- 기존 후보는 플랫폼별 실제 저장 파일이 있는 경우 해당 variant를 표시하고, 없으면 legacy 대표 파일을 표시한다.

#### 말풍선

- 상단에 `빌더`와 `업로드·고급 조정` mode를 제공한다.
- builder recipe가 있는 후보를 편집하면 `빌더`를 기본으로 연다.
- recipe가 없는 수동 후보를 편집하면 `업로드·고급 조정`을 기본으로 연다.
- Android/iOS 토글은 같은 이미지를 장식용으로 바꾸는 UI가 아니라 실제 플랫폼별 생성 결과를 전환한다.

### 4.4 Inspector

- 후보 이름
- 현재 mode와 source:
  - 신규 업로드
  - 수동 말풍선
  - 빌더 말풍선
  - 기존 후보
- 플랫폼별 분석값과 constraints
- 저장 전 guidance와 blocking error
- 적용 target 요약
- legacy target 유지 또는 선택 role exact targets로 정리
- builder recipe 버전과 geometry 상태
- 저장, 삭제

### 4.5 Library 도크

- 현재 workspace slot에 실제로 적용 가능한 후보만 표시한다.
- 검색·필터는 서버 query와 같은 조건을 사용한다.
- 필터:
  - 전체
  - exact role
  - 확인 필요
  - 빌더 제작
- 썸네일에 platform variant 존재 여부, enabled, warning, builder badge를 표시한다.
- 후보 선택은 edit draft를 hydrate하며 Stage와 Inspector를 갱신한다.
- 검색·필터·슬롯이 바뀌면 cursor를 초기화한다.

## 5. 도메인과 상태 계약

### 5.1 플랫폼 variant를 보존하는 workspace slot

```ts
type AdminAssetWorkspaceSlot = {
  key: string;
  role: ThemeResourceRole;
  kind: AdminAssetKind;
  label: string;
  variants: Partial<Record<ThemePlatform, ThemeAssetSlot>>;
};
```

- role이 같은 Android/iOS 슬롯을 `variants`에 함께 보존한다.
- guidance, 권장 크기, 파일명, export mapping은 현재 preview platform의 variant에서 읽는다.
- target 생성은 label/fileName 추측보다 role과 platform variant를 우선한다.
- 한 플랫폼에만 있는 role도 같은 모델로 표현한다.

### 5.2 Workspace draft

```ts
type AdminAssetWorkspaceDraft =
  | {
      mode: "create";
      slotKey: string;
      sourceMode: "upload" | "bubble-builder";
      title: string;
      file?: File;
      analysis?: AdminAssetAnalysis;
      bubbleBuilder?: AdminBubbleBuilderDraft;
      bubbleAdjustment?: AdminBubbleAdjustment;
      dirty: boolean;
    }
  | {
      mode: "edit";
      candidateId: string;
      original: AdminAssetCandidate;
      title: string;
      targets: readonly AdminAssetTargetInput[];
      enabled: boolean;
      sourceStatus: "idle" | "loading" | "ready" | "error";
      sourceFile?: ThemeProjectFile;
      bubbleBuilder?: AdminBubbleBuilderDraft;
      bubbleAdjustment?: AdminBubbleAdjustment;
      dirty: boolean;
    };
```

- reducer 또는 `useAdminAssetWorkspaceDraft`가 create/edit 전환을 담당한다.
- 파일 분석 결과가 builder recipe 또는 저장된 bubble adjustment를 자동으로 초기화하지 않는다.
- create mode에서 새 파일을 선택했을 때만 추천 adjustment를 초기화한다.
- 편집 candidate A를 로드하는 동안 B를 선택하면 A의 응답은 무시한다.

### 5.3 전환 규칙

| 현재 상태 | 사용자 행동 | 처리 |
| --- | --- | --- |
| clean create/edit | 슬롯 변경 | 새 슬롯 create draft |
| dirty create/edit | 슬롯 변경 | 이탈 확인 후 전환 |
| clean edit | 다른 후보 선택 | 새 후보 hydrate |
| dirty edit | 다른 후보 선택 | 이탈 확인 후 hydrate |
| edit | paste/drop | 기존 파일을 덮지 않고 확인 후 create upload draft |
| legacy bubble edit | 빌더 시작 | 새 builder candidate 생성 안내 후 create draft |
| builder edit | 빌더 재적용 | Android/iOS variants와 자동 geometry 재생성 |
| builder edit + 수동 geometry | 빌더 재적용 | 수동 geometry가 초기화됨을 확인 |
| 저장 중 | 슬롯/후보 전환 | 비활성화 |
| 현재 후보 삭제 성공 | 삭제 | 현재 슬롯의 빈 create draft로 전환 |

### 5.4 저장 후 반환

- `saveAdminAssetCandidate`와 `updateAdminAssetCandidate`는 저장 과정 중간 row가 아니라 최종 관계가 포함된 authoritative candidate를 반환한다.
- targets 또는 bubble spec 교체 후 candidate를 재조회하는 방식을 기본으로 한다.
- 저장 성공 시 반환 candidate로 Library와 edit draft의 `original`을 동시에 갱신한다.
- 반환값이 DB 최종 상태와 다르면 저장 성공으로 표시하지 않는다.

## 6. 목록·검색·페이지네이션 계약

관리자 워크스페이스 목록은 `assetKind`만으로 조회한 뒤 클라이언트에서 슬롯을 거르는 방식을 사용하지 않는다.

### 6.1 Query 조건

- workspace slot role
- preview platform
- asset kind
- target match:
  - 동일 platform 또는 `all`
  - `exact_role` 일치
  - `asset_kind` 일치
  - 지원할 경우 `shape_rule` 일치
- enabled 필터
- builder source 필터
- 검색어
- stable cursor: `updated_at desc, id desc`

### 6.2 구현 방향

- 관리자용 target-aware query/RPC 또는 API를 추가한다.
- 사용자 `/api/theme-assets/recommended`와 target rank 규칙을 가능한 한 같은 순수 도메인 함수로 공유한다.
- SQL/RPC와 TypeScript에서 동일 규칙을 중복 구현해야 한다면 fixture로 결과 일치를 검증한다.
- 검색은 전체 관리 후보에 대한 서버 검색으로 구현한다.
- cursor에는 현재 검색·필터 조건을 직접 넣지 않더라도, 조건이 변하면 클라이언트 cursor와 결과를 반드시 초기화한다.
- 빈 첫 페이지 뒤에 실제 일치 결과가 남는 일이 없어야 한다.

## 7. 말풍선 빌더 통합

### 7.1 재사용 원칙

현재 `BubbleBuilderDialog`는 `/edit`의 모달 orchestration까지 포함한다. 관리자 워크스페이스에서는 모달을 그대로 중첩하지 않는다.

공통 편집 본체를 분리한다.

```text
BubbleBuilderEditor
├─ shape/color controls
├─ decoration library and controls
├─ BubblePreview canvas
├─ collision/warning UI
└─ apply-ready result

BubbleBuilderDialog (/edit)
└─ Dialog shell + BubbleBuilderEditor

AdminAssetBubbleBuilderStage (/admin/assets)
└─ workspace shell + BubbleBuilderEditor
```

- geometry와 render 계산은 계속 `lib/theme/bubbleBuilder`만 사용한다.
- 관리자 컴포넌트에서 markers/insets/stretch를 다시 계산하지 않는다.
- `/edit`의 기존 `BubbleBuilderDialog` 동작과 테스트를 유지한다.

### 7.2 관리자 빌더 기능

- 선택 role 하나에 대한 신규 제작
- 모서리 반경
- 배경색
- 외곽선 색과 두께
- 말풍선 본체 위치
- 복수 장식 이미지
- 장식 파일 선택, paste, drag & drop
- 장식 선택·삭제
- 장식 위치, 크기, 좌우 반전, 회전
- 텍스트 영역 충돌 경고와 안전 위치 이동
- 짧은/긴/여러 줄 메시지 preview
- Android/iOS 실제 결과 전환
- 텍스트 색 동기화 옵션은 관리자 후보 자체에 색 slot을 저장하지 않으므로 이번 범위에서는 숨긴다. 향후 template preset 제작 흐름에서 별도로 연결한다.

### 7.3 저장 결과

빌더 저장 시 선택한 role과 variant에 대해 같은 recipe로 다음 두 결과를 모두 만든다.

1. Android `.9.png`와 markers
2. iOS PNG와 insets/stretch

두 파일은 하나의 관리 후보에 속한 platform variants이며 Library에는 후보 하나로 표시한다.

```ts
type AdminAssetPlatformVariant = {
  platform: ThemePlatform;
  storagePath: string;
  fileName: string;
  mimeType: string;
  analysis?: AdminAssetAnalysis;
};
```

`AdminBubbleSpec`에는 Android markers와 iOS insets/stretch를 함께 저장한다.

### 7.4 Recipe와 장식 원본

빌더 후보를 다시 편집하려면 렌더 PNG만이 아니라 다음을 보존해야 한다.

- `BubbleFamilyDesignSpec`
- `presetVersion`
- 장식 layer ID와 transform
- 각 장식 layer의 원본 binary
- 장식 원본 fileName과 MIME

장식 원본은 recipe JSON에 넣지 않고 별도 storage object로 저장한다. recipe는 layer ID로 원본을 참조한다.

### 7.5 빌더 geometry와 고급 조정

- 빌더 적용 직후 `bubbleSpec`은 renderer가 만든 자동 geometry다.
- 고급 조정에서 저장한 값은 candidate의 authoritative `bubbleSpec`을 덮는다.
- recipe는 artwork 재생성을 위해 유지한다.
- 고급 조정 후 builder를 다시 적용하면 renderer가 geometry를 다시 계산하므로 수동 조정이 초기화된다는 확인을 표시한다.
- Inspector에 `자동 geometry` 또는 `수동 보정됨` 상태를 표시한다.

## 8. Persistence 확장

현재 `admin_assets.storage_path` 하나만으로는 빌더의 플랫폼별 파일을 표현할 수 없다. forward-only migration으로 다음 관계를 추가한다.

### 8.1 제안 테이블

#### `admin_asset_variants`

- `id`
- `asset_id` FK, cascade delete
- `platform` (`android` 또는 `ios`)
- `storage_path`
- `file_name`
- `mime_type`
- `analysis`
- `created_at`, `updated_at`
- unique `(asset_id, platform)`

#### `admin_asset_bubble_designs`

- `asset_id` PK/FK, cascade delete
- `recipe` JSONB
- `geometry_mode` (`generated` 또는 `manual`)
- `created_at`, `updated_at`

#### `admin_asset_bubble_decorations`

- `asset_id` FK, cascade delete
- `layer_id`
- `storage_path`
- `file_name`
- `mime_type`
- `created_at`, `updated_at`
- PK 또는 unique `(asset_id, layer_id)`

### 8.2 하위 호환

- 기존 `admin_assets.storage_path`는 legacy 대표 파일 fallback으로 유지한다.
- variant row가 있으면 요청 platform의 variant를 우선 사용한다.
- variant가 없는 기존 후보는 현재 storage path를 사용한다.
- 기존 수동 말풍선에는 recipe/design row가 없어도 된다.
- migration에서 기존 파일을 억지로 Android/iOS variant 두 개로 복제하지 않는다.

### 8.3 저장 orchestration

빌더 신규 저장:

1. recipe validation
2. Android/iOS 결과 생성
3. variant와 decoration 파일을 revisioned 임시 경로에 업로드
4. DB transaction/RPC로 asset, targets, variants, bubble spec, design, decoration rows 저장
5. authoritative candidate 재조회
6. 실패 시 새 storage object 보상 삭제

빌더 수정 저장:

1. 기존 candidate와 파일 경로 snapshot
2. 새 결과를 새 revision 경로에 업로드
3. DB transaction/RPC로 관계를 새 revision으로 교체
4. authoritative candidate 재조회
5. commit 성공 후 이전 revision 파일 삭제
6. DB 실패 시 새 revision 파일만 삭제하고 이전 candidate 유지

브라우저에서 여러 테이블을 순차 수정해 부분 저장 상태를 만들지 않는다.

### 8.4 조회와 사용자 적용

- 관리자 목록은 선택 platform의 variant signed URL을 반환한다.
- `/api/theme-assets/recommended`도 요청 platform variant를 우선 반환한다.
- candidate를 `/edit`에 적용할 때 현재 project platform의 파일을 upload entry로 사용한다.
- Android는 Android variant와 markers를 사용한다.
- iOS는 iOS variant와 insets/stretch를 사용한다.
- preview와 export는 동일 candidate platform variant를 사용한다.

## 9. 컴포넌트 리팩터

권장 경계:

- `AdminAssetsWorkspace`: query, draft, save/delete orchestration
- `AdminAssetsToolbar`: back link, 저장 상태, notice
- `AdminAssetsNavigator`: kind/slot tree
- `AdminAssetStage`: 일반 이미지/말풍선 mode 분기
- `AdminAssetBubbleBuilderStage`: 공통 `BubbleBuilderEditor` 연결
- `AdminAssetInspector`: metadata, guidance, targets, actions
- `AdminAssetLibraryDock`: 검색, 필터, filmstrip, load-more
- `AdminAssetLibraryCard`: compact 후보 카드
- `useAdminAssetWorkspaceDraft`: create/edit reducer와 dirty guard
- `lib/theme/adminAssetWorkspace.ts`: slot variant, target, guidance, query 파생 순수 함수

유지·재사용:

- `ImageEditDialog`: create upload 크롭
- `InlineBubbleAdjuster`: 수동 말풍선과 고급 조정
- `lib/theme/bubbleBuilder/*`: builder geometry/render/types
- 삭제 확인 다이얼로그
- 이미지 분석
- signed asset access

은퇴:

- `isAddAssetOpen`
- 중복 `assetKind` state와 폼 kind select
- `AdminAssetEditDialog`
- 세로형 기존 후보 목록

## 10. 구현 단계

### Phase 0 — 상태·데이터 계약

- [ ] `AdminAssetWorkspaceSlot`과 platform variants 순수 함수 추가
- [ ] create/edit workspace draft와 reducer 전환 정의
- [ ] dirty 이탈 확인과 async request token 규칙 정의
- [ ] target-aware 관리자 목록 query 계약 확정
- [ ] `updateAdminAssetCandidate` authoritative 반환 수정
- [ ] builder 후보 platform variants/design/decorations migration 작성
- [ ] builder 저장·수정 transaction/RPC와 storage 보상 전략 확정
- [ ] 사용자 recommended API의 platform variant 선택 계약 확정

완료 기준:

- 상태 전환표와 저장 실패 복구가 테스트로 고정된다.
- 기존 후보와 새 variant 후보를 모두 읽을 수 있다.
- update 반환값이 DB 최종 관계와 일치한다.
- builder 후보 하나가 Android/iOS 파일을 각각 가진다.

### Phase 1 — 앱 셸과 컴포넌트 경계

- [ ] `SiteHeader`, `max-w-7xl`, 과도한 padding 제거
- [ ] `h-[100dvh] overflow-hidden` 툴바/3-pane/도크 골격
- [ ] 각 pane `min-h-0`, 독립 스크롤
- [ ] Navigator tree와 workspace slot 연결
- [ ] draft reducer와 툴바 저장 상태 연결
- [ ] dirty 전환 확인 다이얼로그

완료 기준:

- 넓은 화면을 거터 없이 채운다.
- pane과 도크가 viewport 밖으로 밀리지 않는다.
- 기존 생성·선택 동작을 새 draft 상태로 수행할 수 있다.

### Phase 2 — 일반 Stage와 고급 말풍선 조정

- [ ] 큰 체커보드 preview와 empty drop/paste target
- [ ] create mode 파일 선택과 크롭
- [ ] 플랫폼별 constraints·analysis·guidance
- [ ] 수동 말풍선 `InlineBubbleAdjuster` 중앙 배치
- [ ] 기존 말풍선 원본 async load와 stale response 차단
- [ ] Android/iOS geometry summary

완료 기준:

- 일반 이미지는 create에서만 크롭할 수 있다.
- 기존 후보를 불러와도 원본 파일과 저장된 geometry가 덮이지 않는다.
- 수동 말풍선 수정 저장 직후 새 geometry가 유지된다.

### Phase 3 — 말풍선 빌더 통합

- [ ] `BubbleBuilderDialog`에서 공통 `BubbleBuilderEditor` 추출
- [ ] `/edit` dialog에 공통 editor 재연결하고 기존 동작 유지
- [ ] 관리자 Stage에 builder editor 인라인 배치
- [ ] 최근 복수 장식 기능 전체 연결
- [ ] Android/iOS 결과 동시 생성
- [ ] recipe, decoration originals, platform variants 저장
- [ ] builder 후보 재진입과 재생성
- [ ] 수동 geometry 초기화 확인

완료 기준:

- 선택 말풍선 role 하나에 대해 후보 하나가 생성된다.
- 후보 하나가 Android/iOS 실제 파일과 geometry를 모두 가진다.
- 저장 후 builder 후보를 다시 열면 recipe와 모든 장식 원본이 복원된다.
- `/edit`의 기존 builder에 회귀가 없다.

### Phase 4 — Library 도크와 in-place 편집

- [ ] target-aware 목록·검색·필터·cursor 연결
- [ ] 하단 filmstrip과 접기
- [ ] 후보 클릭 → edit draft hydrate
- [ ] update 저장 분기와 authoritative 결과 반영
- [ ] 삭제 후 draft와 Library 정리
- [ ] `AdminAssetEditDialog` 제거

완료 기준:

- 현재 슬롯 후보가 첫 페이지부터 정확히 표시된다.
- 검색이 아직 로드하지 않은 전체 후보에도 적용된다.
- 목록을 보며 생성·수정·삭제할 수 있다.
- 저장 직후와 새로고침 후 Stage/Library 데이터가 같다.

### Phase 5 — 파워유저 후속

- [ ] `Ctrl/Cmd+S` 저장
- [ ] `Ctrl/Cmd+Enter` 저장 후 계속
- [ ] `Ctrl/Cmd+K` Library 검색
- [ ] `[`/`]` 슬롯 이동
- [ ] 토스트
- [ ] 연속 등록
- [ ] 일반 이미지 배치 업로드
- [ ] builder preset 저장·복제

## 11. 검증 계획

### 11.1 단위 테스트

- platform workspace slot이 Android/iOS metadata를 모두 보존
- slot → kind/targets 파생
- exact-role/asset-kind/shape-rule 노출 판정
- 검색·필터 변경 시 cursor 초기화
- authoritative update 반환
- variant fallback과 platform 우선 선택
- builder recipe validation과 장식 manifest 매핑
- Android/iOS render 결과와 bubble spec 조합

### 11.2 컴포넌트·상태 테스트

- dirty 상태 슬롯/후보 전환 확인
- 후보 A 로딩 중 B 선택 시 A 응답 무시
- 기존 bubble geometry가 이미지 분석 후에도 유지
- create는 save, edit은 update 호출
- 저장 실패 시 draft와 오류 유지
- 저장 성공 시 Stage와 Library 동시 갱신
- 삭제 후 빈 create draft 전환
- legacy bubble에서 builder 시작 시 새 candidate 생성
- builder candidate recipe/decorations 재진입
- 수동 geometry 후 builder 재적용 확인
- 복수 장식 paste/drop/select/remove
- `/edit`의 `BubbleBuilderDialog` 회귀 없음

### 11.3 Integration

- builder render → platform variant storage → recommended API → `/edit` 선택 → preview/export 왕복
- Android variant가 iOS에, iOS variant가 Android에 반환되지 않음
- target/variant/spec/design 저장 중 실패 시 이전 revision 유지
- 장식 원본 일부 업로드 실패 시 candidate 부분 생성 없음
- 기존 one-file admin candidate 하위 호환

### 11.4 브라우저 QA

- 넓은 데스크톱과 최소 지원 너비
- Windows 100%, 125%, 150% 확대
- pane 독립 스크롤과 도크 열기/접기
- 긴 슬롯명·후보명
- empty/loading/error/end-of-list
- signed URL 실패·만료
- 키보드 focus 순서와 focus-visible
- 삭제 확인
- builder 짧은/긴/여러 줄 preview
- 복수 장식 충돌과 안전 위치 이동

### 11.5 프로젝트 명령

- Korean UI: `npm run check:text`
- TypeScript/API/domain: `npx tsc --noEmit`
- 순수 함수와 컴포넌트: `npm test`
- lint: `npm run lint` — 신규 error 0
- iOS slot/export mapping 변경 시: `npm run check:ios-slots`
- Android color mapping 변경 시: `npm run check:android-colors`
- migration/query/storage와 broad editor 변경 완료 시: `npm run build`

로컬이 운영 Supabase를 바라보므로 자동 테스트는 persistence mock 또는 별도 test boundary를 사용한다. 운영 후보의 수정·삭제는 명시적인 수동 QA에서만 수행한다.

## 12. 위험과 대응

| 위험 | 대응 |
| --- | --- |
| 기존 kind↔slot effect와 새 slot 주도 상태 충돌 | `assetKind` state 제거, workspace slot에서 단방향 파생 |
| async 파일 응답이 다른 후보 draft를 덮음 | request token과 candidate ID 확인 |
| 분석 effect가 저장된 bubble geometry를 초기화 | create 파일 선택과 edit hydrate effect 분리 |
| update 직후 이전 targets/spec 표시 | 관계 저장 후 authoritative candidate 재조회 |
| 현재 슬롯 후보가 뒤 페이지에 숨음 | target-aware 서버 query와 stable cursor |
| Android/iOS 슬롯 metadata 손실 | role별 `variants` 모델 |
| 빌더 Android 파일을 iOS에서 사용 | `admin_asset_variants`와 요청 platform 우선 선택 |
| recipe만 저장되고 장식 원본이 없음 | layer ID별 decoration storage와 재진입 검증 |
| builder update 도중 일부 파일만 교체 | revisioned upload, DB transaction/RPC, 보상 삭제 |
| 수동 geometry가 builder 재적용으로 사라짐 | geometry mode 표시와 적용 전 확인 |
| 공통 editor 추출로 `/edit` builder 회귀 | 기존 dialog 테스트 유지, 공통 editor contract test |
| 고정 3-pane이 확대 배율에서 깨짐 | 최소 너비 정의, `minmax`, overflow와 125/150% QA |

## 13. 완료 정의

- `/admin/assets`가 전체화면 3-pane과 하단 Library 도크로 동작한다.
- 슬롯이 kind와 platform metadata의 유일한 선택 기준이다.
- dirty 편집 내용이 암묵적으로 유실되지 않는다.
- 현재 슬롯 후보 검색·필터·페이지네이션이 전체 데이터 기준으로 정확하다.
- 일반 이미지와 수동 말풍선을 큰 Stage에서 생성·수정할 수 있다.
- 최근 말풍선 빌더의 recipe, 복수 장식, collision validation을 관리자 Stage에서 사용할 수 있다.
- 빌더 후보 하나가 선택 role의 Android/iOS 렌더 파일과 geometry를 함께 가진다.
- 빌더 후보를 다시 열어 recipe와 장식 원본을 복원하고 재생성할 수 있다.
- 저장 직후 반환값과 새로고침 후 DB 상태가 일치한다.
- 사용자 `/edit`, preview, Android/iOS export가 요청 platform에 맞는 동일 variant를 사용한다.
- 기존 one-file 관리자 후보와 `/edit` 말풍선 빌더에 회귀가 없다.
