export type ThemeImageSourceFormat = "android-nine-patch" | "plain";

/**
 * 파일명뿐 아니라 signed URL도 source identity로 들어오므로 query/hash를 제거한 뒤 판정한다.
 * target slot의 출력 파일명은 이 함수에 전달하지 않는다.
 */
export function detectThemeImageSourceFormat(sourceName: string | undefined): ThemeImageSourceFormat {
  if (!sourceName) return "plain";
  const path = decodeSourcePath(sourceName.split(/[?#]/, 1)[0]).toLowerCase();
  return path.endsWith(".9.png") ? "android-nine-patch" : "plain";
}

export function isAndroidNinePatchSourceName(sourceName: string | undefined) {
  return detectThemeImageSourceFormat(sourceName) === "android-nine-patch";
}

export function getAndroidNinePatchInnerSize(width: number, height: number) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 2 || height <= 2) {
    throw new Error("Android 9-patch 이미지는 marker 테두리를 포함해 가로·세로가 3px보다 커야 합니다.");
  }
  return { width: width - 2, height: height - 2 };
}

function decodeSourcePath(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
