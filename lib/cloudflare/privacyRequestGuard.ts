// OpenNext 1.20's cache interceptor does not check the HTTP method. Preserve
// Next's 405 for this read-only page; Server Actions still go through Next.
export function guardPrivacyMethod(request: Request): Response | undefined {
  if (request.method === "GET" || request.method === "HEAD" ||
      request.headers.get("next-action") || !policyCachePaths.includes(new URL(request.url).pathname)) {
    return undefined;
  }
  return new Response(new TextEncoder().encode("Method Not Allowed"), {
    status: 405,
    headers: { Allow: "GET,HEAD" },
  });
}
import { policyCachePaths } from "./policyCachePaths.mjs";
