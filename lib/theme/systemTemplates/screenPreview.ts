import { loadNinePatchBlob } from "@/lib/theme/android/ninepatch";
import { drawBubble, getAutoBubbleSize } from "@/lib/theme/preview/bubbleCanvas";
import type { BubbleEditState } from "@/lib/theme/project/state";
import {
  canRenderPreviewCanvas,
  canvasToWebpBlob,
  createPreviewCanvas,
  drawAvatar,
  drawBackground,
  drawImageContain,
  drawText,
  fillRoundRect,
  loadImageOrNull,
  previewFont,
  roundRect,
} from "@/lib/theme/systemTemplates/previewCanvas";
import {
  chatListPreviewRows,
  chatroomPreviewMessages,
  friendBirthdayRows,
  previewAdBanner,
  previewScreenIds,
  previewScreenSize,
  previewTabs,
  updateProfileNames,
  type PreviewScreenId,
  type PreviewTabKey,
} from "@/lib/theme/systemTemplates/previewScreenData";
import type { TabIconUrls, TemplatePreviewVisual } from "@/lib/theme/systemTemplates/preview";
import type { BubbleAsset, BubbleSlot } from "@/lib/theme/types";

/**
 * 모달 프리뷰 4화면을 굽는다.
 *
 * 모달은 원본 에셋을 서명 URL로 받아 DOM으로 그린다. 화면에는 폰 목업 크기로 나오는데 2MB짜리
 * 배경 원본을 받으므로, 한 번 여는 데 8MB 가까이 나갔다. 시스템 템플릿은 운영자 한 명이 만들어
 * 올리므로 **저장할 때 화면을 통째로 구워 두면** 사용자는 결과 이미지만 받으면 된다.
 *
 * 에셋별 축소본을 만드는 방법도 있었지만 말풍선이 걸린다. `BubbleGeometry`는 원본 픽셀 좌표라
 * 이미지를 줄이면 9-slice가 어긋난다. 화면째 구우면 좌표를 원본에 적용한 뒤 평면화하므로
 * 그 문제가 아예 생기지 않는다.
 *
 * 입력은 `TemplatePreviewVisual` 하나다. 폴백으로 도는 DOM 컴포넌트와 **같은 입력**을 써야
 * 둘이 같은 화면을 보여 준다.
 */

const { width: W, height: H, deviceScale } = previewScreenSize;

const headerPadX = 12;
const contentPadX = 12;
const tabBarHeight = 42;
const adBannerHeight = 34;

type ScreenImages = {
  mainBackground: HTMLImageElement | null;
  chatBackground: HTMLImageElement | null;
  tabBackground: HTMLImageElement | null;
  /**
   * 친구·채팅목록 화면의 리스트 아바타에 돌려 쓴다.
   * 프로필 화면은 여기서 첫 번째(`profile_image_1`)만 쓴다.
   */
  profiles: Array<HTMLImageElement | null>;
  tabIcons: Partial<Record<keyof TabIconUrls, HTMLImageElement | null>>;
  bubbles: Map<string, BubbleAsset>;
};

/**
 * 굽기 전에 확인할 것 — 기대한 에셋이 모두 서명됐는가.
 *
 * 서명이 빠진 경로는 visual에서 URL 없는 슬롯이 되고, 렌더는 그것을 "이미지 없음"으로 받아들여
 * 색과 자리표시자만으로 멀쩡히 4장을 완성한다. 그 결과가 업로드되면 갤러리가 **영구히 우선**하므로
 * 일시적인 서명 실패가 실제 테마와 다른 미리보기로 굳는다.
 *
 * 기대한 경로가 아예 없는 경우(업로드 에셋이 없는 템플릿)는 정상이다. 색만으로 구워도 맞다.
 */
export function findUnsignedPreviewAssets(expectedPaths: string[], signedUrlByPath: Record<string, string>) {
  return expectedPaths.filter((path) => !signedUrlByPath[path]);
}

