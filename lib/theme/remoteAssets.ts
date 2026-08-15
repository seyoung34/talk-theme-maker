import { readJsonResponse } from "@/lib/shared/api/http";
import { mapWithConcurrency } from "@/lib/shared/concurrency";
import { supabaseUrl } from "@/lib/supabase/config";
import { themeAssetSignedUrlTtlSeconds } from "@/lib/theme/themeAssetSigning";

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
/**
 * 받아 둔 URL을 얼마나 재사용할지.
 *
 * 서버가 발급하는 수명(`themeAssetSignedUrlTtlSeconds`)에서 갱신 여유만 빼고 그대로 쓴다.
 * 여기가 짧으면 서버 수명을 늘려도 클라이언트가 먼저 새 URL을 받아 오고, URL이 바뀌는 순간
 * 브라우저 캐시가 무효가 된다 — 캐시가 걸리게 하려면 두 값이 같이 길어야 한다.
 */
const signedUrlRefreshBufferMs = 60 * 60 * 1000;
const signedUrlTtlMs = themeAssetSignedUrlTtlSeconds * 1000 - signedUrlRefreshBufferMs;
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
  // 영속 캐시는 localStorage 동기 read + 전체 JSON.parse다. 경로마다 한 번씩 돌면 에셋 수십 개짜리
  // 템플릿의 부트스트랩에서 그만큼 main thread를 잡는다. 이 호출당 한 번만 읽는다.
  let persistentCache: Record<string, SignedUrlCacheEntry> | null = null;
  for (const path of uniquePaths) {
    const memory = memorySignedUrlCache.get(path);
    if (memory && isFreshSignedUrlEntry(memory)) {
      result[path] = memory.signedUrl;
      continue;
    }
    persistentCache ??= readPersistentSignedUrlCache();
    const persistent = persistentCache[path];
    if (persistent && isFreshSignedUrlEntry(persistent)) {
      memorySignedUrlCache.set(path, persistent);
      result[path] = persistent.signedUrl;
      continue;
    }
    missing.push(path);
  }
  if (!missing.length) return result;

  // 템플릿 하나가 수십 개 에셋을 참조한다. 배치를 순차로 돌리면 편집기 부트스트랩에
  // 왕복 지연이 그대로 쌓이므로 배치들을 병렬로 요청한다.
  const batches: string[][] = [];
  for (let index = 0; index < missing.length; index += signedUrlBatchSize) {
    batches.push(missing.slice(index, index + signedUrlBatchSize));
  }

  const batchResults = await mapWithConcurrency(batches, signedUrlBatchConcurrency, requestSignedUrlBatch);
  const fetched: [string, SignedUrlCacheEntry][] = [];
  const expiresAt = Date.now() + signedUrlTtlMs;
  for (const batch of batchResults) {
    for (const [path, signedUrl] of Object.entries(batch)) {
      const entry = { signedUrl, expiresAt };
      memorySignedUrlCache.set(path, entry);
      result[path] = signedUrl;
      fetched.push([path, entry]);
    }
  }

  // 받은 것을 모아 한 번만 직렬화한다. 경로마다 쓰면 stringify + localStorage write가 그 수만큼 반복된다.
  if (fetched.length) {
    // 네트워크 요청을 기다리는 동안 같은 탭의 다른 호출이 캐시를 갱신할 수 있다. 조회 초기에 읽은
    // snapshot을 그대로 쓰면 나중에 끝난 호출이 먼저 저장된 항목을 지우므로, commit 직전에 최신
    // 저장본을 다시 읽어 이번 결과만 병합한다. 다중 탭 간 원자적 갱신까지는 보장하지 않는다.
    const cache = readPersistentSignedUrlCache();
    for (const [path, entry] of fetched) cache[path] = entry;
    writePersistentSignedUrlCache(cache);
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

function isFreshSignedUrlEntry(entry: SignedUrlCacheEntry) {
  return Boolean(entry.signedUrl) && entry.expiresAt - signedUrlRefreshBufferMs > Date.now();
}

function readPersistentSignedUrlCache(): Record<string, SignedUrlCacheEntry> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(signedUrlCacheKey);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, SignedUrlCacheEntry>;
    // 만료 항목은 읽는 김에 걸러 낸다. 걸러진 객체를 그대로 다시 쓰므로 저장본도 함께 정리된다.
    return Object.fromEntries(Object.entries(parsed).filter(([, entry]) => entry && isFreshSignedUrlEntry(entry)));
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
