import type { Metadata } from "next";
import { Suspense } from "react";
import { createPrivatePageMetadata } from "@/lib/seo/site";
import InquiriesClient from "@/components/inquiry/InquiriesClient";

export const metadata: Metadata = createPrivatePageMetadata(
  "문의 내역",
  "접수한 문의와 답변을 확인합니다.",
);

export default function InquiriesPage() {
  return (
    <Suspense fallback={null}>
      <InquiriesClient />
    </Suspense>
  );
}
