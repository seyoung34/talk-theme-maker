# admin/assets 편집 워크스페이스 계획 리뷰

> 리뷰 대상: `docs/plans/planned/admin-assets-workspace-plan.md`
>
> 목적: 구현 착수 전에 데이터 정합성, 편집 상태 수명주기, 목록 조회 계약, 검증 범위를 보완한다.
>
> 전달 대상: 계획을 수정하거나 구현할 담당자(Claude 포함).
>
> 반영 상태: 2026-07-25 원 계획에 반영 완료. 원 계획은 Phase 0, platform variants, workspace draft, target-aware query, authoritative update, 말풍선 빌더 저장 계약을 포함하도록 개정되었다. 이 문서는 리뷰 근거와 결정 이력을 보존한다.

## 1. 총평

Figma형 3-pane, 중앙 Stage, 하단 Library 도크, 생성·편집 통합이라는 UX 방향은 타당하다. 현재 화면의 가로 공간 낭비, 작은 프리뷰, 세로 스택, 편집 모달 문제를 직접 해결한다.

다만 현재 계획은 화면 배치에는 충분하지만 실제 구현 계약으로는 다음 영역이 부족하다.

- 기존 후보를 수정할 때 사용하는 draft의 수명주기
- 비동기 원본 파일 로드와 말풍선 geometry 보존
- 기존 후보의 이미지 크롭·교체 지원 범위
- 현재 슬롯 기준 목록·검색·페이지네이션의 정확성
- Android/iOS별 슬롯 metadata 보존
- 저장 직후 authoritative candidate를 반환하는 update 계약
- 상태 리팩터에 상응하는 자동 검증

아래 P1 항목을 해결하지 않고 UI부터 구현하면 Phase 3에서 저장·검색 구조를 다시 변경할 가능성이 높다.

## 2. 우선 보완사항

### P1-1. 말풍선 수정 결과의 authoritative 반환 보장

원 계획은 기존 `updateAdminAssetCandidate`를 유지·재사용한다고 명시한다.

- 계획 근거: `admin-assets-workspace-plan.md:85`
- 코드 근거: `lib/theme/adminAssets.ts:159-190`

현재 update 순서는 다음과 같다.

1. `admin_assets` row를 update하고 관계 데이터를 select한다.
2. target과 bubble spec 테이블을 교체한다.
3. 처음 select한 데이터로 반환 candidate를 만든다.

새 bubble spec은 1번의 select 이후 저장되지만 3번의 반환 데이터에는 주입되지 않는다. 또한 candidate의 `bubbleAdjustment`는 `bubble_adjustment` row 값이 아니라 bubble spec으로부터 다시 만들어진다. 따라서 in-place 편집에서 저장 성공 직후 Stage와 Library 도크에 이전 geometry가 다시 표시될 수 있다.

#### 요청사항

다음 중 한 가지 방식으로 update 반환 계약을 고친다.

- 관계 테이블 교체 후 candidate를 다시 조회한다.
- 새 targets와 bubble spec을 반환 row에 합성한 후 candidate로 변환한다.
- update 이후 전용 `getAdminAssetCandidate(id)`로 authoritative row를 조회한다.

#### 완료 기준

- 수정 저장 직후 Stage와 Library 도크에 새 geometry가 표시된다.
- 브라우저 새로고침 후에도 동일한 geometry가 표시된다.
- target을 변경한 경우 저장 직후 target 요약도 새 값으로 표시된다.

### P1-2. 기존 후보의 이미지 크롭·교체 지원 범위 확정

계획 내 표현이 서로 충돌한다.

- 목표 레이아웃은 일반 이미지에 `정적 프리뷰 + 크롭`을 배치한다: 계획 `:41`, `:56`
- 편집 루프는 기존 후보에서 이름·대상·geometry만 수정한다고 설명한다: 계획 `:71`

현재 update 계약에는 파일, 파일명, MIME, analysis를 변경하는 필드가 없다.

- `lib/theme/adminAssetDomain.ts:72-78`
- `lib/theme/adminAssets.ts:159-190`

또한 `ImageEditDialog`는 신규 등록용 `file` 상태에만 연결되어 있다.

- `components/admin/AdminAssetsClient.tsx:629-637`

#### 요청사항

이번 범위에서 아래 중 하나를 명시적으로 선택한다.

**권장: 기존 후보는 파일 교체 불가**

- 신규 생성에서는 크롭을 제공한다.
- 기존 후보 편집에서는 이미지 프리뷰만 제공한다.
- 기존 후보의 수정 범위는 이름, target, 활성 상태, 말풍선 geometry로 제한한다.
- 이미지 교체는 별도 후속 Phase로 분리한다.

**대안: 기존 후보도 파일 교체 가능**

