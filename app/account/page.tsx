import type { Metadata } from "next";
import { createPrivatePageMetadata } from "@/lib/seo/site";
import { Suspense } from "react";
import AccountClient from "@/components/account/AccountClient";

export const metadata: Metadata = createPrivatePageMetadata(
  "마이페이지",
  "계정 정보와 보유 크레딧, 최근 내보내기 이력을 확인합니다.",
);

export default function AccountPage() {
  return (
    <Suspense fallback={null}>
      <AccountClient />
    </Suspense>
  );
}
