import { readJsonResponse } from "@/lib/shared/api/http";
import { mapWithConcurrency } from "@/lib/shared/concurrency";
import { supabaseUrl } from "@/lib/supabase/config";

export const themeAssetsBucketName = "theme-assets";

/**
 * 공개 버킷. 갤러리 카드 썸네일처럼 **보호할 이유가 없는** 이미지만 담는다.
 *
 * 원본 에셋은 `theme-assets`(비공개)에 남는다. 그쪽은 내보내기 결과물에 들어가는 재료라
 * 앱을 거치지 않고 받아갈 수 있으면 안 된다.
 */
export const themePublicBucketName = "theme-public";

/**
 * 공개 버킷 객체의 영구 URL.
 *
 * 서명하지 않으므로 만료가 없다. 갤러리가 URL을 오래 들고 있어도 깨지지 않는다.
 * Supabase URL이 없는 환경(e2e 빌드 등)에서는 `undefined`를 돌려주고, 호출부가 색상만으로
 * 카드를 그린다.
 *
 * `version`을 주면 `?v=`로 붙인다. 썸네일은 저장 경로가 `system-templates/<id>/preview/card.webp`로
 * 고정돼 있고 업로드 시 `cacheControl: "3600"`을 설정하므로, 재굽기로 내용이 바뀌어도 URL이 그대로면
 * 브라우저/CDN이 최대 1시간 동안 이전 이미지를 계속 돌려준다. 저장 시각(예: `updatedAt`)처럼 저장할
 * 때마다 바뀌는 값을 넘기면 재굽기 직후에도 새 이미지를 받는다.
 */
export function getPublicThemeAssetUrl(storagePath: string | undefined, version?: number | string) {
  if (!storagePath || !supabaseUrl) return undefined;
  const url = `${supabaseUrl}/storage/v1/object/public/${themePublicBucketName}/${storagePath.split("/").map(encodeURIComponent).join("/")}`;
  return version !== undefined ? `${url}?v=${encodeURIComponent(String(version))}` : url;
}
// 서버 라우트의 maxSignedUrlPaths(50)와 맞춘다.
const signedUrlBatchSize = 50;
const signedUrlBatchConcurrency = 4;
const signedUrlRequestConcurrency = 6;

const signedUrlCacheKey = "kakaotalk-theme-maker:signed-url-cache:v1";
const signedUrlTtlMs = 9 * 60 * 1000;
const signedUrlRefreshBufferMs = 30 * 1000;
const memorySignedUrlCache = new Map<string, SignedUrlCacheEntry>();

type SignedUrlCacheEntry = {
  signedUrl: string;
  expiresAt: number;
};

export async function getThemeAssetSignedUrl(storagePath: string) {
  const urls = await getThemeAssetSignedUrls([storagePath]);
  const signedUrl = urls[storagePath];
  if (!signedUrl) throw new Error("Theme asset URL could not be created.");
  return signedUrl;
}

export async function getThemeAssetSignedUrls(storagePaths: string[]) {
  const uniquePaths = Array.from(new Set(storagePaths.filter(Boolean)));
  const result: Record<string, string> = {};
  const missing: string[] = [];
  for (const path of uniquePaths) {
    const cached = getCachedSignedUrl(path);
    if (cached) result[path] = cached;
    else missing.push(path);
  }
  if (!missing.length) return result;

  // 템플릿 하나가 수십 개 에셋을 참조한다. 배치를 순차로 돌리면 편집기 부트스트랩에
  // 왕복 지연이 그대로 쌓이므로 배치들을 병렬로 요청한다.
  const batches: string[][] = [];
  for (let index = 0; index < missing.length; index += signedUrlBatchSize) {
    batches.push(missing.slice(index, index + signedUrlBatchSize));
  }

  const batchResults = await mapWithConcurrency(batches, signedUrlBatchConcurrency, requestSignedUrlBatch);
  for (const batch of batchResults) {
    for (const [path, signedUrl] of Object.entries(batch)) {
      setCachedSignedUrl(path, signedUrl);
      result[path] = signedUrl;
    }
  }
  return result;
}

async function requestSignedUrlBatch(paths: string[]) {
  const response = await fetch("/api/theme-assets/signed-urls", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ paths }),
  });
  const payload = await readJsonResponse<{ signedUrls?: Record<string, string>; error?: string }>(response);
  // 배치 엔드포인트가 배포되지 않은 환경에서는 단건 엔드포인트로 되돌아간다.
  if (response.status === 404) return getThemeAssetSignedUrlsIndividually(paths);
  if (!response.ok || !payload.signedUrls) {
    throw new Error(payload.error ?? "Theme asset URL could not be created.");
  }
  return payload.signedUrls;
}

async function getThemeAssetSignedUrlsIndividually(storagePaths: string[]) {
  const signedUrls: Record<string, string> = {};
  const responses = await mapWithConcurrency(storagePaths, signedUrlRequestConcurrency, async (path) => {
    const response = await fetch("/api/theme-assets/signed-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path }),
    });
    const payload = await readJsonResponse<{ signedUrl?: string; error?: string }>(response);
    if (!response.ok || !payload.signedUrl) {
      throw new Error(payload.error ?? `Theme asset URL could not be created: ${path}`);
    }
    return { path, signedUrl: payload.signedUrl };
  });

  for (const { path, signedUrl } of responses) signedUrls[path] = signedUrl;
  return signedUrls;
}

export async function storagePathToFile(storagePath: string, fileName: string, mimeType = "application/octet-stream") {
  const signedUrl = await getThemeAssetSignedUrl(storagePath);
  const response = await fetch(signedUrl);
  if (!response.ok) throw new Error(`Theme asset could not be downloaded: ${storagePath}`);
  const blob = await response.blob();
  return new File([blob], fileName, { type: mimeType || blob.type || "application/octet-stream" });
}

export async function storagePathToPreviewUrl(storagePath: string) {
  return getThemeAssetSignedUrl(storagePath);
}

export function sanitizeStoragePathPart(value: string) {
  return (
    value
      .normalize("NFKD")
      .replace(/[^\w.\-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 96) || "asset"
  );
}

function getCachedSignedUrl(storagePath: string) {
  const now = Date.now();
  const memory = memorySignedUrlCache.get(storagePath);
  if (memory && memory.expiresAt - signedUrlRefreshBufferMs > now) return memory.signedUrl;

  const persistent = readPersistentSignedUrlCache()[storagePath];
  if (persistent && persistent.expiresAt - signedUrlRefreshBufferMs > now) {
    memorySignedUrlCache.set(storagePath, persistent);
    return persistent.signedUrl;
  }

  return null;
}

function setCachedSignedUrl(storagePath: string, signedUrl: string) {
  const entry = { signedUrl, expiresAt: Date.now() + signedUrlTtlMs };
  memorySignedUrlCache.set(storagePath, entry);

  const cache = readPersistentSignedUrlCache();
  cache[storagePath] = entry;
  writePersistentSignedUrlCache(cache);
}

function readPersistentSignedUrlCache(): Record<string, SignedUrlCacheEntry> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(signedUrlCacheKey);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, SignedUrlCacheEntry>;
    const now = Date.now();
    return Object.fromEntries(Object.entries(parsed).filter(([, entry]) => entry?.signedUrl && entry.expiresAt - signedUrlRefreshBufferMs > now));
  } catch {
    return {};
  }
}

function writePersistentSignedUrlCache(cache: Record<string, SignedUrlCacheEntry>) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(signedUrlCacheKey, JSON.stringify(cache));
  } catch {
    // Ignore quota/privacy-mode failures; memory cache still works for this session.
  }
}
