export type IosPackageEntry = {
  path: string;
  bytes: Uint8Array;
  /** Worker가 catalog registry attestation으로 확인한 이미지에만 허용한다. */
  pngSignatureVerified?: boolean;
};

export class IosExportRequestError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = "IosExportRequestError";
    this.code = code;
    this.status = status;
  }
}

export function normalizeIosPath(value: string) {
  const normalized = value.replaceAll("\\", "/").replace(/^\/+/, "");
  if (normalized === "KakaoTalkTheme.css") return normalized;
  if (/^Images\/[^/\\\u0000-\u001f]+\.png$/i.test(normalized) && !normalized.includes("../")) return normalized;
  throw new IosExportRequestError("forbidden_export_path", "iOS 테마 리소스 경로가 올바르지 않습니다.");
}

export function validateIosPackage(entries: IosPackageEntry[]) {
  const cssEntry = entries.find((entry) => entry.path === "KakaoTalkTheme.css");
  if (!cssEntry) throw new IosExportRequestError("missing_theme_css", "KakaoTalkTheme.css 파일이 필요합니다.");
  if (cssEntry.bytes.length === 0 || cssEntry.bytes.length > 512 * 1024) {
    throw new IosExportRequestError("invalid_theme_css", "KakaoTalkTheme.css 파일 크기가 올바르지 않습니다.");
  }

  let css: string;
  try {
    css = new TextDecoder("utf-8", { fatal: true }).decode(cssEntry.bytes);
  } catch {
    throw new IosExportRequestError("invalid_theme_css_encoding", "KakaoTalkTheme.css는 UTF-8 형식이어야 합니다.");
  }
  for (const property of ["-kakaotalk-theme-name", "-kakaotalk-theme-version", "-kakaotalk-theme-id"]) {
    if (!css.includes(`${property}:`)) throw new IosExportRequestError("invalid_theme_css", `테마 CSS에 ${property} 값이 없습니다.`);
  }
  const themeIdentifier = /-kakaotalk-theme-id:\s*'([^'\r\n]+)'\s*;/i.exec(css)?.[1];
  if (!themeIdentifier || !/^[a-z][a-z0-9]*(?:\.[a-z][a-z0-9]*)+$/i.test(themeIdentifier)) {
    throw new IosExportRequestError("invalid_theme_identifier", "테마 CSS의 identifier 형식이 올바르지 않습니다.");
  }

  const imagePaths = new Set(entries.filter((entry) => entry.path.startsWith("Images/")).map((entry) => entry.path.slice("Images/".length)));
  for (const entry of entries) {
    if (entry.path.startsWith("Images/") && !hasPngSignature(entry.bytes) && entry.pngSignatureVerified !== true) {
      throw new IosExportRequestError("invalid_png_file", `실제 PNG 형식이 아닌 이미지가 포함되어 있습니다: ${entry.path}`);
    }
  }

  const referencedImages = [...css.matchAll(/'([^'\r\n]+\.png)'/gi)].map((match) => match[1]);
  for (const fileName of referencedImages) {
    const baseName = fileName.replace(/@(?:2x|3x)(?=\.png$)/i, "");
    const hasVariant = imagePaths.has(fileName)
      || imagePaths.has(baseName)
      || imagePaths.has(baseName.replace(/\.png$/i, "@2x.png"))
      || imagePaths.has(baseName.replace(/\.png$/i, "@3x.png"));
    if (!hasVariant) throw new IosExportRequestError("missing_referenced_image", `테마 CSS가 참조하는 이미지를 찾지 못했습니다: ${fileName}`);
  }
}

export function applyServerThemeIdentifier(entries: IosPackageEntry[], themeIdentifier: string) {
  if (!/^com\.kakao\.talk\.theme\.u[0-9a-f]{16}\.i[0-9]{6,}$/.test(themeIdentifier)) {
    throw new IosExportRequestError("invalid_server_theme_identifier", "iOS 테마 식별자를 발급하지 못했습니다.", 500);
  }

  const cssIndex = entries.findIndex((entry) => entry.path === "KakaoTalkTheme.css");
  if (cssIndex < 0) throw new IosExportRequestError("missing_theme_css", "KakaoTalkTheme.css 파일이 필요합니다.");

  let css: string;
  try {
    css = new TextDecoder("utf-8", { fatal: true }).decode(entries[cssIndex].bytes);
  } catch {
    throw new IosExportRequestError("invalid_theme_css_encoding", "KakaoTalkTheme.css는 UTF-8 형식이어야 합니다.");
  }

  const identifierPattern = /(-kakaotalk-theme-id:\s*)'[^'\r\n]*'(\s*;)/i;
  if (!identifierPattern.test(css)) {
    throw new IosExportRequestError("invalid_theme_css", "테마 CSS에 -kakaotalk-theme-id 값이 없습니다.");
  }

  const nextEntries = entries.slice();
  nextEntries[cssIndex] = {
    ...entries[cssIndex],
    bytes: new TextEncoder().encode(css.replace(identifierPattern, `$1'${themeIdentifier}'$2`)),
  };
  validateIosPackage(nextEntries);
  return nextEntries;
}

export function validateExportName(value: FormDataEntryValue | null) {
  const name = typeof value === "string" && value.trim() ? value.trim() : "kakaotalk-theme";
  if (name.length > 80 || /[\u0000-\u001f\u007f]/.test(name)) throw new IosExportRequestError("invalid_export_name", "테마 이름은 줄바꿈 없이 80자 이하로 입력해 주세요.");
  return name;
}

export function validateVersionName(value: FormDataEntryValue | null) {
  const version = typeof value === "string" && value.trim() ? value.trim() : "1.0.0";
  if (!/^[0-9A-Za-z][0-9A-Za-z._-]{0,31}$/.test(version)) throw new IosExportRequestError("invalid_version_name", "버전은 영문, 숫자, 점, 밑줄, 하이픈을 사용해 32자 이하로 입력해 주세요.");
  return version;
}

function hasPngSignature(bytes: Uint8Array) {
  return bytes.length >= 8
    && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
    && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a;
}