- update input에 blob, fileName, mimeType, analysis를 추가한다.
- 동일 storage path overwrite 또는 새 path 교체 정책을 정한다.
- DB update 실패 시 storage 롤백 정책을 정한다.
- signed URL 갱신과 브라우저 캐시 무효화를 처리한다.
- 교체 후 Stage와 Library 썸네일이 즉시 갱신되는지 검증한다.

### P1-3. `editingCandidateId`보다 명확한 workspace draft 모델 필요

계획은 `editingCandidateId`가 `editingAsset`과 모달을 대체한다고 정의하지만, ID 하나로는 편집 상태를 안전하게 표현하기 어렵다.

편집 상태에는 최소한 다음 값이 필요하다.

- 편집 대상의 원본 snapshot
- 변경 중인 title, target mode, geometry
- 원본 파일 로딩 상태와 오류
- dirty 여부
- 현재 비동기 요청 식별자
- 저장 또는 삭제 진행 상태

기존 공용 `file` 상태를 편집에도 그대로 쓰면 말풍선 geometry가 덮일 위험이 있다.

- 파일 분석 effect: `components/admin/AdminAssetsClient.tsx:117-138`
- analysis 변경 시 bubble adjustment 초기화: `components/admin/AdminAssetsClient.tsx:112-115`

기존 말풍선 파일을 `file`에 넣으면 분석 완료 후 저장된 adjustment가 자동 기본값으로 바뀔 수 있다.

#### 권장 모델

```ts
type AdminAssetWorkspaceDraft =
  | {
      mode: "create";
      slotId: string;
      file?: File;
      title: string;
      analysis?: AdminAssetAnalysis;
      bubbleAdjustment?: AdminBubbleAdjustment;
      dirty: boolean;
    }
  | {
      mode: "edit";
      candidateId: string;
      original: AdminAssetCandidate;
      sourceFile?: ThemeProjectFile;
      title: string;
      targets: readonly AdminAssetTargetInput[];
      bubbleAdjustment?: AdminBubbleAdjustment;
      dirty: boolean;
      sourceStatus: "idle" | "loading" | "ready" | "error";
    };
```

실제 구현에서는 reducer 또는 전용 hook으로 다음 전환을 한곳에서 관리하는 편이 안전하다.

- 슬롯 선택 → create draft 초기화
- 후보 선택 → edit draft hydration 시작
- 원본 파일 로드 성공/실패
- 저장 시작/성공/실패
- 삭제 성공
- 새 파일 선택/붙여넣기/드롭
- 편집 취소

#### 반드시 정의할 전환 규칙

- 수정 중 다른 슬롯을 선택할 때
- 수정 중 다른 후보를 선택할 때
- 수정 중 이미지를 붙여넣거나 드롭할 때
- 저장 중 Navigator 또는 Library 선택을 변경할 때
- 현재 편집 후보를 삭제했을 때
- 후보 A 파일 로딩 중 후보 B를 선택했을 때

dirty draft 이동 확인은 입력 유실 방지 기능이므로 Phase 4 파워유저 항목으로 미루지 않는다.

### P1-4. 슬롯 기준 목록·검색·페이지네이션 계약 보완

계획은 Library 도크를 “현재 슬롯 후보”로 정의하고 검색·필터·load-more를 제공한다.

- 계획 `:58`, `:73-74`, `:101-105`

현재 구현은 서버에서 `assetKind`만 필터링한 최대 24개를 받은 뒤, 현재 슬롯 노출 여부와 검색을 클라이언트에서 적용한다.

- 요청: `components/admin/AdminAssetsClient.tsx:169-177`
- 클라이언트 필터: `components/admin/AdminAssetsClient.tsx:80-104`
- 서버 쿼리: `lib/theme/adminAssets.ts:78-105`

이 구조에서는 다음 문제가 발생한다.

- 첫 페이지가 같은 kind의 다른 슬롯 후보로 채워지면 현재 슬롯 도크가 비어 보일 수 있다.
- 일치 후보가 뒤 페이지에 있어도 사용자가 알 수 없다.
- 검색은 전체 라이브러리가 아니라 이미 로드된 일부만 검색한다.
- 필터 후 결과 개수가 아니라 필터 전 결과를 기준으로 cursor가 진행된다.

#### 요청사항

다음을 계획에 명시한다.

- `slotRole`과 candidate target을 기준으로 서버 또는 RPC에서 목록을 필터링한다.
- `exact_role`, `asset_kind`, `shape_rule` target의 슬롯 포함 규칙을 도메인 함수로 단일화한다.
- 검색이 전체 서버 검색인지 “불러온 후보 내 검색”인지 확정한다.
- 전체 검색이라면 query와 cursor에 검색어와 필터 조건을 포함한다.
- filter 적용 후에도 cursor가 누락·중복 없이 동작하도록 한다.

