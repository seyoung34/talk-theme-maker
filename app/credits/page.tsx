import type { Metadata } from "next";
import { createPrivatePageMetadata } from "@/lib/seo/site";
import { Suspense } from "react";
import CreditsClient from "@/components/billing/CreditsClient";

export const metadata: Metadata = createPrivatePageMetadata(
  "크레딧 충전",
  "테마 내보내기에 사용할 크레딧을 충전합니다.",
);

export default function CreditsPage() {
  return <Suspense fallback={null}><CreditsClient /></Suspense>;
}
