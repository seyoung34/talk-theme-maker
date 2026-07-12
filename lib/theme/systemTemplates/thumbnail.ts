import { getResolvedAssetUrl, getResolvedColor, getSelectedUpload } from "@/lib/theme/project/state";
import { loadNinePatchDataUrl } from "@/lib/theme/android/ninepatch";
import { drawBubble, getAutoBubbleSize } from "@/lib/theme/preview/bubbleCanvas";
import type { BubbleEditState } from "@/lib/theme/project/state";
import type { SystemTemplateSaveInput } from "@/lib/theme/systemTemplates/types";
import { getThemeSlots, getThemeTemplate } from "@/lib/theme/templates";
import type { BubbleAsset, BubbleSlot, ThemePlatform, ThemeResourceRole } from "@/lib/theme/types";
import { themeColorToCss } from "@/lib/theme/color";

// 640x600 = 16:15 비율. 갤러리 카드 비주얼(aspect-[16/15])과 일치시켜 object-cover 시
// 크롭/왜곡 없이 그대로 맞아떨어지게 한다.
const width = 640;
const height = 600;

// 갤러리 카드용 정적 요약 이미지. 상세는 모달이 담당하므로 여기서는 텍스트 없이
// 배경·프로필·말풍선·탭 아이콘만 "무드 요약"으로 그린다. 좌표는 canvas 크기 기준 비율로 잡아
// 색·이미지 조합이 달라져도 정렬이 깨지지 않게 한다.
const outerPad = 24;
const columnGap = 16;
const cornerRadius = 24;
// 탭 아이콘은 좌측(메인) 컬럼 하단에, 입력창 캡슐은 우측(채팅) 컬럼 하단에 얹는다.
const tabStripHeight = 52;
const inputBarHeight = 38;

// 정적 썸네일이 담는 탭 아이콘(비포커스 5종). preview.ts의 tabIconRoleByKey와 순서를 맞춘다.
// 재굽기 경로(supabaseRepository)도 같은 목록으로 서명 URL을 주입해야 결과가 일치한다.
export const thumbnailTabIconRoles: ThemeResourceRole[] = [
  "tab_icon_friends",
  "tab_icon_chats",
  "tab_icon_now",
  "tab_icon_shopping",
  "tab_icon_more",
];

