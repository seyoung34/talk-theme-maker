import type { ThemeProjectAnalysis, ThemeProjectFile } from "@/lib/theme/project/types";
import { isAndroidNinePatchSourceName } from "@/lib/theme/sourceImage";
import type { ThemeResourceRole } from "@/lib/theme/types";


export function previewRoleFilesSignature(files: Partial<Record<ThemeResourceRole, ThemeProjectFile>>) {
  return Object.entries(files)
    .sort(([leftRole], [rightRole]) => leftRole.localeCompare(rightRole))
    .map(([role, file]) => [role, file?.path, file?.sourceUrl, file?.previewUrl, file?.previewName, file?.file?.name, file?.file?.size, file?.file?.lastModified].join(":"))
    .join("|");
}

export function findResourceIdByPath(analysis: ThemeProjectAnalysis, path?: string) {
  if (!path) return undefined;
  return analysis.resources.find((resource) => resource.filePath === path)?.id;
}

export function findBestFile(analysis: ThemeProjectAnalysis, role: ThemeResourceRole) {
  const candidates = analysis.resources
    .filter((resource) => resource.role === role && resource.filePath)
    .map((resource) => analysis.files.find((file) => file.path === resource.filePath))
    /**
     * 그릴 수 있는 것의 기준은 **바이트 또는 URL이 하나라도 있는가**다.
     *
     * `previewUrl`을 빠뜨리면 catalog 참조로 저장된 슬롯이 통째로 사라진다. 그 항목은 바이트를
     * 내려받지 않는 것이 목적이라 `file`이 없고, 업로드를 고른 상태라 `sourceUrl`도 없다. 남는
     * 것은 서명된 `previewUrl` 하나뿐인데, 여기서 걸러 내면 화면에 빈 자리가 남는다. 실제로
     * 시스템 템플릿을 catalog 참조로 바꾼 뒤 탭 아이콘이 전부 비었다.
     *
     * `imageUrlForThemeFile`은 이미 `previewUrl`을 우선 사용하므로, 후보 판정만 맞추면 된다.
     * 업로드 항목의 같은 판정은 `canRenderUploadEntry`가 한다 — 기준을 둘로 나누지 않는다.
     */
    .filter((file): file is ThemeProjectFile => Boolean(file?.file || file?.sourceUrl || file?.previewUrl));

  return (
    candidates.find((file) => file.path.includes("mipmap-xxxhdpi")) ??
    candidates.find((file) => file.path.includes("drawable-xxhdpi") && file.name.includes("_01_")) ??
    candidates.find((file) => file.name.includes("@3x") && file.name.includes("01")) ??
    candidates.find((file) => file.name.includes("@3x")) ??
    candidates.find((file) => file.name.includes("01")) ??
    candidates.find((file) => !file.name.endsWith(".9.png")) ??
    candidates[0]
  );
}

export function getThemeFileSourceName(file: ThemeProjectFile) {
  return file.file?.name ?? file.sourceUrl ?? file.name;
}

export async function imageUrlForThemeFile(
  file: ThemeProjectFile,
  stripNinePatch = isAndroidNinePatchSourceName(getThemeFileSourceName(file)),
) {
  const sourceUrl = file.previewUrl ?? file.sourceUrl;
  const previewIsNinePatch = file.previewUrl
    ? isAndroidNinePatchSourceName(file.previewName ?? file.previewUrl)
    : stripNinePatch;
  if (file.file) return imageUrlForPreview(file.file, previewIsNinePatch);
  if (sourceUrl) {
    if (!previewIsNinePatch) return sourceUrl;
    return stripNinePatchUrl(sourceUrl);
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

// 나인패치 파싱은 바이트만 있으면 된다. data URL로 바꾸면 base64 인코딩 비용과
// 33% 큰 문자열이 따라붙는데, 여기서 받은 blob은 그대로 createImageBitmap에 넘길 수 있다.
export async function blobForThemeFile(file: ThemeProjectFile): Promise<Blob | null> {
  if (file.file) return file.file;
  if (!file.sourceUrl) return null;
  const response = await fetch(file.sourceUrl);
  if (!response.ok) return null;
  return response.blob();
}

export async function blobForThemePreview(file: ThemeProjectFile): Promise<Blob | null> {
  if (file.previewUrl) {
    // 미리보기 타일의 no-cors 캐시 항목을 재사용하면 blob 변환이 실패할 수 있다.
    // `reload`로 캐시를 건너뛰어 받아 오고, 그 응답으로 캐시 항목을 교체한다.
    const response = await fetch(file.previewUrl, { cache: "reload", mode: "cors" });
    if (!response.ok) return null;
    return response.blob();
  }
  return blobForThemeFile(file);
}

/**
 * "이 래퍼가 가리키는 이미지가 무엇인가"에 대한 단 하나의 답.
 *
 * 캐시 키를 만드는 쪽마다 기준이 달라지면, 화면은 새 이미지를 그리는데 캐시는 옛 이미지에서
 * 나온 파싱 결과나 색 팔레트를 계속 내주는 어긋남이 생긴다. catalog 참조로만 저장된 항목은
 * `file`도 `sourceUrl`도 없어서, 여기서 `previewUrl`을 빼면 같은 슬롯의 서로 다른 이미지가
 * 통째로 같은 키가 된다 — `size`도 0으로 같기 때문에 구분할 것이 남지 않는다.
 *
 * 우선순위는 그리는 쪽과 같다: 바이트 → 원본 URL → 미리보기 URL.
 * 서명 URL은 재발급될 때마다 쿼리가 바뀌므로 경로만 본다 — 쿼리까지 넣으면 같은 바이트를
 * 재발급 때마다 다시 파싱한다.
 */
export function themeFileRemoteIdentity(file: ThemeProjectFile) {
  const remote = file.sourceUrl ?? file.previewUrl;
  return remote ? remote.split("?")[0] : "";
}

// 파싱 결과 캐시용 키.
export function themeFileCacheKey(file: ThemeProjectFile) {
  return `${file.path}:${file.size}:${file.file?.lastModified ?? themeFileRemoteIdentity(file)}`;
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