export async function generatePreviewScreens(visual: TemplatePreviewVisual): Promise<Partial<Record<PreviewScreenId, Blob>>> {
  // 그릴 수 없는 환경(SSR·테스트)에서는 이미지를 받기 전에 끝낸다. 받아 봐야 버린다.
  if (!canRenderPreviewCanvas()) return {};

  const { images, missing } = await loadScreenImages(visual);

  // URL이 있는데 받지 못한 이미지가 하나라도 있으면 굽지 않는다.
  //
  // 여기서 굽으면 그 에셋만 빠진 화면이 완성되고, 업로드된 뒤에는 갤러리가 그것을 영구히
  // 우선한다. 일시적인 다운로드 실패가 실제 테마와 다른 미리보기로 굳는 셈이다.
  // 굽지 않으면 모달이 원본을 받아 그리는 폴백으로 떨어진다 — 느리지만 정확하다.
  if (missing.length > 0) {
    console.warn(`Screen previews skipped; ${missing.length} image(s) could not be loaded.`, missing);
    return {};
  }

  const result: Partial<Record<PreviewScreenId, Blob>> = {};

  for (const id of previewScreenIds) {
    const blob = await renderScreen(id, visual, images);
    if (blob) result[id] = blob;
  }
  return result;
}

async function renderScreen(id: PreviewScreenId, visual: TemplatePreviewVisual, images: ScreenImages) {
  const created = createPreviewCanvas(W, H, deviceScale);
  if (!created) return null;
  const { canvas, context } = created;

  if (id === "friends") drawFriendsScreen(context, visual, images);
  if (id === "chats") drawChatsScreen(context, visual, images);
  if (id === "chatroom") drawChatroomScreen(context, visual, images);
  if (id === "profile") drawProfileScreen(context, visual, images);

  return canvasToWebpBlob(canvas);
}

// ---------------------------------------------------------------- 이미지 적재

/**
 * 화면에 필요한 이미지를 모두 받는다.
 *
 * URL이 없는 슬롯은 원래 비어 있는 것이므로 문제가 아니다. **URL이 있는데 받지 못한 것**만
 * `missing`에 모아 호출부가 굽기를 포기할 수 있게 한다.
 */
async function loadScreenImages(visual: TemplatePreviewVisual): Promise<{ images: ScreenImages; missing: string[] }> {
  const tabIconKeys = Object.keys(visual.tabIcons ?? {}) as Array<keyof TabIconUrls>;
  const missing: string[] = [];

  const track = async (url: string | undefined) => {
    if (!url) return null;
    const image = await loadImageOrNull(url);
    if (!image) missing.push(url);
    return image;
  };

  // `profile_image_full_1`은 받지 않는다. 프로필 화면이 `profile_image_1`만 쓰기 때문이다.
  const [mainBackground, chatBackground, tabBackground, profile1, profile2, profile3, ...tabIconImages] = await Promise.all([
    track(visual.mainBackgroundImage),
    track(visual.chatBackgroundImage),
    track(visual.tabBackgroundImage),
    track(visual.profileImage),
    track(visual.profileImage2),
    track(visual.profileImage3),
    ...tabIconKeys.map((key) => track(visual.tabIcons?.[key])),
  ]);

  const tabIcons: ScreenImages["tabIcons"] = {};
  tabIconKeys.forEach((key, index) => {
    tabIcons[key] = tabIconImages[index] ?? null;
  });

  // 프로필이 하나만 있으면 DOM과 같이 그것을 돌려 쓴다.
  const profiles = [profile1, profile2 ?? profile1, profile3 ?? profile1];
  const { assets: bubbles, missing: missingBubbles } = await loadBubbles(visual);

  return {
    images: { mainBackground, chatBackground, tabBackground, profiles, tabIcons, bubbles },
    missing: [...missing, ...missingBubbles],
  };
}

