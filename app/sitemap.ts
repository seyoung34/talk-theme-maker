import type { MetadataRoute } from "next";
import { absoluteUrl, indexablePaths, publicSiteOrigin } from "@/lib/seo/site";

/**
 * 공개 페이지만 담는다. `/edit`, `/account`, `/credits`, 인증·관리자 화면은 개인화 화면이라
 * 색인 대상이 아니며 각 페이지에서 `noindex`로 막는다.
 *
 * `/template`의 시스템 템플릿 상세는 아직 개별 URL이 없다. 서버 렌더(SQ-54)를 검증한 뒤에 넣는다.
 *
 * `lastModified`는 넣지 않는다. 이 앱은 Worker에서 요청마다 렌더되므로 `new Date()`를 쓰면
 * 크롤러가 볼 때마다 "방금 수정됨"이 되어 실제 변경 시각을 담지 못한다. 부정확한 `lastmod`은
 * 무시되거나 신뢰를 잃으므로, 정확한 값을 줄 수 있을 때까지 생략하는 편이 낫다.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  // 운영 도메인이 검증되지 않으면 localhost URL이 담긴 sitemap을 내보내느니 비우는 편이 낫다.
  if (!publicSiteOrigin) return [];

  return indexablePaths.map(({ path, changeFrequency, priority }) => ({
    url: absoluteUrl(path)!,
    changeFrequency,
    priority,
  }));
}