필요하면 `listAdminAssetCandidatePage`와 별도로 관리자 워크스페이스 전용 query를 둔다.

### P2-1. 플랫폼 variant를 보존하는 통합 슬롯 모델 필요

현재 `getUnifiedAdminAssetSlots`는 Android 슬롯을 먼저 순회한 뒤 같은 role의 iOS 슬롯을 제거한다.

- `components/admin/AdminAssetsClient.tsx:682-691`

그러나 `ThemeAssetSlot`은 platform, fileName, constraints 등 플랫폼별 metadata를 가진다.

- `lib/theme/templates.ts:94-120`

실제 공통 role도 플랫폼별 정보가 다르다.

- `main_background`: Android에는 1080×1920 권장 크기가 있으나 iOS metadata는 다르다.
- `theme_icon`: Android 권장 크기는 144×144, iOS는 162×162이다.
- 말풍선과 여러 아이콘은 플랫폼별 fileName이 다르다.

따라서 단일 Android 대표 슬롯만 유지한 상태에서 Android/iOS 토글을 추가하면 Inspector의 constraints, 가이드, 파일명, target 설명이 부정확할 수 있다.

#### 권장 모델

```ts
type AdminAssetWorkspaceSlot = {
  key: string;
  role: ThemeResourceRole;
  kind: AdminAssetKind;
  label: string;
  variants: Partial<Record<ThemePlatform, ThemeAssetSlot>>;
};
```

#### 요청사항

플랫폼 토글이 다음 항목 중 무엇을 바꾸는지 정의한다.

- Stage 렌더링
- 권장 크기와 constraints
- guidance
- 대상 파일명
- 말풍선 markers/insets/stretch 편집 UI
- 저장 target 요약

### P2-2. 컴포넌트와 상태 경계 명시

현재 `AdminAssetsClient.tsx`는 약 1,260행이며 목록 조회, 이미지 분석, 생성, 수정, 삭제, target 파생, geometry UI를 모두 포함한다. 계획대로 3-pane과 in-place 편집을 한 파일에 추가하면 상태 결합도가 더 높아질 가능성이 크다.

#### 권장 경계

- `AdminAssetsWorkspace`: 전체 orchestration과 저장 작업
- `AdminAssetsNavigator`: kind/slot tree
- `AdminAssetStage`: 파일 drop/paste, preview, crop, bubble adjuster
- `AdminAssetInspector`: draft 필드, guidance, targets, save/delete
- `AdminAssetLibraryDock`: query controls, filmstrip, load-more
- `useAdminAssetWorkspaceDraft` 또는 reducer: create/edit 전환
- `lib/theme/adminAssetWorkspace.ts`: 순수 slot/target/filter 파생 함수

넓은 TSX 전체 재작성은 피하고, 먼저 순수 함수와 상태 전환을 추출한 뒤 pane을 분리한다.

### P2-3. 저장 상태와 알림 역할 정리

계획은 슬림 툴바에 “저장상태/알림”을 배치하지만 토스트는 Phase 4로 미룬다.

- 계획 `:15`, `:36`
- Phase 4: 계획 `:107-109`

툴바 표시가 일시 notice인지, 현재 draft 저장 상태인지 구분해야 한다.

#### 권장 상태

- `저장되지 않은 변경사항`
- `저장 중`
- `저장됨`
- `저장 실패 — 재시도 필요`

성공 안내는 일정 시간 후 사라져도 되지만 저장 실패와 dirty 상태는 자동으로 사라지면 안 된다.

## 3. 권장 구현 순서

기존 Phase 1 앞에 다음 Phase 0을 추가한다.

### Phase 0 — 상태·데이터 계약

- [ ] 기존 후보의 파일 교체 지원 여부 확정
- [ ] 플랫폼 variant를 보존하는 workspace slot 모델 정의
- [ ] create/edit draft와 전환 규칙 정의
- [ ] dirty draft 이탈 확인 규칙 정의
- [ ] target-aware 목록·검색·페이지네이션 계약 정의
- [ ] `updateAdminAssetCandidate` authoritative 반환 수정
- [ ] 위 순수 로직과 update 결과에 대한 테스트 추가

완료 기준:

- create/edit 상태 전환표가 문서화되어 있다.
- 플랫폼별 슬롯 metadata가 손실되지 않는다.
- 현재 슬롯 목록과 검색의 범위가 명확하다.
- update 직후 반환 candidate가 DB 최종 상태와 일치한다.

### Phase 1 — 앱 셸 및 상태 경계

- 3-pane과 도크 골격을 만든다.
- 기존 동작을 pane별 컴포넌트로 이동한다.
- workspace draft/reducer를 연결한다.
- 슬롯 변경과 candidate 변경의 dirty guard를 적용한다.

### Phase 2 — 스테이지

