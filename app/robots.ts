import type { MetadataRoute } from "next";
import { absoluteUrl, disallowedCrawlPaths } from "@/lib/seo/site";

/**
 * 운영 도메인은 Cloudflare Managed robots.txt(AI 크롤러 차단 목록)도 함께 내보낸다.
 * Cloudflare는 origin 응답이 있으면 관리 블록을 덧붙이므로 여기서 AI 크롤러를 중복 선언하지 않는다.
 *
 * disallow는 크롤 예산 보호용 보조 장치다. 개인정보·관리자 경로의 권위 있는 경계는 인증과 권한 검사다.
 */
export default function robots(): MetadataRoute.Robots {
  const sitemap = absoluteUrl("/sitemap.xml");

  return {
    rules: [{ userAgent: "*", allow: "/", disallow: disallowedCrawlPaths }],
    ...(sitemap ? { sitemap } : {}),
  };
}
