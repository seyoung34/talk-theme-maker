import type { Metadata } from "next";
import PolicyDocumentPage from "@/components/policy/PolicyDocumentPage";
import { getPolicyDocument } from "@/lib/policies/documents";
import { getPublicBusinessInfo } from "@/lib/policies/publicConfig";

export const metadata: Metadata = { title: "이용약관 | TalkTheme", description: "TalkTheme 서비스 이용약관" };
export default function TermsPage() { return <PolicyDocumentPage document={getPolicyDocument("terms")} businessInfo={getPublicBusinessInfo()} />; }
