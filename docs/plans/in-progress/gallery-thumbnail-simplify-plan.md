# 템플릿 갤러리 썸네일 단순화 — 깨지는 레이아웃 정리

`/template` 갤러리 카드의 썸네일 레이아웃이 깨지는 문제를 해결한다. 상세 프리뷰는 이미 모달
(`TemplatePreviewModal`, 4화면 스와이프)이 담당하므로, 갤러리 카드는 **텍스트 없는 정적 요약 이미지**로
역할을 축소한다: 메인 배경 · 탭 아이콘 · 기본 프로필 · 채팅방 배경 · 채팅 말풍선(글자 없이 이미지 느낌만).

> 상태: `thumbnail.ts` 재작성·탭 아이콘·재굽기 동기화 구현 완료(타입체크·lint 통과). 남은 것: `/admin/edit` 저장 → `/template` 갤러리 카드 로컬 육안 QA.
> 참고: `/template` → `/edit` 흐름 → [../../architecture/ux-flow.md](../../architecture/ux-flow.md)
> 참고: 시스템 템플릿 라인업 기획 → [system-template-lineup-plan.md](system-template-lineup-plan.md)

## 문제의식

갤러리 카드 썸네일은 두 경로로 렌더링된다.

1. **정적 webp** — `visual.cardPreviewImage`가 있으면 `lib/theme/systemTemplates/thumbnail.ts`가
   canvas(640×480)로 구운 webp를 `<img class="aspect-[4/3] object-cover">`로 표시한다.
   (`components/template/TemplateGalleryClient.tsx`의 `TemplateVisualPreview`)
2. **React fallback** — webp가 없으면 같은 컴포넌트의 thumb/card JSX가 색·이미지로 목업을 그린다.

레이아웃이 깨지는 쪽은 **1번 `thumbnail.ts`가 굽는 정적 webp**다. 현재 canvas는:

- 하드코딩된 좌표(`24 / 316 / 345 / 420 …`)로 좌(메인)·우(채팅) 2패널을 그린다. 콘텐츠·색 조합에
  따라 여백/정렬이 어긋난다.
- 갤러리에서 이미 버리기로 한 **텍스트를 굽는다**: `"친구"`, 말풍선 안의 `"안녕"` · `"좋아!"` ·
  `"테마 미리보기"`. 카드 크기로 축소되면 글자가 뭉개져 깨져 보이는 주범이다.
- 탭바를 실제 탭 아이콘이 아니라 **원형 점 5개**(`context.arc`)로 흉내 낸다 → 요구하는 "탭 아이콘"
  표현이 아니다. `tab_icon_*` role은 로드조차 하지 않는다.
- 말풍선을 `drawThumbnailBubble` → `drawPreviewBubble`(나인패치)로 **별도 캔버스에 그린 뒤 축소 합성**
  한다. 스케일(`bubbleRenderScale = 0.5`)·에셋 로드 실패 시 빈 영역/찌그러짐이 생긴다.

즉 "상세 정보를 담으려다" 카드 크기에서 깨진다. 상세는 모달이 맡으므로 카드는 **한눈에 무드만 전달**
하면 된다.

## 목표 / 완료 기준

- [x] 갤러리 카드 정적 썸네일에 **텍스트가 전혀 없다**(글자 렌더링 코드 제거 — `fillText` 전부 삭제, 말풍선 `text:""`).
- [x] 썸네일이 다음 요소만 담는다: 메인 배경 · 채팅방 배경 · **실제 탭 아이콘** · 기본 프로필 ·
      채팅 말풍선(글자 없이 이미지/색상만).
- [x] 코드상 폴백 처리: 말풍선 에셋이 없으면 `drawBubble`이 단색 캡슐로, 탭 아이콘이 없으면 폴백 도형으로 마감(로드 실패는 try/catch로 흡수).
- [ ] 대표 시스템 템플릿(basic + 라인업 후보) · 이미지 없는 색상만 템플릿 · 나인패치 말풍선 템플릿에서
      **여백/정렬이 깨지지 않는다**(로컬 육안 확인 — 남음).
- [ ] React fallback(`TemplateVisualPreview` thumb)과 정적 webp의 구성 요소가 **시각적으로 일관**된다(육안 확인 시 판단 — 남음).

## 설계 방향

### 1. 레이아웃: 하드코딩 좌표 → 비율 기반 영역

