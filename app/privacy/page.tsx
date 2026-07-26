import type { Metadata } from "next";
import { createPublicPageMetadata } from "@/lib/seo/site";
import PolicyDocumentPage from "@/components/policy/PolicyDocumentPage";
import { getPolicyDocument } from "@/lib/policies/documents";
import { getPublicBusinessInfo } from "@/lib/policies/publicConfig";

export const metadata: Metadata = createPublicPageMetadata({
  title: "개인정보 처리방침",
  description: "TalkTheme 개인정보 처리와 파일 보관·삭제 안내",
  path: "/privacy",
});
export default function PrivacyPage() { return <PolicyDocumentPage document={getPolicyDocument("privacy")} businessInfo={getPublicBusinessInfo()} />; }