async function loadBubbles(visual: TemplatePreviewVisual) {
  const sources: Array<{ key: string; url?: string; slot: BubbleSlot }> = [
    { key: "me-1", url: visual.myBubbleImage, slot: "me" },
    { key: "me-2", url: visual.myBubbleImage2, slot: "me" },
    { key: "you-1", url: visual.friendBubbleImage, slot: "you" },
    { key: "you-2", url: visual.friendBubbleImage2, slot: "you" },
  ];

  const assets = new Map<string, BubbleAsset>();
  const missing: string[] = [];

  await Promise.all(
    sources.map(async ({ key, url, slot }) => {
      if (!url) return;
      try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`bubble fetch failed: ${response.status}`);
        const blob = await response.blob();
        // 나인패치 판정은 파일명으로 한다. 서명 URL이라 쿼리를 떼고 본다.
        const fileName = url.split("?")[0].split("#")[0];
        const isNinePatch = fileName.toLowerCase().endsWith(".9.png");
        assets.set(key, await loadNinePatchBlob(blob, `${slot}-bubble${isNinePatch ? ".9" : ""}.png`, slot));
      } catch {
        // 단색 캡슐로 떨어뜨리지 않는다. 말풍선은 테마의 핵심이라 빠진 채로 구워 두면
        // 실제 테마와 다른 미리보기가 굳는다.
        missing.push(url);
      }
    }),
  );
  return { assets, missing };
}

// ---------------------------------------------------------------- 공용 조각

function drawHeader(context: CanvasRenderingContext2D, height: number, background: string, foreground: string, title: string, titleSize: number, leading?: () => void, icons: GlyphKind[] = []) {
  context.save();
  context.fillStyle = background;
  context.fillRect(0, 0, W, height);
  context.restore();

  leading?.();

  const iconsWidth = icons.length * 18;
  const titleX = leading ? headerPadX + 24 + 8 : headerPadX;
  drawText(context, title, titleX, height / 2, {
    font: previewFont(700, titleSize),
    color: foreground,
    maxWidth: W - titleX - headerPadX - iconsWidth,
  });

  icons.forEach((kind, index) => {
    drawGlyph(context, kind, W - headerPadX - (icons.length - index) * 18 + 4, height / 2, 14, foreground);
  });
}

function drawAdBanner(context: CanvasRenderingContext2D, y: number) {
  fillRoundRect(context, contentPadX, y, W - contentPadX * 2, adBannerHeight, 10, "#f1f3f5");
  fillRoundRect(context, contentPadX + 8, y + 9, 44, 16, 5, "#e2e5e9");
  drawText(context, previewAdBanner.badge, contentPadX + 30, y + 17, { font: previewFont(700, 8), color: "#868e96", align: "center" });

  const textX = contentPadX + 60;
  const textWidth = W - contentPadX - 8 - textX;
  drawText(context, previewAdBanner.title, textX, y + 13, { font: previewFont(600, 9.5), color: "#343a40", maxWidth: textWidth });
  drawText(context, previewAdBanner.description, textX, y + 24, { font: previewFont(500, 8), color: "#868e96", maxWidth: textWidth });
}

