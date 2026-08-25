# 슬롯별 Android/iOS 적용 키

`lib/theme/manifest/*.slots.json` 에서 생성한다. **직접 고치지 말고**
`node scripts/generate-slot-key-reference.mjs` 를 다시 실행한다.

- **Android** — 색상은 `res/values/colors.xml` 의 항목 이름, 이미지는 APK 안의 경로다.
- **iOS** — 색상은 CSS 블록 › 프로퍼티, 이미지는 패키지 안의 경로와 이를 참조하는 프로퍼티다.
- `—` 는 그 플랫폼에 해당 슬롯이 없다는 뜻이다. 한쪽에만 있는 슬롯이 적지 않다.

슬롯 108개 (Android 89 · iOS 79)

## 친구/메인

| 슬롯 이름 | 종류 | role | Android | iOS |
|---|---|---|---|---|
| 메인 배경 이미지 | 이미지 | `main_background` | `src/main/theme/drawable-xxhdpi/theme_background_image.png` | `Images/mainBgImage.png`<br>`MainViewStyle-Primary` › `-ios-background-image` |
| 메인 배경색 | 색상 | `main_background_color` | `theme_background_color` | `MainViewStyle-Primary` › `background-color` |
| 섹션 구분선 투명도 | 색상 | `main_body_cell_border_alpha` | — | `SectionTitleStyle-Main` › `border-alpha` |
| 목록 구분선 색상 | 색상 | `main_body_cell_border_color` | `theme_body_cell_border_color` | `SectionTitleStyle-Main` › `border-color` |
| 친구·채팅 리스트 셀 기본 배경 | 색상 | `main_body_cell_color` | `theme_body_cell_color` | — |
| 리스트 눌림 배경 | 색상 | `main_body_cell_pressed_color` | `theme_body_cell_pressed_color` | `MainViewStyle-Primary` › `-ios-selected-background-color` |
| 상태 메시지 색상 | 색상 | `main_description_color` | `theme_description_color` | `MainViewStyle-Primary` › `-ios-description-text-color` |
| 상태 메시지 눌림 색상 | 색상 | `main_description_pressed_color` | `theme_description_pressed_color` | — |
| 헤더·칩 영역 배경 색상 | 색상 | `main_header_color` | `theme_header_cell_color` | — |
| 헤더 제목·아이콘 색상 | 색상 | `main_header_foreground_color` | `theme_header_color` | `HeaderStyle-Main` › `-ios-text-color` |
| 섹션 제목 색상 | 색상 | `main_section_title_color` | `theme_section_title_color` | — |
| 리스트 눌림 배경 투명도 | 색상 | `main_selected_background_alpha` | — | `MainViewStyle-Primary` › `-ios-selected-background-alpha` |
| 이름 색상 | 색상 | `main_title_color` | `theme_title_color` | `MainViewStyle-Primary` › `-ios-text-color` |
| 이름 눌림 색상 | 색상 | `main_title_pressed_color` | `theme_title_pressed_color` | `MainViewStyle-Primary` › `-ios-highlighted-text-color` |

## 채팅 목록·하단 탭

