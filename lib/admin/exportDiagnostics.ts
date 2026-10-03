export type DiagnosticsFilters = { days: 1 | 7 | 30; platform: "android" | "ios" | null; backend: "worker" | "cloud_run" | "unknown" | null };
export type DiagnosticsSummary = { platform: string; total: number; succeeded: number; failed: number; pending: number; duration_count: number; duration_null_count: number; p50: number | null; p95: number | null };
export type DiagnosticsFailure = { platform: string; backend: string; stage: string; error_code: string; count: number };
export type DiagnosticsJob = { id: string; platform: string; backend: string; stage: string; error_code?: string; created_at: string };
export type ExportDiagnostics = { summary: DiagnosticsSummary[]; failures: DiagnosticsFailure[]; catalog: { catalog: boolean; total: number; failed: number }[]; recent: DiagnosticsJob[]; stale: DiagnosticsJob[]; stale_count: number };

export function safeDiagnosticErrorCode(value: unknown): string {
  return typeof value === "string" && value.length <= 64 && /^[a-z0-9_.-]+$/.test(value) ? value : "unknown";
}

export function diagnosticsFilters(params: Record<string, string | string[] | undefined>): DiagnosticsFilters {
  return {
    days: params.days === "1" ? 1 : params.days === "30" ? 30 : 7,
    platform: params.platform === "android" || params.platform === "ios" ? params.platform : null,
    backend: params.backend === "worker" || params.backend === "cloud_run" || params.backend === "unknown" ? params.backend : null,
  };
}

/** Rolling elapsed-day window, inclusive start / exclusive end, using one captured clock. */
export function diagnosticsPeriod(days: number, now = new Date()) {
  return { start: new Date(now.getTime() - days * 86_400_000).toISOString(), end: now.toISOString() };
}

export function diagnosticRate(count: number, total: number): string {
  return total === 0 ? "—" : `${(count / total * 100).toFixed(1)}%`;
}
