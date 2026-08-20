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

/**
 * 파일명의 `@2x`/`@3x` 접미사에서 원본 배율을 읽는다. 없으면 `null`.
 *
 * catalog registry의 `source_scale`과 iOS export의 `getIosSourceScale()`이 같은 값을 써야 한다.
 * 둘이 갈라지면 export가 잘못된 배율로 리사이즈하므로 판정을 여기 하나로 둔다.
 *
 * `detectThemeImageSourceFormat()`과 달리 query/hash를 벗기지 않는다 — 기존 export 동작을 그대로
 * 유지하기 위해서다. signed URL을 넘기는 호출부가 있으므로 바꾸려면 export 결과부터 확인해야 한다.
 */
export function detectThemeImageSourceScale(value: string | undefined): 2 | 3 | null {
  if (!value) return null;
  const match = value.match(/@([23])x(?=\.[a-z0-9]+$|$)/i);
  if (!match) return null;
  return match[1] === "2" ? 2 : 3;
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