function drawTabBar(context: CanvasRenderingContext2D, visual: TemplatePreviewVisual, images: ScreenImages, active: PreviewTabKey) {
  const y = H - tabBarHeight;

  context.save();
  context.beginPath();
  context.rect(0, y, W, tabBarHeight);
  context.clip();
  context.fillStyle = visual.tabBackgroundColor;
  context.fillRect(0, y, W, tabBarHeight);
  if (images.tabBackground) {
    // DOM은 bg-cover다. 탭바만 잘라 같은 비율로 채운다.
    const image = images.tabBackground;
    const scale = Math.max(W / (image.naturalWidth || 1), tabBarHeight / (image.naturalHeight || 1));
    context.drawImage(image, (W - image.naturalWidth * scale) / 2, y + (tabBarHeight - image.naturalHeight * scale) / 2, image.naturalWidth * scale, image.naturalHeight * scale);
  }
  context.restore();

  context.fillStyle = "rgba(0,0,0,.05)";
  context.fillRect(0, y, W, 1);

  const cellWidth = W / previewTabs.length;
  previewTabs.forEach((tab, index) => {
    const centerX = cellWidth * index + cellWidth / 2;
    const isActive = tab.key === active;
    // 5개 모두 기본(비포커스) 아이콘을 쓴다. 포커스 아이콘을 채우지 않은 템플릿이 많아
    // 선택된 탭만 다른 그림으로 떨어지면 오히려 어긋나 보인다. 활성 표시는 투명도와
    // 라벨 굵기가 맡는다.
    const icon = images.tabIcons[tab.key as keyof TabIconUrls] ?? null;
    const iconSize = 20;
    const iconY = y + 5;

    context.save();
    context.globalAlpha = isActive ? 1 : 0.55;
    if (icon) {
      drawImageContain(context, icon, centerX - iconSize / 2, iconY, iconSize, iconSize);
    } else {
      fillRoundRect(context, centerX - 7, iconY + 3, 14, 14, 5, isActive ? "rgba(0,0,0,.85)" : "rgba(0,0,0,.4)");
    }
    context.restore();

    if (tab.badge) {
      const badgeX = centerX + 7;
      const badgeY = iconY + 1;
      fillRoundRect(context, badgeX, badgeY - 5, Math.max(10, tab.badge.length * 5 + 4), 10, 5, visual.unreadColor);
      drawText(context, tab.badge, badgeX + Math.max(10, tab.badge.length * 5 + 4) / 2, badgeY, { font: previewFont(800, 6), color: "#ffffff", align: "center" });
    }

    drawText(context, tab.label, centerX, y + 32, {
      font: previewFont(isActive ? 800 : 600, 7.5),
      color: isActive ? visual.titleColor : visual.descriptionColor,
      align: "center",
    });
  });
}

/** 이름·부제 두 줄짜리 리스트 행. 친구탭 생일 목록과 채팅 목록이 같은 모양이다. */
function drawListRow(
  context: CanvasRenderingContext2D,
  y: number,
  avatar: HTMLImageElement | null,
  title: string,
  subtitle: string,
  visual: TemplatePreviewVisual,
  trailing?: { time: string; unread: number },
) {
  const avatarSize = 36;
  drawAvatar(context, contentPadX, y, avatarSize, avatar);

  const textX = contentPadX + avatarSize + 10;
  const trailingWidth = trailing ? 34 : 0;
  const textWidth = W - contentPadX - textX - trailingWidth;
  drawText(context, title, textX, y + 12, { font: previewFont(700, 12), color: visual.titleColor, maxWidth: textWidth });
  drawText(context, subtitle, textX, y + 26, { font: previewFont(500, 10), color: visual.descriptionColor, maxWidth: textWidth });

  if (trailing) {
    context.save();
    context.globalAlpha = 0.85;
    drawText(context, trailing.time, W - contentPadX, y + 10, { font: previewFont(500, 8.5), color: visual.descriptionColor, align: "right" });
    context.restore();
    if (trailing.unread > 0) {
      const label = String(trailing.unread);
      const badgeWidth = Math.max(14, label.length * 6 + 8);
      fillRoundRect(context, W - contentPadX - badgeWidth, y + 20, badgeWidth, 14, 7, visual.unreadColor);
      drawText(context, label, W - contentPadX - badgeWidth / 2, y + 27, { font: previewFont(800, 8), color: "#ffffff", align: "center" });
    }
  }
}

// ---------------------------------------------------------------- 화면 1: 친구탭