// 재생성 시에는 로컬 File이 없으므로 role별 원격(서명) 이미지 URL을 주입해 굽는다.
export async function generateSystemTemplateThumbnail(
  input: Pick<SystemTemplateSaveInput, "baseTemplateId" | "platform" | "overrides">,
  imageUrlByRole?: Partial<Record<ThemeResourceRole, string>>,
): Promise<Blob | null> {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) return null;

  const template = getThemeTemplate(input.baseTemplateId);
  const slots = getThemeSlots(input.platform);
  const colors = input.overrides.colors;
  const selections = input.overrides.candidateSelections;
  const uploads = input.overrides.uploads;
  const color = (role: ThemeResourceRole, fallback: string) => themeColorToCss(getResolvedColor(slots.find((slot) => slot.role === role), colors, selections, input.baseTemplateId, template) ?? fallback);
  // 편집기 ChatroomPreview와 동일한 9-slice edit(stretch/inset/marker)을 말풍선에 적용하기 위해 복원한다.
  const bubbleEdit = (role: ThemeResourceRole): BubbleEditState | undefined => {
    const slot = slots.find((item) => item.role === role);
    if (!slot) return undefined;
    const markers = input.overrides.bubbleEdits.markers[slot.id];
    const insets = input.overrides.bubbleEdits.insets[slot.id];
    const stretch = input.overrides.bubbleEdits.stretch[slot.id];
    return markers || insets || stretch ? { markers, insets, stretch } : undefined;
  };
  const meEdit = bubbleEdit("bubble_me_1");
  const youEdit = bubbleEdit("bubble_you_1");
  const imageRoles: ThemeResourceRole[] = ["main_background", "chat_background", "profile_image_1", ...thumbnailTabIconRoles];
  const bubbleRoles: ThemeResourceRole[] = ["bubble_me_1", "bubble_you_1"];
  const images = new Map<ThemeResourceRole, HTMLImageElement>();
  const bubbleAssets = new Map<ThemeResourceRole, BubbleAsset>();
  const objectUrls: string[] = [];

  const resolveSource = (role: ThemeResourceRole) => {
    const slot = slots.find((item) => item.role === role);
    if (!slot) return { source: undefined, selectedUploadName: undefined };
    const overrideUrl = imageUrlByRole?.[role];
    const selectedUpload = overrideUrl ? undefined : getSelectedUpload(slot, uploads, selections);
    const source = overrideUrl ?? (selectedUpload ? URL.createObjectURL(selectedUpload.file) : getResolvedAssetUrl(slot, uploads, selections, input.baseTemplateId, template));
    if (selectedUpload && source) objectUrls.push(source);
    return { source, selectedUploadName: selectedUpload?.file.name };
  };

  await Promise.all([
    ...imageRoles.map(async (role) => {
      const { source } = resolveSource(role);
      if (!source) return;
      try {
        images.set(role, await loadImage(source));
      } catch {
        // A missing optional image should not block template saving.
      }
    }),
    ...bubbleRoles.map(async (role) => {
      const { source, selectedUploadName } = resolveSource(role);
      if (!source) return;
      const bubbleSlot: BubbleSlot = role === "bubble_me_1" ? "me" : "you";
      const fileName = selectedUploadName ?? source.split("?")[0].split("#")[0];
      try {
        bubbleAssets.set(role, await loadBubbleAsset(source, fileName, bubbleSlot));
      } catch {
        // A missing bubble image falls back to a solid capsule below.
      }
    }),
  ]);

  try {
    // 두 컬럼이 카드(4:3)를 세로로 꽉 채운다. 탭바/입력창은 각 컬럼 내부 하단에 얹는다.
    const contentTop = outerPad;
    const contentHeight = height - outerPad * 2;
    const innerWidth = width - outerPad * 2 - columnGap;
    const leftWidth = Math.round(innerWidth * 0.47);
    const rightWidth = innerWidth - leftWidth;
    const leftX = outerPad;
    const rightX = leftX + leftWidth + columnGap;

    context.fillStyle = "#eef3f2";
    context.fillRect(0, 0, width, height);

    // 좌측(메인 화면): 메인 배경 + 프로필 리스트 + 하단 탭 아이콘
    drawPanel(context, leftX, contentTop, leftWidth, contentHeight, cornerRadius, color("main_background_color", template.defaults.mainBackground), images.get("main_background"));
    drawFriendsColumn(context, leftX, contentTop, leftWidth, contentHeight, images.get("profile_image_1"));
    drawTabBar(context, leftX, contentTop + contentHeight - tabStripHeight, leftWidth, tabStripHeight, color("tab_background", template.defaults.tabBackground), thumbnailTabIconRoles.map((role) => images.get(role)));

    // 우측(채팅방): 채팅 배경 + 말풍선(글자 없이 이미지/색상만) + 하단 입력창 캡슐
    drawPanel(context, rightX, contentTop, rightWidth, contentHeight, cornerRadius, color("chat_background_color", template.defaults.chatBackground), images.get("chat_background"));
    drawChatBubbles(context, rightX, contentTop, rightWidth, contentHeight, {
      platform: input.platform,
      meAsset: bubbleAssets.get("bubble_me_1") ?? null,
      youAsset: bubbleAssets.get("bubble_you_1") ?? null,
      meEdit,
      youEdit,
      myBubbleFill: themeColorToCss(template.defaults.myBubble),
      friendBubbleFill: themeColorToCss(template.defaults.friendBubble),
    });

    return await canvasToBlob(canvas);
  } finally {
    objectUrls.forEach((url) => URL.revokeObjectURL(url));
  }
}

async function loadBubbleAsset(source: string, fileName: string, slot: BubbleSlot) {
  const response = await fetch(source);
  if (!response.ok) throw new Error("Thumbnail bubble image load failed.");
  const dataUrl = await blobToDataUrl(await response.blob());
  const isNinePatch = fileName.toLowerCase().endsWith(".9.png");
  return await loadNinePatchDataUrl(dataUrl, `${slot}-bubble${isNinePatch ? ".9" : ""}.png`, slot);
}

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Thumbnail image load failed."));
    image.src = src;
  });
}

