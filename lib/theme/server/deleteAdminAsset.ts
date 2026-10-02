import "server-only";
import { createClient } from "@/lib/supabase/server";
import { readAdminAssetStoragePaths } from "@/lib/theme/adminAssets";
import { themeAssetsBucketName } from "@/lib/theme/remoteAssets";
import { readAdminAssetUsageIndex } from "./adminAssetUsage";

export async function deleteUnreferencedAdminAsset(id: string): Promise<"deleted" | "linked" | "incomplete" | "missing"> {
  const usage = await readAdminAssetUsageIndex({ includeApplied: false });
  if (!usage.complete) return "incomplete";
  if (usage.byAssetId[id]?.length) return "linked";
  // Preserve existing authenticated admin RLS mutation grants; service_role lacks DELETE.
  const admin = await createClient();
  const { data, error: readError } = await admin.from("admin_assets")
    .select("storage_path,admin_asset_variants(storage_path),admin_asset_bubble_designs!admin_asset_bubble_designs_asset_id_fkey(admin_asset_bubble_decorations(storage_path))")
    .eq("id", id).maybeSingle();
  if (readError) throw readError;
  if (!data) return "missing";
  const paths = readAdminAssetStoragePaths(data);
  const { error } = await admin.from("admin_assets").delete().eq("id", id);
  if (error) throw error;
  if (paths.length) {
    const { error: storageError } = await admin.storage.from(themeAssetsBucketName).remove(paths);
    // DB deletion succeeded; an orphan is safer than claiming the asset still exists.
    if (storageError) console.error("Deleted admin asset storage cleanup failed", storageError);
  }
  return "deleted";
}
