import { getImpersonatedAccessToken, readGcpOidcConfig } from "@/lib/theme/export/buildJobClient";

/**
 * GCS catalog bucket 전송 계층.
 *
 * `@google-cloud/storage`를 쓰지 않는다 — 이 코드는 Cloudflare Worker에서 돌고
 * `scripts/verify-edge-safe-imports.mjs`가 Node 전용 모듈을 막는다. JSON API를 fetch로 직접 부른다.
 *
 * bucket 이름은 항상 환경변수에서 온다. client가 준 값을 여기로 흘리지 않는다.
 */

const gcsRequestTimeoutMs = 30_000;

export class CatalogStorageError extends Error {
  constructor(
    readonly code:
      | "missing_catalog_config"
      | "catalog_upload_failed"
      | "catalog_lookup_failed"
      | "catalog_object_mismatch"
      | "invalid_object_key",
    message: string,
    readonly detail?: string,
  ) {
    super(message);
    this.name = "CatalogStorageError";
  }
}

export type CatalogStorageConfig = {
  bucket: string;
  publisherServiceAccount: string;
};

export function readCatalogStorageConfig(): CatalogStorageConfig {
  const bucket = process.env.GCP_THEME_ASSET_BUCKET?.trim();
  const publisherServiceAccount = process.env.GCP_THEME_CATALOG_PUBLISHER_SA_EMAIL?.trim();
  if (!bucket || !publisherServiceAccount) {
    throw new CatalogStorageError("missing_catalog_config", "테마 에셋 저장소 설정이 완료되지 않았습니다.");
  }
  return { bucket, publisherServiceAccount };
}

/** publish 경로 전용 토큰. Builder SA가 아니라 create 권한을 가진 publisher SA로 impersonate한다. */
export function getCatalogPublisherAccessToken(config: CatalogStorageConfig) {
  return getImpersonatedAccessToken(config.publisherServiceAccount, readGcpOidcConfig());
}

export type CatalogObjectMetadata = {
  readonly objectKey: string;
  readonly generation: string;
  readonly sizeBytes: number;
};

/**
 * catalog는 `catalog/v1/` 아래만 쓴다.
 *
 * 키가 계산 결과라 해도 경로 탈출을 한 번 더 막는다 — 이 검사는 GCS bucket 안에서 catalog가
 * 다른 prefix를 오염시키지 않는다는 보장이고, 나중에 같은 bucket을 다른 용도로 나눌 때도 유효하다.
 */
export function assertCatalogObjectKey(objectKey: string) {
  if (
    !objectKey.startsWith("catalog/v1/")
    || objectKey.includes("..")
    || objectKey.includes("//")
    || objectKey.includes("\\")
    || objectKey.length > 512
  ) {
    throw new CatalogStorageError("invalid_object_key", "테마 에셋 경로가 올바르지 않습니다.", objectKey.slice(0, 80));
  }
  return objectKey;
}

/**
 * 객체를 올린다. content-addressed 키라 같은 키면 내용이 같으므로, 이미 있으면 그대로 재사용한다.
 *
 * `ifGenerationMatch=0`은 "없을 때만 생성"이다. 412는 오류가 아니라 "다른 publish가 이미 올렸다"는
 * 뜻이므로 기존 metadata를 읽어 돌려준다. 재시도가 몇 번 돌아도 결과가 같다.
 */
export async function putCatalogObject(input: {
  config: CatalogStorageConfig;
  accessToken: string;
  objectKey: string;
  bytes: Uint8Array;
  contentType: string;
  expectedSizeBytes: number;
}): Promise<CatalogObjectMetadata & { created: boolean }> {
  const objectKey = assertCatalogObjectKey(input.objectKey);
  const url = `https://storage.googleapis.com/upload/storage/v1/b/${encodeURIComponent(input.config.bucket)}/o`
    + `?uploadType=media&ifGenerationMatch=0&name=${encodeURIComponent(objectKey)}`;

  const response = await fetchWithTimeout(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${input.accessToken}`, "Content-Type": input.contentType },
    body: input.bytes as unknown as BodyInit,
  }, "catalog_upload_failed", "테마 에셋 업로드에 실패했습니다.");

  if (response.status === 412) {
    await response.arrayBuffer();
    const existing = await headCatalogObject({ config: input.config, accessToken: input.accessToken, objectKey });
    if (!existing) {
      throw new CatalogStorageError("catalog_upload_failed", "테마 에셋 업로드에 실패했습니다.", "precondition failed but object missing");
    }
    assertSizeMatches(existing, input.expectedSizeBytes);
    return { ...existing, created: false };
  }

  if (!response.ok) {
    throw new CatalogStorageError("catalog_upload_failed", "테마 에셋 업로드에 실패했습니다.", `HTTP ${response.status}`);
  }

  const metadata = parseObjectMetadata(objectKey, await response.json().catch(() => null));
  assertSizeMatches(metadata, input.expectedSizeBytes);
  return { ...metadata, created: true };
}

export async function headCatalogObject(input: {
  config: CatalogStorageConfig;
  accessToken: string;
  objectKey: string;
}): Promise<CatalogObjectMetadata | null> {
  const objectKey = assertCatalogObjectKey(input.objectKey);
  const url = `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(input.config.bucket)}/o/${encodeURIComponent(objectKey)}`;
  const response = await fetchWithTimeout(url, {
    method: "GET",
    headers: { Authorization: `Bearer ${input.accessToken}` },
  }, "catalog_lookup_failed", "테마 에셋을 확인하지 못했습니다.");

  if (response.status === 404) {
    await response.arrayBuffer();
    return null;
  }
  if (!response.ok) {
    throw new CatalogStorageError("catalog_lookup_failed", "테마 에셋을 확인하지 못했습니다.", `HTTP ${response.status}`);
  }
  return parseObjectMetadata(objectKey, await response.json().catch(() => null));
}

function assertSizeMatches(metadata: CatalogObjectMetadata, expectedSizeBytes: number) {
  if (metadata.sizeBytes !== expectedSizeBytes) {
    throw new CatalogStorageError(
      "catalog_object_mismatch",
      "테마 에셋 크기가 기록과 일치하지 않습니다.",
      `expected ${expectedSizeBytes}, got ${metadata.sizeBytes}`,
    );
  }
}

function parseObjectMetadata(objectKey: string, payload: unknown): CatalogObjectMetadata {
  const record = typeof payload === "object" && payload !== null ? (payload as Record<string, unknown>) : null;
  const generation = typeof record?.generation === "string" ? record.generation : "";
  // GCS JSON API는 size를 문자열로 돌려준다.
  const sizeBytes = Number(typeof record?.size === "string" ? record.size : NaN);
  if (!generation || !Number.isSafeInteger(sizeBytes) || sizeBytes < 0) {
    throw new CatalogStorageError("catalog_lookup_failed", "테마 에셋 메타데이터를 읽지 못했습니다.");
  }
  return { objectKey, generation, sizeBytes };
}

async function fetchWithTimeout(url: string, init: RequestInit, code: CatalogStorageError["code"], message: string) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), gcsRequestTimeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    throw new CatalogStorageError(code, message, detail.slice(0, 240));
  } finally {
    clearTimeout(timeoutId);
  }
}
