import { createAdminClient } from "@/lib/supabase/server";
import { safeDiagnosticErrorCode, type DiagnosticsFilters, type ExportDiagnostics } from "./exportDiagnostics";
import type { Loaded } from "./overview";

/** Call only after requireAdmin. Counts and percentiles are computed entirely in SQL. */
export async function loadExportDiagnostics(filters: DiagnosticsFilters, period: { start: string; end: string }): Promise<Loaded<ExportDiagnostics>> {
  try {
    const { data, error } = await createAdminClient().rpc("admin_export_diagnostics", {
      p_start: period.start, p_end: period.end, p_platform: filters.platform, p_backend: filters.backend,
    });
    if (error) throw error;
    if (!data || !Array.isArray(data.summary) || !Array.isArray(data.failures) || !Array.isArray(data.catalog)
      || !Array.isArray(data.recent) || !Array.isArray(data.stale) || typeof data.stale_count !== "number") throw new Error("invalid_diagnostics_response");
    const result = data as ExportDiagnostics;
    return { ok: true, value: {
      ...result,
      failures: result.failures.map((row) => ({ ...row, error_code: safeDiagnosticErrorCode(row.error_code) })),
      recent: result.recent.map((row) => ({ ...row, error_code: safeDiagnosticErrorCode(row.error_code) })),
    } };
  } catch {
    // Do not log raw database error bodies or convert lookup failure to a zero count.
    console.warn("Admin export diagnostics lookup failed.");
    return { ok: false };
  }
}
