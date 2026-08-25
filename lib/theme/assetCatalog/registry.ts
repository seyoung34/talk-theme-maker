import type { ThemePlatform, ThemeResourceRole } from "@/lib/theme/types";

import type { CatalogTransform } from "@/lib/theme/export/catalogTransform";

/**
 * catalog registry(`public.theme_asset_objects`)의 애플리케이션 계약.
 *
 * 계약 문서: `docs/architecture/three-track-asset-storage.md` §3.2, §7.2
 *
 * 이 모듈은 **순수 함수만** 둔다. Worker의 export 경로가 import하는데, 그 경로는
 * `scripts/verify-edge-safe-imports.mjs`가 Node 전용 모듈을 금지한다. GCS/R2 접근은
 * REST + WIF로 별도 모듈에서 처리한다.
 */

/** catalog object 하나의 상한. DB CHECK와 같은 값이다. */
export const maxCatalogObjectBytes = 20 * 1024 * 1024;
/** 참조 바이트 합계와 `logical_input_bytes`의 상한. DB CHECK와 같은 값이다. */
export const maxReferencedAssetBytes = 200 * 1024 * 1024;
export const maxReferencedAssetFileCount = 300;

export type ThemeAssetObjectStatus = "staged" | "active" | "retired" | "failed";
export type ThemeAssetSourceScale = 1 | 2 | 3;

export type ThemeAssetR2Preview = {
  readonly objectKey: string;
  readonly sha256: string;
};

export type ThemeAssetObjectRecord = {
  readonly id: string;
  readonly logicalAssetId: string;
  readonly revision: number;
  readonly variantKey: string;
  readonly status: ThemeAssetObjectStatus;
  readonly gcsObjectKey: string;
  readonly gcsGeneration: string;
  readonly sha256: string;
  readonly sizeBytes: number;
  readonly mimeType: string;
  /** iOS sourceScale 추론과 Android `.9.png` 판별이 파일명에 의존한다. */
  readonly fileName: string;
  readonly sourceScale: ThemeAssetSourceScale;
  /** 원본 catalog object 기준. fast path는 normalize가 필요 없는 object만 받는다. */
  readonly width: number;
  readonly height: number;
  readonly pngSignatureVerified: boolean;
  readonly r2Previews: Readonly<Record<string, ThemeAssetR2Preview>>;
  readonly createdAt: string;
  readonly activatedAt?: string;
};

/** 브라우저가 보낼 수 있는 유일한 형태. bucket·object key·signed URL은 받지 않는다. */
export type CatalogAssetSelection = {
  readonly kind: "catalog";
  readonly assetId: string;
  readonly revision: number;
  readonly variantKey: string;
};

/** 권한 확인 뒤 Worker가 Builder에게 넘기는 항목. */
export type ResolvedCatalogManifestItem = {
  readonly path: string;
  readonly resourceRole?: ThemeResourceRole;
  /** Builder가 catalog 원본을 결과물용 PNG로 바꿔야 할 때만 존재한다. */
  readonly transform?: CatalogTransform;
  readonly catalogObject: {
    readonly objectKey: string;
    readonly generation: string;
    readonly sha256: string;
    readonly sizeBytes: number;
    readonly mimeType: string;
    readonly fileName: string;
    readonly sourceScale: ThemeAssetSourceScale;
    readonly width: number;
    readonly height: number;
    readonly pngSignatureVerified: boolean;
  };
};

export class ThemeAssetRegistryError extends Error {
  constructor(readonly code: "INVALID_REGISTRY_ROW" | "INVALID_CATALOG_SELECTION" | "REFERENCED_BYTES_EXCEEDED") {
    super(code);
    this.name = "ThemeAssetRegistryError";
  }
}

export function mapThemeAssetObjectRow(row: unknown): ThemeAssetObjectRecord {
  const record = requireRecord(row);
  const sizeBytes = requireInteger(record.size_bytes);
  if (sizeBytes <= 0 || sizeBytes > maxCatalogObjectBytes) throw invalidRow();

  const activatedAt = readOptionalString(record.activated_at);
  const status = requireStatus(record.status);
  // DB의 theme_asset_objects_activated_at_check와 같은 규칙. 파서에서도 막아 두면 legacy/부분 이관
  // row가 active로 잘못 읽히지 않는다.
  if (status === "active" && !activatedAt) throw invalidRow();

  return {
    id: requireNonEmptyString(record.id),
    logicalAssetId: requireNonEmptyString(record.logical_asset_id),
    revision: requirePositiveInteger(record.revision),
    variantKey: requireNonEmptyString(record.variant_key),
    status,
    gcsObjectKey: requireNonEmptyString(record.gcs_object_key),
    gcsGeneration: requireNonEmptyString(record.gcs_generation),
    sha256: requireSha256(record.sha256),
    sizeBytes,
    mimeType: requireNonEmptyString(record.mime_type),
    fileName: requireNonEmptyString(record.file_name),
    sourceScale: requireSourceScale(record.source_scale),
    width: requirePositiveInteger(record.width),
    height: requirePositiveInteger(record.height),
    pngSignatureVerified: record.png_signature_verified === true,
    r2Previews: parseR2Previews(record.r2_previews),
    createdAt: requireNonEmptyString(record.created_at),
    ...(activatedAt ? { activatedAt } : {}),
  };
}

export function parseCatalogAssetSelection(value: unknown): CatalogAssetSelection {
  const record = requireRecord(value);
  if (record.kind !== "catalog") throw new ThemeAssetRegistryError("INVALID_CATALOG_SELECTION");
  const assetId = typeof record.assetId === "string" ? record.assetId : "";
  const variantKey = typeof record.variantKey === "string" ? record.variantKey : "";
  const revision = typeof record.revision === "number" ? record.revision : NaN;
  if (!assetId || !variantKey || !Number.isSafeInteger(revision) || revision < 1) {
    throw new ThemeAssetRegistryError("INVALID_CATALOG_SELECTION");
  }
  return { kind: "catalog", assetId, revision, variantKey };
}

