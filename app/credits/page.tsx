import type { Metadata } from "next";
import { createPrivatePageMetadata } from "@/lib/seo/site";
import { Suspense } from "react";
import CreditsClient from "@/components/billing/CreditsClient";

export const metadata: Metadata = createPrivatePageMetadata(
  "크레딧 충전",
  "카카오톡 테마 파일을 받는 데 사용할 크레딧을 충전합니다.",
);

export default function CreditsPage() {
  return <Suspense fallback={null}><CreditsClient /></Suspense>;
}
