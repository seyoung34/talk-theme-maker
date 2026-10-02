export type AdminAssetUsageBundle = {
  id: string;
  title: string;
  status: string;
  visibility: string;
  variants: { id: string; platform: string; baseTemplateId?: string; slots: string[]; appliedSlots?: string[]; relationKinds?: string[] }[];
};

export type AdminAssetUsageIndex = {
  byAssetId: Record<string, AdminAssetUsageBundle[]>;
  complete: boolean;
  unknownReferences: number;
  checkedAt: string;
};

export type AdminAssetUsageVariantRow = {
  id: string;
  platform: string;
  upload_refs: unknown;
  system_template_bundles: unknown;
  base_template_id?: unknown;
  candidate_selections?: unknown;
};

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

/** Explicit catalog identity or original admin storage path only; filenames are never provenance. */
export function getExplicitAdminAssetIds(value: unknown, knownAdminIds: ReadonlySet<string> = new Set()): string[] {
  const entry = record(value);
  if (!entry) return [];
  const catalogId = record(entry.catalog)?.assetId;
  const paths = [entry.storagePath, record(entry.catalogMetadata)?.legacyStoragePath, record(entry.imageEdit)?.originalStoragePath];
  const ids = new Set<string>();
  if (typeof entry.id === "string" && knownAdminIds.has(entry.id)) ids.add(entry.id);
  if (typeof catalogId === "string" && /^admin:[0-9a-f-]{36}$/i.test(catalogId)) ids.add(catalogId.slice(6));
  for (const path of paths) {
    const match = typeof path === "string" ? /^admin-assets\/([0-9a-f-]{36})\//i.exec(path) : null;
    if (match) ids.add(match[1]);
  }
  return [...ids];
}

export function buildAdminAssetUsageIndex(rows: AdminAssetUsageVariantRow[], complete = true, knownAdminIds: ReadonlySet<string> = new Set()): AdminAssetUsageIndex {
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
        const ids = getExplicitAdminAssetIds(entry, knownAdminIds);
        if (!ids.length) { unknownReferences += 1; continue; }
        for (const assetId of ids) {
          const bundles = byAssetId[assetId] ??= [];
          let usage = bundles.find((item) => item.id === bundle.id);
          if (!usage) {
            usage = { id: bundle.id, title: typeof bundle.title === "string" ? bundle.title : "제목 없음", status: String(bundle.status ?? "unknown"), visibility: String(bundle.visibility ?? "unknown"), variants: [] };
            bundles.push(usage);
          }
          let variant = usage.variants.find((item) => item.id === row.id);
          if (!variant) { variant = { id: row.id, platform: row.platform, slots: [], relationKinds: [], ...(typeof row.base_template_id === "string" ? { baseTemplateId: row.base_template_id } : {}) }; usage.variants.push(variant); }
          if (!variant.slots.includes(slot)) variant.slots.push(slot);
          const directCatalog = record(entry.catalog)?.assetId === `admin:${assetId}`;
          const originalPath = [entry.storagePath, record(entry.catalogMetadata)?.legacyStoragePath, record(entry.imageEdit)?.originalStoragePath].some((path) => typeof path === "string" && path.startsWith(`admin-assets/${assetId}/`));
          const kinds = [directCatalog ? "catalog" : null, originalPath ? (entry.imageEdit ? "derived" : "original") : null, entry.id === assetId && knownAdminIds.has(assetId) ? "saved-id" : null].filter((kind): kind is string => Boolean(kind));
          for (const kind of kinds) if (!variant.relationKinds!.includes(kind)) variant.relationKinds!.push(kind);
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

export function describeAdminAssetUsage(bundles: readonly AdminAssetUsageBundle[]): string {
  const applied = bundles.filter((bundle) => bundle.variants.some((variant) => Boolean(variant.appliedSlots?.length))).length;
  const stored = bundles.filter((bundle) => bundle.variants.length > 0 && bundle.variants.every((variant) => variant.appliedSlots?.length === 0)).length;
  const unknown = bundles.filter((bundle) => bundle.variants.some((variant) => variant.appliedSlots === undefined)).length;
  return `저장 참조 ${bundles.length}개 · 적용 중 ${applied}개 · 후보 보관 ${stored}개${unknown ? ` · 적용 미판정 ${unknown}개` : ""}`;
}
