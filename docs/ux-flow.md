# 카카오톡 테마 메이커 UX 흐름

## 제품 방향

카카오톡 테마 메이커는 Android/iOS 테마에 필요한 파일 이름과 위치를 슬롯으로 제공하고, 사용자가 각 슬롯에 이미지를 넣으면서 화면별로 확인하는 내부 제작 도구다.

## 현재 기본 흐름

1. `/template`에서 템플릿 카드를 선택한다.
2. 모달에서 템플릿 미리보기를 확인한다.
3. `Android로 시작` 또는 `iOS로 시작` 버튼을 누른다.
4. `/edit`으로 이동해 선택한 템플릿과 플랫폼 기본값으로 시작한다.
5. 정해진 이미지 슬롯에 파일을 업로드한다.
6. 채팅방, 친구 목록, 하단 탭, 프로필 화면에서 미리본다.
7. 말풍선 이미지는 `/editor`에서 9-patch 또는 inset/stretch를 정밀하게 확인한다.
8. 필수 슬롯 누락 여부를 확인한다.
9. 후속 단계에서 Android/iOS export를 분리해 구현한다.

## 주요 화면

- `/`: 한국어 시작 허브와 제작 흐름 안내.
- `/template`: 템플릿 카드 갤러리와 미리보기 모달.
- `/edit`: 템플릿 기반 테마 에디터.
- `/project`: 기존 링크 호환용 리다이렉트.
- `/editor`: Android 9-patch와 iOS inset/stretch 말풍선 에디터.

## 템플릿 구성

코드에 포함되는 기본 템플릿은 `basic` 하나다. 그 밖의 완성형 테마는 Supabase 시스템 템플릿으로 등록하고 이미지 파일은 `theme-assets` Storage에 저장한다.

## 현재 구현된 슬롯

### Android

- `src/main/theme/drawable-xxhdpi/theme_chatroom_background_image.png`
- `src/main/theme/drawable-xxhdpi/theme_chatroom_bubble_me_01_image.9.png`
- `src/main/theme/drawable-xxhdpi/theme_chatroom_bubble_you_01_image.9.png`
- `src/main/theme/drawable-xxhdpi/theme_background_image.png`
- `src/main/theme/drawable-xxhdpi/theme_maintab_ico_friends_image.png`
- `src/main/theme/drawable-xxhdpi/theme_profile_01_image.png`

### iOS

- `Images/chatroomBgImage@3x.png`
- `Images/chatroomBubbleSend01@3x.png`
- `Images/chatroomBubbleReceive01@3x.png`
- `Images/mainBgImage@3x.png`
- `Images/maintabIcoFriends@3x.png`
- `Images/profileImg01@3x.png`

## 다음 구현 우선순위

1. 업로드된 슬롯을 IndexedDB에 저장해서 새로고침 후 복원한다.
2. Android/iOS 필수 파일 슬롯을 실제 가이드 기준으로 더 촘촘하게 추가한다.
3. iOS `@2x/@3x` 쌍 생성/검수 흐름을 추가한다.
4. Android `.9.png` 슬롯은 말풍선 에디터에서 수정 후 다시 `/edit` 슬롯에 반영한다.
5. export 준비 화면을 추가한다.

## 현재 경계

- Node API는 구현하지 않는다.
- 결제, 마켓, 공개 업로드 서비스는 구현하지 않는다.
- export는 아직 완성하지 않는다.
- Android와 iOS export 로직은 분리한다.
