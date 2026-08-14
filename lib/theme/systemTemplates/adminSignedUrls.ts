import { themeAssetsBucketName } from "@/lib/theme/remoteAssets";
import { themeAssetSignedUrlTtlSeconds } from "@/lib/theme/themeAssetSigning";

type SignedUrlItem = { path?: string | null; signedUrl?: string | null; error?: string | null };

/**
 * `createSignedUrls`만 쓰는 최소 구조 타입. 테스트에서 대역을 넘길 수 있고,
 * Supabase 브라우저 클라이언트가 그대로 들어맞는다.
 */
export type ThemeAssetSigningClient = {
  storage: {
    from(bucket: string): {
      createSignedUrls(paths: string[], expiresIn: number): Promise<{ data: SignedUrlItem[] | null; error: { message: string } | null }>;
    };
  };
};

/**
 * 관리자 전용 서명 URL 생성. **Next.js 라우트를 거치지 않고** Supabase Storage로 직접 요청한다.
 *
 * 일반 사용자 경로(`getThemeAssetSignedUrls`)는 `/api/theme-assets/signed-urls`를 거친다.
 * 그 라우트는 비관리자에게 공개 여부를 검증해 줘야 하므로 그대로 둔다. 반면 관리자 일괄
 * 재생성은 템플릿 하나당 십수 개 경로를 서명하느라 Worker CPU 한도(Cloudflare Free 10ms)를
 * 그대로 태우고, 관리자에게는 검증할 공개 여부 자체가 없다. Storage RLS의
 * "Admins manage theme asset objects" 정책이 같은 권한을 DB 쪽에서 강제한다.
 *
 * 일부 경로만 서명되면 썸네일이 조용히 반쪽으로 구워지므로 누락도 오류로 취급한다.
 */
export async function createAdminThemeAssetSignedUrls(client: ThemeAssetSigningClient, storagePaths: string[]) {
  const paths = Array.from(new Set(storagePaths.filter(Boolean)));
  if (!paths.length) return {};

  const { data, error } = await client.storage.from(themeAssetsBucketName).createSignedUrls(paths, themeAssetSignedUrlTtlSeconds);
  if (error) throw error;

  const signedUrls: Record<string, string> = {};
  for (const item of data ?? []) {
    if (item?.path && item.signedUrl) signedUrls[item.path] = item.signedUrl;
  }

  const missing = paths.filter((path) => !signedUrls[path]);
  if (missing.length) throw new Error(`Theme asset URL could not be created: ${missing.join(", ")}`);
  return signedUrls;
}
