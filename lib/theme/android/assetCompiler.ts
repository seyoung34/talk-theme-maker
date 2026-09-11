import type { AndroidRasterPlan } from "@/lib/theme/android/rasterPlan";

// 크기·역할 규칙은 브라우저 전용 코드와 한 파일에 둘 수 없다. Cloud Run 빌더가 같은 규칙을
// 써야 하는데, 이 파일은 DOM API를 쓰고 `@/` 별칭으로 `templates.ts`를 끌어온다. 빌더의
// NodeNext 컴파일은 그 별칭을 해석하지 못해 깨진다. 순수 규칙은 `rasterPlan.ts`에 두고
// 여기서는 브라우저 렌더링만 맡는다. 기존 import 경로를 유지하려고 재노출한다.
export {
  getAndroidRasterPlan,
  isAndroidDerivedLauncherRole,
  readAndroidDensity,
  type AndroidRasterPlan,
  type AndroidRasterPlanSlot,
} from "@/lib/theme/android/rasterPlan";

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
