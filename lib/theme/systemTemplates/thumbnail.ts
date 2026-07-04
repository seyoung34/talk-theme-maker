import { getResolvedAssetUrl, getResolvedColor, getSelectedUpload } from "@/lib/theme/project/state";
import type { SystemTemplateSaveInput } from "@/lib/theme/systemTemplates/types";
import { getThemeSlots, getThemeTemplate } from "@/lib/theme/templates";
import type { StretchPoint, ThemeResourceRole } from "@/lib/theme/types";
import { themeColorToCss } from "@/lib/theme/color";

const width = 640;
const height = 480;

export async function generateSystemTemplateThumbnail(input: SystemTemplateSaveInput): Promise<Blob | null> {
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
  // 말풍선 슬롯의 stretch(cap-inset)를 꺼내 9-slice로 그린다. 없으면 비율 유지(contain)로 폴백.
  const bubbleStretch = (role: ThemeResourceRole): StretchPoint | undefined => {
    const slot = slots.find((item) => item.role === role);
    return slot ? input.overrides.bubbleEdits.stretch[slot.id] : undefined;
  };
  const meStretch = bubbleStretch("bubble_me_1");
  const youStretch = bubbleStretch("bubble_you_1");
  const imageRoles: ThemeResourceRole[] = ["main_background", "chat_background", "bubble_me_1", "bubble_you_1", "profile_image_1"];
  const images = new Map<ThemeResourceRole, HTMLImageElement>();
  const objectUrls: string[] = [];

  await Promise.all(
    imageRoles.map(async (role) => {
      const slot = slots.find((item) => item.role === role);
      if (!slot) return;
      const selectedUpload = getSelectedUpload(slot, uploads, selections);
      const source = selectedUpload ? URL.createObjectURL(selectedUpload.file) : getResolvedAssetUrl(slot, uploads, selections, input.baseTemplateId, template);
      if (!source) return;
      if (selectedUpload) objectUrls.push(source);
      try {
        images.set(role, await loadImage(source));
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

    drawBubble(context, 345, 105, 170, 58, false, color("chat_bubble_you_color", template.defaults.friendBubble), images.get("bubble_you_1"), youStretch);
    drawBubble(context, 420, 190, 166, 62, true, color("chat_bubble_me_color", template.defaults.myBubble), images.get("bubble_me_1"), meStretch);
    drawBubble(context, 345, 278, 205, 58, false, color("chat_bubble_you_color", template.defaults.friendBubble), images.get("bubble_you_1"), youStretch);
    context.fillStyle = "rgba(255,255,255,.9)";
    roundRect(context, 340, 380, 252, 48, 24);
    context.fill();

    return await canvasToBlob(canvas);
  } finally {
    objectUrls.forEach((url) => URL.revokeObjectURL(url));
  }
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

function drawBubble(context: CanvasRenderingContext2D, x: number, y: number, bubbleWidth: number, bubbleHeight: number, mine: boolean, color: string, image?: HTMLImageElement, stretch?: StretchPoint) {
  if (image) {
    // 말풍선 이미지는 9-slice로 그려 안쪽만 늘리고 캐릭터/테두리는 원본 비율 유지.
    drawImageNineSlice(context, image, x, y, bubbleWidth, bubbleHeight, stretch);
  } else {
    context.save();
    roundRect(context, x, y, bubbleWidth, bubbleHeight, 21);
    context.clip();
    context.fillStyle = color;
    context.fillRect(x, y, bubbleWidth, bubbleHeight);
    context.restore();
    context.fillStyle = mine ? "rgba(33,48,52,.4)" : "rgba(33,48,52,.32)";
    roundRect(context, x + 20, y + 21, bubbleWidth * 0.58, 10, 5);
    context.fill();
  }
}

// stretch(cap-inset)가 유효하면 9-slice로, 아니면 비율 유지(contain)로 그린다.
function drawImageNineSlice(context: CanvasRenderingContext2D, image: HTMLImageElement, x: number, y: number, w: number, h: number, stretch?: StretchPoint) {
  const sourceWidth = image.naturalWidth;
  const sourceHeight = image.naturalHeight;
  const stretchX = stretch?.x ?? 0;
  const stretchY = stretch?.y ?? 0;
  const hasValidStretch = stretchX > 1 && stretchY > 1 && stretchX < sourceWidth - 1 && stretchY < sourceHeight - 1;
  if (!hasValidStretch) {
    drawImageContain(context, image, x, y, w, h);
    return;
  }

  // 원본 cap 크기(px). 소스가 고해상(@3x)이라 dest 박스에 맞게 축소한다.
  const capLeft = stretchX;
  const capRight = sourceWidth - stretchX - 1;
  const capTop = stretchY;
  const capBottom = sourceHeight - stretchY - 1;
  const scaleX = Math.min(1, w / (capLeft + capRight));
  const scaleY = Math.min(1, h / (capTop + capBottom));
  const destLeft = capLeft * scaleX;
  const destRight = capRight * scaleX;
  const destTop = capTop * scaleY;
  const destBottom = capBottom * scaleY;
  const destMidWidth = Math.max(0, w - destLeft - destRight);
  const destMidHeight = Math.max(0, h - destTop - destBottom);

  const cols = [
    { sx: 0, sw: capLeft, dx: x, dw: destLeft },
    { sx: stretchX, sw: 1, dx: x + destLeft, dw: destMidWidth },
    { sx: stretchX + 1, sw: capRight, dx: x + destLeft + destMidWidth, dw: destRight },
  ];
  const rows = [
    { sy: 0, sh: capTop, dy: y, dh: destTop },
    { sy: stretchY, sh: 1, dy: y + destTop, dh: destMidHeight },
    { sy: stretchY + 1, sh: capBottom, dy: y + destTop + destMidHeight, dh: destBottom },
  ];
  for (const row of rows) {
    for (const col of cols) {
      if (col.dw <= 0 || row.dh <= 0 || col.sw <= 0 || row.sh <= 0) continue;
      context.drawImage(image, col.sx, row.sy, col.sw, row.sh, col.dx, row.dy, col.dw, row.dh);
    }
  }
}

function drawImageContain(context: CanvasRenderingContext2D, image: HTMLImageElement, x: number, y: number, w: number, h: number) {
  const scale = Math.min(w / image.naturalWidth, h / image.naturalHeight);
  const drawWidth = image.naturalWidth * scale;
  const drawHeight = image.naturalHeight * scale;
  context.drawImage(image, x + (w - drawWidth) / 2, y + (h - drawHeight) / 2, drawWidth, drawHeight);
}

function roundRect(context: CanvasRenderingContext2D, x: number, y: number, rectWidth: number, rectHeight: number, radius: number) {
  const safeRadius = Math.min(radius, rectWidth / 2, rectHeight / 2);
  context.beginPath();
  context.roundRect(x, y, rectWidth, rectHeight, safeRadius);
}

function canvasToBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.8));
}
