import type { Config } from "./config.js";
import type { Sample } from "./model.js";
import { MonitorHttpError, object, readBoundedJson, requestData } from "./http.js";

const query = `query MonitorWorkers($accountTag: string, $start: string, $end: string, $scriptName: string) {
  viewer { accounts(filter: {accountTag: $accountTag}) {
    workersInvocationsAdaptive(limit: 100, filter: {
      scriptName: $scriptName, datetime_geq: $start, datetime_leq: $end
    }) { dimensions { status } sum { requests errors } }
  } }
}`;

export function metricsWindow(now: number) {
  // Closed, non-overlapping five-minute windows, with two minutes for ingestion.
  const end = Math.floor((now - 120000) / 300000) * 300000;
  return { from: end - 300000, to: end - 1, id: String(end) };
}

export function parseMetrics(payload: unknown) {
  const root = object(payload);
  if (root.errors !== undefined && root.errors !== null && (!Array.isArray(root.errors) || root.errors.length)) throw new MonitorHttpError("invalid_response");
  const accounts = object(object(root.data).viewer).accounts;
  if (!Array.isArray(accounts) || accounts.length !== 1) throw new MonitorHttpError("invalid_response");
  const rows = object(accounts[0]).workersInvocationsAdaptive;
  if (!Array.isArray(rows) || rows.length >= 100) throw new MonitorHttpError("invalid_response");
  let requests = 0, failures = 0, successes = 0, unclassified = 0;
  const failureStatuses = new Set(["exceededResources", "scriptThrewException", "internalError"]);
  for (const raw of rows) {
    const row = object(raw), sum = object(row.sum), status = object(row.dimensions).status;
    if (typeof status !== "string" || typeof sum.requests !== "number" || typeof sum.errors !== "number"
      || !Number.isFinite(sum.requests) || !Number.isFinite(sum.errors) || sum.requests < 0
      || sum.errors < 0 || sum.errors > sum.requests) throw new MonitorHttpError("invalid_response");
    requests += sum.requests;
    if (failureStatuses.has(status)) failures += sum.requests;
    else if (status === "success") successes += sum.requests;
    else if (!["canceled", "clientDisconnected"].includes(status)) unclassified += sum.requests;
  }
  if (![requests, failures, successes, unclassified].every(Number.isFinite)) throw new MonitorHttpError("invalid_response");
  return { requests, failures, successes, unclassified };
}

export async function collectMetrics(config: Config, now: number, fetcher: typeof fetch = fetch): Promise<Sample[]> {
  const window = metricsWindow(now);
  const base = { at: now, observationId: window.id };
  try {
    const metrics = parseMetrics(await requestData("https://api.cloudflare.com/client/v4/graphql", {
      method: "POST", headers: { authorization: `Bearer ${config.cloudflareToken}`, "content-type": "application/json" },
      body: JSON.stringify({ query, variables: {
        accountTag: config.accountTag, scriptName: config.scriptName,
        start: new Date(window.from).toISOString(), end: new Date(window.to).toISOString(),
      } }),
    }, readBoundedJson, fetcher));
    const failed = metrics.failures >= config.policy.runtimeFailureCount
      && metrics.requests > 0 && metrics.failures / metrics.requests >= config.policy.runtimeFailureRate;
    return [
      { ...base, observationId: String(now), source: "cloudflare_collector", outcome: metrics.unclassified ? "failed" : "healthy", code: metrics.unclassified ? "unclassified_outcome" : "collection_ok" },
      { ...base, source: "cloudflare_runtime", outcome: failed ? "failed" : metrics.successes > 0 && !metrics.unclassified ? "healthy" : "unknown",
        code: failed ? "runtime_failure_candidates" : metrics.requests ? "runtime_window_observed" : "no_invocations",
        requests: metrics.requests, failures: metrics.failures },
    ];
  } catch (error) {
    // Failed queries use tick ID so consecutive collection failures can be detected.
    return [
      { at: now, observationId: String(now), source: "cloudflare_collector", outcome: "failed", code: error instanceof MonitorHttpError ? error.code : "collection_failed" },
      { ...base, source: "cloudflare_runtime", outcome: "unknown", code: "collection_unavailable" },
    ];
  }
}

export async function collectHealth(config: Config, now: number, fetcher: typeof fetch = fetch): Promise<Sample[]> {
  const probes: { source: "public_http" | "session_http" | "readiness"; path: string; headers: Record<string, string>; read: (response: Response) => Promise<void> }[] = [
    { source: "public_http" as const, path: "/", headers: {}, read: async (response: Response) => {
      if (!response.headers.get("content-type")?.includes("text/html")) throw new MonitorHttpError("invalid_response");
      // Read only a bounded prefix and cancel. Full SSR/editor correctness is login QA.
      const reader = response.body?.getReader();
      if (!reader) throw new MonitorHttpError("invalid_response");
      try {
        const first = await reader.read();
        if (first.done || !first.value.byteLength) throw new MonitorHttpError("invalid_response");
      } finally { await reader.cancel().catch(() => undefined); reader.releaseLock(); }
    } },
    { source: "session_http" as const, path: "/api/session", headers: {}, read: async (response: Response) => {
      const value = object(await readBoundedJson(response));
      if (value.user !== null || value.isAdmin !== false) throw new MonitorHttpError("invalid_response");
    } },
    { source: "readiness" as const, path: "/api/internal/ops/readiness", headers: { authorization: `Bearer ${config.readinessToken}` }, read: async (response: Response) => {
      const value = object(await readBoundedJson(response));
      if (response.status === 503 && value.ready === false && value.reason === "database_unavailable") throw new MonitorHttpError("database_unavailable");
      if (value.ready !== true) throw new MonitorHttpError("invalid_response");
    } },
  ];
  return Promise.all(probes.map(async probe => {
    try {
      await requestData(config.origin + probe.path, { headers: probe.headers, cache: "no-store" }, probe.read, fetcher, 5000, probe.source === "readiness" ? [503] : []);
      return { source: probe.source, outcome: "healthy" as const, code: "probe_ok", observationId: String(now), at: now };
    } catch (error) {
      return { source: probe.source, outcome: "failed" as const, code: error instanceof MonitorHttpError ? error.code : "probe_failed", observationId: String(now), at: now };
    }
  }));
}