| 슬롯 이름 | 종류 | role | Android | iOS |
|---|---|---|---|---|
| 하단 배너 배경 | 색상 | `bottom_banner_background_color` | — | `BottomBannerStyle` › `background-color` |
| 탭 바 배경 색상 | 색상 | `tab_background` | `theme_maintab_cell_color` | `TabBarStyle-Main` › `background-color` |
| 탭바 배경 이미지 | 9-patch | `tab_background_image` | `src/main/theme/drawable-xxhdpi/theme_maintab_cell_image.9.png` | `Images/maintabBgImage.png`<br>`TabBarStyle-Main` › `-ios-background-image` |
| 배너 배지 배경 | 색상 | `tab_banner_badge_background_color` | `theme_tab_bannerbadge_background_color` | — |
| 통화 탭 아이콘 | 이미지 | `tab_icon_call` | `src/main/theme/drawable-xxhdpi/theme_maintab_ico_call_image.png` | `Images/maintabIcoCall.png`<br>`TabBarStyle-Main` › `-ios-call-normal-icon-image` |
| 통화 탭 선택 아이콘 | 이미지 | `tab_icon_call_focused` | `src/main/theme/drawable-xxhdpi/theme_maintab_ico_call_focused_image.png` | `Images/maintabIcoCallSelected.png`<br>`TabBarStyle-Main` › `-ios-call-selected-icon-image` |
| 채팅 탭 아이콘 | 이미지 | `tab_icon_chats` | `src/main/theme/drawable-xxhdpi/theme_maintab_ico_chats_image.png` | `Images/maintabIcoChats.png`<br>`TabBarStyle-Main` › `-ios-chats-normal-icon-image` |
| 채팅 탭 선택 아이콘 | 이미지 | `tab_icon_chats_focused` | `src/main/theme/drawable-xxhdpi/theme_maintab_ico_chats_focused_image.png` | `Images/maintabIcoChatsSelected.png`<br>`TabBarStyle-Main` › `-ios-chats-selected-icon-image` |
| 친구 탭 아이콘 | 이미지 | `tab_icon_friends` | `src/main/theme/drawable-xxhdpi/theme_maintab_ico_friends_image.png` | `Images/maintabIcoFriends.png`<br>`TabBarStyle-Main` › `-ios-friends-normal-icon-image` |
| 친구 탭 선택 아이콘 | 이미지 | `tab_icon_friends_focused` | `src/main/theme/drawable-xxhdpi/theme_maintab_ico_friends_focused_image.png` | `Images/maintabIcoFriendsSelected.png`<br>`TabBarStyle-Main` › `-ios-friends-selected-icon-image` |
| 더보기 탭 아이콘 | 이미지 | `tab_icon_more` | `src/main/theme/drawable-xxhdpi/theme_maintab_ico_more_image.png` | `Images/maintabIcoMore.png`<br>`TabBarStyle-Main` › `-ios-more-normal-icon-image` |
| 더보기 탭 선택 아이콘 | 이미지 | `tab_icon_more_focused` | `src/main/theme/drawable-xxhdpi/theme_maintab_ico_more_focused_image.png` | `Images/maintabIcoMoreSelected.png`<br>`TabBarStyle-Main` › `-ios-more-selected-icon-image` |
| Now 탭 아이콘 | 이미지 | `tab_icon_now` | `src/main/theme/drawable-xxhdpi/theme_maintab_ico_now_image.png` | `Images/maintabIcoNow.png`<br>`TabBarStyle-Main` › `-ios-now-normal-icon-image` |
| Now 탭 선택 아이콘 | 이미지 | `tab_icon_now_focused` | `src/main/theme/drawable-xxhdpi/theme_maintab_ico_now_focused_image.png` | `Images/maintabIcoNowSelected.png`<br>`TabBarStyle-Main` › `-ios-now-selected-icon-image` |
| Piccoma 탭 아이콘 | 이미지 | `tab_icon_piccoma` | `src/main/theme/drawable-xxhdpi/theme_maintab_ico_piccoma_image.png` | `Images/maintabIcoPiccoma.png`<br>`TabBarStyle-Main` › `-ios-piccoma-normal-icon-image` |
| Piccoma 탭 선택 아이콘 | 이미지 | `tab_icon_piccoma_focused` | `src/main/theme/drawable-xxhdpi/theme_maintab_ico_piccoma_focused_image.png` | `Images/maintabIcoPiccomaSelected.png`<br>`TabBarStyle-Main` › `-ios-piccoma-selected-icon-image` |
| 쇼핑 탭 아이콘 | 이미지 | `tab_icon_shopping` | `src/main/theme/drawable-xxhdpi/theme_maintab_ico_shopping_image.png` | `Images/maintabIcoShopping.png`<br>`TabBarStyle-Main` › `-ios-shopping-normal-icon-image` |
| 쇼핑 탭 선택 아이콘 | 이미지 | `tab_icon_shopping_focused` | `src/main/theme/drawable-xxhdpi/theme_maintab_ico_shopping_focused_image.png` | `Images/maintabIcoShoppingSelected.png`<br>`TabBarStyle-Main` › `-ios-shopping-selected-icon-image` |
| 라이트 배지 배경 | 색상 | `tab_light_banner_badge_background_color` | `theme_tab_lightbannerbadge_background_color` | — |
| 마지막 메시지 색상 | 색상 | `tab_paragraph_color` | `theme_paragraph_color` | `MainViewStyle-Primary` › `-ios-paragraph-text-color` |
| 마지막 메시지 눌림 색상 | 색상 | `tab_paragraph_pressed_color` | `theme_paragraph_pressed_color` | `MainViewStyle-Primary` › `-ios-paragraph-highlighted-text-color` |

