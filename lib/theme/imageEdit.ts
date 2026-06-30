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

export async function renderEditedImageFile(source: File, state: ImageEditState, outputName?: string, target?: ImageEditTarget) {
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
  const fittedScale = getFitBaseScale(state.fitMode, bitmap.width, bitmap.height, canvas.width, canvas.height);
  const scale = fittedScale * clampImageScale(state.scale);
  const drawWidth = bitmap.width * scale;
  const drawHeight = bitmap.height * scale;
  const drawX = (canvas.width - drawWidth) / 2 + state.offsetX;
  const drawY = (canvas.height - drawHeight) / 2 + state.offsetY;

  context.save();
  if (state.flipX) {
    context.translate(canvas.width, 0);
    context.scale(-1, 1);
    context.drawImage(bitmap, canvas.width - drawX - drawWidth, drawY, drawWidth, drawHeight);
  } else {
    context.drawImage(bitmap, drawX, drawY, drawWidth, drawHeight);
  }
  context.restore();
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