function drawFriendsScreen(context: CanvasRenderingContext2D, visual: TemplatePreviewVisual, images: ScreenImages) {
  drawBackground(context, { x: 0, y: 0, width: W, height: H }, 0, visual.mainBackgroundColor, images.mainBackground);

  const headerHeight = 44;
  drawHeader(
    context,
    headerHeight,
    visual.mainHeaderColor,
    visual.mainHeaderForegroundColor,
    "내 프로필",
    12,
    () => drawAvatar(context, headerPadX, headerHeight / 2 - 12, 24, images.profiles[0]),
    ["search", "user-plus", "gift", "settings"],
  );

  let y = headerHeight + 10;

  // 친구 / 추천 칩
  const chipHeight = 20;
  const friendChipWidth = 40;
  fillRoundRect(context, contentPadX, y, friendChipWidth, chipHeight, chipHeight / 2, visual.titleColor);
  drawText(context, "친구", contentPadX + friendChipWidth / 2, y + chipHeight / 2, { font: previewFont(700, 10), color: visual.mainBackgroundColor, align: "center" });

  const recommendX = contentPadX + friendChipWidth + 6;
  context.save();
  context.strokeStyle = "rgba(0,0,0,.1)";
  context.lineWidth = 1;
  roundRect(context, recommendX, y, friendChipWidth, chipHeight, chipHeight / 2);
  context.stroke();
  context.restore();
  drawText(context, "추천", recommendX + friendChipWidth / 2, y + chipHeight / 2, { font: previewFont(700, 10), color: visual.titleColor, align: "center" });

  y += chipHeight + 8;
  drawAdBanner(context, y);
  y += adBannerHeight + 10;

  drawText(context, "업데이트 프로필 12", contentPadX, y, { font: previewFont(700, 11), color: visual.sectionTitleColor });
  y += 12;

  // 프로필 5개를 가로로 균등 배치
  const cellWidth = (W - contentPadX * 2) / updateProfileNames.length;
  updateProfileNames.forEach((name, index) => {
    const centerX = contentPadX + cellWidth * index + cellWidth / 2;
    drawAvatar(context, centerX - 16, y, 32, images.profiles[index % images.profiles.length]);
    if (index > 0) {
      context.fillStyle = "#ff7246";
      context.beginPath();
      context.arc(centerX - 10, y + 2, 3, 0, Math.PI * 2);
      context.fill();
    }
    drawText(context, name, centerX, y + 40, { font: previewFont(500, 7), color: visual.descriptionColor, align: "center", maxWidth: cellWidth - 2 });
  });
  y += 52;

  context.save();
  context.globalAlpha = 0.35;
  context.fillStyle = visual.bodyCellBorderColor;
  context.fillRect(contentPadX, y, W - contentPadX * 2, 1);
  context.restore();
  y += 10;

  drawText(context, "생일인 친구 4", contentPadX, y, { font: previewFont(700, 11), color: visual.sectionTitleColor });
  y += 12;

  for (const row of friendBirthdayRows) {
    if (y + 40 > H - tabBarHeight) break;
    drawListRow(context, y, images.profiles[friendBirthdayRows.indexOf(row) % images.profiles.length], row.name, row.sub, visual);
    y += 42;
  }

  drawTabBar(context, visual, images, "friends");
}

// ---------------------------------------------------------------- 화면 2: 채팅목록탭

function drawChatsScreen(context: CanvasRenderingContext2D, visual: TemplatePreviewVisual, images: ScreenImages) {
  drawBackground(context, { x: 0, y: 0, width: W, height: H }, 0, visual.mainBackgroundColor, images.mainBackground);

  const headerHeight = 38;
  drawHeader(context, headerHeight, visual.mainHeaderColor, visual.mainHeaderForegroundColor, "채팅", 13, undefined, ["search", "plus"]);

  let y = headerHeight + 10;
  drawAdBanner(context, y);
  y += adBannerHeight + 10;

  chatListPreviewRows.forEach((row, index) => {
    if (y + 40 > H - tabBarHeight) return;
    drawListRow(context, y, images.profiles[index % images.profiles.length], row.name, row.message, visual, { time: row.time, unread: row.unread });
    y += 44;
  });

  drawTabBar(context, visual, images, "chats");
}

// ---------------------------------------------------------------- 화면 3: 채팅방

