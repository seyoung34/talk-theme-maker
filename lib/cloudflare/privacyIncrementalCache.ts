import type { IncrementalCache } from "@opennextjs/aws/types/overrides.js";
import dummyCache from "@opennextjs/aws/overrides/incrementalCache/dummy.js";
import staticAssetsCache from "@opennextjs/cloudflare/overrides/incremental-cache/static-assets-incremental-cache";
import { policyCachePaths } from "./policyCachePaths.mjs";

// Only reviewed non-personalized, build-time policy pages opt into read-only SSG.
// Keep the adapter's name so preview/deploy can populate its static assets.
// All other pages and fetch/data cache entries retain the existing dummy cache.
const privacyIncrementalCache: IncrementalCache = {
  name: staticAssetsCache.name,
  get(key, cacheType) {
    return policyCachePaths.includes(key) && (cacheType === undefined || cacheType === "cache")
      ? staticAssetsCache.get(key, cacheType)
      : dummyCache.get(key, cacheType);
  },
  set: (...args) => dummyCache.set(...args),
  delete: (...args) => dummyCache.delete(...args),
};

export default privacyIncrementalCache;