function drawPanel(context: CanvasRenderingContext2D, x: number, y: number, panelWidth: number, panelHeight: number, radius: number, background: string, image?: HTMLImageElement) {
  context.save();
  roundRect(context, x, y, panelWidth, panelHeight, radius);
  context.clip();
  context.fillStyle = background;
  context.fillRect(x, y, panelWidth, panelHeight);
  if (image) drawImageCover(context, image, x, y, panelWidth, panelHeight);
  context.restore();
}

// 좌측 컬럼: 기본 프로필 아바타 + 리스트 자리(회색 바). 텍스트는 그리지 않는다.
function drawFriendsColumn(context: CanvasRenderingContext2D, x: number, y: number, columnWidth: number, columnHeight: number, profileImage?: HTMLImageElement) {
  context.save();
  roundRect(context, x, y, columnWidth, columnHeight, cornerRadius);
  context.clip();

  const padX = Math.round(columnWidth * 0.08);
  const headerHeight = Math.round(columnHeight * 0.1);
  context.fillStyle = "rgba(255,255,255,.85)";
  roundRect(context, x, y, columnWidth, headerHeight, cornerRadius);
  context.fill();

  const lineX = x + padX + Math.round(columnWidth * 0.2) + 14;
  let rowY = y + headerHeight + Math.round(columnHeight * 0.07);

  const bigAvatar = Math.round(columnWidth * 0.2);
  drawAvatar(context, x + padX, rowY, bigAvatar, profileImage);
  drawLine(context, lineX, rowY + Math.round(bigAvatar * 0.28), columnWidth * 0.42, 13);
  drawLine(context, lineX, rowY + Math.round(bigAvatar * 0.62), columnWidth * 0.3, 10);
  rowY += bigAvatar + Math.round(columnHeight * 0.08);

  const smallAvatar = Math.round(columnWidth * 0.16);
  for (const lineWidth of [0.5, 0.42]) {
    drawAvatar(context, x + padX, rowY, smallAvatar);
    drawLine(context, x + padX + smallAvatar + 14, rowY + Math.round((smallAvatar - 12) / 2), columnWidth * lineWidth, 12);
    rowY += smallAvatar + Math.round(columnHeight * 0.06);
  }

  context.restore();
}

// 우측 컬럼: 말풍선 3개(you/me/you) + 하단 입력창 캡슐. 글자 없이 이미지/단색 캡슐만.
function drawChatBubbles(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  columnWidth: number,
  columnHeight: number,
  options: {
    platform: ThemePlatform;
    meAsset: BubbleAsset | null;
    youAsset: BubbleAsset | null;
    meEdit?: BubbleEditState;
    youEdit?: BubbleEditState;
    myBubbleFill: string;
    friendBubbleFill: string;
  },
) {
  const padX = Math.round(columnWidth * 0.06) + 6;
  const padTop = 18;
  const areaX = x + padX;
  const areaWidth = columnWidth - padX * 2;
  const areaY = y + padTop;
  const areaHeight = columnHeight - padTop - inputBarHeight - 14;
  const rows: Array<{ mine: boolean; widthFactor: number }> = [
    { mine: false, widthFactor: 0.74 },
    { mine: true, widthFactor: 0.7 },
    { mine: false, widthFactor: 0.86 },
  ];
  const rowHeight = areaHeight / rows.length;

  rows.forEach((row, index) => {
    // 각 말풍선은 자기 고유 종횡비대로 행 박스 안에 배치된다(잘림 없이 contain).
    const boxWidth = areaWidth * row.widthFactor;
    const boxHeight = rowHeight * 0.84;
    const boxX = row.mine ? areaX + areaWidth - boxWidth : areaX;
    const boxY = areaY + index * rowHeight + (rowHeight - boxHeight) / 2;
    drawThumbnailBubble(context, {
      asset: row.mine ? options.meAsset : options.youAsset,
      edit: row.mine ? options.meEdit : options.youEdit,
      platform: options.platform,
      mine: row.mine,
      x: boxX,
      y: boxY,
      width: boxWidth,
      height: boxHeight,
      fill: row.mine ? options.myBubbleFill : options.friendBubbleFill,
    });
  });

  drawInputBar(context, areaX, y + columnHeight - inputBarHeight - 10, areaWidth, inputBarHeight);
}