`thumbnail.ts`의 절대 좌표 배치를 canvas 크기 기준 **비율 그리드**로 바꾼다. 카드가 `aspect-[4/3]`
`object-cover`이므로 canvas도 4:3(예: 지금의 640×480 유지)로 두되, 내부는 좌(메인) : 우(채팅)
2-컬럼 + 하단 탭바 스트립 정도의 단순 구조로 정리한다. 목표는 "화면 재현"이 아니라 "무드 요약"이다.

권장 구성(안):

- 좌측 컬럼: `main_background` 배경 + 상단에 `profile_image_1`(기본 프로필) 원형 1~2개.
- 우측 컬럼: `chat_background` 배경 + 말풍선 캡슐 2~3개(you/me 번갈아, **텍스트 없음**).
- 하단 스트립: **탭 아이콘** 5개(`tab_icon_*`)를 `tab_background` 위에 배치. 아이콘 없으면 폴백 도형.

### 2. 텍스트 제거

`context.fillText(...)` 호출을 전부 제거한다(헤더 `"친구"`, 말풍선 3개 텍스트). `drawThumbnailBubble`
`options.text`도 제거하고, 말풍선은 **이미지(나인패치 fill) 또는 단색 캡슐**만 그린다.

### 3. 탭 아이콘 실제 렌더링

- `thumbnail.ts`의 `imageRoles`에 탭 아이콘 role을 추가로 로드한다. role 목록은
  `lib/theme/systemTemplates/preview.ts`의 `tabIconRoleByKey`(친구/채팅/Now/쇼핑/더보기 및 focused)와
  일치시킨다. 정적 썸네일은 **비포커스 5종**(`tab_icon_friends` 등)만 있으면 충분하다.
- 아이콘이 없으면 지금처럼 도형 폴백을 그리되, "점" 대신 fallback 컬러 사각/원으로 통일한다.

### 4. 재굽기 경로 동기화 (놓치기 쉬운 지점)

썸네일을 굽는 진입점이 **두 곳**이다. 둘 다 role 목록을 맞춰야 한다.

- 최초 저장: `supabaseRepository.ts`의 `createAndUploadTemplateThumbnail` → `generateSystemTemplateThumbnail(input)`
  (로컬 `File` 사용).
- 재굽기: `supabaseRepository.ts`가 원격 서명 URL을 `imageUrlByRole`로 주입 → 여기서
  `thumbnailRoles`(현재 `main_background, chat_background, bubble_me_1, bubble_you_1, profile_image_1`)에
  **탭 아이콘 role을 추가**하지 않으면 재굽기 시 탭 아이콘이 비어 저장 경로별로 결과가 달라진다.

### 5. React fallback과 일관성

`TemplateVisualPreview`의 thumb 분기(`MiniBubbleSwatch` 등)는 이미 텍스트 없이 배경+말풍선만 그린다.
정적 webp의 구성(프로필·탭 아이콘 포함)과 어긋나지 않게, 필요하면 thumb 분기에 탭 아이콘 행을 맞춰
추가할지 이 단계에서 함께 결정한다. (fallback은 webp가 아직 안 구워졌을 때만 보이므로 우선순위는 낮음.)

## 범위 밖 (건드리지 않음)

- 모달 상세 프리뷰(`TemplatePreviewModal`, 4화면)와 `edit` 편집기 미리보기 — 이번 변경 대상 아님.
- `ThemeResourceRole`/슬롯 계약, 색·업로드 해석 경로(`getResolved*`) — 읽기만 한다.
- `cardPreviewPath` 저장 위치·서명 URL 파이프라인 — 유지.

## 작업 순서(안)

1. `thumbnail.ts` 레이아웃을 비율 기반으로 재작성 + 모든 텍스트 렌더링 제거.
2. 탭 아이콘 role 로드·렌더링 추가(+아이콘 없을 때 폴백).
3. `supabaseRepository.ts` 재굽기 `thumbnailRoles`에 탭 아이콘 role 반영.
4. 대표 템플릿 3종(이미지형/색상형/나인패치형)으로 로컬 저장 후 갤러리 카드 육안 확인.
5. 필요 시 `TemplateVisualPreview` thumb 분기 구성 요소 정렬.

## 검증

- `thumbnail.ts`는 순수 로직이 아니라 canvas(브라우저) 의존이므로 자동 테스트보다 **로컬 육안 검증**이
  핵심이다: `/admin/edit`에서 시스템 템플릿 저장 → `/template` 갤러리 카드(모바일 thumb/데스크톱 card)
  확인.
- 타입/계약 변경이 생기면 `npx tsc --noEmit`.
- Korean UI 텍스트는 이번 변경으로 canvas에서 제거되므로 `npm run check:text` 대상 아님(문구 미변경 시).
