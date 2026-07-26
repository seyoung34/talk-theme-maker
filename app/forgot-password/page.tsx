import type { Metadata } from "next";
import { createPrivatePageMetadata } from "@/lib/seo/site";
import { Suspense } from "react";
import PasswordResetRequestClient from "@/components/auth/PasswordResetRequestClient";

export const metadata: Metadata = createPrivatePageMetadata(
  "비밀번호 재설정 요청",
  "가입한 이메일로 비밀번호 재설정 링크를 받습니다.",
);

export default function ForgotPasswordPage() {
  return <Suspense fallback={null}><PasswordResetRequestClient /></Suspense>;
}