## 채팅방

| 슬롯 이름 | 종류 | role | Android | iOS |
|---|---|---|---|---|
| 내 말풍선 1 | 9-patch | `bubble_me_1` | `src/main/theme/drawable-xxhdpi/theme_chatroom_bubble_me_01_image.9.png` | `Images/chatroomBubbleSend01.png`<br>`MessageCellStyle-Send` › `-ios-background-image` |
| 내 말풍선 1 선택 | 이미지 | `bubble_me_1_selected` | — | `Images/chatroomBubbleSend01Selected.png`<br>`MessageCellStyle-Send` › `-ios-selected-background-image` |
| 내 말풍선 2 | 9-patch | `bubble_me_2` | `src/main/theme/drawable-xxhdpi/theme_chatroom_bubble_me_02_image.9.png` | `Images/chatroomBubbleSend02.png`<br>`MessageCellStyle-Send` › `-ios-group-background-image` |
| 내 말풍선 2 선택 | 이미지 | `bubble_me_2_selected` | — | `Images/chatroomBubbleSend02Selected.png`<br>`MessageCellStyle-Send` › `-ios-group-selected-background-image` |
| 상대 말풍선 1 | 9-patch | `bubble_you_1` | `src/main/theme/drawable-xxhdpi/theme_chatroom_bubble_you_01_image.9.png` | `Images/chatroomBubbleReceive01.png`<br>`MessageCellStyle-Receive` › `-ios-background-image` |
| 상대 말풍선 1 선택 | 이미지 | `bubble_you_1_selected` | — | `Images/chatroomBubbleReceive01Selected.png`<br>`MessageCellStyle-Receive` › `-ios-selected-background-image` |
| 상대 말풍선 2 | 9-patch | `bubble_you_2` | `src/main/theme/drawable-xxhdpi/theme_chatroom_bubble_you_02_image.9.png` | `Images/chatroomBubbleReceive02.png`<br>`MessageCellStyle-Receive` › `-ios-group-background-image` |
| 상대 말풍선 2 선택 | 이미지 | `bubble_you_2_selected` | — | `Images/chatroomBubbleReceive02Selected.png`<br>`MessageCellStyle-Receive` › `-ios-group-selected-background-image` |
| 채팅방 배경 이미지 | 이미지 | `chat_background` | `src/main/theme/drawable-xxhdpi/theme_chatroom_background_image.png` | `Images/chatroomBgImage.png`<br>`BackgroundStyle-ChatRoom` › `-ios-background-image` |
| 채팅방 배경색 | 색상 | `chat_background_color` | `theme_chatroom_background_color` | `BackgroundStyle-ChatRoom` › `background-color` |
| 내 말풍선 텍스트 색상 | 색상 | `chat_bubble_me_color` | `theme_chatroom_bubble_me_color` | `MessageCellStyle-Send` › `-ios-text-color` |
| 내 말풍선 선택 텍스트 | 색상 | `chat_bubble_me_selected_color` | — | `MessageCellStyle-Send` › `-ios-selected-text-color` |
| 상대 말풍선 텍스트 색상 | 색상 | `chat_bubble_you_color` | `theme_chatroom_bubble_you_color` | `MessageCellStyle-Receive` › `-ios-text-color` |
| 상대 말풍선 선택 텍스트 | 색상 | `chat_bubble_you_selected_color` | — | `MessageCellStyle-Receive` › `-ios-selected-text-color` |
| 메뉴 버튼 배경 색상 | 색상 | `chat_button_background_color` | — | `InputBarStyle-Chat` › `-ios-button-normal-background-color` |
| 메뉴 버튼 아이콘 색상 | 색상 | `chat_button_foreground_color` | — | `InputBarStyle-Chat` › `-ios-button-normal-foreground-color` |
| 메뉴 버튼 아이콘 눌림 색상 | 색상 | `chat_button_highlighted_foreground_color` | — | `InputBarStyle-Chat` › `-ios-button-highlighted-foreground-color` |
| 입력 텍스트 색상 | 색상 | `chat_button_text_color` | — | `InputBarStyle-Chat` › `-ios-button-text-color` |
| 입력바 배경 | 색상 | `chat_input_background_color` | `theme_chatroom_input_bar_background_color` | `InputBarStyle-Chat` › `background-color` |
| 입력 텍스트 색상 | 색상 | `chat_input_text_color` | `theme_chatroom_input_bar_color` | — |
| 메뉴·입력창 배경 색상 | 색상 | `chat_menu_button_color` | `theme_chatroom_input_bar_menu_button_color` | — |
| 메뉴 버튼 아이콘 색상 | 색상 | `chat_menu_icon_color` | `theme_chatroom_input_bar_menu_icon_color` | — |
| 전송 버튼 배경 색상 | 색상 | `chat_send_button_color` | `theme_chatroom_input_bar_send_button_color` | `InputBarStyle-Chat` › `-ios-send-normal-background-color` |
| 전송 버튼 배경 눌림 색상 | 색상 | `chat_send_highlighted_button_color` | — | `InputBarStyle-Chat` › `-ios-send-highlighted-background-color` |
| 전송 버튼 아이콘 눌림 색상 | 색상 | `chat_send_highlighted_icon_color` | — | `InputBarStyle-Chat` › `-ios-send-highlighted-foreground-color` |
| 전송 버튼 아이콘 색상 | 색상 | `chat_send_icon_color` | `theme_chatroom_input_bar_send_icon_color` | `InputBarStyle-Chat` › `-ios-send-normal-foreground-color` |
| 안 읽음 숫자 색상 | 색상 | `chat_unread_count_color` | `theme_chatroom_unread_count_color` | `MessageCellStyle-Send,MessageCellStyle-Receive` › `-ios-unread-text-color` |

