export const themeAssetsBucketName = "theme-assets";

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

  for (let index = 0; index < missing.length; index += 50) {
    const paths = missing.slice(index, index + 50);
    const response = await fetch("/api/theme-assets/signed-urls", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paths }),
    });
    const payload = await readJsonResponse<{ signedUrls?: Record<string, string>; error?: string }>(response);
    if (response.status === 404) {
      const fallbackUrls = await getThemeAssetSignedUrlsIndividually(paths);
      for (const [path, signedUrl] of Object.entries(fallbackUrls)) {
        setCachedSignedUrl(path, signedUrl);
        result[path] = signedUrl;
      }
      continue;
    }
    if (!response.ok || !payload.signedUrls) {
      throw new Error(payload.error ?? "Theme asset URL could not be created.");
    }
    for (const [path, signedUrl] of Object.entries(payload.signedUrls)) {
      setCachedSignedUrl(path, signedUrl);
      result[path] = signedUrl;
    }
  }
  return result;
}

async function getThemeAssetSignedUrlsIndividually(storagePaths: string[]) {
  const signedUrls: Record<string, string> = {};
  for (const path of storagePaths) {
    const response = await fetch("/api/theme-assets/signed-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path }),
    });
    const payload = await readJsonResponse<{ signedUrl?: string; error?: string }>(response);
    if (!response.ok || !payload.signedUrl) {
      throw new Error(payload.error ?? `Theme asset URL could not be created: ${path}`);
    }
    signedUrls[path] = payload.signedUrl;
  }
  return signedUrls;
}

async function readJsonResponse<T extends { error?: string }>(response: Response): Promise<T> {
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return response.json() as Promise<T>;
  }
  const text = await response.text().catch(() => "");
  const excerpt = text.replace(/\s+/g, " ").slice(0, 120);
  return { error: excerpt ? `Unexpected non-JSON response (${response.status}): ${excerpt}` : `Unexpected non-JSON response (${response.status}).` } as T;
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
