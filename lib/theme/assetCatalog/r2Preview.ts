import { getCloudflareContext } from "@opennextjs/cloudflare";

/**
 * R2 공개 preview 버킷 쓰기 경로.
 *
 * Worker 바인딩만 쓴다. S3 호환 API + 액세스 키를 택하지 않은 이유는 장기 자격증명이 하나 더
 * 생기기 때문이다. 바인딩은 배포 시점에 묶이므로 보관·로테이션할 비밀이 없다.
 *
 * 읽기는 이 모듈이 담당하지 않는다. 공개 preview는 custom domain에서 CDN이 직접 서빙한다.
 */

export const previewKeyPrefix = "preview/v1";
export const previewBindingName = "THEME_PREVIEW_BUCKET";
/** 불변 키를 쓰므로 최대치로 캐시한다. 내용이 바뀌면 sha256이 바뀌어 키가 바뀐다. */
export const previewCacheControl = "public, max-age=31536000, immutable";

export type PreviewContentType = "image/webp" | "image/png";

/**
 * 쓰기에 필요한 R2 표면만 좁게 선언한다.
 *
 * 프로젝트 소스에 `CloudflareEnv` 선언이 없어(생성물인 `.open-next/`에만 있다) 바인딩 타입을
 * 여기서 최소한으로 정의한다. 넓은 R2 타입을 끌어오면 런타임에 없는 메서드까지 타입상 열린다.
 */
export type PreviewBucket = {
  put(
    key: string,
    value: ArrayBuffer | Uint8Array,
    options?: {
      httpMetadata?: { contentType?: string; cacheControl?: string };
      customMetadata?: Record<string, string>;
    },
  ): Promise<{ size: number } | null>;
  head(key: string): Promise<{ size: number } | null>;
};

export class PreviewStorageError extends Error {
  constructor(
    readonly code: "preview_upload_failed" | "preview_verify_failed" | "invalid_preview_key",
    message: string,
    readonly detail?: string,
  ) {
    super(message);
    this.name = "PreviewStorageError";
  }
}

/**
 * 바인딩을 꺼낸다. Workers 밖(`next dev`·테스트)에서는 `null`.
 *
 * 호출부는 `null`을 오류로 보지 말고 기존 Supabase `theme-public` 경로로 fallback한다.
 * 전환 기간에 어차피 필요한 경로라 로컬 전용 분기를 따로 만들지 않는다.
 */
export function getPreviewBucket(): PreviewBucket | null {
  try {
    const env = getCloudflareContext().env as unknown as Record<string, unknown>;
    const bucket = env[previewBindingName];
    return isPreviewBucket(bucket) ? bucket : null;
  } catch {
    return null;
  }
}

/**
 * content-addressed preview 키.
 *
 * 계획 §8.1이 `?v=` cache busting을 금지하므로 내용이 바뀌면 키 자체가 바뀌어야 한다. sha256을
 * 키에 넣으면 그것이 자동으로 성립하고, 같은 파생물이 여러 템플릿에서 나와도 객체는 하나다.
 */
export function previewObjectKey(sha256: string, contentType: PreviewContentType) {
  if (!/^[0-9a-f]{64}$/.test(sha256)) {
    throw new PreviewStorageError("invalid_preview_key", "미리보기 경로가 올바르지 않습니다.", "sha256");
  }
  return `${previewKeyPrefix}/${sha256.slice(0, 2)}/${sha256}.${contentType === "image/png" ? "png" : "webp"}`;
}

export function assertPreviewObjectKey(objectKey: string) {
  if (
    !objectKey.startsWith(`${previewKeyPrefix}/`)
    || objectKey.includes("..")
    || objectKey.includes("//")
    || objectKey.includes("\\")
    || objectKey.length > 512
  ) {
    throw new PreviewStorageError("invalid_preview_key", "미리보기 경로가 올바르지 않습니다.", objectKey.slice(0, 80));
  }
  return objectKey;
}

/**
 * preview 파생물을 올리고 곧바로 확인한다.
 *
 * `put`이 성공해도 HEAD로 크기를 대조한다. registry가 기록한 preview가 실제로 서빙 가능한지
 * 확인하지 않으면, 카드가 깨진 뒤에야 알게 된다.
 *
 * 원본 revision을 custom metadata에 남긴다 — 나중에 어느 revision에서 나온 파생물인지 객체만 보고
 * 역추적할 수 있어야 GC와 재굽기 판단이 가능하다.
 */
export async function putPreviewObject(input: {
  bucket: PreviewBucket;
  objectKey: string;
  bytes: Uint8Array;
  contentType: PreviewContentType;
  sha256: string;
  sourceRevision: number;
}): Promise<{ objectKey: string; sizeBytes: number }> {
  const objectKey = assertPreviewObjectKey(input.objectKey);

  try {
    await input.bucket.put(objectKey, input.bytes, {
      httpMetadata: { contentType: input.contentType, cacheControl: previewCacheControl },
      customMetadata: { sha256: input.sha256, sourceRevision: String(input.sourceRevision) },
    });
  } catch (error) {
    throw new PreviewStorageError(
      "preview_upload_failed",
      "미리보기 업로드에 실패했습니다.",
      error instanceof Error ? error.message.slice(0, 240) : undefined,
    );
  }

  const head = await input.bucket.head(objectKey).catch(() => null);
  if (!head) {
    throw new PreviewStorageError("preview_verify_failed", "미리보기 업로드를 확인하지 못했습니다.", "head returned null");
  }
  if (head.size !== input.bytes.byteLength) {
    throw new PreviewStorageError(
      "preview_verify_failed",
      "미리보기 크기가 기록과 일치하지 않습니다.",
      `expected ${input.bytes.byteLength}, got ${head.size}`,
    );
  }
  return { objectKey, sizeBytes: head.size };
}

function isPreviewBucket(value: unknown): value is PreviewBucket {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<PreviewBucket>;
  return typeof candidate.put === "function" && typeof candidate.head === "function";
}
