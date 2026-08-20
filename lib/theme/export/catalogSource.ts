import { isCatalogFastPathEligible } from "./catalogFastPath.js";
import { parseCatalogTransform, validateCatalogTransform, type CatalogTransform } from "./catalogTransform.js";

/**
 * Builder가 GCS catalog 객체를 읽는 공통 계층 (계획 §9.4).
 *
 * Android/iOS builder 양쪽이 쓴다. 두 builder는 지금도 `serverAsset` 처리와 경로 검증을 각자
 * 복제하고 있는데, catalog는 검증 규칙이 더 많아(generation 고정·해시 대조) 복제하면 한쪽만 고치는
 * 사고가 난다.
 *
 * 이 모듈은 **Builder 전용**이다. Cloud Run의 Node 런타임에서 돌고 앱의 edge 경로는 쓰지 않는다.
 * 그래서 GCS 접근을 주입받는다 — `@google-cloud/storage`를 여기서 import하면 `check:edge-imports`가
 * 이 파일을 따라 들어오는 앱 모듈에서 걸린다.
 */

/** Worker가 registry를 해석해 만든 항목. Builder는 이 값을 그대로 믿지 않고 다시 확인한다. */
export type CatalogObjectRef = {
  readonly objectKey: string;
  readonly generation: string;
  readonly sha256: string;
  readonly sizeBytes: number;
  readonly mimeType: string;
  readonly fileName?: string;
  readonly sourceScale?: number;
  readonly width?: number;
  readonly height?: number;
  readonly pngSignatureVerified?: boolean;
};

export type CatalogManifestItem = {
  readonly path: string;
  readonly catalogObject: CatalogObjectRef;
  readonly transform?: CatalogTransform;
};

/** 실패 사유. `result.json`에 그대로 실려 상태 API가 사용자 문구로 바꾼다. */
export type CatalogReadErrorCode =
  | "asset_source_missing"
  | "asset_hash_mismatch"
  | "asset_source_invalid"
  | "asset_transform_required";

export class CatalogReadError extends Error {
  constructor(
    readonly code: CatalogReadErrorCode,
    message: string,
    readonly detail?: string,
  ) {
    super(message);
    this.name = "CatalogReadError";
  }
}

export const catalogKeyPrefix = "catalog/v1/";

/**
 * 허용 prefix와 경로 탈출을 확인한다.
 *
 * Worker가 만든 값이라 신뢰할 만하지만, Builder는 bundle.json을 파일로 받는다. 그 파일이 어떻게
 * 만들어졌는지 Builder는 모르므로 여기서 다시 본다 — 신뢰 경계는 프로세스마다 다시 그어야 한다.
 */
export function assertCatalogObjectKey(objectKey: string) {
  if (
    typeof objectKey !== "string"
    || !objectKey.startsWith(catalogKeyPrefix)
    || objectKey.includes("..")
    || objectKey.includes("//")
    || objectKey.includes("\\")
    || objectKey.length > 512
  ) {
    throw new CatalogReadError("asset_source_invalid", "테마 에셋 경로가 올바르지 않습니다.", String(objectKey).slice(0, 80));
  }
  return objectKey;
}

export function isCatalogManifestItem(value: unknown): value is CatalogManifestItem {
  if (typeof value !== "object" || value === null) return false;
  const item = value as Record<string, unknown>;
  if (typeof item.path !== "string") return false;
  const object = item.catalogObject;
  if (typeof object !== "object" || object === null) return false;
  const ref = object as Record<string, unknown>;
  if (!(typeof ref.objectKey === "string"
    && typeof ref.generation === "string"
    && typeof ref.sha256 === "string"
    && typeof ref.sizeBytes === "number"
    && typeof ref.mimeType === "string")) return false;
  if (item.transform === undefined) return true;
  try {
    parseCatalogTransform(item.transform);
    return true;
  } catch {
    return false;
  }
}

/**
 * Builder에서 fast path 조건을 다시 본다 (계획 §9.5).
 *
 * Worker가 이미 걸렀지만 Builder는 `bundle.json`을 파일로 받는다. 그 파일이 어떻게 만들어졌는지
 * Builder는 모르므로 같은 조건을 다시 확인한다 — 신뢰 경계는 프로세스마다 다시 긋는다.
 *
 * 변환이 필요한 항목이 여기까지 왔다는 것은 Worker 쪽 판정이 새고 있다는 뜻이라, 조용히
 * 통과시키지 않고 실패시켜 드러낸다.
 */
export function assertCatalogFastPath(input: {
  platform: "android" | "ios";
  path: string;
  ref: CatalogObjectRef;
}) {
  // fileName·sourceScale이 없는 옛 manifest는 판정할 수 없다. 그때는 막는다.
  if (typeof input.ref.fileName !== "string" || typeof input.ref.sourceScale !== "number") {
    throw new CatalogReadError(
      "asset_transform_required",
      "테마 에셋 변환 정보가 없습니다.",
      `${input.path}: missing fileName/sourceScale`,
    );
  }
  const verdict = isCatalogFastPathEligible({
    platform: input.platform,
    path: input.path,
    source: { fileName: input.ref.fileName, sourceScale: input.ref.sourceScale, mimeType: input.ref.mimeType },
  });
  if (!verdict.eligible) {
    throw new CatalogReadError(
      "asset_transform_required",
      "이 에셋은 변환이 필요해 그대로 사용할 수 없습니다.",
      `${input.path}: ${verdict.reason}`,
    );
  }
}

