import type { Metadata } from "next";
import LandingClient from "@/components/landing/LandingClient";
import { createPublicPageMetadata, siteDescription, siteTitleDefault } from "@/lib/seo/site";

// 랜딩 본문은 캐러셀·스크롤 연출 때문에 클라이언트 컴포넌트다. metadata를 내보내려면 서버
// 컴포넌트여야 해서 다른 라우트와 같은 방식으로 얇은 래퍼를 둔다.
export const metadata: Metadata = createPublicPageMetadata({
  // 랜딩 제목은 이미 서비스명을 담고 있어 `%s | TalkTheme` 접미사를 붙이면 겹친다.
  title: siteTitleDefault,
  absoluteTitle: siteTitleDefault,
  description: siteDescription,
  path: "/",
});

export default function HomePage() {
  return <LandingClient />;
}
