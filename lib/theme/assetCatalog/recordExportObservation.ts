import { createAdminClient } from "@/lib/supabase/server";

/** Observation never changes the outcome of reservation, build or settlement. */
export async function recordExportCatalogObservation(jobId: string, assetIds: readonly string[], hasUnobservedSources: boolean): Promise<void> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 1000);
    try {
      const { error } = await createAdminClient().rpc("record_export_catalog_observation", {
        p_job_id: jobId,
        p_asset_ids: [...assetIds],
        p_has_unobserved_sources: hasUnobservedSources,
      }).abortSignal(controller.signal);
      if (error) console.warn("export_catalog_observation_failed");
    } finally {
      clearTimeout(timer);
    }
  } catch {
    console.warn("export_catalog_observation_failed");
  }
}