- 신규 파일 drop/paste/select와 큰 프리뷰를 구현한다.
- 플랫폼 variant에 따라 constraints와 guidance를 갱신한다.
- 말풍선 원본 비동기 로드에 요청 식별자를 적용한다.
- 이전 candidate의 늦은 응답이 현재 draft를 덮지 않게 한다.
- 기존 후보 이미지 교체를 지원하지 않는다면 크롭 버튼을 create mode에만 표시한다.

### Phase 3 — Library 도크 및 in-place 편집

- target-aware query를 연결한다.
- 검색·필터·cursor 조건을 서버 계약과 맞춘다.
- candidate 선택 시 edit draft를 hydrate한다.
- 저장·삭제 후 선택과 draft 상태를 정리한다.
- 모달 편집 경로를 제거한다.

### Phase 4 — 파워유저

기존 계획의 단축키, 토스트, 저장 후 계속, 배치 업로드를 유지한다. 단, dirty guard와 persistent error 표시는 Phase 4로 미루지 않는다.

## 4. 검증 계획 보완

기존 `npx tsc --noEmit`, `npm run lint`, `npm run check:text`에 아래 검증을 추가한다.

### 순수 함수 테스트

- Android/iOS platform variant가 동일 workspace slot에 보존된다.
- 슬롯에서 kind와 save targets가 정확히 파생된다.
- candidate target 종류별 슬롯 노출 판정이 정확하다.
- Library query 조건과 cursor가 필터 변경 시 초기화된다.

### 컴포넌트/상태 테스트

- 후보 A 로딩 중 후보 B 선택 시 A의 응답을 무시한다.
- 저장된 bubble geometry가 파일 분석 후에도 유지된다.
- dirty 상태에서 슬롯 또는 후보 변경 시 확인 절차가 실행된다.
- create mode는 `saveAdminAssetCandidate`를 호출한다.
- edit mode는 `updateAdminAssetCandidate`를 호출한다.
- update 성공 후 새 geometry와 targets가 Stage와 Library에 반영된다.
- 편집 중인 후보 삭제 후 create 또는 명시적 empty 상태로 전환된다.
- 저장 실패 시 draft가 보존되고 오류가 자동으로 사라지지 않는다.

### 브라우저 QA

- 빈 목록, loading, error, load-more 종료 상태
- 만료되거나 로드에 실패한 signed URL
- 긴 후보 이름과 긴 슬롯 이름
- Library 도크 열기/접기와 pane별 독립 스크롤
- Windows 100%, 125%, 150% 배율
- 최소 지원 데스크톱 너비
- 키보드 focus 순서와 focus-visible
- 삭제 확인 다이얼로그
- Android/iOS 전환 시 guidance와 geometry 요약

### 운영 데이터 주의

로컬이 운영 Supabase를 바라보므로 자동 테스트는 persistence mock 또는 별도 테스트 경계를 사용한다. 운영 데이터 수정·삭제는 명시적인 수동 QA 시나리오에서만 수행한다.

## 5. 계획 수정 시 답해야 할 결정사항

1. 기존 후보의 이미지 자체를 교체하거나 다시 크롭할 수 있는가?
2. dirty 편집 상태에서 슬롯 또는 후보를 바꿀 때 어떤 확인 UX를 사용할 것인가?
3. 검색은 전체 관리 후보를 서버에서 검색하는가, 현재 로드된 후보만 검색하는가?
4. `shape_rule`과 `asset_kind` target을 현재 슬롯 후보에 포함하는 정확한 규칙은 무엇인가?
5. 플랫폼 토글 시 constraints와 guidance도 해당 플랫폼 기준으로 바뀌는가?
6. 저장 성공 후 update 결과를 재조회할 것인가, 클라이언트에서 합성할 것인가?
7. Library에서 편집 중인 후보가 현재 검색·필터 조건에서 사라질 경우 Stage 편집은 유지할 것인가?

## 6. Claude 전달용 요청문

아래 요청문과 이 문서를 함께 전달하면 된다.

> `docs/plans/planned/admin-assets-workspace-plan.md`를 구현하기 전에  
> `docs/plans/planned/admin-assets-workspace-plan-review.md`의 리뷰를 반영해 계획을 보완해 주세요.
>
> 특히 P1 항목인:
>
> 1. 말풍선 update의 authoritative 반환,
> 2. 기존 후보 이미지 크롭/교체 범위,
> 3. create/edit workspace draft와 비동기 전환 규칙,
> 4. 슬롯 기준 목록·검색·페이지네이션 계약
>
> 을 먼저 확정해 주세요.
>
> 원 계획의 UX 방향은 유지하되 Phase 0을 추가하고, 각 결정에 맞게 구현 단계와 완료 기준 및 테스트 시나리오를 구체화해 주세요. 계획 변경만 수행하고 아직 제품 코드는 수정하지 마세요.
