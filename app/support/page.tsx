import type { Metadata } from "next";
import { createPublicPageMetadata } from "@/lib/seo/site";
import PolicyDocumentPage from "@/components/policy/PolicyDocumentPage";
import { getPolicyDocument } from "@/lib/policies/documents";
import { getPublicBusinessInfo } from "@/lib/policies/publicConfig";

export const metadata: Metadata = createPublicPageMetadata({
  title: "고객지원·사업자 정보",
  description: "TalkTheme 문의, 결제, 개인정보 요청과 사업자 정보",
  path: "/support",
});
export default function SupportPage() { return <PolicyDocumentPage document={getPolicyDocument("support")} businessInfo={getPublicBusinessInfo()} />; }
