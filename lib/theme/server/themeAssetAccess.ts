import { createTtlCache, type TtlCache } from "@/lib/shared/ttlCache";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { maxSignedUrlPaths, themeAssetSignedUrlTtlSeconds } from "@/lib/theme/themeAssetSigning";

// 관리자 브라우저 경로도 같은 TTL/상한을 써야 해서 상수 자체는 클라이언트 안전 모듈에 있다.
export { maxSignedUrlPaths, themeAssetSignedUrlTtlSeconds };

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;
type SupabaseAdminClient = ReturnType<typeof createAdminClient>;

/**
 * 공개 여부 조회 캐시.
 *
 * 비관리자 요청마다 "이 추천 에셋이 공개인가", "이 시스템 템플릿이 게시·공개인가"를 DB에 물었다.
 * 같은 템플릿을 여는 사용자가 많을수록 같은 답을 반복해서 계산한다. Workers Free는 요청당
 * CPU 10ms라 이 반복이 그대로 예산을 먹는다.
 *
 * 부정(비공개) 결과도 캐시한다. 긍정만 캐시하면 비공개 리소스를 반복 요청하는 트래픽이 캐시를
 * 그대로 통과해 무력화한다. 대신 TTL을 짧게 둔다 — 관리자가 공개로 바꾼 뒤 최대 1분간 이전
 * 판정이 남지만, 서명 URL 자체가 10분 유효하므로 실질적 차이는 크지 않다.
 *
 * 아이솔레이트마다 따로 존재하는 best-effort 캐시다(`ttlCache.ts` 주석). 여기서는 "조회를
 * 건너뛰는" 용도이지 권한 판정 자체를 대체하지 않는다 — 캐시가 비어 있어도 결과는 같다.
 */
const visibilityCacheTtlMs = 60_000;
const publicVariantCache = createTtlCache<boolean>({ ttlMs: visibilityCacheTtlMs, maxEntries: 256 });
const adminAssetCache = createTtlCache<boolean>({ ttlMs: visibilityCacheTtlMs, maxEntries: 256 });

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
    // 이번 요청 안에서는 캐시 축출에 흔들리지 않도록 답을 지역 Map에 모은다.
    const known = readCached(adminAssetCache, adminAssetPaths);
    const unknown = adminAssetPaths.filter((path) => !known.has(path));

    if (unknown.length) {
      const { data: registeredAssets, error } = await adminClient
        .from("admin_assets")
        .select("storage_path,admin_asset_targets!inner(id)")
        .in("storage_path", unknown);
      if (error) throw error;

      const registeredPaths = new Set((registeredAssets ?? []).map((asset) => asset.storage_path));
      // 조회 결과에 없는 경로는 "공개 아님"이다. 이 답도 저장해야 비공개 경로 반복 요청이
      // 캐시를 그대로 통과하지 않는다.
      for (const path of unknown) writeCached(adminAssetCache, known, path, registeredPaths.has(path));
    }

    const forbiddenPath = adminAssetPaths.find((path) => !known.get(path));
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

    const isPublic = readCached(publicVariantCache, variantIds);
    const unknownIds = variantIds.filter((id) => !isPublic.has(id));

    if (unknownIds.length) {
      const { data: variants, error } = await adminClient
        .from("system_template_variants")
        .select("id,system_template_bundles!inner(status,visibility)")
        .in("id", unknownIds);
      if (error) throw error;

      const publicIds = new Set(
        (variants ?? [])
          .filter((variant) => {
            const bundle = Array.isArray(variant.system_template_bundles) ? variant.system_template_bundles[0] : variant.system_template_bundles;
            return bundle?.status === "published" && bundle?.visibility === "public";
          })
          .map((variant) => variant.id),
      );
      // 존재하지 않는 id도 여기서 false로 굳는다. 판정 결과는 캐시 유무와 무관하게 같다.
      for (const id of unknownIds) writeCached(publicVariantCache, isPublic, id, publicIds.has(id));
    }

    if (variantIds.some((id) => !isPublic.get(id))) {
      return { ok: false, status: 403, error: "공개되지 않은 시스템 템플릿 에셋입니다." };
    }
  }

  return { ok: true };
}

function readCached(cache: TtlCache<boolean>, keys: string[]) {
  const known = new Map<string, boolean>();
  for (const key of keys) {
    const cached = cache.get(key);
    if (cached !== undefined) known.set(key, cached);
  }
  return known;
}

function writeCached(cache: TtlCache<boolean>, known: Map<string, boolean>, key: string, value: boolean) {
  cache.set(key, value);
  known.set(key, value);
}
