# TalkTheme 에셋 Role/Slot 및 AI 프롬프트 가이드

이 문서는 사용자가 제공한 사진이나 아트 디렉션을 바탕으로 AI가 카카오톡 테마용 배경, 탭 아이콘, 말풍선, 프로필, 잠금화면 에셋을 만들 때 사용하는 설계 계약이다. 생성 모델에 전달할 문구뿐 아니라 생성 전 입력, 역할 간 일관성, 후처리, 검증 기준까지 정의한다.

이 문서는 설명용 복사본이다. 실제 슬롯과 export 계약의 단일 소스는 다음 파일이다.

- `lib/theme/types.ts`: 플랫폼 공통 의미 계약인 `ThemeResourceRole`
- `lib/theme/templates.ts`: `ThemeAssetSlot` 구조와 템플릿 기본값
- `lib/theme/manifest/android.slots.json`: Android slot, 파일명, 경로, 필수 여부, export mapping
- `lib/theme/manifest/ios.slots.json`: iOS slot, 파일명, CSS selector/property, 필수 여부
- `lib/theme/project/state.ts`: 이미지→색상 fallback, 프로필 fallback, 선택 상태
- `lib/theme/preview/bubbleCanvas.ts`: Android 9-slice와 iOS cap-inset 말풍선 렌더링

현재 manifest 기준으로 Android는 89개 slot(이미지 40, nine-patch 5, 색상 44), iOS는 79개 slot(이미지 38, 색상 41)을 가진다. 개수나 ID가 바뀌면 이 문서도 함께 검토한다.

공식 적용 기준은 카카오톡 사용자 테마 제작가이드 26.3.0 Android/iOS PDF를 2026-07-22에 대조했다. 아래에서 `지원`은 현재 manifest·project state·export가 처리하는 항목, `부분 지원`은 fallback 또는 preview QA가 남은 항목을 뜻한다. 공식 규격과 현재 구현의 차이는 [개선 계획](../../docs/plans/in-progress/asset-role-slot-guide-improvement-plan.md)에 기록한다.

## 1. Role과 slot의 구분

`role`은 UI, preview, export, DB metadata 사이에서 공유되는 안정적인 의미다. 예를 들어 `chat_background`는 플랫폼과 파일명이 달라도 항상 “말풍선 뒤의 채팅방 배경”을 뜻한다.

`slot`은 role을 실제 플랫폼 리소스에 연결한 구체적인 대상이다. slot에는 다음 정보가 붙는다.

- `id`: 프로젝트 override의 key. 프롬프트 결과를 저장할 때도 role이 아니라 이 ID를 사용한다.
- `platform`: `android` 또는 `ios`
- `kind`: `image`, `ninepatch`, `color`
- `required`: export에 기본 리소스가 반드시 있어야 하는지 여부
- `fileName`, `path`, `export`: 패키지 파일 계약
- `cssSelector`, `cssProperty`: iOS 테마 CSS 계약
- `note`: 사용 화면과 제작 시 주의점
- `constraints`: 비율·권장 크기·crop 기준·alpha·runtime note. 프롬프트와 향후 업로드 진단이 재사용할 구조화된 제약

AI는 role의 의미를 먼저 이해하고, 선택된 플랫폼의 slot 제약을 덧붙여야 한다. 같은 role을 Android와 iOS에 적용한다고 해서 동일한 픽셀 파일을 무조건 복사하면 안 된다.

## 2. 프롬프트 생성의 공통 원칙

### 2.1 입력 계약

한 번의 생성 요청에는 최소한 다음 정보가 있어야 한다.

```json
{
  "referenceUsage": "owned | commercially-licensed | inspiration",
  "referenceTreatment": "preserve-subject | palette-and-mood-only | motif-only",
  "platform": "android | ios | shared-concept",
  "role": "chat_background",
  "slotIds": ["android-chat-background"],
  "pairedRoles": [],
  "target": {
    "width": 1080,
    "height": 1920,
    "alpha": "opaque | transparent | mixed",
    "fit": "cover | contain | exact"
  },
  "artDirection": "사용자가 원하는 분위기와 스타일",
  "palette": ["#RRGGBB"],
  "compositionRules": [],
  "negativeRules": [],
  "postProcess": [],
  "validation": []
}
```

`target.width`와 `target.height`는 프롬프트 작성자가 임의로 추측하지 않는다. 현재 선택된 기본 에셋, slot metadata, 또는 export target에서 읽은 값을 사용한다. manifest가 크기를 선언하지 않으면 생성 후 slot 전용 편집 단계에서 정확한 크기로 자른다.

### 2.2 모든 생성 이미지에 적용할 규칙

- reference의 소유·상업 이용 상태를 기록한다. `inspiration`은 원본 구도나 캐릭터를 복제하는 허가가 아니다.
- 로고, 워터마크, 서명, 읽을 수 있는 문구, UI 스크린샷, 유명 캐릭터, 제3자 상표를 생성하지 않는다.
- role이 요구하지 않는 버튼, 채팅 말풍선, 사람 이름, 배지, 앱 아이콘을 이미지 안에 미리 그려 넣지 않는다.
- 같은 테마의 모든 에셋은 팔레트, 선 굵기, 모서리 반경, 광원 방향, 질감 밀도를 공유한다.
- 작은 UI 에셋에는 사진의 세부 묘사를 그대로 축소하지 않는다. reference의 색·실루엣·대표 모티프만 단순화한다.
- 투명 배경이 필요한 에셋은 checkerboard나 흰색 배경을 그리지 말고 실제 alpha를 사용한다.
- 생성 결과는 preview와 export가 읽을 수 있는 실제 PNG/JPEG/WEBP여야 한다. 확장자만 바꾼 파일은 허용하지 않는다.
- 여러 상태가 있는 role은 각각 생성하지 말고 한 batch에서 같은 seed/스타일 지시로 만든다.

