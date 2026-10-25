import { defineCloudflareConfig } from "@opennextjs/cloudflare";
import privacyIncrementalCache from "./lib/cloudflare/privacyIncrementalCache";

export default defineCloudflareConfig({
  incrementalCache: privacyIncrementalCache,
  enableCacheInterception: true,
});
