import { createAdminClient, createClient } from "@/lib/supabase/server";

export const themeAssetSignedUrlTtlSeconds = 60 * 10;
export const maxSignedUrlPaths = 50;

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;
type SupabaseAdminClient = ReturnType<typeof createAdminClient>;

export type ThemeAssetAccessCheck = {
  ok: true;
} | {
  ok: false;
  status: 400 | 403;
  error: string;
};

export function normalizeThemeAssetStoragePaths(value: unknown, limit = maxSignedUrlPaths) {
  const paths = Array.isArray(value)
    ? Array.from(new Set(value.filter((path): path is string => typeof path === "string" && path.length > 0)))
    : [];

  if (!paths.length || paths.length > limit) {
    return { ok: false as const, status: 400 as const, error: `1~${limit}개의 올바른 경로가 필요합니다.` };
  }

  const invalidPath = paths.find(isInvalidThemeAssetStoragePath);
  if (invalidPath) {
    return { ok: false as const, status: 400 as const, error: `올바르지 않은 Storage 경로입니다: ${invalidPath}` };
  }

  return { ok: true as const, paths };
}

export function isInvalidThemeAssetStoragePath(path: string) {
  return path.length > 512 || path.includes("..") || path.startsWith("/") || path.includes("\\");
}

export function getSystemTemplateVariantIdFromPath(path: string) {
  const id = path.split("/")[1];
  return id && /^[0-9a-f-]{36}$/i.test(id) ? id : null;
}

export async function getThemeAssetAccessContext() {
  const supabase = await createClient();
  const adminClient = createAdminClient();
  const { data: userData } = await supabase.auth.getUser();
  const isAdmin = userData.user
    ? Boolean((await supabase.from("admin_profiles").select("user_id").eq("user_id", userData.user.id).eq("role", "admin").maybeSingle()).data)
    : false;

  return { supabase, adminClient, isAdmin };
}

export async function checkThemeAssetStorageAccess(
  paths: string[],
  {
    adminClient,
    isAdmin,
  }: {
    supabase: SupabaseServerClient;
    adminClient: SupabaseAdminClient;
    isAdmin: boolean;
  },
): Promise<ThemeAssetAccessCheck> {
  const unsupportedPath = paths.find((path) => !path.startsWith("admin-assets/") && !path.startsWith("system-templates/"));
  if (unsupportedPath) {
    return { ok: false, status: 400, error: `지원하지 않는 Storage 경로입니다: ${unsupportedPath}` };
  }

  const adminAssetPaths = paths.filter((path) => path.startsWith("admin-assets/"));
  if (adminAssetPaths.length && !isAdmin) {
    const { data: enabledAssets, error } = await adminClient
      .from("admin_assets")
      .select("storage_path,admin_asset_targets!inner(id)")
      .eq("enabled", true)
      .eq("admin_asset_targets.enabled", true)
      .in("storage_path", adminAssetPaths);
    if (error) throw error;

    const enabledPaths = new Set((enabledAssets ?? []).map((asset) => asset.storage_path));
    const forbiddenPath = adminAssetPaths.find((path) => !enabledPaths.has(path));
    if (forbiddenPath) {
      return { ok: false, status: 403, error: "공개되지 않은 추천 에셋입니다." };
    }
  }

  const systemPaths = paths.filter((path) => path.startsWith("system-templates/"));
  if (systemPaths.length && !isAdmin) {
    const variantIds = Array.from(new Set(systemPaths.map(getSystemTemplateVariantIdFromPath).filter((id): id is string => Boolean(id))));
    if (!variantIds.length || systemPaths.some((path) => !getSystemTemplateVariantIdFromPath(path))) {
      return { ok: false, status: 400, error: "올바르지 않은 시스템 템플릿 에셋 경로입니다." };
    }

    const { data: variants, error } = await adminClient
      .from("system_template_variants")
      .select("id,system_template_bundles!inner(status,visibility)")
      .in("id", variantIds);
    if (error) throw error;

    const publicIds = new Set(
      (variants ?? [])
        .filter((variant) => {
          const bundle = Array.isArray(variant.system_template_bundles) ? variant.system_template_bundles[0] : variant.system_template_bundles;
          return bundle?.status === "published" && bundle?.visibility === "public";
        })
        .map((variant) => variant.id),
    );
    if (variantIds.some((id) => !publicIds.has(id))) {
      return { ok: false, status: 403, error: "공개되지 않은 시스템 템플릿 에셋입니다." };
    }
  }

  return { ok: true };
}
