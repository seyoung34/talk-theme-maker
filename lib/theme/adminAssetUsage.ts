export type AdminAssetUsageBundle = {
  id: string;
  title: string;
  status: string;
  visibility: string;
  variants: { id: string; platform: string; slots: string[] }[];
};

export type AdminAssetUsageIndex = {
  byAssetId: Record<string, AdminAssetUsageBundle[]>;
  complete: boolean;
  unknownReferences: number;
  checkedAt: string;
};

type VariantRow = {
  id: string;
  platform: string;
  upload_refs: unknown;
  system_template_bundles: unknown;
};

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

/** Explicit catalog identity or original admin storage path only; filenames are never provenance. */
export function buildAdminAssetUsageIndex(rows: VariantRow[], complete = true): AdminAssetUsageIndex {
  const byAssetId: AdminAssetUsageIndex["byAssetId"] = {};
  let unknownReferences = 0;
  for (const row of rows) {
    const bundle = record(Array.isArray(row.system_template_bundles) ? row.system_template_bundles[0] : row.system_template_bundles);
    if (!bundle || typeof bundle.id !== "string") continue;
    for (const [slot, entries] of Object.entries(record(row.upload_refs) ?? {})) {
      if (!Array.isArray(entries)) { unknownReferences += 1; continue; }
      for (const value of entries) {
        const entry = record(value);
        if (!entry) { unknownReferences += 1; continue; }
        const catalogId = record(entry.catalog)?.assetId;
        const paths = [entry.storagePath, record(entry.catalogMetadata)?.legacyStoragePath, record(entry.imageEdit)?.originalStoragePath];
        const ids = new Set<string>();
        if (typeof catalogId === "string" && /^admin:[0-9a-f-]{36}$/i.test(catalogId)) ids.add(catalogId.slice(6));
        for (const path of paths) {
          const match = typeof path === "string" ? /^admin-assets\/([0-9a-f-]{36})\//i.exec(path) : null;
          if (match) ids.add(match[1]);
        }
        if (!ids.size) { unknownReferences += 1; continue; }
        for (const assetId of ids) {
          const bundles = byAssetId[assetId] ??= [];
          let usage = bundles.find((item) => item.id === bundle.id);
          if (!usage) {
            usage = { id: bundle.id, title: typeof bundle.title === "string" ? bundle.title : "제목 없음", status: String(bundle.status ?? "unknown"), visibility: String(bundle.visibility ?? "unknown"), variants: [] };
            bundles.push(usage);
          }
          let variant = usage.variants.find((item) => item.id === row.id);
          if (!variant) { variant = { id: row.id, platform: row.platform, slots: [] }; usage.variants.push(variant); }
          if (!variant.slots.includes(slot)) variant.slots.push(slot);
        }
      }
    }
  }
  return { byAssetId, complete, unknownReferences, checkedAt: new Date().toISOString() };
}

export async function fetchAdminAssetUsageIndex(signal?: AbortSignal): Promise<AdminAssetUsageIndex> {
  const response = await fetch("/api/admin/theme-assets/usage", { cache: "no-store", signal });
  if (!response.ok) throw new Error("시스템 템플릿 연결 정보를 불러오지 못했습니다.");
  return response.json() as Promise<AdminAssetUsageIndex>;
}
