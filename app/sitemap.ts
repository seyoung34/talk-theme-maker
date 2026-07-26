import type { MetadataRoute } from "next";
import { absoluteUrl, indexablePaths, publicSiteOrigin } from "@/lib/seo/site";

/**
 * 공개 페이지만 담는다. `/edit`, `/account`, `/credits`, 인증·관리자 화면은 개인화 화면이라
 * 색인 대상이 아니며 각 페이지에서 `noindex`로 막는다.
 *
 * `/template`의 시스템 템플릿 상세는 아직 개별 URL이 없다. 서버 렌더(SQ-54)를 검증한 뒤에 넣는다.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  // 운영 도메인이 검증되지 않으면 localhost URL이 담긴 sitemap을 내보내느니 비우는 편이 낫다.
  if (!publicSiteOrigin) return [];

  const lastModified = new Date();
  return indexablePaths.map(({ path, changeFrequency, priority }) => ({
    url: absoluteUrl(path)!,
    lastModified,
    changeFrequency,
    priority,
  }));
}
