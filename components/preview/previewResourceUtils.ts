import type { ThemeProjectAnalysis, ThemeProjectFile } from "@/lib/theme/project/types";
import type { ThemeResourceRole } from "@/lib/theme/types";

export function findResourceIdByPath(analysis: ThemeProjectAnalysis, path?: string) {
  if (!path) return undefined;
  return analysis.resources.find((resource) => resource.filePath === path)?.id;
}

export function findBestFile(analysis: ThemeProjectAnalysis, role: ThemeResourceRole) {
  const candidates = analysis.resources
    .filter((resource) => resource.role === role && resource.filePath)
    .map((resource) => analysis.files.find((file) => file.path === resource.filePath))
    .filter((file): file is ThemeProjectFile => Boolean(file?.file || file?.sourceUrl));

  return (
    candidates.find((file) => file.path.includes("drawable-xxhdpi") && file.name.includes("_01_")) ??
    candidates.find((file) => file.name.includes("@3x") && file.name.includes("01")) ??
    candidates.find((file) => file.name.includes("@3x")) ??
    candidates.find((file) => file.name.includes("01")) ??
    candidates.find((file) => !file.name.endsWith(".9.png")) ??
    candidates[0]
  );
}

export async function imageUrlForThemeFile(file: ThemeProjectFile, stripNinePatch = file.name.endsWith(".9.png")) {
  if (file.file) return imageUrlForPreview(file.file, stripNinePatch);
  if (file.sourceUrl) {
    if (!stripNinePatch) return file.sourceUrl;
    return stripNinePatchUrl(file.sourceUrl);
  }
  return "";
}

export async function imageUrlForPreview(file: File, stripNinePatch: boolean) {
  if (!stripNinePatch) return URL.createObjectURL(file);
  const dataUrl = await readFileAsDataUrl(file);
  return stripNinePatchUrl(dataUrl);
}

async function stripNinePatchUrl(dataUrlOrUrl: string) {
  const image = await loadImage(dataUrlOrUrl);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, image.naturalWidth - 2);
  canvas.height = Math.max(1, image.naturalHeight - 2);
  const ctx = canvas.getContext("2d");
  if (!ctx) return dataUrlOrUrl;
  ctx.drawImage(image, 1, 1, canvas.width, canvas.height, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/png");
}

export async function dataUrlForThemeFile(file: ThemeProjectFile) {
  if (file.file) return readFileAsDataUrl(file.file);
  if (!file.sourceUrl) return "";
  const response = await fetch(file.sourceUrl);
  const blob = await response.blob();
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Image load failed."));
    image.src = src;
  });
}
