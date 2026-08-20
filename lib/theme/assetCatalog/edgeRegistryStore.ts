import {
  mapAdminAssetExportAccessRow,
  mapTemplateAssetExportAccessRows,
  type AdminAssetExportAccess,
  type TemplateAssetExportAccess,
} from "@/lib/theme/assetCatalog/exportAccess";
import { mapThemeAssetObjectRow, type ThemeAssetObjectRecord } from "@/lib/theme/assetCatalog/registry";

/**
 * Cloudflare Worker export 경로가 필요한 registry 읽기 계약.
 *
 * publisher가 사용하는 `createRegistryStore()`는 Next 서버용 Supabase client와 쓰기 RPC를
 * 포함한다. Worker에서는 그 모듈을 import하지 않고, 이 읽기 전용 store가 Supabase REST를
 * 직접 호출한다. GCS 접근과 같은 실행 경계(`fetch` + 단명 자격증명)를 유지하기 위한 분리다.
 */
export type EdgeRegistryStore = {
  findActiveByKeys(keys: readonly { logicalAssetId: string; variantKey: string }[]): Promise<ThemeAssetObjectRecord[]>;
  findAdminAssetExportAccess(adminAssetIds: readonly string[]): Promise<AdminAssetExportAccess[]>;
  findTemplateAssetExportAccess(input: {
    uploadEntryIds: readonly string[];
    userId?: string;
  }): Promise<TemplateAssetExportAccess[]>;
};

const registryTable = "theme_asset_objects";
const adminAssetsTable = "admin_assets";
const templateVariantsTable = "system_template_variants";
const requestTimeoutMs = 15_000;

export class EdgeRegistryStoreError extends Error {
  constructor(
    readonly code: "missing_supabase_config" | "registry_lookup_failed",
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "EdgeRegistryStoreError";
  }
}

type SupabaseRestConfig = {
  readonly baseUrl: string;
  readonly secretKey: string;
};

/** Worker에서만 읽는 service-role REST client. secret key는 에러 메시지나 query에 넣지 않는다. */
export function createEdgeRegistryStore(): EdgeRegistryStore {
  const config = readSupabaseRestConfig();

  return {
    async findActiveByKeys(keys) {
      if (!keys.length) return [];
      const clauses = keys.map(({ logicalAssetId, variantKey }) =>
        `and(logical_asset_id.eq."${escapePostgrestValue(logicalAssetId)}",variant_key.eq."${escapePostgrestValue(variantKey)}")`,
      );
      const url = buildRestUrl(config, registryTable, {
        select: "*",
        status: "eq.active",
        or: `(${clauses.join(",")})`,
      });
      const rows = await readRows(url, "catalog registry", config.secretKey);
      return rows.map(mapThemeAssetObjectRow);
    },

    async findAdminAssetExportAccess(adminAssetIds) {
      const ids = [...new Set(adminAssetIds.filter(isUuid))];
      if (!ids.length) return [];
      const url = buildRestUrl(config, adminAssetsTable, {
        select: "id,slot_role,platform,asset_kind,enabled,admin_asset_targets(id,asset_id,platform,slot_role,target_kind,priority,enabled)",
        id: `in.(${ids.join(",")})`,
      });
      const rows = await readRows(url, "admin asset export access", config.secretKey);
      return rows.map(mapAdminAssetExportAccessRow);
    },

    async findTemplateAssetExportAccess(input) {
      const uploadEntryIds = [...new Set(input.uploadEntryIds.filter((id) => typeof id === "string" && id.trim()))];
      if (!uploadEntryIds.length) return [];

      const select = "id,platform,upload_refs,system_template_bundles!inner(status,visibility,created_by)";
      const rows: unknown[] = [];
      rows.push(...await readRows(buildRestUrl(config, templateVariantsTable, {
        select,
        "system_template_bundles.status": "eq.published",
        "system_template_bundles.visibility": "eq.public",
      }), "public template export access", config.secretKey));

      if (isUuid(input.userId)) {
        rows.push(...await readRows(buildRestUrl(config, templateVariantsTable, {
          select,
          "system_template_bundles.created_by": `eq.${input.userId}`,
        }), "owned template export access", config.secretKey));
      }

      return mapTemplateAssetExportAccessRows(rows, { uploadEntryIds, userId: input.userId });
    },
  };
}

function readSupabaseRestConfig(): SupabaseRestConfig {
  const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const secretKey = process.env.SUPABASE_SECRET_KEY?.trim();
  if (!rawUrl || !secretKey) {
    throw new EdgeRegistryStoreError("missing_supabase_config", "Supabase export registry 설정이 완료되지 않았습니다.");
  }

  try {
    const url = new URL(rawUrl);
    if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("invalid protocol");
    return { baseUrl: url.toString().replace(/\/$/, ""), secretKey };
  } catch {
    throw new EdgeRegistryStoreError("missing_supabase_config", "Supabase export registry 설정이 올바르지 않습니다.");
  }
}

function buildRestUrl(config: SupabaseRestConfig, table: string, params: Record<string, string>) {
  const url = new URL(`/rest/v1/${table}`, config.baseUrl);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return url;
}

async function readRows(url: URL, operation: string, secretKey: string): Promise<unknown[]> {
  const response = await fetchWithTimeout(url, operation, secretKey);
  if (!response.ok) {
    await response.arrayBuffer().catch(() => undefined);
    throw new EdgeRegistryStoreError("registry_lookup_failed", `${operation} 조회에 실패했습니다.`, response.status);
  }

  const payload = await response.json().catch(() => null);
  if (!Array.isArray(payload)) {
    throw new EdgeRegistryStoreError("registry_lookup_failed", `${operation} 응답 형식이 올바르지 않습니다.`, response.status);
  }
  return payload;
}

async function fetchWithTimeout(url: URL, operation: string, secretKey: string) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), requestTimeoutMs);
  try {
    return await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        apikey: secretKey,
        // Supabase의 새 `sb_secret_*` key는 JWT가 아니므로 Authorization Bearer에 넣지 않는다.
        // 브라우저 User-Agent로 오인되지 않도록 Worker 호출임을 명시한다.
        "User-Agent": "talktheme-maker-worker",
      },
      signal: controller.signal,
    });
  } catch {
    throw new EdgeRegistryStoreError("registry_lookup_failed", `${operation} 조회에 실패했습니다.`);
  } finally {
    clearTimeout(timeoutId);
  }
}

function escapePostgrestValue(value: string) {
  return value.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
