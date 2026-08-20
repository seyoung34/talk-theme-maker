/**
 * catalog 원본을 **변환 없이 그대로** 결과물에 넣어도 되는지 판정한다 (계획 §9.5).
 *
 * catalog fast path는 바이트를 손대지 않고 출력 경로에 복사하는 경로다. 그래서 변환이 필요한
 * 경우를 여기서 걸러 내지 않으면 잘못된 결과물이 만들어진다.
 *
 *   - `@3x` 원본이 `@2x` 출력 경로에 그대로 들어간다
 *   - Android `.9.png`의 marker 테두리가 iOS 이미지에 남는다
 *   - 말풍선 cap-inset이 실제 픽셀과 어긋난다
 *
 * Builder-side 변환은 Phase 5다. 그때까지 변환이 필요한 항목은 **catalog를 쓰지 않고** 기존
 * Blob/`field` 업로드로 떨어져야 한다.
 *
 * 이 모듈은 앱(Worker resolve)과 Builder가 함께 쓴다. Builder는 `bundle.json`을 파일로 받으므로
 * Worker가 제대로 걸렀다고 가정하지 않고 같은 조건을 다시 본다.
 */

export type CatalogFastPathSource = {
  /** registry의 `file_name`. Android `.9.png` 판별과 배율 추론이 파일명에 의존한다. */
  readonly fileName: string;
  /** registry의 `source_scale`. publish 시 확정한 값. */
  readonly sourceScale: number;
  readonly mimeType: string;
};

export type CatalogFastPathRejection =
  | "nine_patch_source"
  | "scale_mismatch"
  | "extension_mismatch"
  | "not_png";

export type CatalogFastPathVerdict =
  | { readonly eligible: true }
  | { readonly eligible: false; readonly reason: CatalogFastPathRejection };

const eligible: CatalogFastPathVerdict = { eligible: true };

/**
 * 출력 경로에서 목표 배율을 읽는다. `@2x`/`@3x`가 없으면 `undefined`.
 *
 * `getIosSlotExportTargets()`가 만드는 경로 규칙과 짝이다 — 1배는 접미사 없이, 나머지는 `@Nx`.
 */
export function readTargetScaleFromPath(path: string): 2 | 3 | undefined {
  const match = path.match(/@([23])x(?=\.[a-z0-9]+$)/i);
  if (!match) return undefined;
  return match[1] === "2" ? 2 : 3;
}

/**
 * iOS 출력에 catalog 원본을 그대로 쓸 수 있는지.
 *
 * 접미사 없는 경로는 **보수적으로 1배 출력으로 본다.** 실제로는 "배율 변환이 없는 슬롯"일 수도
 * 있지만 경로만으로는 구분되지 않는다. 여기서 관대하게 통과시키면 3배 원본이 1배 자리에 들어가므로,
 * 애매하면 막고 기존 업로드 경로로 보낸다. 정확한 판정은 `targetScale`을 아는 브라우저가 한다(§9.5).
 */
export function isIosCatalogFastPathEligible(input: {
  path: string;
  source: CatalogFastPathSource;
}): CatalogFastPathVerdict {
  const base = checkCommon(input.path, input.source);
  if (!base.eligible) return base;

  // Android 9-patch는 marker 테두리를 벗겨야 해 바이트를 그대로 쓸 수 없다.
  if (isAndroidNinePatchSourceName(input.source.fileName)) {
    return { eligible: false, reason: "nine_patch_source" };
  }

  const targetScale = readTargetScaleFromPath(input.path) ?? 1;
  if (targetScale !== input.source.sourceScale) {
    return { eligible: false, reason: "scale_mismatch" };
  }
  return eligible;
}

/**
 * Android 출력에 catalog 원본을 그대로 쓸 수 있는지.
 *
 * Android는 배율 변환이 없다 — 밀도별 폴더에 같은 바이트가 들어간다. 대신 `.9.png`는 marker를
 * 생성해야 하므로 제외한다.
 */
export function isAndroidCatalogFastPathEligible(input: {
  path: string;
  source: CatalogFastPathSource;
}): CatalogFastPathVerdict {
  const base = checkCommon(input.path, input.source);
  if (!base.eligible) return base;

  // 출력이 `.9.png`이거나 원본이 9-patch면 marker 처리가 필요하다.
  if (input.path.toLowerCase().endsWith(".9.png") || isAndroidNinePatchSourceName(input.source.fileName)) {
    return { eligible: false, reason: "nine_patch_source" };
  }
  return eligible;
}

/** 플랫폼 공통 조건. */
function checkCommon(path: string, source: CatalogFastPathSource): CatalogFastPathVerdict {
  if (source.mimeType !== "image/png") return { eligible: false, reason: "not_png" };
  // PNG로 나가야 하는 자리에 다른 확장자의 원본을 넣으면 확장자만 PNG인 파일이 된다.
  if (!path.toLowerCase().endsWith(".png")) return { eligible: false, reason: "extension_mismatch" };
  return eligible;
}

/**
 * 이 파일은 Next/Webpack과 NodeNext로 컴파일되는 Builder가 함께 가져간다.
 * `sourceImage.ts`의 `.js` specifier는 NodeNext에는 맞지만 Next의 Cloudflare 빌드에서는
 * 해당 파일을 해석하지 못하므로, catalog fast path가 실제로 필요한 보수적 판정만 여기서
 * 유지한다. 파일명 정규화 규칙은 sourceImage.ts와 동일하게 query/hash를 제거하고 복원한다.
 */
function isAndroidNinePatchSourceName(sourceName: string | undefined) {
  if (!sourceName) return false;
  const path = decodeSourcePath(sourceName.split(/[?#]/, 1)[0]).toLowerCase();
  return path.endsWith(".9.png");
}

function decodeSourcePath(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/** 플랫폼별 판정을 하나로 묶는다. 호출부가 플랫폼을 들고 있는 곳에서 쓴다. */
export function isCatalogFastPathEligible(input: {
  platform: "android" | "ios";
  path: string;
  source: CatalogFastPathSource;
}): CatalogFastPathVerdict {
  return input.platform === "ios"
    ? isIosCatalogFastPathEligible({ path: input.path, source: input.source })
    : isAndroidCatalogFastPathEligible({ path: input.path, source: input.source });
}