### 2.3 공통 negative prompt

아래 항목을 기본 negative prompt로 사용하고 role별 금지 요소를 추가한다.

```text
logo, watermark, signature, readable text, letters, numbers unless explicitly required,
copyrighted character, celebrity likeness, app screenshot, UI mockup baked into artwork,
low resolution, JPEG artifacts, accidental border, inconsistent lighting,
cropped essential subject, duplicate subject, malformed geometry, fake transparency
```

### 2.4 후처리와 검증

- 생성 모델에는 9-patch marker나 iOS cap-inset 선을 그리게 하지 않는다. artwork 생성 후 deterministic editor가 marker/inset/stretch 값을 적용한다.
- 배경 에셋은 실제 헤더, 이름, 상태 메시지, 시간, 말풍선, 입력바를 겹친 preview에서 읽기 쉬운지 확인한다.
- 일반 텍스트는 배경과 4.5:1, 큰 텍스트와 핵심 아이콘은 3:1 이상의 대비를 목표로 한다.
- 선택/눌림 상태는 색만 아주 미세하게 바꾸지 않는다. 실제 크기 preview에서 구분되는 fill, 굵기, 명도 중 하나 이상을 바꾼다.
- role pair 사이의 canvas 크기, 중심, optical weight가 동일한지 확인한다.
- export 직전에는 slot ID, 플랫폼, 파일 형식, 실제 픽셀 크기, alpha, 안전 영역을 다시 검사한다.

## 3. 배경 계열

### 3.1 `main_background`

| 플랫폼 | slot | kind | 필수 |
| --- | --- | --- | --- |
| Android | `android-main-background` | image | 예 |
| iOS | `ios-main-background-image` | image | 예 |

친구 목록과 채팅 목록의 넓은 배경이다. 사진을 직접 살리는 데 가장 적합한 role이다.

프롬프트 규칙:

- 이름, 상태 메시지, 목록 셀이 올라오는 중앙 영역의 대비와 시각적 복잡도를 낮춘다.
- 주요 피사체는 상단 헤더와 하단 탭에 가려지지 않게 배치하고, 화면 crop을 고려해 넉넉한 여백을 둔다.
- 작은 반복 무늬는 목록 텍스트의 획과 경쟁하지 않도록 낮은 대비와 낮은 밀도로 제한한다.
- 사진을 유지할 때는 `preserve-subject`; 색감만 차용할 때는 `palette-and-mood-only`를 명시한다.
- 이미지가 비활성화되면 `main_background_color`가 보이므로 가장자리와 투명 영역은 fallback 색과 조화를 이뤄야 한다.

공식 적용 기준과 지원 상태:

- Android: 가로:세로 `1:2`, `top-center` 기준 cover crop, 권장 `1080×1920px`(지원: manifest constraint).
- iOS: 상단/중앙 기준 crop(지원: manifest constraint). 공식 가이드는 Android처럼 고정 비율을 제시하지 않으므로 선택된 2x source와 preview overlay로 최종 crop을 확인한다.

### 3.2 `chat_background`

| 플랫폼 | slot | kind | 필수 |
| --- | --- | --- | --- |
| Android | `android-chat-background` | image | 예 |
| iOS | `ios-chat-background-image` | image | 예 |

말풍선, 시간, 읽지 않음 숫자, 날짜 구분선 뒤에 표시된다. Android는 가로:세로 `1:2`, `1080×1920px` 기준이다(지원: manifest constraint). iOS는 고정 비율을 추측하지 않고 2x source와 실제 preview를 기준으로 한다.

프롬프트 규칙:

- 화면 중앙과 좌우 말풍선 경로에 얼굴, 글자, 강한 윤곽선, 고주파 무늬를 두지 않는다.
- 위아래로 긴 화면에서 자연스럽게 crop되거나 연장될 수 있는 구도를 사용한다.
- `bubble_me_*`, `bubble_you_*`, `chat_unread_count_color`와 동시에 preview해 양쪽 말풍선이 모두 분리되는지 확인한다.
- full-bleed 배경으로 만들고 의도하지 않은 테두리나 흰 여백을 금지한다.
- 이미지가 비활성화되면 `chat_background_color`가 사용된다.

### 3.3 `passcode_background`

| 플랫폼 | slot | kind | 필수 |
| --- | --- | --- | --- |
| Android | `android-passcode-background` | image | 아니오 |
| iOS | `ios-passcode-background-image` | image | 아니오 |

암호 제목, 4개의 indicator, 숫자 keypad가 겹치는 잠금화면 배경이다.

프롬프트 규칙:

- 중앙 상단의 제목/indicator 영역과 하단 keypad 영역은 단순하고 대비가 안정적이어야 한다.
- 숫자, 자물쇠 번호, 실제 PIN처럼 보이는 기호를 배경에 넣지 않는다.
- 이미지 없이 `passcode_background_color`만 사용하는 구성이 정식 fallback이다.

