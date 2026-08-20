import { createAdminClient } from "@/lib/supabase/server";
import {
  mapAdminAssetExportAccessRow,
  mapTemplateAssetExportAccessRows,
  type AdminAssetExportAccess,
  type TemplateAssetExportAccess,
} from "@/lib/theme/assetCatalog/exportAccess";
import { mapThemeAssetObjectRow, type ThemeAssetObjectRecord, type ThemeAssetR2Preview } from "@/lib/theme/assetCatalog/registry";

/**
 * catalog registry의 영속화.
 *
 * `theme_asset_objects`는 `service_role`에만 grant돼 있고 anon/authenticated는 테이블 grant 단계에서
 * 막힌다. 그래서 이 모듈은 서버에서만 부를 수 있고, 브라우저 코드가 import하면 안 된다.
 *
 * DELETE는 노출하지 않는다. 삭제는 `theme-catalog-gc` 신원의 일이고 registry는 상태만 바꾼다.
 */

const registryTable = "theme_asset_objects";

/**
 * `upload_refs`는 슬롯 키가 동적인 jsonb라 "이 업로드 항목 id를 포함하는 variant"를 서버 필터로
 * 표현할 수 없어, 후보 행을 받아 메모리에서 골라낸다. PostgREST는 `max_rows`를 넘으면 **조용히**
 * 앞부분만 주므로, 찾는 variant가 그 뒤에 있으면 정상 사용 중인 템플릿에 권한 없음 403이 나간다.
 * 조용히 틀린 답을 주는 대신 명확히 실패시킨다. `edgeRegistryStore`도 같은 규칙을 쓴다.
 */
const templateAccessRowLimit = 1000;

function assertTemplateAccessNotTruncated(count: number, operation: string) {
  if (count >= templateAccessRowLimit) {
    throw new Error(`${operation} 후보가 상한(${templateAccessRowLimit})에 도달해 결과가 잘렸을 수 있습니다. 조회 범위를 좁혀야 합니다.`);
  }
}

/** 기존 publish 테스트/호출부가 필요한 registry 쓰기 계약. export 접근 조회는 점진적으로 붙인다. */
export type RegistryStore = Omit<ReturnType<typeof createRegistryStore>, "findAdminAssetExportAccess" | "findTemplateAssetExportAccess"> & {
  findAdminAssetExportAccess?: (adminAssetIds: readonly string[]) => Promise<AdminAssetExportAccess[]>;
  findTemplateAssetExportAccess?: (input: {
    uploadEntryIds: readonly string[];
    catalogAssetIds?: readonly string[];
    userId?: string;
  }) => Promise<TemplateAssetExportAccess[]>;
};

export type StagedObjectInput = {
  logicalAssetId: string;
  revision: number;
  variantKey: string;
  gcsObjectKey: string;
  gcsGeneration: string;
  sha256: string;
  sizeBytes: number;
  mimeType: string;
  fileName: string;
  sourceScale: 1 | 2 | 3;
  width: number;
  height: number;
  pngSignatureVerified: boolean;
};

/**
 * PostgREST `or()` 필터의 값 안에 들어갈 문자열을 안전하게 만든다.
 *
 * 논리 자산 id는 `admin-asset:1781680542261:xqcxdi`처럼 콜론과 하이픈을 포함한다. 큰따옴표로 감싸면
 * 콤마·괄호가 필터 문법으로 해석되지 않지만, 값 안의 큰따옴표와 역슬래시는 직접 이스케이프해야 한다.
 */
function escapePostgrestValue(value: string) {
  return value.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
}