## 더보기

| 슬롯 이름 | 종류 | role | Android | iOS |
|---|---|---|---|---|
| 전달 완료 배너 배경 색상 | 색상 | `direct_share_background_color` | `theme_direct_share_background_color` | `BackgroundStyle-DirectShareBar` › `background-color` |
| 바로 공유 버튼 | 색상 | `direct_share_button_color` | `theme_direct_share_button_color` | — |
| 전달완료 이름 | 색상 | `direct_share_name_color` | — | `LabelStyle-DirectShareBarName` › `-ios-text-color` |
| 전달 완료 안내 텍스트 색상 | 색상 | `direct_share_text_color` | `theme_direct_share_color` | `LabelStyle-DirectShareBarMessage` › `-ios-text-color` |
| 서비스 강조 색상 | 색상 | `feature_primary_color` | `theme_feature_primary_color` | `FeatureStyle-Primary` › `-ios-text-color` |
| 서비스 주요 눌림 색상 | 색상 | `feature_primary_pressed_color` | `theme_feature_primary_pressed_color` | — |
| 더보기·보조 콘텐츠 배경 | 색상 | `main_body_secondary_cell_color` | `theme_body_secondary_cell_color` | `MainViewStyle-Secondary` › `background-color` |
| 탐색 탭 색상 | 색상 | `main_feature_browse_tab_color` | `theme_feature_browse_tab_color` | — |
| 탐색 탭 선택 색상 | 색상 | `main_feature_browse_tab_focused_color` | `theme_feature_browse_tab_focused_color` | — |
| 메시지 알림 배경 색상 | 색상 | `notification_background_color` | `theme_notification_background_color` | `BackgroundStyle-MessageNotificationBar` › `background-color` |
| 알림 눌림 배경 | 색상 | `notification_background_pressed_color` | `theme_notification_background_pressed_color` | — |
| 메시지 알림 이름 | 색상 | `notification_name_color` | — | `LabelStyle-MessageNotificationBarName` › `-ios-text-color` |
| 메시지 알림 텍스트 색상 | 색상 | `notification_text_color` | `theme_notification_color` | `LabelStyle-MessageNotificationBarMessage` › `-ios-text-color` |
| 상단 탭 텍스트 색상 | 색상 | `tab_text_color` | — | `HeaderStyle-Main` › `-ios-tab-text-color` |

