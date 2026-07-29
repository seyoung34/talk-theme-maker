import type { Metadata, Viewport } from "next";
import AnalyticsProvider from "@/components/analytics/AnalyticsProvider";
import SiteFooter from "@/components/layout/SiteFooter";
import { getAnalyticsBootstrapScript, getAnalyticsMeasurementId } from "@/lib/analytics/ga4";
import { createVerificationMetadata, metadataBaseUrl, siteDescription, siteName, siteTitleDefault } from "@/lib/seo/site";
import "./globals.css";

export const metadata: Metadata = {
  // 검증된 값이 없으면 undefined로 두어 잘못된 절대 URL이 나가지 않게 한다.
  metadataBase: metadataBaseUrl,
  title: {
    default: siteTitleDefault,
    // 각 페이지는 접미사 없는 순수 제목만 지정한다. 완성형 제목이 필요하면 `title.absolute`를 쓴다.
    template: `%s | ${siteName}`,
  },
  description: siteDescription,
  applicationName: siteName,
  // Search Console·서치어드바이저 소유확인. 토큰이 없으면 태그를 내보내지 않는다.
  verification: createVerificationMetadata(),
  // canonical은 페이지마다 지정한다. 루트에 두면 지정하지 않은 하위 페이지가 "/"를 물려받는다.
  openGraph: {
    type: "website",
    siteName,
    locale: "ko_KR",
    title: siteTitleDefault,
    description: siteDescription,
    url: "/",
  },
  twitter: {
    card: "summary_large_image",
    title: siteTitleDefault,
    description: siteDescription,
  },
};

// 모바일 브라우저가 데스크톱 레이아웃 폭(약 980px)으로 축소 렌더링하지 않도록 명시한다.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const measurementId = getAnalyticsMeasurementId();
  return (
    <html lang="ko">
      {measurementId ? (
        <head>
          <script dangerouslySetInnerHTML={{ __html: getAnalyticsBootstrapScript(measurementId) }} />
        </head>
      ) : null}
      <body>
        {children}
        <SiteFooter />
        <AnalyticsProvider />
      </body>
    </html>
  );
}
