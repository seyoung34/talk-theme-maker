import type { Metadata } from "next";
import { createPrivatePageMetadata } from "@/lib/seo/site";
import { Suspense } from "react";
import LoginClient from "@/components/auth/LoginClient";

export const metadata: Metadata = createPrivatePageMetadata(
  "로그인",
  "TalkTheme 계정으로 로그인합니다.",
);

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginClient />
    </Suspense>
  );
}
