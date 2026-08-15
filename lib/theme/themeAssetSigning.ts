/**
 * 서명 URL 생성 파라미터. 클라이언트·서버 양쪽에서 안전하게 import 할 수 있어야 한다.
 *
 * 서버 라우트(`app/api/theme-assets/*`)는 `lib/theme/server/themeAssetAccess`를 거쳐 쓰고,
 * 관리자 브라우저 경로는 `lib/theme/systemTemplates/adminSignedUrls`가 직접 쓴다.
 * 후자가 `themeAssetAccess`를 import 하면 `next/headers`까지 딸려 오므로 상수만 여기 둔다.
 */

/**
 * 서명 URL의 수명. 7일.
 *
 * 원래 10분이었는데, **그 짧은 수명이 브라우저 캐시를 통째로 무력화하고 있었다.** 서명 URL은
 * 만료될 때마다 토큰이 바뀌고, 토큰이 바뀌면 URL이 바뀌고, 브라우저 HTTP 캐시는 URL이 키다.
 * 그래서 같은 사용자가 같은 템플릿을 다시 열어도 전부 다시 받았다.
 *
 * 대조 실험(2026-08-15, `/template` 모달): 같은 파일 9개를 경로까지 동일하게 요청했을 때
 * - 서명 URL이 같으면 → 9건 전부 캐시 적중, 평균 8ms
 * - 서명 URL만 달라지면 → 9건 전부 재다운로드, 평균 588ms
 *
 * 대가는 유출된 URL의 유효 기간이 길어지는 것이다. 이 버킷에는 사용자 개인 데이터가 없고
 * (사용자 템플릿은 IndexedDB에 있다) 게시된 시스템 템플릿 에셋은 이미 공개 배포물이라 감수한다.
 * 남는 위험은 **미게시 초안 에셋의 URL이 관리자 브라우저에서 새는 경우**뿐이다.
 */
export const themeAssetSignedUrlTtlSeconds = 60 * 60 * 24 * 7;

export const maxSignedUrlPaths = 50;

/**
 * 저장 객체의 `Cache-Control`. 30일.
 *
 * 경로에 업로드 entry id가 들어가 있어(`.../<slotId>/<entryId>-<name>`) 내용이 바뀌면 경로도
 * 바뀐다. 사실상 불변이라 길게 잡아도 낡은 이미지가 남을 일이 없다.
 *
 * 지정하지 않으면 Supabase 기본값(1시간)이 걸린다. 서명 URL 수명을 7일로 늘려도 브라우저가
 * 1시간 뒤 바이트를 버리면 다시 받아야 하므로, 둘을 같이 늘려야 의미가 있다.
 */
export const themeAssetCacheControl = String(60 * 60 * 24 * 30);
