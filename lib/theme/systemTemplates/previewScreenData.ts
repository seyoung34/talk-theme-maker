/**
 * 모달 프리뷰 4화면이 보여 주는 예시 데이터.
 *
 * 같은 화면을 두 곳이 그린다 — 관리자 저장 시 굽는 canvas 렌더러(`screenPreview.ts`)와,
 * 구운 이미지가 없을 때 폴백으로 도는 DOM 컴포넌트(`TemplateGalleryClient.tsx`).
 * 데이터가 갈라지면 폴백으로 떨어지는 순간 화면이 달라 보이므로 여기 한 곳에 둔다.
 */

export const previewScreenIds = ["friends", "chats", "chatroom", "profile"] as const;
export type PreviewScreenId = (typeof previewScreenIds)[number];

/** 모달 하단에 그대로 노출되는 문구다. */
export const previewScreens: Array<{ id: PreviewScreenId; label: string }> = [
  { id: "friends", label: "친구" },
  { id: "chats", label: "채팅목록" },
  { id: "chatroom", label: "채팅방" },
  { id: "profile", label: "프로필" },
];

export type PreviewTabKey = "friends" | "chats" | "now" | "shopping" | "more";

export const previewTabs: Array<{ key: PreviewTabKey; label: string; badge?: string }> = [
  { key: "friends", label: "친구", badge: "12" },
  { key: "chats", label: "채팅", badge: "8" },
  { key: "now", label: "Now" },
  { key: "shopping", label: "쇼핑" },
  { key: "more", label: "더보기" },
];

export const updateProfileNames = ["내 프로필", "수아", "하늘", "준서", "서연"];

export const friendBirthdayRows = [
  { name: "수아", sub: "오늘도 좋은 하루 ☺️" },
  { name: "정하늘", sub: "새 프로필로 바꿨어요" },
  { name: "이준서", sub: "여행 다녀왔습니다" },
];

export const chatListPreviewRows = [
  { name: "수아", message: "콜! 이따 6시에 보자 ㅎㅎ", time: "09:40", unread: 2 },
  { name: "가족 단톡방", message: "엄마: 저녁 몇 시에 올 거야?", time: "어제", unread: 5 },
  { name: "정하늘", message: "그 사진 봤어?? 완전 웃기다 ㅋㅋㅋ", time: "어제", unread: 0 },
  { name: "이준서", message: "내일 회의 자료 공유할게요", time: "화요일", unread: 0 },
];

/**
 * 연속 메시지 두 쌍(you_1→you_2, me_1→me_2)으로 구성해 bubble_me_1/2, bubble_you_1/2 네 슬롯이
 * 모두 보이게 한다. variant 2는 "_2"(연속 메시지 변형) 에셋을 쓴다.
 */
export const chatroomPreviewMessages: Array<{ mine: boolean; variant: 1 | 2; text: string; time: string }> = [
  { mine: false, variant: 1, text: "오늘 저녁 뭐 먹지 ㅋㅋ", time: "5:41" },
  { mine: false, variant: 2, text: "떡볶이 어때?", time: "5:41" },
  { mine: true, variant: 1, text: "콜 좋아 ㅎㅎ", time: "5:42" },
  { mine: true, variant: 2, text: "6시에 보자!", time: "5:42" },
];

/** 광고 예시 영역. 테마와 무관한 고정 UI라 색을 테마에서 가져오지 않는다. */
export const previewAdBanner = {
  title: "카카오톡 채널의 새로운 소식",
  description: "테마와 무관한 광고 예시 영역입니다.",
  badge: "AD",
};

/**
 * 굽는 크기. 모달 목업은 `aspect-9/19.5`로 최대 540px 높이까지 커진다.
 * 논리 크기를 표시 크기에 맞추고 실제 픽셀만 2배로 올려 큰 화면에서도 흐리지 않게 한다.
 */
export const previewScreenSize = { width: 250, height: 542, deviceScale: 2 } as const;