export function createRegistryStore(admin = createAdminClient()) {
  return {
    /** 같은 (logical, revision, variant) 레코드. 재시도가 이미 만든 것을 다시 쓰기 위해 먼저 본다. */
    async findRevision(input: { logicalAssetId: string; revision: number; variantKey: string }) {
      const { data, error } = await admin
        .from(registryTable)
        .select("*")
        .eq("logical_asset_id", input.logicalAssetId)
        .eq("revision", input.revision)
        .eq("variant_key", input.variantKey)
        .maybeSingle();
      if (error) throw error;
      return data ? mapThemeAssetObjectRow(data) : null;
    },

    /**
     * export 해석용 배치 조회.
     *
     * `active`만 읽는다 — `staged`/`retired`/`failed`를 가져와 호출부가 거르게 하면, 거르는 것을
     * 잊은 경로가 생겼을 때 폐기된 revision이 결과물에 들어간다. 조회 단계에서 좁히는 것이 계약이다.
     *
     * PostgREST는 복합 키 `IN`을 직접 받지 못하므로 `or(and(...))`로 짝을 나열한다. manifest 상한이
     * 300개이고 같은 자산은 `toRegistryLookupKeys()`가 이미 dedupe하므로 길이는 문제되지 않는다.
     */
    async findActiveByKeys(keys: readonly { logicalAssetId: string; variantKey: string }[]) {
      if (!keys.length) return [];
      const clauses = keys.map(({ logicalAssetId, variantKey }) =>
        `and(logical_asset_id.eq."${escapePostgrestValue(logicalAssetId)}",variant_key.eq."${escapePostgrestValue(variantKey)}")`,
      );
      const { data, error } = await admin
        .from(registryTable)
        .select("*")
        .eq("status", "active")
        .or(clauses.join(","));
      if (error) throw error;
      return (data ?? []).map(mapThemeAssetObjectRow);
    },

    /** export 시점의 관리자 에셋 enabled/platform/target 정책을 읽는다. */
    async findAdminAssetExportAccess(adminAssetIds: readonly string[]): Promise<AdminAssetExportAccess[]> {
      if (!adminAssetIds.length) return [];
      const { data, error } = await admin
        .from("admin_assets")
        .select("id,slot_role,platform,asset_kind,enabled,admin_asset_targets(id,asset_id,platform,slot_role,target_kind,priority,enabled)")
        .in("id", adminAssetIds);
      if (error) throw error;
      return (data ?? []).map(mapAdminAssetExportAccessRow);
    },

    /** export 시점의 시스템 템플릿 published/public·소유권 정책을 읽는다. */
    async findTemplateAssetExportAccess(input: {
      uploadEntryIds: readonly string[];
      catalogAssetIds?: readonly string[];
      userId?: string;
    }): Promise<TemplateAssetExportAccess[]> {
      const uploadEntryIds = [...new Set(input.uploadEntryIds.filter((id) => typeof id === "string" && id.trim()))];
      const catalogAssetIds = [...new Set((input.catalogAssetIds ?? []).filter((id) => typeof id === "string" && id.trim()))];
      if (!uploadEntryIds.length && !catalogAssetIds.length) return [];

      const select = "id,platform,upload_refs,system_template_bundles!inner(status,visibility,created_by)";
      const rows: unknown[] = [];

      const { data: publicRows, error: publicError } = await admin
        .from("system_template_variants")
        .select(select)
        .eq("system_template_bundles.status", "published")
        .eq("system_template_bundles.visibility", "public")
        .limit(templateAccessRowLimit);
      if (publicError) throw publicError;
      assertTemplateAccessNotTruncated(publicRows?.length ?? 0, "public template export access");
      rows.push(...(publicRows ?? []));

      if (input.userId) {
        const { data: ownedRows, error: ownedError } = await admin
          .from("system_template_variants")
          .select(select)
          .eq("system_template_bundles.created_by", input.userId)
          .limit(templateAccessRowLimit);
        if (ownedError) throw ownedError;
        assertTemplateAccessNotTruncated(ownedRows?.length ?? 0, "owned template export access");
        rows.push(...(ownedRows ?? []));
      }

      return mapTemplateAssetExportAccessRows(rows, { uploadEntryIds, catalogAssetIds, userId: input.userId });
    },

    /**
     * 상태와 무관한 최대 revision. 다음 revision 번호를 정할 때 쓴다.
     *
     * `findActive`로 정하면 안 된다 — 다른 publish가 만들어 둔 `staged` 행이 보이지 않아 같은
     * 번호를 다시 집는다. 그러면 `unique (logical_asset_id, revision, variant_key)`에 걸리거나,
     * 바이트가 다를 때는 `REVISION_NOT_FORWARD`로 끝나 재시도조차 걸리지 않는다.
     *
     * `staged`뿐 아니라 `failed`·`retired`도 센다. 이미 쓰인 번호는 재사용할 수 없다.
     */
    async findLatestRevision(input: { logicalAssetId: string; variantKey: string }) {
      const { data, error } = await admin
        .from(registryTable)
        .select("revision")
        .eq("logical_asset_id", input.logicalAssetId)
        .eq("variant_key", input.variantKey)
        .order("revision", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      const revision = (data as { revision?: unknown } | null)?.revision;
      return typeof revision === "number" && Number.isSafeInteger(revision) ? revision : 0;
    },

    async findActive(input: { logicalAssetId: string; variantKey: string }) {
      const { data, error } = await admin
        .from(registryTable)
        .select("*")
        .eq("logical_asset_id", input.logicalAssetId)
        .eq("variant_key", input.variantKey)
        .eq("status", "active")
        .maybeSingle();
      if (error) throw error;
      return data ? mapThemeAssetObjectRow(data) : null;
    },

    async insertStaged(input: StagedObjectInput): Promise<ThemeAssetObjectRecord> {
      const { data, error } = await admin
        .from(registryTable)
        .insert({
          logical_asset_id: input.logicalAssetId,
          revision: input.revision,
          variant_key: input.variantKey,
          status: "staged",
          gcs_object_key: input.gcsObjectKey,
          gcs_generation: input.gcsGeneration,
          sha256: input.sha256,
          size_bytes: input.sizeBytes,
          mime_type: input.mimeType,
          file_name: input.fileName,
          source_scale: input.sourceScale,
          width: input.width,
          height: input.height,
          png_signature_verified: input.pngSignatureVerified,
          png_signature_verified_at: input.pngSignatureVerified ? new Date().toISOString() : null,
        })
        .select("*")
        .single();
      if (error) throw error;
      return mapThemeAssetObjectRow(data);
    },

    async setPreviews(id: string, previews: Record<string, ThemeAssetR2Preview>) {
      const { error } = await admin.from(registryTable).update({ r2_previews: previews }).eq("id", id);
      if (error) throw error;
    },

    /**
     * active pointer 전환.
     *
     * 부분 unique 인덱스(`theme_asset_objects_active_revision_idx`) 때문에 반드시 "이전 것을 내리고
     * → 새 것을 올리는" 순서여야 한다. 두 UPDATE를 따로 보내면 사이에서 끊길 때 **active revision이
     * 하나도 없는 상태**가 남고, 그때 export는 해당 에셋을 해석하지 못한다.
     *
     * 그래서 RPC로 넘긴다. plpgsql 본문은 한 트랜잭션이라 둘이 함께 커밋되거나 함께 롤백된다.
     * 전제 조건 검사도 함수 안에 있어 stale한 상태로 재시도해도 잘못된 전환이 일어나지 않는다.
     */
    async activate(input: { activateId: string; retireId?: string }) {
      const { error } = await admin.rpc("activate_theme_asset_object", {
        p_activate_id: input.activateId,
        p_retire_id: input.retireId ?? null,
      });
      if (error) throw error;
    },

    /** 실패한 staged를 남긴다. 지우지 않는 이유는 어떤 객체가 떠 있는지 GC가 알아야 하기 때문이다. */
    async markFailed(id: string) {
      const { error } = await admin.from(registryTable).update({ status: "failed" }).eq("id", id).eq("status", "staged");
      if (error) throw error;
    },

    /**
     * 일시 오류로 `failed`가 된 revision을 같은 내용으로 다시 올릴 수 있게 되돌린다.
     *
     * revision은 "내용의 이름"이라 같은 바이트에 새 번호를 붙이면 의미가 흐려진다. sha256이 같을
     * 때만 되돌리므로 다른 내용으로 덮어쓰는 요청은 통과하지 못한다.
     */
    async restageFailed(id: string, sha256: string) {
      const { error } = await admin.rpc("restage_failed_theme_asset_object", { p_id: id, p_sha256: sha256 });
      if (error) throw error;
    },

    /** 특정 GCS 객체를 아직 참조하는 레코드가 있는지. GC 후보 판정에 쓴다. */
    async countReferences(gcsObjectKey: string) {
      const { count, error } = await admin
        .from(registryTable)
        .select("id", { count: "exact", head: true })
        .eq("gcs_object_key", gcsObjectKey);
      if (error) throw error;
      return count ?? 0;
    },
  };
}
