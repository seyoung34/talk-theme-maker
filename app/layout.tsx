import type { Metadata } from "next";
import AnalyticsProvider from "@/components/analytics/AnalyticsProvider";
import SiteFooter from "@/components/layout/SiteFooter";
import { getAnalyticsBootstrapScript, getAnalyticsMeasurementId } from "@/lib/analytics/ga4";
import "./globals.css";

export const metadata: Metadata = {
  title: "TalkTheme",
  description: "카카오톡 테마 이미지 제작과 미리보기를 위한 내부 도구",
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
