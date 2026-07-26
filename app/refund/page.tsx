import type { Metadata } from "next";
import { createPublicPageMetadata } from "@/lib/seo/site";
import PolicyDocumentPage from "@/components/policy/PolicyDocumentPage";
import { getPolicyDocument } from "@/lib/policies/documents";
import { getPublicBusinessInfo } from "@/lib/policies/publicConfig";

export const metadata: Metadata = createPublicPageMetadata({
  title: "환불·청약철회 안내",
  description: "TalkTheme 크레딧 결제 취소와 환불 안내",
  path: "/refund",
});
export default function RefundPage() { return <PolicyDocumentPage document={getPolicyDocument("refund")} businessInfo={getPublicBusinessInfo()} />; }
