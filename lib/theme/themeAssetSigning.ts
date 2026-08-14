/**
 * 서명 URL 생성 파라미터. 클라이언트·서버 양쪽에서 안전하게 import 할 수 있어야 한다.
 *
 * 서버 라우트(`app/api/theme-assets/*`)는 `lib/theme/server/themeAssetAccess`를 거쳐 쓰고,
 * 관리자 브라우저 경로는 `lib/theme/systemTemplates/adminSignedUrls`가 직접 쓴다.
 * 후자가 `themeAssetAccess`를 import 하면 `next/headers`까지 딸려 오므로 상수만 여기 둔다.
 */
export const themeAssetSignedUrlTtlSeconds = 60 * 10;
export const maxSignedUrlPaths = 50;
