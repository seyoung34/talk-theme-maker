import "server-only";
import { createAdminClient } from "@/lib/supabase/server";
import { buildAdminAssetUsageIndex } from "@/lib/theme/adminAssetUsage";

/** Each variant is visited once. Keyset pagination avoids the old 500-row blind spot. */
export async function readAdminAssetUsageIndex() {
  const admin = createAdminClient();
  const rows: Parameters<typeof buildAdminAssetUsageIndex>[0] = [];
  let cursor: string | undefined;
  const batchSize = 200;
  const maxRows = 10000;
  while (rows.length < maxRows) {
    let query = admin.from("system_template_variants")
      .select("id,platform,upload_refs,system_template_bundles!inner(id,title,status,visibility)")
      .order("id", { ascending: true }).limit(batchSize);
    if (cursor) query = query.gt("id", cursor);
    const { data, error } = await query;
    if (error) throw error;
    rows.push(...data);
    if (data.length < batchSize) return buildAdminAssetUsageIndex(rows);
    cursor = data[data.length - 1].id;
  }
  return buildAdminAssetUsageIndex(rows, false);
}
