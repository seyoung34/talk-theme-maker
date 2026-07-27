import { readJsonResponse } from "@/lib/shared/api/http";
import { mapWithConcurrency } from "@/lib/shared/concurrency";

export const themeAssetsBucketName = "theme-assets";
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
