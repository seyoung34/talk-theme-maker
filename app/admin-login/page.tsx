import type { Metadata } from "next";
import { createPrivatePageMetadata } from "@/lib/seo/site";
import { Suspense } from "react";
import AdminLoginClient from "@/components/admin/AdminLoginClient";

export const metadata: Metadata = createPrivatePageMetadata(
  "관리자 로그인",
  "관리자 전용 로그인 화면입니다.",
);

export default function AdminLoginPage() {
  return (
    <Suspense>
      <AdminLoginClient />
    </Suspense>
  );
}
