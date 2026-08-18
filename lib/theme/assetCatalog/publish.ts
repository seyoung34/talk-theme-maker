import { readPngMetadata } from "@/lib/theme/assetCatalog/pngSource";
import { maxCatalogObjectBytes, type ThemeAssetObjectRecord, type ThemeAssetSourceScale } from "@/lib/theme/assetCatalog/registry";
import { detectThemeImageSourceScale } from "@/lib/theme/sourceImage";

/**
 * catalog publish의 도메인 코어.
 *
 * 계획 §7.1. 네트워크 I/O는 여기 없다 — 검증·키 생성·상태 전이만 담는다. GCS/R2 전송은 이 모듈이
 * 만든 계획을 실행하는 별도 어댑터가 맡는다. 그래야 자격증명 없이 순수 함수로 검증할 수 있고,
 * `app/api/admin`의 edge-safe 제약(Node SDK 금지)도 자연히 지켜진다.
 */

/** `catalog/v1/<sha 앞 2자>/<sha>.png` — content-addressed라 같은 바이트는 같은 키가 된다. */
export const catalogKeyPrefix = "catalog/v1";

export class CatalogPublishError extends Error {
  constructor(
    readonly code:
      | "UNSUPPORTED_MIME"
      | "EMPTY_SOURCE"
      | "SOURCE_TOO_LARGE"
      | "INVALID_FILE_NAME"
      | "INVALID_SOURCE_IMAGE"
      | "REVISION_NOT_FORWARD",
    readonly detail?: string,
  ) {
    super(code);
    this.name = "CatalogPublishError";
  }
}

export type CatalogSourceInput = {
  readonly fileName: string;
  readonly mimeType: string;
  readonly bytes: Uint8Array;
};

/** registry에 그대로 들어갈 수 있는, 검증이 끝난 서술자. */
export type CatalogSourceDescriptor = {
  readonly fileName: string;
  readonly mimeType: "image/png";
  readonly sizeBytes: number;
  readonly width: number;
  readonly height: number;
  readonly sourceScale: ThemeAssetSourceScale;
  readonly pngSignatureVerified: true;
};

/**
 * `@2x`/`@3x`가 없는 파일명의 기본 배율.
 *
 * iOS export의 `getIosSourceScale()`이 모든 단서가 없을 때 3으로 떨어지는 것과 같은 값이다.
 * 여기서 다른 값을 쓰면 registry가 기록한 배율과 export가 쓰는 배율이 갈라진다.
 */
export const defaultCatalogSourceScale: ThemeAssetSourceScale = 3;

/**
 * publish 입력을 검증하고 registry가 요구하는 값을 뽑는다.
 *
 * PNG만 받는다. catalog는 export가 바이트 변환 없이 그대로 쓰는 원본 저장소이고, Android/iOS 출력이
 * 모두 PNG라 다른 포맷은 어차피 fast path를 탈 수 없다. WebP 파생물은 R2 preview 쪽 이야기다.
 */
export function describeCatalogSource(input: CatalogSourceInput): CatalogSourceDescriptor {
  const fileName = input.fileName.trim();
  if (!fileName || fileName.length > 255 || fileName.includes("/") || fileName.includes("\\")) {
    throw new CatalogPublishError("INVALID_FILE_NAME");
  }
  if (input.mimeType !== "image/png") throw new CatalogPublishError("UNSUPPORTED_MIME", input.mimeType);
  if (input.bytes.byteLength === 0) throw new CatalogPublishError("EMPTY_SOURCE");
  if (input.bytes.byteLength > maxCatalogObjectBytes) throw new CatalogPublishError("SOURCE_TOO_LARGE");

  let metadata;
  try {
    metadata = readPngMetadata(input.bytes);
  } catch (error) {
    throw new CatalogPublishError("INVALID_SOURCE_IMAGE", error instanceof Error ? error.message : undefined);
  }

  return {
    fileName,
    mimeType: "image/png",
    sizeBytes: input.bytes.byteLength,
    width: metadata.width,
    height: metadata.height,
    sourceScale: detectThemeImageSourceScale(fileName) ?? defaultCatalogSourceScale,
    pngSignatureVerified: true,
  };
}