function drawChatroomScreen(context: CanvasRenderingContext2D, visual: TemplatePreviewVisual, images: ScreenImages) {
  drawBackground(context, { x: 0, y: 0, width: W, height: H }, 0, visual.chatBackgroundColor, images.chatBackground);

  const headerHeight = 38;
  const inputHeight = 38;

  // 헤더는 테마 색이 아니라 배경 위에 얹는 반투명 띠다(DOM의 bg-black/5).
  context.fillStyle = "rgba(0,0,0,.05)";
  context.fillRect(0, 0, W, headerHeight);
  drawGlyph(context, "back", headerPadX + 7, headerHeight / 2, 14, visual.titleColor);
  drawText(context, "수아", headerPadX + 22, headerHeight / 2, { font: previewFont(700, 12), color: visual.titleColor, maxWidth: W - 90 });
  drawGlyph(context, "search", W - headerPadX - 25, headerHeight / 2, 14, visual.titleColor);
  drawGlyph(context, "menu", W - headerPadX - 7, headerHeight / 2, 14, visual.titleColor);

  // 메시지는 아래에서 위로 쌓는다(DOM의 content-end).
  let bottom = H - inputHeight - 12;
  for (let index = chatroomPreviewMessages.length - 1; index >= 0; index -= 1) {
    const message = chatroomPreviewMessages[index];
    const height = drawChatBubbleRow(context, visual, images, message, bottom);
    bottom -= height + 8;
  }

  context.fillStyle = "rgba(255,255,255,.85)";
  context.fillRect(0, H - inputHeight, W, inputHeight);
  const inputY = H - inputHeight / 2;
  drawGlyph(context, "plus", headerPadX, inputY, 14, "#868e96");
  fillRoundRect(context, headerPadX + 14, inputY - 10, W - headerPadX * 2 - 58, 20, 10, "#ffffff");
  drawText(context, "메시지 입력", headerPadX + 24, inputY, { font: previewFont(500, 10), color: "#868e96" });
  drawGlyph(context, "smile", W - headerPadX - 32, inputY, 14, "#868e96");

  context.fillStyle = visual.unreadColor;
  context.beginPath();
  context.arc(W - headerPadX - 12, inputY, 12, 0, Math.PI * 2);
  context.fill();
  drawGlyph(context, "send", W - headerPadX - 12, inputY, 12, "#ffffff");
}

/** 말풍선 한 줄. 그린 높이를 돌려줘 호출부가 위로 쌓을 수 있게 한다. */
function drawChatBubbleRow(
  context: CanvasRenderingContext2D,
  visual: TemplatePreviewVisual,
  images: ScreenImages,
  message: (typeof chatroomPreviewMessages)[number],
  bottom: number,
) {
  const { mine, variant, text, time } = message;
  const key = `${mine ? "me" : "you"}-${variant}`;
  const asset = images.bubbles.get(key) ?? null;
  const textColor = mine ? visual.myBubbleTextColor : visual.friendBubbleTextColor;
  const fill = mine ? visual.myBubbleFillColor : visual.friendBubbleFillColor;
  const edit = resolveBubbleEdit(visual, mine, variant);

  const avatarSize = 24;
  const maxBubbleWidth = W - contentPadX * 2 - (mine ? 22 : avatarSize + 6 + 22);
  const rendered = asset ? renderBubble(asset, edit, visual.platform, text, fill, textColor, maxBubbleWidth) : null;

  const bubbleWidth = rendered?.width ?? Math.min(maxBubbleWidth, context.measureText(text).width + 24);
  const bubbleHeight = rendered?.height ?? 26;
  const top = bottom - bubbleHeight;

  const startX = mine ? W - contentPadX - bubbleWidth : contentPadX + avatarSize + 6;
  if (!mine) drawAvatar(context, contentPadX, top + bubbleHeight - avatarSize, avatarSize, images.profiles[0]);

  if (rendered) {
    context.drawImage(rendered.canvas, startX, top, bubbleWidth, bubbleHeight);
  } else {
    fillRoundRect(context, startX, top, bubbleWidth, bubbleHeight, 12, fill);
    drawText(context, text, startX + 10, top + bubbleHeight / 2, { font: previewFont(500, 11), color: textColor, maxWidth: bubbleWidth - 20 });
  }

  const timeX = mine ? startX - 4 : startX + bubbleWidth + 4;
  drawText(context, time, timeX, bottom - 4, {
    font: previewFont(500, 7),
    color: visual.descriptionColor,
    align: mine ? "right" : "left",
  });

  return bubbleHeight;
}

