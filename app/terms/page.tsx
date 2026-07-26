import type { Metadata } from "next";
import { createPublicPageMetadata } from "@/lib/seo/site";
import PolicyDocumentPage from "@/components/policy/PolicyDocumentPage";
import { getPolicyDocument } from "@/lib/policies/documents";
import { getPublicBusinessInfo } from "@/lib/policies/publicConfig";

export const metadata: Metadata = createPublicPageMetadata({
  title: "이용약관",
  description: "TalkTheme 서비스 이용약관",
  path: "/terms",
});
export default function TermsPage() { return <PolicyDocumentPage document={getPolicyDocument("terms")} businessInfo={getPublicBusinessInfo()} />; }
