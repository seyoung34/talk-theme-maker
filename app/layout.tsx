import type { Metadata } from "next";
import AnalyticsProvider from "@/components/analytics/AnalyticsProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: "TalkTheme",
  description: "카카오톡 테마 이미지 제작과 미리보기를 위한 내부 도구",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      {/* DEBUG: vanilla gtag.js snippet for isolating client-side transmission issue. Remove before merging. */}
      <head>
        <script async src="https://www.googletagmanager.com/gtag/js?id=G-08DYYZDY6D" />
        <script
          dangerouslySetInnerHTML={{
            __html: `window.dataLayer = window.dataLayer || [];\nfunction gtag(){dataLayer.push(arguments);}\ngtag('js', new Date());\ngtag('config', 'G-08DYYZDY6D');`,
          }}
        />
      </head>
      <body>{children}<AnalyticsProvider /></body>
    </html>
  );
}
