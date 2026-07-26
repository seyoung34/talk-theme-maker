import type { Metadata } from "next";
import { createPrivatePageMetadata } from "@/lib/seo/site";
import { Suspense } from "react";
import UpdatePasswordClient from "@/components/auth/UpdatePasswordClient";

export const metadata: Metadata = createPrivatePageMetadata(
  "비밀번호 변경",
  "새 비밀번호를 설정합니다.",
);

export default function UpdatePasswordPage() {
  return <Suspense fallback={null}><UpdatePasswordClient /></Suspense>;
}
