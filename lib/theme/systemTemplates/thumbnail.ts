import { getResolvedAssetUrl, getResolvedColor, getSelectedUpload } from "@/lib/theme/project/state";
import { loadNinePatchDataUrl } from "@/lib/theme/android/ninepatch";
import { drawBubble as drawPreviewBubble } from "@/lib/theme/preview/bubbleCanvas";
import type { BubbleEditState } from "@/lib/theme/project/state";
import type { SystemTemplateSaveInput } from "@/lib/theme/systemTemplates/types";
import { getThemeSlots, getThemeTemplate } from "@/lib/theme/templates";
import type { BubbleAsset, BubbleSlot, ThemeResourceRole } from "@/lib/theme/types";
import { themeColorToCss } from "@/lib/theme/color";

const width = 640;
const height = 480;

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
  const imageRoles: ThemeResourceRole[] = ["main_background", "chat_background", "bubble_me_1", "bubble_you_1", "profile_image_1"];
  const images = new Map<ThemeResourceRole, HTMLImageElement>();
  const bubbleAssets = new Map<ThemeResourceRole, BubbleAsset>();
  const objectUrls: string[] = [];

  await Promise.all(
    imageRoles.map(async (role) => {
      const slot = slots.find((item) => item.role === role);
      if (!slot) return;
      const overrideUrl = imageUrlByRole?.[role];
      const selectedUpload = overrideUrl ? undefined : getSelectedUpload(slot, uploads, selections);
      const source = overrideUrl ?? (selectedUpload ? URL.createObjectURL(selectedUpload.file) : getResolvedAssetUrl(slot, uploads, selections, input.baseTemplateId, template));
      if (!source) return;
      if (selectedUpload) objectUrls.push(source);
      try {
        if (role === "bubble_me_1" || role === "bubble_you_1") {
          const bubbleSlot: BubbleSlot = role === "bubble_me_1" ? "me" : "you";
          const fileName = selectedUpload?.file.name ?? source.split("?")[0].split("#")[0];
          bubbleAssets.set(role, await loadBubbleAsset(source, fileName, bubbleSlot));
        } else {
          images.set(role, await loadImage(source));
        }
      } catch {
        // A missing optional image should not block template saving.
      }
    }),
  );

  try {
    context.fillStyle = "#eef3f2";
    context.fillRect(0, 0, width, height);
    drawPanel(context, 24, 24, 276, 432, 30, color("main_background_color", template.defaults.mainBackground), images.get("main_background"));
    drawPanel(context, 316, 24, 300, 432, 30, color("chat_background_color", template.defaults.chatBackground), images.get("chat_background"));

    context.fillStyle = "rgba(255,255,255,.88)";
    roundRect(context, 24, 24, 276, 70, 30);
    context.fill();
    context.fillStyle = "#1f3437";
    context.font = "700 25px sans-serif";
    context.fillText("친구", 52, 67);
    drawAvatar(context, 52, 130, 54, images.get("profile_image_1"));
    drawLine(context, 126, 139, 114, 13);
    drawLine(context, 126, 166, 88, 10);
    drawAvatar(context, 52, 218, 42);
    drawLine(context, 112, 224, 130, 12);
    drawAvatar(context, 52, 286, 42);
    drawLine(context, 112, 292, 98, 12);

    context.fillStyle = "rgba(255,255,255,.9)";
    context.fillRect(24, 385, 276, 71);
    for (let index = 0; index < 5; index += 1) {
      context.fillStyle = index === 1 ? "#284f55" : "#9aabaa";
      context.beginPath();
      context.arc(57 + index * 52, 416, 9, 0, Math.PI * 2);
      context.fill();
    }

    drawThumbnailBubble(context, {
      asset: bubbleAssets.get("bubble_you_1") ?? null,
      edit: youEdit,
      platform: input.platform,
      x: 345,
      y: 105,
      width: 170,
      height: 58,
      text: "안녕",
      fill: themeColorToCss(template.defaults.friendBubble),
      textColor: color("chat_bubble_you_color", template.defaults.mainTitle),
    });
    drawThumbnailBubble(context, {
      asset: bubbleAssets.get("bubble_me_1") ?? null,
      edit: meEdit,
      platform: input.platform,
      x: 420,
      y: 190,
      width: 166,
      height: 62,
      text: "좋아!",
      fill: themeColorToCss(template.defaults.myBubble),
      textColor: color("chat_bubble_me_color", template.defaults.mainTitle),
    });
    drawThumbnailBubble(context, {
      asset: bubbleAssets.get("bubble_you_1") ?? null,
      edit: youEdit,
      platform: input.platform,
      x: 345,
      y: 278,
      width: 205,
      height: 58,
      text: "테마 미리보기",
      fill: themeColorToCss(template.defaults.friendBubble),
      textColor: color("chat_bubble_you_color", template.defaults.mainTitle),
    });
    context.fillStyle = "rgba(255,255,255,.9)";
    roundRect(context, 340, 380, 252, 48, 24);
    context.fill();

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

function drawImageCover(context: CanvasRenderingContext2D, image: HTMLImageElement, x: number, y: number, targetWidth: number, targetHeight: number) {
  const scale = Math.max(targetWidth / image.naturalWidth, targetHeight / image.naturalHeight);
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

function drawThumbnailBubble(
  context: CanvasRenderingContext2D,
  options: {
    asset: BubbleAsset | null;
    edit?: BubbleEditState;
    platform: SystemTemplateSaveInput["platform"];
    x: number;
    y: number;
    width: number;
    height: number;
    text: string;
    fill: string;
    textColor: string;
  },
) {
  const asset = options.asset && options.edit?.markers
    ? { ...options.asset, markers: options.edit.markers }
    : options.asset;
  drawPreviewBubble(context, { ...options, asset });
}

function roundRect(context: CanvasRenderingContext2D, x: number, y: number, rectWidth: number, rectHeight: number, radius: number) {
  const safeRadius = Math.min(radius, rectWidth / 2, rectHeight / 2);
  context.beginPath();
  context.roundRect(x, y, rectWidth, rectHeight, safeRadius);
}

function canvasToBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.8));
}
