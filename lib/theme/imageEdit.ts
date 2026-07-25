export type ImageFitMode = "cover" | "contain" | "original";

export type ImageEditState = {
  version: 1;
  flipX: boolean;
  scale: number;
  offsetX: number;
  offsetY: number;
  fitMode: ImageFitMode;
};

export type ImageEditMetadata = {
  originalName: string;
  originalSize: number;
  originalFile?: File;
  editedAt: number;
  state: ImageEditState;
  target?: ImageEditTarget;
};

export type ImageEditTarget = {
  width: number;
  height: number;
  label?: string;
};

export type ImageEditRenderOptions = {
  preserveNinePatchBorder?: boolean;
};

export const defaultImageEditState: ImageEditState = {
  version: 1,
  flipX: false,
  scale: 1,
  offsetX: 0,
  offsetY: 0,
  fitMode: "contain",
};

export function clampImageScale(value: number) {
  if (!Number.isFinite(value)) return 1;
  return Math.min(3, Math.max(0.25, value));
}

export async function renderEditedImageFile(source: File, state: ImageEditState, outputName?: string, target?: ImageEditTarget, options?: ImageEditRenderOptions) {
  const bitmap = await createImageBitmap(source);
  const canvas = document.createElement("canvas");
  canvas.width = getSafeTargetDimension(target?.width) ?? bitmap.width;
  canvas.height = getSafeTargetDimension(target?.height) ?? bitmap.height;

  const context = canvas.getContext("2d");
  if (!context) {
    bitmap.close();
    throw new Error("이미지 편집 캔버스를 준비하지 못했습니다.");
  }

  context.clearRect(0, 0, canvas.width, canvas.height);
  const preserveNinePatchBorder = Boolean(options?.preserveNinePatchBorder && bitmap.width === canvas.width && bitmap.height === canvas.height && bitmap.width >= 3 && bitmap.height >= 3);
  if (preserveNinePatchBorder) {
    drawEditedBitmap(context, bitmap, state, { sourceX: 1, sourceY: 1, sourceWidth: bitmap.width - 2, sourceHeight: bitmap.height - 2, outputX: 1, outputY: 1, outputWidth: canvas.width - 2, outputHeight: canvas.height - 2 });
    drawNinePatchBorder(context, bitmap, state.flipX);
  } else {
    drawEditedBitmap(context, bitmap, state, { sourceX: 0, sourceY: 0, sourceWidth: bitmap.width, sourceHeight: bitmap.height, outputX: 0, outputY: 0, outputWidth: canvas.width, outputHeight: canvas.height });
  }
  bitmap.close();

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((nextBlob) => {
      if (nextBlob) {
        resolve(nextBlob);
      } else {
        reject(new Error("편집된 이미지를 생성하지 못했습니다."));
      }
    }, getOutputMimeType(source.type));
  });

  return new File([blob], outputName ?? buildEditedImageName(source.name), { type: blob.type || source.type || "image/png" });
}

function drawEditedBitmap(
  context: CanvasRenderingContext2D,
  bitmap: ImageBitmap,
  state: ImageEditState,
  frame: { sourceX: number; sourceY: number; sourceWidth: number; sourceHeight: number; outputX: number; outputY: number; outputWidth: number; outputHeight: number },
) {
  const fittedScale = getFitBaseScale(state.fitMode, frame.sourceWidth, frame.sourceHeight, frame.outputWidth, frame.outputHeight);
  const scale = fittedScale * clampImageScale(state.scale);
  const drawWidth = frame.sourceWidth * scale;
  const drawHeight = frame.sourceHeight * scale;
  const drawX = frame.outputX + (frame.outputWidth - drawWidth) / 2 + state.offsetX;
  const drawY = frame.outputY + (frame.outputHeight - drawHeight) / 2 + state.offsetY;

  context.save();
  context.beginPath();
  context.rect(frame.outputX, frame.outputY, frame.outputWidth, frame.outputHeight);
  context.clip();
  if (state.flipX) {
    context.translate(frame.outputX * 2 + frame.outputWidth, 0);
    context.scale(-1, 1);
    context.drawImage(bitmap, frame.sourceX, frame.sourceY, frame.sourceWidth, frame.sourceHeight, frame.outputX * 2 + frame.outputWidth - drawX - drawWidth, drawY, drawWidth, drawHeight);
  } else {
    context.drawImage(bitmap, frame.sourceX, frame.sourceY, frame.sourceWidth, frame.sourceHeight, drawX, drawY, drawWidth, drawHeight);
  }
  context.restore();
}

function drawNinePatchBorder(context: CanvasRenderingContext2D, bitmap: ImageBitmap, flipX: boolean) {
  context.save();
  if (flipX) {
    context.translate(bitmap.width, 0);
    context.scale(-1, 1);
  }
  context.drawImage(bitmap, 0, 0, bitmap.width, 1, 0, 0, bitmap.width, 1);
  context.drawImage(bitmap, 0, bitmap.height - 1, bitmap.width, 1, 0, bitmap.height - 1, bitmap.width, 1);
  context.drawImage(bitmap, 0, 1, 1, bitmap.height - 2, 0, 1, 1, bitmap.height - 2);
  context.drawImage(bitmap, bitmap.width - 1, 1, 1, bitmap.height - 2, bitmap.width - 1, 1, 1, bitmap.height - 2);
  context.restore();
}

function getFitBaseScale(mode: ImageFitMode, sourceWidth: number, sourceHeight: number, targetWidth: number, targetHeight: number) {
  if (mode === "original") return 1;
  const widthRatio = targetWidth / sourceWidth;
  const heightRatio = targetHeight / sourceHeight;
  return mode === "cover" ? Math.max(widthRatio, heightRatio) : Math.min(widthRatio, heightRatio);
}

function getSafeTargetDimension(value: number | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  const rounded = Math.round(value);
  if (rounded < 1) return undefined;
  return Math.min(8192, rounded);
}

function getOutputMimeType(mimeType: string) {
  if (mimeType === "image/jpeg" || mimeType === "image/webp") return mimeType;
  return "image/png";
}

function buildEditedImageName(name: string) {
  const dotIndex = name.lastIndexOf(".");
  if (dotIndex <= 0) return `${name}-edited.png`;
  return `${name.slice(0, dotIndex)}-edited${name.slice(dotIndex)}`;
}