Android는 키패드 상단 영역에서 `center` crop된다(지원: manifest constraint). 따라서 핵심 motif를 화면 맨 아래에만 두지 말고, 제목·indicator·keypad가 놓일 영역을 모두 비워 둔다. iOS의 공식 문서는 잠금화면 상단 적용을 설명하지만 고정 crop 방식은 명시하지 않는다.

### 3.4 `tab_background_image`

| 플랫폼 | slot | kind | 필수 |
| --- | --- | --- | --- |
| Android | `android-tab-background-image` | ninepatch | 아니오 |
| iOS | `ios-tab-background-image` | image | 아니오 |

하단 탭 바 뒤의 좁고 긴 배경이다.

프롬프트 규칙:

- 모든 탭 아이콘이 놓일 반복 가능한 저복잡도 surface로 만든다.
- 좌우 끝 장식, 중앙 피사체, 읽을 수 있는 문구를 금지한다. 탭 개수와 화면 폭이 달라도 자연스러워야 한다.
- Android artwork에는 marker를 그리지 않는다. 생성 후 9-patch stretch/content 영역을 지정한다.
- 비활성화 시 `tab_background` 색상이 fallback이다.

Android 공식 규격은 전체 `1442×214px`, 내부 artwork `1440×212px`다. 위쪽은 빈 1px, 왼쪽·오른쪽·아래쪽은 1px 9-patch marker로 사용한다(지원: manifest constraint; marker는 후처리). iOS는 일반 이미지이며 `center` crop된다(지원: manifest constraint).

### 3.5 `splash`

| 플랫폼 | slot | kind | 필수 |
| --- | --- | --- | --- |
| Android | `android-common-splash`, `android-common-splash-landscape` | image | 예 |
| iOS | 해당 slot 없음 | - | - |

카카오톡 실행 시 잠깐 표시된다. Android 12 미만에서만 테마 splash가 적용되며, 현재 세로/가로 slot을 분리해 지원한다. 가로 slot은 세로 이미지의 단순 복사가 아니라 별도 16:9 artwork를 요구한다.

프롬프트 규칙:

- 핵심 모티프를 중앙 safe area에 두고 주변은 충분히 확장 가능한 배경으로 만든다.
- 방향에 민감한 긴 문구, 화면 모서리에 걸친 인물, 자체 로딩 UI를 넣지 않는다.
- 브랜드 로고나 앱 이름을 AI가 임의로 생성하지 않는다.

공식 권장 크기는 세로 xhdpi `720×1280px`, xxhdpi/대화면 `1440×2560px`; 가로 xhdpi `1280×720px`, xxhdpi/대화면 `2560×1440px`다. 세로/가로 artwork는 같은 모티프를 공유하되, 각각 중앙 safe area를 재구성한다.

## 4. 하단 탭 아이콘 계열

모든 탭 아이콘은 기본/선택 상태 pair다. 기본 상태와 선택 상태는 같은 canvas, 같은 중심, 같은 실루엣을 유지한다.

| 의미 | 기본 role | 선택 role | Android slot | iOS slot |
| --- | --- | --- | --- | --- |
| 친구 | `tab_icon_friends` | `tab_icon_friends_focused` | `android-tab-friends*` | `ios-tab-friends*` |
| 채팅 | `tab_icon_chats` | `tab_icon_chats_focused` | `android-tab-chats*` | `ios-tab-chats*` |
| Now/오픈채팅 | `tab_icon_now` | `tab_icon_now_focused` | `android-tab-now*` | `ios-tab-now*` |
| 쇼핑 | `tab_icon_shopping` | `tab_icon_shopping_focused` | `android-tab-shopping*` | `ios-tab-shopping*` |
| 더보기 | `tab_icon_more` | `tab_icon_more_focused` | `android-tab-more*` | `ios-tab-more*` |
| 통화 | `tab_icon_call` | `tab_icon_call_focused` | `android-tab-call*` | `ios-tab-call*` |
| Piccoma | `tab_icon_piccoma` | `tab_icon_piccoma_focused` | `android-tab-piccoma*` | `ios-tab-piccoma*` |

`friends`의 기본 아이콘만 양 플랫폼에서 필수이며 나머지는 선택 slot이다. 하지만 AI 세트 생성 시 현재 지역/버전에서 안 보이는 아이콘도 같은 스타일로 함께 만드는 편이 안전하다.

프롬프트 규칙:

- 친구=사람/프로필, 채팅=말풍선, Now=재생·라이브·오픈 공간, 쇼핑=가방/카트, 더보기=점/메뉴, 통화=수화기, Piccoma=책/코믹의 의미가 작은 크기에서도 분명해야 한다.
- transparent PNG, 정중앙 정렬, 동일한 optical size, 동일한 선 굵기와 모서리 언어를 사용한다.
- 기본 상태는 낮은 강조, focused 상태는 fill/굵기/강조색으로 구분한다. focused 상태에서 모양 자체가 다른 아이콘으로 바뀌면 안 된다.
- 그라데이션, 복잡한 사진 질감, 작은 내부 글자, badge 숫자, 개별 배경 타일을 금지한다.
- 한 아이콘씩 생성하지 말고 전체 semantic set과 상태 pair를 한 batch 규칙으로 생성한다.
- Android 원본은 최소 `56dp`를 기준으로 제작한다. iOS는 2x PNG를 사용한다. 어느 플랫폼이든 normal/selected의 canvas, 중심, optical size는 같아야 한다.
- Call/Piccoma는 클라이언트 지역·버전에 따라 노출되지 않을 수 있다. Piccoma는 글로벌 일본 버전의 세 번째 탭처럼 조건부 노출될 수 있으므로, 핵심 테마 모티프를 이 아이콘에만 의존하지 않는다.

