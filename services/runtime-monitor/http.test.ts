import { afterEach, expect, it, vi } from "vitest";
import { readBoundedJson, readBoundedText, requestData } from "./http";
afterEach(() => vi.useRealTimers());
it("rejects oversized body without trusting Content-Length", async () => {
  await expect(readBoundedText(new Response("x".repeat(11)), 10)).rejects.toMatchObject({ code: "response_too_large" });
});
it("deadline includes a stalled body after headers arrive", async () => {
  vi.useFakeTimers();
  const fetcher = vi.fn<typeof fetch>().mockImplementation(async (_url, init) => new Response(new ReadableStream({
    start(controller) { init?.signal?.addEventListener("abort", () => controller.error(new Error("private-body-error"))); },
  })));
  const promise = requestData("https://fixture.test", {}, readBoundedJson, fetcher, 50);
  const assertion = expect(promise).rejects.toMatchObject({ code: "request_timeout" });
  await vi.advanceTimersByTimeAsync(51);
  await assertion;
});
it("redirect responses are rejected without forwarding authorization", async () => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 302, headers: { location: "https://other.test" } }));
  await expect(requestData("https://fixture.test", { headers: { authorization: "private-token" } }, readBoundedJson, fetcher)).rejects.toMatchObject({ code: "http_failed" });
  expect(fetcher).toHaveBeenCalledOnce();
  expect(fetcher.mock.calls[0][1]?.redirect).toBe("manual");
});