/**
 * 말풍선을 고유 크기로 9-slice 렌더한 뒤 화면에 놓을 크기를 계산한다.
 *
 * 편집기 미리보기(`BubbleCanvasPreview`)와 같은 경로를 쓴다. 고유 크기로 그려야 stretch·inset이
 * 저장된 좌표 그대로 적용된다 — 미리 줄여 놓고 그리면 좌표가 어긋난다.
 */
function renderBubble(
  asset: BubbleAsset,
  edit: BubbleEditState | undefined,
  platform: TemplatePreviewVisual["platform"],
  text: string,
  fill: string,
  textColor: string,
  maxWidth: number,
) {
  const offscreen = document.createElement("canvas");
  const offContext = offscreen.getContext("2d");
  if (!offContext) return null;

  const intrinsic = getAutoBubbleSize(offContext, asset, platform, edit, text);
  offscreen.width = Math.max(1, Math.round(intrinsic.width));
  offscreen.height = Math.max(1, Math.round(intrinsic.height));
  const context = offscreen.getContext("2d");
  if (!context) return null;

  drawBubble(context, {
    asset,
    edit,
    platform,
    x: 0,
    y: 0,
    width: intrinsic.width,
    height: intrinsic.height,
    text,
    fill,
    textColor,
  });

  const scale = Math.min(0.24, maxWidth / intrinsic.width);
  return { canvas: offscreen, width: intrinsic.width * scale, height: intrinsic.height * scale };
}

function resolveBubbleEdit(visual: TemplatePreviewVisual, mine: boolean, variant: 1 | 2): BubbleEditState | undefined {
  const geometry = variant === 2 ? (mine ? visual.myBubbleGeometry2 : visual.friendBubbleGeometry2) : mine ? visual.myBubbleGeometry : visual.friendBubbleGeometry;
  const stretch = variant === 2 ? (mine ? visual.myBubbleStretch2 : visual.friendBubbleStretch2) : mine ? visual.myBubbleStretch : visual.friendBubbleStretch;
  const insets = variant === 2 ? (mine ? visual.myBubbleInsets2 : visual.friendBubbleInsets2) : mine ? visual.myBubbleInsets : visual.friendBubbleInsets;
  const markers = variant === 2 ? (mine ? visual.myBubbleMarkers2 : visual.friendBubbleMarkers2) : mine ? visual.myBubbleMarkers : visual.friendBubbleMarkers;
  const flipX = variant === 2 ? (mine ? visual.myBubbleFlipX2 : visual.friendBubbleFlipX2) : mine ? visual.myBubbleFlipX : visual.friendBubbleFlipX;
  return geometry || stretch || insets || markers || flipX ? { geometry, stretch, insets, markers, flipX } : undefined;
}

// ---------------------------------------------------------------- 화면 4: 기본 프로필

/**
 * 기본 프로필 화면.
 *
 * `profile_image_1` 하나만 보여 준다. 예전에는 `profile_image_full_1`을 크게 놓고 아래에
 * `profile_image_1~3`을 늘어놓았는데, 대부분의 템플릿이 2·3을 채우지 않아 같은 그림이
 * 반복되는 줄로만 보였다.
 */
function drawProfileScreen(context: CanvasRenderingContext2D, visual: TemplatePreviewVisual, images: ScreenImages) {
  drawBackground(context, { x: 0, y: 0, width: W, height: H }, 0, visual.mainBackgroundColor, images.mainBackground);

  const centerY = H / 2;
  const heroSize = 112;
  drawAvatar(context, W / 2 - heroSize / 2, centerY - heroSize / 2 - 16, heroSize, images.profiles[0]);

  drawText(context, "내 프로필", W / 2, centerY + heroSize / 2 + 2, { font: previewFont(700, 13), color: visual.titleColor, align: "center" });
  drawText(context, "기본 프로필 사진", W / 2, centerY + heroSize / 2 + 20, { font: previewFont(800, 9), color: visual.descriptionColor, align: "center" });
}