권장 prompt fragment:

```text
cohesive mobile bottom-navigation icon family, transparent background,
same canvas and optical size, consistent stroke and corner language,
unselected and selected state pairs, legible at very small size,
no text, no badge, no individual background tile
```

## 5. 말풍선 계열

| role | 의미 | Android slot/kind | iOS slot/kind | 필수 |
| --- | --- | --- | --- | --- |
| `bubble_me_1` | 내가 보낸 일반/첫 메시지 | `android-bubble-me-1` / ninepatch | `ios-bubble-me-1` / image | 예 |
| `bubble_me_2` | 내 연속 메시지 | `android-bubble-me-2` / ninepatch | `ios-bubble-me-2` / image | 아니오 |
| `bubble_you_1` | 상대 일반/첫 메시지 | `android-bubble-you-1` / ninepatch | `ios-bubble-you-1` / image | 예 |
| `bubble_you_2` | 상대 연속 메시지 | `android-bubble-you-2` / ninepatch | `ios-bubble-you-2` / image | 아니오 |
| `bubble_me_1_selected` | 내 일반/첫 메시지 선택 상태 | - | `ios-bubble-me-1-selected` / image | 아니오 |
| `bubble_me_2_selected` | 내 연속 메시지 선택 상태 | - | `ios-bubble-me-2-selected` / image | 아니오 |
| `bubble_you_1_selected` | 상대 일반/첫 메시지 선택 상태 | - | `ios-bubble-you-1-selected` / image | 아니오 |
| `bubble_you_2_selected` | 상대 연속 메시지 선택 상태 | - | `ios-bubble-you-2-selected` / image | 아니오 |

핵심 규칙:

- 꼬리는 필수가 아니다. 꼬리를 사용하는 family라면 `me`는 오른쪽, `you`는 왼쪽을 기준으로 하고, 꼬리 없는 family는 양쪽 모두 허용한다.
- `1`과 `2`는 같은 가족이다. `2`는 연속 메시지용이므로 꼬리가 있다면 줄이거나 제거할 수 있고, 꼬리가 없는 family는 같은 body를 재사용한다. 크기감, 채움, 테두리, radius는 유지한다.
- 내부 텍스트 영역은 넓고 단순해야 한다. 얼굴, 패턴, 하이라이트, 테두리 장식이 stretch 중심이나 content 영역을 침범하면 안 된다.
- 배경은 실제 alpha 투명이어야 한다. 그림자도 canvas 밖에서 잘리지 않도록 안전 여백 안에 둔다.
- 내/상대 말풍선은 서로 구별되면서 같은 테마 가족으로 보여야 한다.
- `chat_bubble_me_color`, `chat_bubble_you_color`는 말풍선 채움색이 아니라 현재 manifest상 말풍선 안의 텍스트 색이다. 이미지 밝기와 함께 결정한다.
- iOS selected image가 비어 있으면 normal image를, selected text color가 비어 있으면 normal text color를 사용한다(부분 지원: 별도 selected slot은 export에 연결되어 있으나 preview/실기기 QA가 남아 있다). selected artwork는 normal과 geometry·(있는 경우) 꼬리·stretch 영역을 동일하게 유지하고, 명도·채움·pressed feedback만 바꾼다.

Android 규칙:

- 1px 9-patch marker는 AI가 만들지 않는다.
- 고정 코너와 (있는 경우) 꼬리는 stretch 영역 밖에 둔다.
- 반복/그라데이션이 stretch seam에서 끊기지 않도록 중앙 stretch 영역은 균질하게 만든다.
- marker와 content padding은 bubble editor에서 설정하고 export 시 `.9.png`로 렌더한다.

iOS 규칙:

- 일반 PNG artwork를 사용하고 cap-inset stretch point와 content insets를 별도로 저장한다.
- 기본 preview inset은 새 artwork의 body와 (있는 경우) 꼬리 방향을 반영하므로, 새 artwork에 맞춰 반드시 재조정한다.
- 고정 코너 합보다 작은 말풍선에서도 왜곡되지 않는지 짧은 메시지와 여러 줄 메시지로 확인한다.
- iOS 26.3.0 공식 샘플 참고값은 Send stretch `20px 20px`, inset `10px 10px 7px 12px`; Receive stretch `20px 20px`, inset `10px 16px 7px 10px`다. inset은 1x 기준이며 순서는 `top left bottom right`다. 현재 내장 sample의 이전 값과 차이가 있으므로 새 artwork에는 bubble editor의 실제 측정값을 우선하고, 이 수치를 무조건 덮어쓰지 않는다.

권장 negative fragment:

```text
text inside bubble, speech content, emoji, person, photo texture,
busy pattern in stretch area, baked nine-patch markers, asymmetric accidental padding,
cropped optional tail, opaque canvas background
```

