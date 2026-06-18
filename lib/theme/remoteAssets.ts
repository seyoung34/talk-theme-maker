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
  const cached = getCachedSignedUrl(storagePath);
  if (cached) return cached;

  const response = await fetch("/api/theme-assets/signed-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path: storagePath }),
  });
  const payload = (await response.json()) as { signedUrl?: string; error?: string };
  if (!response.ok || !payload.signedUrl) {
    throw new Error(payload.error ?? "Theme asset URL could not be created.");
  }
  setCachedSignedUrl(storagePath, payload.signedUrl);
  return payload.signedUrl;
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
