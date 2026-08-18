import { createAdminClient } from "@/lib/supabase/server";
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

export type RegistryStore = ReturnType<typeof createRegistryStore>;

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
     * 이전 active를 먼저 내리고 새 것을 올린다. 순서를 뒤집으면
     * `theme_asset_objects_active_revision_idx`(부분 unique)가 두 active를 거부해 전환이 실패한다.
     *
     * 두 문장이 한 트랜잭션이 아니므로 사이에서 끊기면 active가 잠깐 없다. export는 그때
     * `asset_ref_resolution_failed`로 명시적으로 실패하며, 잘못된 다른 에셋을 쓰지는 않는다.
     * 재시도가 같은 결과로 수렴하므로 이 창을 감수한다.
     */
    async activate(input: { activateId: string; retireId?: string }) {
      if (input.retireId) {
        const { error } = await admin
          .from(registryTable)
          .update({ status: "retired" })
          .eq("id", input.retireId)
          .eq("status", "active");
        if (error) throw error;
      }
      const { error } = await admin
        .from(registryTable)
        .update({ status: "active", activated_at: new Date().toISOString() })
        .eq("id", input.activateId)
        .eq("status", "staged");
      if (error) throw error;
    },

    /** 실패한 staged를 남긴다. 지우지 않는 이유는 어떤 객체가 떠 있는지 GC가 알아야 하기 때문이다. */
    async markFailed(id: string) {
      const { error } = await admin.from(registryTable).update({ status: "failed" }).eq("id", id).eq("status", "staged");
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
