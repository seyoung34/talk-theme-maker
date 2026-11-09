import { createAdminClient } from "@/lib/supabase/server";
import { parseTemplateUsage, type TemplateUsage } from "./exportTemplateUsage";
import type { Loaded } from "./overview";

/** Call only after requireAdmin. Counts and names are aggregated entirely in SQL. */
export async function loadExportTemplateUsage(period: { start: string; end: string }, includeAdmins: boolean): Promise<Loaded<TemplateUsage>> {
  try {
    const { data, error } = await createAdminClient().rpc("admin_export_template_usage", {
      p_start: period.start, p_end: period.end, p_include_admins: includeAdmins,
    });
    if (error) throw error;
    const usage = parseTemplateUsage(data);
    // 요청한 필터와 다르게 집계된 응답은 다른 기준의 숫자이므로 보여주지 않는다.
    if (!usage || usage.include_admins !== includeAdmins) throw new Error("invalid_template_usage_response");
    return { ok: true, value: usage };
  } catch {
    // Do not log raw database error bodies or convert a failed lookup to a zero count.
    console.warn("Admin export template usage lookup failed.");
    return { ok: false };
  }
}