/**
 * catalog ref가 export fast path를 탈 수 있는지.
 *
 * 조건을 만족하지 못하면 호출부는 기존 `field` 업로드로 되돌린다. 판정은 registry metadata만
 * 사용하고 바이트를 내려받지 않는다 — 그것이 이 전환의 목적이다.
 */
export function isCatalogRecordExportable(record: ThemeAssetObjectRecord): boolean {
  return record.status === "active" && record.pngSignatureVerified && record.mimeType === "image/png";
}

/**
 * 참조 바이트 회계.
 *
 * `referencedAssetBytes`는 출력 경로마다 합산한다. 같은 object를 여러 경로가 쓰면 package 크기가
 * 그만큼 늘어나기 때문이다. 실제 GCS read는 job 안에서 dedupe되므로 `uniqueReferencedAssetBytes`를
 * 따로 계산해 관측에만 쓴다. 두 값의 의미가 다르므로 하나로 합치지 않는다.
 */
export function accumulateReferencedAssetBytes(
  items: readonly { readonly objectKey: string; readonly sizeBytes: number }[],
) {
  let referencedAssetBytes = 0;
  const seen = new Map<string, number>();
  for (const item of items) {
    referencedAssetBytes += item.sizeBytes;
    if (!seen.has(item.objectKey)) seen.set(item.objectKey, item.sizeBytes);
  }
  let uniqueReferencedAssetBytes = 0;
  for (const size of seen.values()) uniqueReferencedAssetBytes += size;
  return {
    referencedAssetBytes,
    uniqueReferencedAssetBytes,
    referencedAssetFileCount: items.length,
  };
}

/** enqueue 전에 강제하는 상한. DB guard와 같은 값을 클라이언트 앞단에서 먼저 막는다. */
export function assertReferencedAssetBudget(totals: {
  referencedAssetBytes: number;
  referencedAssetFileCount: number;
  uploadedInputBytes: number;
}) {
  if (totals.referencedAssetBytes < 0 || totals.referencedAssetBytes > maxReferencedAssetBytes) {
    throw new ThemeAssetRegistryError("REFERENCED_BYTES_EXCEEDED");
  }
  if (totals.referencedAssetFileCount < 0 || totals.referencedAssetFileCount > maxReferencedAssetFileCount) {
    throw new ThemeAssetRegistryError("REFERENCED_BYTES_EXCEEDED");
  }
  if (totals.uploadedInputBytes + totals.referencedAssetBytes > maxReferencedAssetBytes) {
    throw new ThemeAssetRegistryError("REFERENCED_BYTES_EXCEEDED");
  }
}

export function toResolvedCatalogManifestItem(path: string, record: ThemeAssetObjectRecord, transform?: CatalogTransform, resourceRole?: ThemeResourceRole): ResolvedCatalogManifestItem {
  return {
    path,
    ...(resourceRole ? { resourceRole } : {}),
    ...(transform ? { transform } : {}),
    catalogObject: {
      objectKey: record.gcsObjectKey,
      generation: record.gcsGeneration,
      sha256: record.sha256,
      sizeBytes: record.sizeBytes,
      mimeType: record.mimeType,
      fileName: record.fileName,
      sourceScale: record.sourceScale,
      width: record.width,
      height: record.height,
      pngSignatureVerified: record.pngSignatureVerified,
    },
  };
}

/** platform variant 키. 값 집합을 DB CHECK로 굳히지 않고 여기서 관리한다. */
export function catalogVariantKeyFor(platform: ThemePlatform): string {
  return platform === "ios" ? "ios" : "android";
}

function parseR2Previews(value: unknown): Record<string, ThemeAssetR2Preview> {
  if (value === null || value === undefined) return {};
  const record = requireRecord(value);
  const previews: Record<string, ThemeAssetR2Preview> = {};
  for (const [key, raw] of Object.entries(record)) {
    const entry = requireRecord(raw);
    previews[key] = {
      objectKey: requireNonEmptyString(entry.objectKey),
      sha256: requireSha256(entry.sha256),
    };
  }
  return previews;
}

function invalidRow() {
  return new ThemeAssetRegistryError("INVALID_REGISTRY_ROW");
}

function requireRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw invalidRow();
  return value as Record<string, unknown>;
}

function requireNonEmptyString(value: unknown): string {
  if (typeof value !== "string" || !value) throw invalidRow();
  return value;
}

function readOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value ? value : undefined;
}

function requireInteger(value: unknown): number {
  // bigint 컬럼은 PostgREST가 문자열로 돌려줄 수 있다.
  const parsed = typeof value === "string" ? Number(value) : value;
  if (typeof parsed !== "number" || !Number.isSafeInteger(parsed)) throw invalidRow();
  return parsed;
}

function requirePositiveInteger(value: unknown): number {
  const parsed = requireInteger(value);
  if (parsed <= 0) throw invalidRow();
  return parsed;
}

function requireStatus(value: unknown): ThemeAssetObjectStatus {
  if (value === "staged" || value === "active" || value === "retired" || value === "failed") return value;
  throw invalidRow();
}

function requireSourceScale(value: unknown): ThemeAssetSourceScale {
  const parsed = requireInteger(value);
  if (parsed !== 1 && parsed !== 2 && parsed !== 3) throw invalidRow();
  return parsed;
}

function requireSha256(value: unknown): string {
  if (typeof value !== "string" || !/^[0-9a-f]{64}$/.test(value)) throw invalidRow();
  return value;
}
