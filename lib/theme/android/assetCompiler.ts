import type { ThemeAssetSlot } from "@/lib/theme/templates";
import type { ThemeResourceRole } from "@/lib/theme/types";

export type AndroidRasterPlan = {
  width: number;
  height: number;
  mode: "cover" | "transparent";
};

const adaptiveIconSizes = {
  mdpi: 108,
  hdpi: 162,
  xhdpi: 216,
  xxhdpi: 324,
  xxxhdpi: 432,
} as const;

const legacyIconSizes = {
  mdpi: 48,
  hdpi: 72,
  xhdpi: 96,
  xxhdpi: 144,
  xxxhdpi: 192,
} as const;

const derivedLauncherRoles = new Set<ThemeResourceRole>([
  "theme_icon",
  "launcher_icon",
  "launcher_round",
  "launcher_foreground",
]);

export function isAndroidDerivedLauncherRole(role: ThemeResourceRole) {
  return derivedLauncherRoles.has(role);
}

export function getAndroidRasterPlan(slot: Pick<ThemeAssetSlot, "role">, targetPath: string, transparentForeground = false): AndroidRasterPlan | undefined {
  const density = readAndroidDensity(targetPath);

  if (slot.role === "theme_icon") return { width: 144, height: 144, mode: "cover" };
  if (slot.role === "launcher_background") {
    const size = density ? adaptiveIconSizes[density] : 432;
    return { width: size, height: size, mode: "cover" };
  }
  if (slot.role === "launcher_icon" || slot.role === "launcher_round") {
    const size = density ? legacyIconSizes[density] : 192;
    return { width: size, height: size, mode: "cover" };
  }
  if (slot.role === "launcher_foreground") {
    const size = density ? adaptiveIconSizes[density] : 432;
    return { width: size, height: size, mode: transparentForeground ? "transparent" : "cover" };
  }
  if (slot.role === "splash") {
    const size = targetPath.includes("drawable-xhdpi/") ? { width: 720, height: 1280 } : { width: 1440, height: 2560 };
    return { ...size, mode: "cover" };
  }
  if (slot.role === "splash_landscape") {
    const size = targetPath.includes("drawable-land-xhdpi/") ? { width: 1280, height: 720 } : { width: 2560, height: 1440 };
    return { ...size, mode: "cover" };
  }
  return undefined;
}

export function readAndroidDensity(targetPath: string): keyof typeof adaptiveIconSizes | undefined {
  const match = targetPath.match(/(?:mipmap|drawable)(?:-land)?-(mdpi|hdpi|xhdpi|xxhdpi|xxxhdpi)(?:\/|$)/);
  return match?.[1] as keyof typeof adaptiveIconSizes | undefined;
}

export async function renderAndroidImageBlob(source: Blob | undefined, plan: AndroidRasterPlan) {
  if (typeof document === "undefined" || typeof Image === "undefined") {
    throw new Error("Android 이미지 파생 출력은 브라우저에서 생성해야 합니다.");
  }

  const canvas = document.createElement("canvas");
  canvas.width = plan.width;
  canvas.height = plan.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Android 이미지 파생 출력용 canvas를 만들지 못했습니다.");
  context.clearRect(0, 0, plan.width, plan.height);

  if (plan.mode === "cover") {
    if (!source) throw new Error("Android 이미지 파생 출력의 원본을 찾지 못했습니다.");
    const image = await loadImage(source);
    const sourceWidth = image.naturalWidth || image.width;
    const sourceHeight = image.naturalHeight || image.height;
    if (!sourceWidth || !sourceHeight) throw new Error("Android 이미지 원본 크기를 확인하지 못했습니다.");
    const scale = Math.max(plan.width / sourceWidth, plan.height / sourceHeight);
    const drawWidth = sourceWidth * scale;
    const drawHeight = sourceHeight * scale;
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(image, (plan.width - drawWidth) / 2, (plan.height - drawHeight) / 2, drawWidth, drawHeight);
  }

  return canvasToPngBlob(canvas);
}

function loadImage(source: Blob) {
  const url = URL.createObjectURL(source);
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Android 이미지 원본을 읽지 못했습니다."));
    };
    image.src = url;
  });
}

function canvasToPngBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Android 이미지를 PNG로 변환하지 못했습니다."));
    }, "image/png");
  });
}