// 채팅 컬럼 하단 입력바: 첨부(+) 아이콘 · 입력 필드 · 전송 버튼을 카톡 스타일 고정값으로 그린다.
// 테마와 무관한 정적 UI라 색·치수를 고정한다.
function drawInputBar(context: CanvasRenderingContext2D, x: number, y: number, barWidth: number, barHeight: number) {
  const centerY = y + barHeight / 2;
  const iconColor = "rgba(60,72,74,.5)";

  // 바 배경
  context.fillStyle = "rgba(255,255,255,.94)";
  roundRect(context, x, y, barWidth, barHeight, barHeight / 2);
  context.fill();

  // 좌측 첨부(+) 아이콘
  const plusX = x + 17;
  const plusRadius = 6;
  context.strokeStyle = iconColor;
  context.lineWidth = 2;
  context.lineCap = "round";
  context.beginPath();
  context.moveTo(plusX - plusRadius, centerY);
  context.lineTo(plusX + plusRadius, centerY);
  context.moveTo(plusX, centerY - plusRadius);
  context.lineTo(plusX, centerY + plusRadius);
  context.stroke();

  // 우측 전송 버튼(카톡 옐로 원 + 어두운 삼각형)
  const sendRadius = barHeight * 0.36;
  const sendCenterX = x + barWidth - 11 - sendRadius;
  context.fillStyle = "#fee500";
  context.beginPath();
  context.arc(sendCenterX, centerY, sendRadius, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = "rgba(52,40,0,.82)";
  context.beginPath();
  context.moveTo(sendCenterX - sendRadius * 0.28, centerY - sendRadius * 0.44);
  context.lineTo(sendCenterX + sendRadius * 0.48, centerY);
  context.lineTo(sendCenterX - sendRadius * 0.28, centerY + sendRadius * 0.44);
  context.closePath();
  context.fill();

  // 중앙 입력 필드(연회색 캡슐)
  const fieldLeft = plusX + plusRadius + 12;
  const fieldRight = sendCenterX - sendRadius - 12;
  const fieldHeight = barHeight - 12;
  if (fieldRight > fieldLeft) {
    context.fillStyle = "rgba(60,72,74,.08)";
    roundRect(context, fieldLeft, centerY - fieldHeight / 2, fieldRight - fieldLeft, fieldHeight, fieldHeight / 2);
    context.fill();
  }
}

// 탭바: 좌측(메인) 컬럼 하단에 얹는다. 하단 모서리만 컬럼과 맞춰 둥글게. 아이콘 없으면 폴백 도형.
function drawTabBar(context: CanvasRenderingContext2D, x: number, y: number, barWidth: number, barHeight: number, background: string, icons: Array<HTMLImageElement | undefined>) {
  context.save();
  context.beginPath();
  context.roundRect(x, y, barWidth, barHeight, [0, 0, cornerRadius, cornerRadius]);
  context.clip();
  context.fillStyle = background;
  context.fillRect(x, y, barWidth, barHeight);
  context.fillStyle = "rgba(0,0,0,.06)";
  context.fillRect(x, y, barWidth, 1);
  context.restore();

  const cellWidth = barWidth / icons.length;
  const iconSize = Math.min(barHeight * 0.5, cellWidth * 0.52);
  icons.forEach((icon, index) => {
    const centerX = x + cellWidth * index + cellWidth / 2;
    const centerY = y + barHeight / 2;
    const iconX = centerX - iconSize / 2;
    const iconY = centerY - iconSize / 2;
    if (icon) {
      drawImageContain(context, icon, iconX, iconY, iconSize, iconSize);
    } else {
      context.fillStyle = index === 0 ? "#284f55" : "#9aabaa";
      roundRect(context, iconX, iconY, iconSize, iconSize, iconSize * 0.32);
      context.fill();
    }
  });
}

function drawImageCover(context: CanvasRenderingContext2D, image: HTMLImageElement, x: number, y: number, targetWidth: number, targetHeight: number) {
  const scale = Math.max(targetWidth / image.naturalWidth, targetHeight / image.naturalHeight);
  const drawWidth = image.naturalWidth * scale;
  const drawHeight = image.naturalHeight * scale;
  context.drawImage(image, x + (targetWidth - drawWidth) / 2, y + (targetHeight - drawHeight) / 2, drawWidth, drawHeight);
}

function drawImageContain(context: CanvasRenderingContext2D, image: HTMLImageElement, x: number, y: number, targetWidth: number, targetHeight: number) {
  if (!image.naturalWidth || !image.naturalHeight) return;
  const scale = Math.min(targetWidth / image.naturalWidth, targetHeight / image.naturalHeight);
  const drawWidth = image.naturalWidth * scale;
  const drawHeight = image.naturalHeight * scale;
  context.drawImage(image, x + (targetWidth - drawWidth) / 2, y + (targetHeight - drawHeight) / 2, drawWidth, drawHeight);
}

function drawAvatar(context: CanvasRenderingContext2D, x: number, y: number, size: number, image?: HTMLImageElement) {
  context.save();
  context.beginPath();
  context.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
  context.clip();
  context.fillStyle = "#d7e7e5";
  context.fillRect(x, y, size, size);
  if (image) drawImageCover(context, image, x, y, size, size);
  context.restore();
}

function drawLine(context: CanvasRenderingContext2D, x: number, y: number, lineWidth: number, lineHeight: number) {
  context.fillStyle = "rgba(31,52,55,.22)";
  roundRect(context, x, y, lineWidth, lineHeight, lineHeight / 2);
  context.fill();
}

// 편집기 ChatroomPreview(BubbleCanvasPreview)와 동일한 방식으로 말풍선을 굽는다:
// getAutoBubbleSize로 이미지 고유 종횡비 크기를 구해 9-slice로 렌더한 뒤,
// 그 결과를 행 박스 안에 종횡비 유지(contain, 세로 중앙)로 배치한다.
// → 다양한 형태/비율의 말풍선을 잘림 없이 일반적으로 처리하고, 편집기와 픽셀 단위로 일치한다.
// 말풍선 이미지가 없으면(로드 실패) 단색 캡슐로 폴백한다.
function drawThumbnailBubble(
  context: CanvasRenderingContext2D,
  options: {
    asset: BubbleAsset | null;
    edit?: BubbleEditState;
    platform: ThemePlatform;
    mine: boolean;
    x: number;
    y: number;
    width: number;
    height: number;
    fill: string;
  },
) {
  const asset = options.asset && options.edit?.markers ? { ...options.asset, markers: options.edit.markers } : options.asset;
  if (asset) {
    const offscreen = document.createElement("canvas");
    const offContext = offscreen.getContext("2d");
    if (offContext) {
      // 편집기와 동일하게 이미지 고유 크기로 9-slice 렌더(빈 텍스트 → 최소=고유 크기).
      const intrinsic = getAutoBubbleSize(offContext, asset, options.platform, options.edit, "");
      offscreen.width = intrinsic.width;
      offscreen.height = intrinsic.height;
      drawBubble(offContext, { asset, edit: options.edit, platform: options.platform, x: 0, y: 0, width: intrinsic.width, height: intrinsic.height, text: "", fill: options.fill, textColor: "rgba(0,0,0,0)" });

      // 행 박스 안에 종횡비 유지 배치(잘림 없이 contain).
      const scale = Math.min(options.width / intrinsic.width, options.height / intrinsic.height);
      const drawWidth = intrinsic.width * scale;
      const drawHeight = intrinsic.height * scale;
      const drawX = options.mine ? options.x + options.width - drawWidth : options.x;
      const drawY = options.y + (options.height - drawHeight) / 2;
      context.drawImage(offscreen, drawX, drawY, drawWidth, drawHeight);
      return;
    }
  }

  context.fillStyle = options.fill;
  roundRect(context, options.x, options.y, options.width, options.height, Math.min(options.height / 2, 18));
  context.fill();
}

function roundRect(context: CanvasRenderingContext2D, x: number, y: number, rectWidth: number, rectHeight: number, radius: number) {
  const safeRadius = Math.min(radius, rectWidth / 2, rectHeight / 2);
  context.beginPath();
  context.roundRect(x, y, rectWidth, rectHeight, safeRadius);
}

function canvasToBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.8));
}