## 6. 잠금화면 indicator와 keypad

### 6.1 `passcode_indicator_{1..4}` / `_checked`

Android와 iOS 모두 1~4의 입력 전/입력 후 이미지 slot을 선택적으로 제공한다.

정확한 role 집합은 `passcode_indicator_1`, `passcode_indicator_1_checked`, `passcode_indicator_2`, `passcode_indicator_2_checked`, `passcode_indicator_3`, `passcode_indicator_3_checked`, `passcode_indicator_4`, `passcode_indicator_4_checked`다.

- Android: `android-passcode-indicator-{n}` / `android-passcode-indicator-{n}-checked`
- iOS: `ios-passcode-indicator-{n}` / `ios-passcode-indicator-{n}-checked`

프롬프트 규칙:

- 8개 파일의 canvas 크기, 중심, optical size를 동일하게 유지한다.
- 기본 상태는 비어 있거나 낮은 강조, checked 상태는 채움·명도·accent로 명확히 구분한다.
- 숫자 1~4를 그리는 slot이 아니다. 실제 PIN처럼 보이는 숫자나 문자를 넣지 않는다.
- 위치별로 다른 그림을 만들 필요가 없다면 한 pair를 생성해 1~4에 동일하게 적용하는 것이 일관성이 높다.
- 작은 크기에서 의미가 남는 단순한 원, 별, 꽃잎, 발자국 같은 motif를 사용한다.

### 6.2 `passcode_keypad_pressed_image`

iOS의 `ios-passcode-keypad-pressed-image`에만 존재하는 선택적 overlay다.

- 숫자나 삭제 아이콘을 포함하지 않는다.
- 반투명 highlight, ripple, halo처럼 어느 숫자 위에도 겹칠 수 있는 중앙 대칭 효과로 만든다.
- 기본 keypad background와 대비는 보이되 숫자 가독성을 해치지 않아야 한다.

Android의 눌림 상태는 이미지가 아니라 `passcode_keypad_pressed_color`와 `passcode_keypad_pressed_background_color`로 표현한다.

## 7. 프로필과 친구 추가 에셋

| role | Android | iOS | 규칙 |
| --- | --- | --- | --- |
| `profile_image_1` | `android-common-profile-1` 필수 | `ios-common-profile-1` 필수 | 원형 crop 안전 영역 유지 |
| `profile_image_2`, `profile_image_3` | 선택 slot | 없음 | 1번과 같은 스타일의 변형 |
| `profile_image_full_1` | 필수 | 없음 | 1번 프로필의 전체 보기 버전 |
| `profile_image_full_2`, `profile_image_full_3` | 선택 slot | 없음 | 대응하는 2/3번의 전체 보기 |
| `find_add_friend` | 선택 | 선택 | 작은 친구 추가 의미 아이콘/버튼 |
| `find_add_friend_pressed` | 선택 | 없음 | 기본 이미지와 동일 geometry의 눌림 상태 |

프로필 프롬프트 규칙:

- 얼굴이나 핵심 motif를 중앙 60~70% safe area에 둬 원형 crop 후에도 남게 한다.
- 모서리에 중요한 장식이나 글자를 두지 않는다.
- `profile_image_1..3`은 서로 다른 변형이어도 같은 세계관, 배경 처리, 선 굵기를 유지한다.
- Android `profile_image_full_n`이 없으면 대응하는 `profile_image_n`이 fallback으로 사용된다. full 버전을 만들 때는 별개의 인물로 바꾸지 말고 같은 subject의 확장 구도로 만든다.
- 실존 인물이나 유명인의 닮은 얼굴을 만들지 않는다. 사용자가 소유한 반려동물 사진처럼 허용된 reference는 정체성을 유지할 수 있다.

Android 공식 크기는 기본 프로필 `220×220px`(drawable-xxhdpi), 전체보기 `320×320px`(drawable-nodpi)다. 기본 프로필은 최소 1개, 최대 3개이며, 현재 slot도 이 구조를 지원한다.

친구 추가 상태 pair 규칙:

- 사람 실루엣+plus처럼 작은 크기에서 즉시 이해되는 형태를 사용한다.
- 눌림 상태는 위치나 형태를 이동시키지 말고 명도/채움/scale의 아주 작은 변화로 표현한다.
- 글로벌 일부 화면에서만 보일 수 있으므로 테마 완성도를 좌우하는 핵심 motif를 이 에셋에만 넣지 않는다.

## 8. 테마 아이콘과 Android launcher

### 8.1 `theme_icon`

Android `android-common-theme-icon`과 iOS `ios-common-theme-icon`의 필수 slot이다. 테마 목록에서 보이는 대표 아이콘이며, Android는 `144×144px`, iOS는 `162×162px` 기준이다.

- 테마 전체를 대표하는 하나의 단순한 motif를 사용한다.
- 작은 크기에서 인식되도록 배경과 전경을 2~3개의 큰 형태로 제한한다.
- 글자, 로고, 세밀한 사진 collage를 피한다.

### 8.2 Android launcher family

| role | slot | 목적 |
| --- | --- | --- |
| `launcher_background` | `android-launcher-background` | adaptive icon의 full-bleed 배경 |
| `launcher_foreground` | `android-launcher-foreground` | transparent 전경 motif |
| `launcher_icon` | `android-launcher-icon` | 일반 launcher raster |
| `launcher_round` | `android-launcher-round` | round launcher raster |

