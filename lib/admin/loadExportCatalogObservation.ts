import { createAdminClient } from "@/lib/supabase/server";
import { parseCatalogObservation, type CatalogObservation } from "./exportCatalogObservation";
import type { Loaded } from "./overview";

/** Call only after requireAdmin. Counts are aggregated in SQL; names are looked up separately and may be missing. */
export async function loadExportCatalogObservation(period: { start: string; end: string }): Promise<Loaded<CatalogObservation>> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("admin_export_catalog_observation", { p_start: period.start, p_end: period.end });
    if (error) throw error;
    const aggregate = parseCatalogObservation(data);
    if (!aggregate) throw new Error("invalid_catalog_observation_response");
    const names = new Map<string, { title: string; assetKind: string | null }>();
    if (aggregate.assets.length > 0) {
      // 이름 조회 실패는 집계를 숨기지 않는다. 삭제된 에셋과 같이 "이름 미확인"으로 표시한다.
      const { data: rows, error: nameError } = await admin
        .from("admin_assets")
        .select("id,title,asset_kind")
        .in("id", aggregate.assets.map((asset) => asset.asset_id));
      if (nameError) console.warn("Admin catalog observation name lookup failed.");
      else for (const row of (rows ?? []) as { id: string; title: unknown; asset_kind: unknown }[]) {
        if (typeof row.title === "string" && row.title.trim()) names.set(row.id.toLowerCase(), { title: row.title, assetKind: typeof row.asset_kind === "string" ? row.asset_kind : null });
      }
    }
    return { ok: true, value: { ...aggregate, assets: aggregate.assets.map((asset) => ({ ...asset, title: names.get(asset.asset_id)?.title ?? null, assetKind: names.get(asset.asset_id)?.assetKind ?? null })) } };
  } catch {
    // Do not log raw database error bodies or convert a failed lookup to a zero count.
    console.warn("Admin export catalog observation lookup failed.");
    return { ok: false };
  }
}
