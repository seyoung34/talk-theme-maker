import type { Metadata } from "next";
import { createPublicPageMetadata } from "@/lib/seo/site";
import PolicyDocumentPage from "@/components/policy/PolicyDocumentPage";
import { getPolicyDocument } from "@/lib/policies/documents";
import { getPublicBusinessInfo } from "@/lib/policies/publicConfig";

export const metadata: Metadata = createPublicPageMetadata({
  title: "저작권·권리침해 신고",
  description: "TalkTheme 공개 콘텐츠 권리침해 신고 절차",
  path: "/copyright",
});
export default function CopyrightPage() { return <PolicyDocumentPage document={getPolicyDocument("copyright")} businessInfo={getPublicBusinessInfo()} />; }