네 slot 모두 필수다. `theme_icon`은 Android launcher family와 별도 리소스이므로 하나가 다른 하나를 대체하지 않는다.

- background는 crop돼도 끊기지 않는 단순한 색/패턴으로 만든다.
- foreground는 실제 alpha를 사용하고 핵심 motif를 adaptive icon safe zone 안에 둔다.
- icon과 round는 background+foreground 조합의 동일한 최종 모양이어야 한다.
- 네 파일을 독립 생성하지 않는다. background/foreground master에서 일반/round 결과를 deterministic하게 합성한다.
- OS mask가 원, squircle, rounded square로 달라져도 핵심 motif가 잘리지 않아야 한다.

## 9. 색상 role 가족

색상 role은 이미지 생성 결과가 아니지만, 이미지 프롬프트의 팔레트와 가독성 제약을 결정한다. Android 색상은 공식적으로 `#RRGGBB` 또는 `#AARRGGBB`(alpha 먼저)를 사용한다. iOS alpha 및 CSS 표기는 export resolver가 정한 형식을 사용하며, 프롬프트가 문자열 형식을 추측하지 않는다.

### 9.1 Main/list

- 배경: `main_background_color`
- 헤더: `main_header_color`(Android), `main_header_foreground_color`
- 주요/눌림 텍스트: `main_title_color`, `main_title_pressed_color`
- 보조/눌림 텍스트: `main_description_color`, `main_description_pressed_color`
- 채팅 목록 보조 텍스트: `tab_paragraph_color`, `tab_paragraph_pressed_color`
- cell surface: `main_body_cell_color`, `main_body_cell_pressed_color`
- cell border: `main_body_cell_border_color`, `main_body_cell_border_alpha`(iOS)
- 선택 overlay: `main_selected_background_alpha`(iOS)
- section label: `main_section_title_color`(Android)

규칙:

- main 배경 이미지 위의 이름/제목은 `main_title_color`, 상태 메시지는 `main_description_color`로 검증한다.
- pressed 색은 기본색과 관계없는 새 색이 아니라 같은 hue 가족의 명도/alpha 변화로 만든다.
- cell 기본 배경은 이미지가 보이도록 투명을 우선하며, 구분이 필요할 때만 surface를 추가한다.
- platform 변환 시 `tab_paragraph_color`와 legacy `main_body_color`, `tab_paragraph_pressed_color`와 legacy `main_paragraph_pressed_color`가 동등 의미로 처리될 수 있다.

### 9.2 Tabs

- 기본 bar: `tab_background`
- optional image: `tab_background_image`
- tab label: `tab_text_color`(iOS 일부 화면)
- badge surface: `tab_light_banner_badge_background_color`, `tab_banner_badge_background_color`(Android)

규칙:

- iOS `TabBarStyle-Main`의 `background-color`는 8자리 hex alpha를 직접 허용하므로, 편집기의 탭바 배경 투명도 설정을 export에 그대로 반영한다. 단, 이 자리의 8자리 hex는 `RRGGBBAA`(알파 마지막, CSS Color Level 4 순서)로 나가야 한다 — 내부 저장 포맷(`AARRGGBB`, Android 관례)을 그대로 내보내면 알파와 색상이 뒤섞인다. `lib/theme/ios/export.ts`의 `themeColorToCssHex`가 이 변환을 담당한다.
- 모든 기본/focused 탭 아이콘이 `tab_background` 위에서 읽혀야 한다.
- badge는 accent와 조화를 이루되 unread/error 의미가 사라질 정도로 배경과 비슷하면 안 된다.

### 9.3 More/service surfaces

- 배경: `main_body_secondary_cell_color`
- 서비스 accent: `feature_primary_color`, `feature_primary_pressed_color`
- 탐색 tab: `main_feature_browse_tab_color`, `main_feature_browse_tab_focused_color`
- direct share: `direct_share_background_color`, `direct_share_name_color`, `direct_share_text_color`, `direct_share_button_color`
- notification: `notification_background_color`, `notification_name_color`, `notification_text_color`, `notification_background_pressed_color`
- 하단 배너: `bottom_banner_background_color`(iOS)

iOS는 `MessageNotificationBar`의 배경·이름·메시지, `DirectShareBar`의 배경·이름·메시지, `BottomBannerStyle`의 배경을 별도 slot으로 지원한다. Android의 notification/direct share 세부 상태와 의미가 완전히 같지는 않으므로 slot ID로 임의 변환하지 않는다.

### 9.4 Chatroom

- 배경 fallback: `chat_background_color`
- 말풍선 안 텍스트: `chat_bubble_me_color`, `chat_bubble_you_color`
- 읽지 않음: `chat_unread_count_color`
- 입력 영역: `chat_input_background_color`
- 전송 버튼: `chat_send_button_color`, `chat_send_icon_color`
- Android menu/input: `chat_input_text_color`, `chat_menu_icon_color`, `chat_menu_button_color`
- iOS button states: `chat_button_text_color`, `chat_button_foreground_color`, `chat_button_highlighted_foreground_color`, `chat_button_background_color`, `chat_send_highlighted_button_color`, `chat_send_highlighted_icon_color`

규칙:

