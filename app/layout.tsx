import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TalkTheme",
  description: "카카오톡 테마 이미지 제작과 미리보기를 위한 내부 도구",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