/**
 * Builder가 catalog 원본을 그대로 복사하거나 descriptor에 따라 변환할 수 있는지 확인한다.
 * Worker가 만든 bundle도 파일 입력과 같은 외부 경계이므로, 여기서 registry metadata와 다시
 * 대조한다.
 */
export function assertCatalogManifestSource(input: {
  platform: "android" | "ios";
  path: string;
  ref: CatalogObjectRef;
  transform?: CatalogTransform;
}) {
  if (input.transform) {
    if (input.ref.pngSignatureVerified !== true || typeof input.ref.fileName !== "string" || typeof input.ref.sourceScale !== "number" || typeof input.ref.width !== "number" || typeof input.ref.height !== "number") {
      throw new CatalogReadError("asset_transform_required", "테마 에셋 변환 정보가 없습니다.", `${input.path}: missing source metadata`);
    }
    const verdict = validateCatalogTransform({
      platform: input.platform,
      path: input.path,
      source: {
        fileName: input.ref.fileName,
        mimeType: input.ref.mimeType,
        sourceScale: input.ref.sourceScale as 1 | 2 | 3,
        width: input.ref.width,
        height: input.ref.height,
      },
      transform: input.transform,
    });
    if (!verdict.valid) {
      throw new CatalogReadError("asset_transform_required", "테마 에셋 변환 계약이 올바르지 않습니다.", `${input.path}: ${verdict.reason}`);
    }
    return;
  }

  assertCatalogFastPath({ platform: input.platform, path: input.path, ref: input.ref });
}

/** GCS 읽기와 해시 계산을 주입받는다. Builder가 각자의 SDK로 채운다. */
export type CatalogReadPorts = {
  /** `generation`을 고정해 읽는다. 그 사이 객체가 바뀌어도 다른 바이트를 받지 않는다. */
  download(input: { objectKey: string; generation: string }): Promise<Uint8Array>;
  sha256Hex(bytes: Uint8Array): string;
};

/**
 * catalog 참조를 바이트로 바꾼다.
 *
 * 같은 객체를 여러 출력 경로가 쓰면 job 안에서 한 번만 읽는다. Android 슬롯 89개 중 23개가 스케일
 * 타깃 때문에 다중 경로이고, catalog로 오면 그 비율이 더 높아진다.
 *
 * **크기와 SHA-256을 반드시 대조한다.** Worker가 registry에서 읽은 값과 실제 바이트가 다르면
 * 그 자리에서 실패한다. 조용히 진행하면 사용자가 다른 그림이 든 테마를 받는다.
 */
export async function createCatalogReader(ports: CatalogReadPorts) {
  const cache = new Map<string, Uint8Array>();

  return async function readCatalogObject(ref: CatalogObjectRef): Promise<Uint8Array> {
    const objectKey = assertCatalogObjectKey(ref.objectKey);
    const cacheKey = `${objectKey}#${ref.generation}`;
    const cached = cache.get(cacheKey);
    if (cached) return cached;

    let bytes: Uint8Array;
    try {
      bytes = await ports.download({ objectKey, generation: ref.generation });
    } catch (error) {
      throw new CatalogReadError(
        "asset_source_missing",
        "테마 에셋을 찾지 못했습니다.",
        `${objectKey}#${ref.generation}: ${error instanceof Error ? error.message.slice(0, 160) : String(error)}`,
      );
    }

    if (bytes.byteLength !== ref.sizeBytes) {
      throw new CatalogReadError(
        "asset_hash_mismatch",
        "테마 에셋 크기가 기록과 일치하지 않습니다.",
        `${objectKey}: expected ${ref.sizeBytes}, got ${bytes.byteLength}`,
      );
    }

    const digest = ports.sha256Hex(bytes);
    if (digest !== ref.sha256) {
      throw new CatalogReadError(
        "asset_hash_mismatch",
        "테마 에셋 내용이 기록과 일치하지 않습니다.",
        `${objectKey}: expected ${ref.sha256.slice(0, 12)}…, got ${digest.slice(0, 12)}…`,
      );
    }

    cache.set(cacheKey, bytes);
    return bytes;
  };
}

/** `gs://bucket/key` 형태에서 bucket과 key를 나눈다. Builder의 입력 URI 파싱에 쓴다. */
export function parseGcsUri(uri: string) {
  const match = /^gs:\/\/([^/]+)\/(.+)$/.exec(uri);
  if (!match) throw new CatalogReadError("asset_source_invalid", "저장소 경로가 올바르지 않습니다.", uri.slice(0, 80));
  return { bucket: match[1], objectKey: match[2] };
}