- `chat_background`, 양쪽 bubble, unread 숫자, input bar를 한 화면으로 합성해 결정한다.
- 전송 버튼 배경과 아이콘은 한 pair로 대비를 검증한다.
- highlighted 색은 기본 상태와 연결된 상태 변화여야 한다.

### 9.5 Passcode

- 공통: `passcode_background_color`, `passcode_color`, `passcode_keypad_background_color`, `passcode_keypad_color`
- Android 눌림: `passcode_keypad_pressed_color`, `passcode_keypad_pressed_background_color`
- Android pattern: `passcode_pattern_line_color`
- iOS 눌림: `passcode_keypad_pressed_image`

제목, indicator, 숫자, 눌림 상태가 배경 위에서 각각 구분돼야 한다. 보안 화면이므로 장식보다 숫자와 입력 상태의 가독성을 우선한다.

## 10. 플랫폼 변환 규칙

같은 role은 Android와 iOS 사이에서 우선 연결한다. slot ID를 문자열 치환해 변환하지 않는다.

- Android `ninepatch` 말풍선 → iOS 일반 PNG + cap-inset/stretch/content inset
- iOS 말풍선 → Android artwork + 별도 1px 9-patch marker
- Android `tab_background_image` nine-patch → iOS 일반 image
- Android adaptive launcher family는 iOS `theme_icon`과 같은 motif를 공유하되 파일 구조는 별도로 만든다.
- Android profile full variant는 iOS에 직접 대응 slot이 없다.
- Android/iOS Call·Piccoma tab은 같은 role family로 대응한다. 각 앱 버전·지역에서 미노출일 수 있으므로 export 자체는 optional slot으로 유지한다.
- iOS `passcode_keypad_pressed_image`는 Android에서 pressed foreground/background 색으로 번역한다.
- platform에 slot이 없으면 억지로 다른 role에 저장하지 않고 variant에서 생략한다.

## 11. Role별 prompt 조립 순서

프롬프트 생성기는 다음 순서로 규칙을 합친다.

1. reference 사용 권한과 처리 방식
2. 테마 전체 art direction과 palette
3. role의 의미와 화면 내 위치
4. platform slot의 kind, target 크기, alpha, required 여부
5. pair/family의 공유 규칙
6. role 전용 composition과 safe area
7. 공통 negative prompt + role 전용 negative prompt
8. deterministic 후처리 지시
9. preview/export 검증 항목

예시 — 소유한 반려동물 사진을 채팅 배경으로 사용할 때:

```text
Create an Android chat background for role chat_background and slot android-chat-background.
Use the owned dog photo as the preserved subject, but simplify the surrounding scene into a calm pastel theme.
Keep the central message corridor and both left/right bubble paths low-detail and low-contrast.
Place the dog away from the header, input bar, and common bubble positions; preserve generous crop-safe margins.
Full-bleed vertical composition, no border, no text, no logo, no watermark, no UI elements.
Palette must harmonize with the supplied me/you bubble colors and unread-count color.
Output artwork only; the pipeline must apply the exact 1080x1920 crop and PNG normalization in post-processing.
```

예시 — 탭 아이콘 family:

```text
Create one cohesive transparent mobile bottom-navigation icon family for friends, chats, now,
shopping, more, call, and piccoma, each with unselected and selected states.
Translate the reference dog's ear and paw motifs into simple geometric icon language without copying the photo.
Maintain identical canvas, center, optical size, stroke width, and corner radius across all icons.
Selected states keep the same geometry and use stronger fill/accent; no text, badge, tile, shadow, or background.
```

예시 — 말풍선 family:

```text
Create a four-piece transparent speech-bubble family: bubble_me_1, bubble_me_2,
bubble_you_1, bubble_you_2. If a tail is used, me tails face right and you tails face left; a no-tail family is valid.
State 2 is the grouped-message version with the same body geometry; an existing tail may be reduced or removed.
Keep a large quiet interior text region and uniform stretchable center; decoration stays in fixed corners only.
No text, emoji, photo texture, baked 9-patch markers, opaque background, or cropped shadow.
Output clean artwork; Android markers and iOS cap insets are added after generation.
```

## 12. 색상 role의 정확한 slot 매핑

아래 표는 현재 manifest에 실제로 존재하는 color slot만 포함한다. `-`는 해당 플랫폼에 직접 대응 slot이 없다는 뜻이다.

