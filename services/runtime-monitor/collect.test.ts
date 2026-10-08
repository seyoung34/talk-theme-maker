import { describe, expect, it, vi } from "vitest";
import { collectHealth, collectMetrics, metricsWindow, parseMetrics } from "./collect";
import { readConfig } from "./config";
export const fixtureEnv = {
  MONITOR_TARGET_ORIGIN: "https://site.test", MONITOR_CF_ACCOUNT_TAG: "a".repeat(32),
  MONITOR_CF_SCRIPT_NAME: "talk-theme-maker", MONITOR_READINESS_TOKEN: "r".repeat(32),
  MONITOR_STATE_BUCKET: "monitor-fixture-bucket", MONITOR_CF_API_TOKEN: "private-cf-token",
  MONITOR_FAILURE_CHECKS: "2", MONITOR_RECOVERY_CHECKS: "2", MONITOR_COOLDOWN_SECONDS: "300",
  MONITOR_RUNTIME_FAILURE_COUNT: "5", MONITOR_RUNTIME_FAILURE_PERCENT: "5",
};
const config = readConfig(fixtureEnv);
const row = (status: string, requests: number, errors = 0) => ({ dimensions: { status }, sum: { requests, errors } });
const payload = (rows: unknown[]) => ({ data: { viewer: { accounts: [{ workersInvocationsAdaptive: rows }] } }, errors: null });
describe("bounded HTTP and GraphQL evidence", () => {
  it("uses closed disjoint windows and queries status aggregates, not raw paths or CPU thresholds", async () => {
    const now = 1000000, window = metricsWindow(now);
    expect(window.to + 1).toBe(window.from + 300000);
    expect(metricsWindow(now + 300000).from).toBe(window.to + 1);
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json(payload([row("success", 95), row("exceededResources", 5, 5)])));
    const result = await collectMetrics(config, now, fetcher);
    expect(result).toContainEqual(expect.objectContaining({ source: "cloudflare_runtime", outcome: "failed", requests: 100, failures: 5 }));
    const request = JSON.parse(String(fetcher.mock.calls[0][1]?.body));
    expect(request.query).not.toMatch(/cpuTime|dimensions.*datetime/);
    expect(request.variables.end).toBe(new Date(window.to).toISOString());
    expect(fetcher.mock.calls[0][1]?.redirect).toBe("manual");
  });
  it("high CPU and canceled invocations alone are not runtime failures", () => {
    expect(parseMetrics(payload([{ ...row("success", 1), quantiles: { cpuTimeP99: 1000000 } }, row("canceled", 5)]))).toMatchObject({ failures: 0, successes: 1 });
  });
  it.each([
    { errors: [{ message: "private-error" }], data: null },
    { data: { viewer: { accounts: [] } } },
    payload(Array.from({ length: 100 }, () => row("success", 1))),
    payload([row("success", -1)]),
    payload([row("success", 1, 2)]),
  ])("query errors, missing account, truncation and invalid counters remain collection failures", async data => {
    const result = await collectMetrics(config, 1000000, vi.fn<typeof fetch>().mockResolvedValue(Response.json(data)));
    expect(result).toContainEqual(expect.objectContaining({ source: "cloudflare_collector", outcome: "failed" }));
    expect(result).toContainEqual(expect.objectContaining({ source: "cloudflare_runtime", outcome: "unknown" }));
    expect(JSON.stringify(result)).not.toContain("private-error");
  });
  it("empty windows and unknown status do not falsely recover runtime incidents", async () => {
    for (const rows of [[], [row("newProviderStatus", 1)], [row("canceled", 1)]]) {
      const result = await collectMetrics(config, 1000000, vi.fn<typeof fetch>().mockResolvedValue(Response.json(payload(rows))));
      expect(result.find(s => s.source === "cloudflare_runtime")?.outcome).toBe("unknown");
    }
  });
  it("probes fixed URLs, sends readiness credential only to its own endpoint and isolates probe failures", async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async url => {
      if (String(url).endsWith("/api/session")) return new Response("private-provider-error", { status: 500 });
      if (String(url).endsWith("/readiness")) return Response.json({ ready: true });
      return new Response("<html>fixture</html>", { headers: { "content-type": "text/html" } });
    });
    const samples = await collectHealth(config, 1000000, fetcher);
    expect(samples.map(s => s.outcome)).toEqual(["healthy", "failed", "healthy"]);
    expect(fetcher.mock.calls.slice(0, 2).every(([, init]) => !new Headers(init?.headers).has("authorization"))).toBe(true);
    expect(new Headers(fetcher.mock.calls[2][1]?.headers).get("authorization")).toContain(config.readinessToken);
    expect(JSON.stringify(samples)).not.toContain("private-provider");
  });
  it("distinguishes authenticated database unavailability from generic HTTP/configuration failure", async () => {
    for (const reason of ["database_unavailable", "other"]) {
      const fetcher = vi.fn<typeof fetch>().mockImplementation(async url =>
        String(url).endsWith("/readiness")
          ? Response.json({ ready: false, reason }, { status: 503 })
          : String(url).endsWith("/api/session")
            ? Response.json({ user: null, isAdmin: false })
            : new Response("<html>fixture</html>", { headers: { "content-type": "text/html" } }));
      const samples = await collectHealth(config, 1000000, fetcher);
      expect(samples[2]).toMatchObject({ source: "readiness", outcome: "failed", code: reason === "database_unavailable" ? reason : "invalid_response" });
    }
  });
});
