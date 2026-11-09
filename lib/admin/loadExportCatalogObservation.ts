import { createAdminClient } from "@/lib/supabase/server";
import { catalogObservationDisplayLimit, catalogObservationNameBatchSize, parseCatalogObservation, type CatalogObservation } from "./exportCatalogObservation";
import type { Loaded } from "./overview";

type NameRow = { id: string; title: unknown; asset_kind: unknown };
type AdminClient = ReturnType<typeof createAdminClient>;

/** 이름은 표시용 보조 정보다. 어떤 실패(오류 반환·reject·예외)도 이미 성공한 집계를 숨기지 않는다. */
async function loadAssetNames(admin: AdminClient, ids: string[]) {
  const names = new Map<string, { title: string; assetKind: string | null }>();
  try {
    for (let index = 0; index < ids.length; index += catalogObservationNameBatchSize) {
      const { data, error } = await admin
        .from("admin_assets")
        .select("id,title,asset_kind")
        .in("id", ids.slice(index, index + catalogObservationNameBatchSize));
      if (error) throw error;
      for (const row of (data ?? []) as NameRow[]) {
        if (typeof row.id === "string" && typeof row.title === "string" && row.title.trim()) {
          names.set(row.id.toLowerCase(), { title: row.title, assetKind: typeof row.asset_kind === "string" ? row.asset_kind : null });
        }
      }
    }
  } catch {
    // 일부만 읽힌 이름도 쓰지 않고 모두 "이름 미확인"으로 둔다. 원문 오류는 남기지 않는다.
    console.warn("Admin catalog observation name lookup failed.");
    names.clear();
  }
  return names;
}

/** Call only after requireAdmin. Counts are aggregated in SQL; names are looked up separately and may be missing. */
export async function loadExportCatalogObservation(period: { start: string; end: string }): Promise<Loaded<CatalogObservation>> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("admin_export_catalog_observation", { p_start: period.start, p_end: period.end });
    if (error) throw error;
    const aggregate = parseCatalogObservation(data);
    if (!aggregate) throw new Error("invalid_catalog_observation_response");
    // RPC는 job 수 내림차순으로 돌려준다. 상한을 넘는 하위 에셋은 표시하지 않고 총수로 알린다.
    const shown = aggregate.assets.slice(0, catalogObservationDisplayLimit);
    const names = shown.length > 0 ? await loadAssetNames(admin, shown.map((asset) => asset.asset_id)) : new Map();
    return { ok: true, value: {
      ...aggregate,
      totalAssetCount: aggregate.assets.length,
      assets: shown.map((asset) => ({ ...asset, title: names.get(asset.asset_id)?.title ?? null, assetKind: names.get(asset.asset_id)?.assetKind ?? null })),
    } };
  } catch {
    // Do not log raw database error bodies or convert a failed lookup to a zero count.
    console.warn("Admin export catalog observation lookup failed.");
    return { ok: false };
  }
}
