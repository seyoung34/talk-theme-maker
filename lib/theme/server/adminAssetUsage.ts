import "server-only";
import { createAdminClient } from "@/lib/supabase/server";
import { buildAdminAssetUsageIndex } from "@/lib/theme/adminAssetUsage";
import { annotateAdminAssetAppliedUsage } from "@/lib/theme/adminAssetAppliedUsage";

/** Each variant is visited once. Keyset pagination avoids the old 500-row blind spot. */
export async function readAdminAssetUsageIndex({ includeApplied = true }: { includeApplied?: boolean } = {}) {
  const admin = createAdminClient();
  const { ids: knownAdminIds, complete: inventoryComplete } = await readAdminIds(admin);
  const rows: Parameters<typeof buildAdminAssetUsageIndex>[0] = [];
  let cursor: string | undefined;
  const batchSize = 200;
  const maxRows = 10000;
  const finish = (complete: boolean) => {
    const index = buildAdminAssetUsageIndex(rows, complete && inventoryComplete, knownAdminIds);
    return includeApplied ? annotateAdminAssetAppliedUsage(index, rows, knownAdminIds) : index;
  };
  while (rows.length < maxRows) {
    let query = admin.from("system_template_variants")
      .select("id,platform,base_template_id,candidate_selections,upload_refs,system_template_bundles!inner(id,title,status,visibility)")
      .order("id", { ascending: true }).limit(batchSize);
    if (cursor) query = query.gt("id", cursor);
    const { data, error } = await query;
    if (error) {
      if (rows.length) return finish(false);
      throw error;
    }
    rows.push(...data);
    if (data.length < batchSize) return finish(true);
    cursor = data[data.length - 1].id;
  }
  return finish(false);
}

/** Saved upload IDs retain admin identity even when original bytes were copied to a template. */
async function readAdminIds(admin: ReturnType<typeof createAdminClient>) {
  const ids = new Set<string>();
  let cursor: string | undefined;
  for (let page = 0; page < 50; page++) {
    let query = admin.from("admin_assets").select("id").order("id", { ascending: true }).limit(200);
    if (cursor) query = query.gt("id", cursor);
    const { data, error } = await query;
    if (error) {
      if (ids.size) return { ids, complete: false };
      throw error;
    }
    for (const row of data) ids.add(row.id);
    if (data.length < 200) return { ids, complete: true };
    cursor = data[data.length - 1].id;
  }
  return { ids, complete: false };
}
