/**
 * 미리보기 이미지를 굽는 데 쓰는 canvas 프리미티브.
 *
 * 갤러리 카드 썸네일(`thumbnail.ts`)과 모달 4화면(`screenPreview.ts`)이 같은 도형을 그린다.
 * 한쪽에만 고치면 카드와 모달이 서로 다른 테마를 보여 주므로 여기 모아 둔다.
 *
 * 브라우저 전용이다. 굽는 주체는 관리자 브라우저이고, 서버에서는 부르지 않는다.
 */

/** 한글이 있는 스택. 굽는 곳이 Windows 관리자 브라우저라 맑은 고딕까지 폴백한다. */
export const previewFontStack = '"Noto Sans KR", "Malgun Gothic", "Apple SD Gothic Neo", system-ui, sans-serif';

export function previewFont(weight: number, size: number) {
  return `${weight} ${size}px ${previewFontStack}`;
}

export function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    // 서명 URL이어도 캔버스가 오염되지 않게 한다. 오염되면 toBlob이 던진다.
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Preview image load failed."));
    image.src = src;
  });
}

/** 실패를 흡수해 부분적으로라도 그린다. 이미지 하나 때문에 화면 전체를 잃지 않는다. */
export async function loadImageOrNull(src: string | undefined) {
  if (!src) return null;
  try {
    return await loadImage(src);
  } catch {
    return null;
  }
}

export function roundRect(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  const safeRadius = Math.max(0, Math.min(radius, width / 2, height / 2));
  context.beginPath();
  context.roundRect(x, y, width, height, safeRadius);
}

export function fillRoundRect(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number, fill: string) {
  context.fillStyle = fill;
  roundRect(context, x, y, width, height, radius);
  context.fill();
}

export function drawImageCover(context: CanvasRenderingContext2D, image: HTMLImageElement, x: number, y: number, width: number, height: number) {
  const natural = { width: image.naturalWidth || image.width, height: image.naturalHeight || image.height };
  if (!natural.width || !natural.height) return;
  const scale = Math.max(width / natural.width, height / natural.height);
  const drawWidth = natural.width * scale;
  const drawHeight = natural.height * scale;
  context.drawImage(image, x + (width - drawWidth) / 2, y + (height - drawHeight) / 2, drawWidth, drawHeight);
}

export function drawImageContain(context: CanvasRenderingContext2D, image: HTMLImageElement, x: number, y: number, width: number, height: number) {
  const natural = { width: image.naturalWidth || image.width, height: image.naturalHeight || image.height };
  if (!natural.width || !natural.height) return;
  const scale = Math.min(width / natural.width, height / natural.height);
  const drawWidth = natural.width * scale;
  const drawHeight = natural.height * scale;
  context.drawImage(image, x + (width - drawWidth) / 2, y + (height - drawHeight) / 2, drawWidth, drawHeight);
}

/** 배경 색 위에 배경 이미지를 cover로 얹는다. 둥근 모서리 안쪽으로 자른다. */
export function drawBackground(
  context: CanvasRenderingContext2D,
  bounds: { x: number; y: number; width: number; height: number },
  radius: number,
  color: string,
  image?: HTMLImageElement | null,
) {
  context.save();
  roundRect(context, bounds.x, bounds.y, bounds.width, bounds.height, radius);
  context.clip();
  context.fillStyle = color;
  context.fillRect(bounds.x, bounds.y, bounds.width, bounds.height);
  if (image) drawImageCover(context, image, bounds.x, bounds.y, bounds.width, bounds.height);
  context.restore();
}

/** 원형으로 자른 프로필. 이미지가 없으면 자리만 채운다. */
export function drawAvatar(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  image?: HTMLImageElement | null,
  placeholder = "#d7e7e5",
) {
  context.save();
  context.beginPath();
  context.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
  context.clip();
  context.fillStyle = placeholder;
  context.fillRect(x, y, size, size);
  if (image) drawImageCover(context, image, x, y, size, size);
  context.restore();
}

/**
 * 한 줄 안에 들어가도록 잘라 낸 문자열.
 *
 * DOM의 `truncate`(`text-overflow: ellipsis`)에 해당한다. canvas에는 대응하는 기능이 없어
 * 직접 잰다. 자를 곳을 이진 탐색하지 않고 뒤에서 한 글자씩 줄인다 — 미리보기 텍스트는 짧다.
 */
export function truncateText(context: CanvasRenderingContext2D, text: string, maxWidth: number) {
  if (context.measureText(text).width <= maxWidth) return text;
  const ellipsis = "…";
  let value = text;
  while (value.length > 1 && context.measureText(value + ellipsis).width > maxWidth) {
    value = value.slice(0, -1);
  }
  return value + ellipsis;
}

export type TextOptions = {
  font: string;
  color: string;
  maxWidth?: number;
  align?: CanvasTextAlign;
  baseline?: CanvasTextBaseline;
};

/** 기준선을 명시해 DOM의 줄 높이 계산과 어긋나지 않게 한다. */
export function drawText(context: CanvasRenderingContext2D, text: string, x: number, y: number, options: TextOptions) {
  context.save();
  context.font = options.font;
  context.fillStyle = options.color;
  context.textAlign = options.align ?? "left";
  context.textBaseline = options.baseline ?? "middle";
  context.fillText(options.maxWidth ? truncateText(context, text, options.maxWidth) : text, x, y);
  context.restore();
}

export function canvasToWebpBlob(canvas: HTMLCanvasElement, quality = 0.82) {
  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", quality));
}

/**
 * 논리 좌표계로 그리는 canvas를 만든다.
 *
 * 크기는 `width × height`(논리 px)이고 실제 픽셀은 `deviceScale`배다. 화면 미리보기는 최대
 * 540px 높이로 표시되므로 1배로 구우면 큰 화면에서 흐려진다. 그리는 코드는 배율을 몰라도 되게
 * `scale()`을 미리 걸어 둔다.
 */
export function createPreviewCanvas(width: number, height: number, deviceScale: number) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * deviceScale);
  canvas.height = Math.round(height * deviceScale);
  const context = canvas.getContext("2d");
  if (!context) return null;
  context.scale(deviceScale, deviceScale);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  return { canvas, context };
}