/**
 * content-addressed object key.
 *
 * 같은 바이트가 같은 키로 가므로 admin asset과 여러 system template이 같은 그림을 참조해도 객체는
 * 하나다. Phase 0 인벤토리에서 `theme-assets` 273개 중 154개가 잉여 사본(65% 바이트)이었고, 이 규칙이
 * 그것을 119개로 접는다.
 */
export function catalogObjectKey(sha256: string) {
  if (!/^[0-9a-f]{64}$/.test(sha256)) throw new CatalogPublishError("INVALID_SOURCE_IMAGE", "sha256");
  return `${catalogKeyPrefix}/${sha256.slice(0, 2)}/${sha256}.png`;
}

/** Web Crypto만 쓴다. Node `crypto`를 import하면 edge-safe 검사에서 걸린다. */
export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes as unknown as ArrayBufferView<ArrayBuffer>);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export type CatalogPublicationPlan = {
  readonly logicalAssetId: string;
  readonly revision: number;
  readonly variantKey: string;
  readonly sha256: string;
  readonly objectKey: string;
  readonly source: CatalogSourceDescriptor;
  /**
   * 이미 같은 바이트가 올라가 있으면 업로드를 건너뛴다. content-addressed라 같은 키면 같은 내용이
   * 보장되므로, 재시도가 몇 번 돌아도 결과가 같다.
   */
  readonly uploadRequired: boolean;
};

export async function planCatalogPublication(input: {
  logicalAssetId: string;
  revision: number;
  variantKey: string;
  source: CatalogSourceInput;
  existingObjectKeys?: ReadonlySet<string>;
}): Promise<CatalogPublicationPlan> {
  const source = describeCatalogSource(input.source);
  const sha256 = await sha256Hex(input.source.bytes);
  const objectKey = catalogObjectKey(sha256);
  return {
    logicalAssetId: input.logicalAssetId,
    revision: input.revision,
    variantKey: input.variantKey,
    sha256,
    objectKey,
    source,
    uploadRequired: !input.existingObjectKeys?.has(objectKey),
  };
}

export type CatalogActivation = {
  /** `staged`에서 `active`로 올릴 레코드. */
  readonly activateId: string;
  /** `active`에서 `retired`로 내릴 기존 레코드. 없으면 첫 게시다. */
  readonly retireId?: string;
};

/**
 * active pointer 전환.
 *
 * 모든 필수 객체가 검증된 뒤에만 호출한다. DB active pointer를 마지막에 옮기는 것이 계획 §7.3의
 * 규칙이고, 그래야 중간 실패가 기존 active revision을 손상하지 않는다.
 *
 * 같은 revision을 다시 활성화하는 재시도는 아무 일도 하지 않는다(멱등).
 */
export function planCatalogActivation(input: {
  staged: Pick<ThemeAssetObjectRecord, "id" | "logicalAssetId" | "revision" | "variantKey" | "status">;
  currentActive?: Pick<ThemeAssetObjectRecord, "id" | "revision" | "status">;
}): CatalogActivation | null {
  const { staged, currentActive } = input;
  if (staged.status === "active") return null;
  if (staged.status !== "staged") {
    throw new CatalogPublishError("REVISION_NOT_FORWARD", `cannot activate from ${staged.status}`);
  }
  // 이전 revision으로 되돌리는 것은 이 경로가 아니라 rollback(active pointer 수동 복귀)의 일이다.
  if (currentActive && currentActive.revision >= staged.revision) {
    throw new CatalogPublishError("REVISION_NOT_FORWARD", `active revision ${currentActive.revision} >= ${staged.revision}`);
  }
  return {
    activateId: staged.id,
    ...(currentActive ? { retireId: currentActive.id } : {}),
  };
}

/**
 * 실패 시 이미 올라간 객체의 처리.
 *
 * content-addressed라 다른 레코드가 같은 키를 참조할 수 있다. 그래서 실패했다고 바로 지우지 않고
 * GC 후보로만 남긴다 — 삭제는 참조가 하나도 없는 것을 확인한 뒤 `theme-catalog-gc` 신원이 한다.
 */
export function collectOrphanCandidates(input: {
  uploadedObjectKeys: readonly string[];
  referencedObjectKeys: ReadonlySet<string>;
}) {
  const seen = new Set<string>();
  const orphans: string[] = [];
  for (const key of input.uploadedObjectKeys) {
    if (input.referencedObjectKeys.has(key) || seen.has(key)) continue;
    seen.add(key);
    orphans.push(key);
  }
  return orphans;
}
