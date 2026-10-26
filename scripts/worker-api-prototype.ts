// LOCAL PROFILING ONLY. No route, deployment config, or remote binding.
import { apiFastPath, type FastPathEnvironment } from "../lib/cloudflare/apiFastPath";
import { workerPublicConfig } from "../.worker-public-config.mjs";
export default {
  fetch(request: Request, env: FastPathEnvironment) {
    return apiFastPath(request, {...env,...workerPublicConfig}) ?? new Response(null,{status:404});
  },
};