// ---------------------------------------------------------------- 아이콘

type GlyphKind = "search" | "user-plus" | "gift" | "settings" | "plus" | "back" | "menu" | "smile" | "send";

/**
 * 헤더·입력창의 UI 아이콘. 테마와 무관한 고정 요소라 lucide 원본 대신 같은 뜻의 도형을 그린다.
 * 테마가 결정하는 부분(배경·말풍선·탭 아이콘·색)은 실제 에셋을 쓴다.
 */
function drawGlyph(context: CanvasRenderingContext2D, kind: GlyphKind, cx: number, cy: number, size: number, color: string) {
  const r = size / 2;
  context.save();
  context.strokeStyle = color;
  context.fillStyle = color;
  context.lineWidth = 1.4;
  context.lineCap = "round";
  context.lineJoin = "round";
  context.beginPath();

  if (kind === "search") {
    context.arc(cx - r * 0.15, cy - r * 0.15, r * 0.55, 0, Math.PI * 2);
    context.moveTo(cx + r * 0.3, cy + r * 0.3);
    context.lineTo(cx + r * 0.75, cy + r * 0.75);
    context.stroke();
  } else if (kind === "plus") {
    context.moveTo(cx - r * 0.7, cy);
    context.lineTo(cx + r * 0.7, cy);
    context.moveTo(cx, cy - r * 0.7);
    context.lineTo(cx, cy + r * 0.7);
    context.stroke();
  } else if (kind === "user-plus") {
    context.arc(cx - r * 0.2, cy - r * 0.35, r * 0.35, 0, Math.PI * 2);
    context.moveTo(cx - r * 0.75, cy + r * 0.7);
    context.quadraticCurveTo(cx - r * 0.2, cy + r * 0.05, cx + r * 0.35, cy + r * 0.7);
    context.moveTo(cx + r * 0.45, cy - r * 0.4);
    context.lineTo(cx + r * 0.95, cy - r * 0.4);
    context.stroke();
  } else if (kind === "gift") {
    context.rect(cx - r * 0.7, cy - r * 0.35, r * 1.4, r * 1.1);
    context.moveTo(cx, cy - r * 0.35);
    context.lineTo(cx, cy + r * 0.75);
    context.stroke();
  } else if (kind === "settings") {
    context.arc(cx, cy, r * 0.7, 0, Math.PI * 2);
    context.moveTo(cx + r * 0.25, cy);
    context.arc(cx, cy, r * 0.25, 0, Math.PI * 2);
    context.stroke();
  } else if (kind === "back") {
    context.moveTo(cx + r * 0.35, cy - r * 0.6);
    context.lineTo(cx - r * 0.35, cy);
    context.lineTo(cx + r * 0.35, cy + r * 0.6);
    context.stroke();
  } else if (kind === "menu") {
    for (const offset of [-r * 0.5, 0, r * 0.5]) {
      context.moveTo(cx - r * 0.7, cy + offset);
      context.lineTo(cx + r * 0.7, cy + offset);
    }
    context.stroke();
  } else if (kind === "smile") {
    context.arc(cx, cy, r * 0.7, 0, Math.PI * 2);
    context.moveTo(cx - r * 0.3, cy + r * 0.2);
    context.quadraticCurveTo(cx, cy + r * 0.5, cx + r * 0.3, cy + r * 0.2);
    context.stroke();
    context.beginPath();
    context.arc(cx - r * 0.25, cy - r * 0.15, r * 0.1, 0, Math.PI * 2);
    context.arc(cx + r * 0.25, cy - r * 0.15, r * 0.1, 0, Math.PI * 2);
    context.fill();
  } else if (kind === "send") {
    context.moveTo(cx - r * 0.3, cy - r * 0.45);
    context.lineTo(cx + r * 0.5, cy);
    context.lineTo(cx - r * 0.3, cy + r * 0.45);
    context.closePath();
    context.fill();
  }

  context.restore();
}