## 잠금화면

| 슬롯 이름 | 종류 | role | Android | iOS |
|---|---|---|---|---|
| 잠금화면 배경 이미지 | 이미지 | `passcode_background` | `src/main/theme/drawable-xxhdpi/theme_passcode_background_image.png` | `Images/passcodeBgImage.png`<br>`BackgroundStyle-Passcode` › `-ios-background-image` |
| 잠금화면 배경색 | 색상 | `passcode_background_color` | `theme_passcode_background_color` | `BackgroundStyle-Passcode` › `background-color` |
| 잠금화면 안내 텍스트 색상 | 색상 | `passcode_color` | `theme_passcode_color` | `LabelStyle-PasscodeTitle` › `-ios-text-color` |
| 암호 표시 1 기본 이미지 | 이미지 | `passcode_indicator_1` | `src/main/theme/drawable-xxhdpi/theme_passcode_01_image.png` | `Images/passcodeImgCode01.png`<br>`PasscodeStyle` › `-ios-bullet-first-image` |
| 암호 표시 1 입력 이미지 | 이미지 | `passcode_indicator_1_checked` | `src/main/theme/drawable-xxhdpi/theme_passcode_01_checked_image.png` | `Images/passcodeImgCode01Selected.png`<br>`PasscodeStyle` › `-ios-bullet-selected-first-image` |
| 암호 표시 2 기본 이미지 | 이미지 | `passcode_indicator_2` | `src/main/theme/drawable-xxhdpi/theme_passcode_02_image.png` | `Images/passcodeImgCode02.png`<br>`PasscodeStyle` › `-ios-bullet-second-image` |
| 암호 표시 2 입력 이미지 | 이미지 | `passcode_indicator_2_checked` | `src/main/theme/drawable-xxhdpi/theme_passcode_02_checked_image.png` | `Images/passcodeImgCode02Selected.png`<br>`PasscodeStyle` › `-ios-bullet-selected-second-image` |
| 암호 표시 3 기본 이미지 | 이미지 | `passcode_indicator_3` | `src/main/theme/drawable-xxhdpi/theme_passcode_03_image.png` | `Images/passcodeImgCode03.png`<br>`PasscodeStyle` › `-ios-bullet-third-image` |
| 암호 표시 3 입력 이미지 | 이미지 | `passcode_indicator_3_checked` | `src/main/theme/drawable-xxhdpi/theme_passcode_03_checked_image.png` | `Images/passcodeImgCode03Selected.png`<br>`PasscodeStyle` › `-ios-bullet-selected-third-image` |
| 암호 표시 4 기본 이미지 | 이미지 | `passcode_indicator_4` | `src/main/theme/drawable-xxhdpi/theme_passcode_04_image.png` | `Images/passcodeImgCode04.png`<br>`PasscodeStyle` › `-ios-bullet-fourth-image` |
| 암호 표시 4 입력 이미지 | 이미지 | `passcode_indicator_4_checked` | `src/main/theme/drawable-xxhdpi/theme_passcode_04_checked_image.png` | `Images/passcodeImgCode04Selected.png`<br>`PasscodeStyle` › `-ios-bullet-selected-fourth-image` |
| 키패드 배경 색상 | 색상 | `passcode_keypad_background_color` | `theme_passcode_keypad_background_color` | `PasscodeStyle` › `-ios-keypad-background-color` |
| 키패드 숫자 색상 | 색상 | `passcode_keypad_color` | `theme_passcode_keypad_color` | `PasscodeStyle` › `-ios-keypad-text-normal-color` |
| 키패드 pressed 배경 | 색상 | `passcode_keypad_pressed_background_color` | `theme_passcode_keypad_pressed_background_color` | — |
| 키패드 숫자 pressed | 색상 | `passcode_keypad_pressed_color` | `theme_passcode_keypad_pressed_color` | — |
| 키패드 눌림 이미지 | 이미지 | `passcode_keypad_pressed_image` | — | `Images/passcodeKeypadPressed.png`<br>`PasscodeStyle` › `-ios-keypad-number-highlighted-image` |
| 패턴 라인 | 색상 | `passcode_pattern_line_color` | `theme_passcode_pattern_line_color` | — |