| role | Android slot | iOS slot |
| --- | --- | --- |
| `chat_background_color` | `android-chat-background-color` | `ios-chat-background-color` |
| `chat_bubble_me_color` | `android-chat-bubble-me-color` | `ios-chat-bubble-me-color` |
| `chat_bubble_me_selected_color` | - | `ios-chat-bubble-me-selected-color` |
| `chat_bubble_you_color` | `android-chat-bubble-you-color` | `ios-chat-bubble-you-color` |
| `chat_bubble_you_selected_color` | - | `ios-chat-bubble-you-selected-color` |
| `chat_button_background_color` | - | `ios-chat-button-background-color` |
| `chat_button_foreground_color` | - | `ios-chat-button-foreground-color` |
| `chat_button_highlighted_foreground_color` | - | `ios-chat-button-highlighted-foreground-color` |
| `chat_button_text_color` | - | `ios-chat-button-text-color` |
| `chat_input_background_color` | `android-chat-input-background` | `ios-chat-input-background` |
| `chat_input_text_color` | `android-chat-input-text-color` | - |
| `chat_menu_button_color` | `android-chat-menu-button-color` | - |
| `chat_menu_icon_color` | `android-chat-menu-icon-color` | - |
| `chat_send_button_color` | `android-chat-send-button` | `ios-chat-send-button` |
| `chat_send_highlighted_button_color` | - | `ios-chat-send-highlighted-button` |
| `chat_send_highlighted_icon_color` | - | `ios-chat-send-highlighted-icon` |
| `chat_send_icon_color` | `android-chat-send-icon-color` | `ios-chat-send-icon-color` |
| `chat_unread_count_color` | `android-chat-unread-count-color` | `ios-chat-unread-count-color` |
| `bottom_banner_background_color` | - | `ios-bottom-banner-background-color` |
| `direct_share_background_color` | `android-direct-share-background-color` | `ios-direct-share-background-color` |
| `direct_share_button_color` | `android-direct-share-button-color` | - |
| `direct_share_name_color` | - | `ios-direct-share-name-color` |
| `direct_share_text_color` | `android-direct-share-text-color` | `ios-direct-share-text-color` |
| `feature_primary_color` | `android-feature-primary-color` | `ios-more-feature-primary-color` |
| `feature_primary_pressed_color` | `android-feature-primary-pressed-color` | - |
| `main_background_color` | `android-main-background-color` | `ios-main-background-color` |
| `main_body_cell_border_alpha` | - | `ios-main-border-alpha` |
| `main_body_cell_border_color` | `android-main-body-cell-border-color` | `ios-main-border-color` |
| `main_body_cell_color` | `android-main-body-cell-color` | - |
| `main_body_cell_pressed_color` | `android-main-body-cell-pressed-color` | `ios-main-selected-background-color` |
| `main_body_secondary_cell_color` | `android-main-body-secondary-cell-color` | `ios-more-background-color` |
| `main_description_color` | `android-main-description-color` | `ios-main-description-color` |
| `main_description_pressed_color` | `android-main-description-pressed-color` | - |
| `main_feature_browse_tab_color` | `android-main-feature-browse-tab-color` | - |
| `main_feature_browse_tab_focused_color` | `android-main-feature-browse-tab-focused-color` | - |
| `main_header_color` | `android-main-header-color` | - |
| `main_header_foreground_color` | `android-main-header-foreground-color` | `ios-main-header-foreground-color` |
| `main_section_title_color` | `android-main-section-title-color` | - |
| `main_selected_background_alpha` | - | `ios-main-selected-background-alpha` |
| `main_title_color` | `android-main-title-color` | `ios-main-text-color` |
| `main_title_pressed_color` | `android-main-title-pressed-color` | `ios-main-highlighted-text-color` |
| `notification_background_color` | `android-notification-background-color` | `ios-notification-background-color` |
| `notification_background_pressed_color` | `android-notification-background-pressed-color` | - |
| `notification_name_color` | - | `ios-notification-name-color` |
| `notification_text_color` | `android-notification-text-color` | `ios-notification-text-color` |
| `passcode_background_color` | `android-passcode-background-color` | `ios-passcode-background-color` |
| `passcode_color` | `android-passcode-color` | `ios-passcode-color` |
| `passcode_keypad_background_color` | `android-passcode-keypad-background-color` | `ios-passcode-keypad-background-color` |
| `passcode_keypad_color` | `android-passcode-keypad-color` | `ios-passcode-keypad-color` |
| `passcode_keypad_pressed_background_color` | `android-passcode-keypad-pressed-background-color` | - |
| `passcode_keypad_pressed_color` | `android-passcode-keypad-pressed-color` | - |
| `passcode_pattern_line_color` | `android-passcode-pattern-line-color` | - |
| `tab_background` | `android-tab-background` | `ios-tab-background-color` |
| `tab_banner_badge_background_color` | `android-tab-banner-badge-background` | - |
| `tab_light_banner_badge_background_color` | `android-tab-light-banner-badge-background` | - |
| `tab_paragraph_color` | `android-tab-paragraph-color` | `ios-tab-paragraph-color` |
| `tab_paragraph_pressed_color` | `android-tab-paragraph-pressed-color` | `ios-tab-paragraph-highlighted-color` |
| `tab_text_color` | - | `ios-tab-text-color` |

## 13. 문서 유지 규칙

- `ThemeResourceRole`을 추가하거나 이름을 바꾸면 이 문서의 role family와 platform 변환 규칙을 갱신한다.
- manifest slot을 추가하면 해당 role의 platform slot 표, 필수 여부, state pair를 갱신한다.
- 공식 가이드와 충돌하는 현재 구현은 계획 문서에 `구현 차이`로 기록한다. 실제 앱 동작을 판단할 때는 manifest와 export 코드가 우선이지만, 공식 규격을 대체하는 근거는 아니다.
- AI 생성 가능 role을 늘릴 때는 먼저 alpha, target size, pair, post-process, validation 계약을 정의한다.
- 프롬프트는 file path나 DB row를 직접 만들지 않는다. 생성 결과는 project state의 slot ID에 연결하고 preview와 export가 같은 resolver를 사용해야 한다.
- `profile_image`, `passcode`, `unknown`, legacy `main_body_color`, `main_paragraph_pressed_color`처럼 현재 manifest slot이 없는 role은 새 생성 대상에 사용하지 않는다.
