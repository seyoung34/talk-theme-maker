import { describe, expect, it } from "vitest";
import { guardPrivacyMethod } from "./privacyRequestGuard";
import { policyCachePaths } from "./policyCachePaths.mjs";

describe("privacy method guard", () => {
  it.each(policyCachePaths.flatMap(path => ["POST", "PUT", "PATCH", "DELETE", "OPTIONS"].map(method => [path, method])))("preserves 405 for %s %s", async (path, method) => {
    const response = guardPrivacyMethod(new Request(`https://example.test${path}?_rsc=1`, { method }));
    expect(response?.status).toBe(405);
    expect(response?.headers.get("allow")).toBe("GET,HEAD");
    expect(await response?.text()).toBe("Method Not Allowed");
  });
  it.each(["GET", "HEAD"])("passes %s through", (method) => {
    expect(guardPrivacyMethod(new Request("https://example.test/privacy", { method }))).toBeUndefined();
  });
  it("lets Next validate Server Actions", () => {
    expect(guardPrivacyMethod(new Request("https://example.test/privacy", {
      method: "POST", headers: { "Next-Action": "invalid" },
    }))).toBeUndefined();
  });
  it.each(["/api/me", "/guide", "/privacy/", "/privacy/child"])("leaves %s routing intact", (path) => {
    expect(guardPrivacyMethod(new Request(`https://example.test${path}`, { method: "POST" }))).toBeUndefined();
  });
});