## 공통 리소스

| 슬롯 이름 | 종류 | role | Android | iOS |
|---|---|---|---|---|
| 친구 추가 버튼 | 이미지 | `find_add_friend` | `src/main/theme/drawable-xxhdpi/theme_find_add_friend_button_image.png` | `Images/findBtnAddFriend.png`<br>`ButtonStyle-AddFriend` › `-ios-image` |
| 친구 추가 버튼 눌림 | 이미지 | `find_add_friend_pressed` | `src/main/theme/drawable-xxhdpi/theme_find_add_friend_button_pressed_image.png` | — |
| 런처 배경 | 이미지 | `launcher_background` | `src/main/res/mipmap-xxxhdpi/ic_launcher_background.png` | — |
| 런처 전경 | 이미지 | `launcher_foreground` | `src/main/res/mipmap-xxxhdpi/ic_launcher_foreground.png` | — |
| 런처 아이콘 | 이미지 | `launcher_icon` | `src/main/res/mipmap-xxxhdpi/ic_launcher.png` | — |
| 런처 라운드 아이콘 | 이미지 | `launcher_round` | `src/main/res/mipmap-xxxhdpi/ic_launcher_round.png` | — |
| 기본 프로필 이미지 | 이미지 | `profile_image_1` | `src/main/theme/drawable-xxhdpi/theme_profile_01_image.png` | `Images/profileImg01.png`<br>`DefaultProfileStyle` › `-ios-profile-images` |
| 프로필 이미지 2 | 이미지 | `profile_image_2` | `src/main/theme/drawable-xxhdpi/theme_profile_02_image.png` | — |
| 프로필 이미지 3 | 이미지 | `profile_image_3` | `src/main/theme/drawable-xxhdpi/theme_profile_03_image.png` | — |
| 전체 프로필 이미지 1 | 이미지 | `profile_image_full_1` | `src/main/theme/drawable-nodpi/theme_profile_01_image_full.png` | — |
| 전체 프로필 이미지 2 | 이미지 | `profile_image_full_2` | `src/main/theme/drawable-nodpi/theme_profile_02_image_full.png` | — |
| 전체 프로필 이미지 3 | 이미지 | `profile_image_full_3` | `src/main/theme/drawable-nodpi/theme_profile_03_image_full.png` | — |
| 실행 스플래시 이미지 | 이미지 | `splash` | `src/main/theme/drawable-xxhdpi/theme_splash_image.png` | — |
| 실행 스플래시 이미지 (가로) | 이미지 | `splash_landscape` | `src/main/theme/drawable-land-xxhdpi/theme_splash_image.png` | — |
| 테마 대표 아이콘 | 이미지 | `theme_icon` | `src/main/theme/drawable-xxhdpi/icon.png` | `Images/commonIcoTheme.png` |

## 플랫폼 편차

- Android 에만 있는 슬롯: 29개
- iOS 에만 있는 슬롯: 19개

한쪽에만 있는 슬롯은 편집기에서도 그 플랫폼에서만 보인다. 내보내기 폴백으로만 채워지는
값이 있으므로, 프리뷰가 슬롯 없는 role 을 그릴 때는 `getPreviewColorRole()` 을 거쳐야 한다.
