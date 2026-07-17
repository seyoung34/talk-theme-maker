import type { Metadata } from "next";
import PolicyDocumentPage from "@/components/policy/PolicyDocumentPage";
import { getPolicyDocument } from "@/lib/policies/documents";
import { getPublicBusinessInfo } from "@/lib/policies/publicConfig";

export const metadata: Metadata = { title: "고객지원·사업자 정보 | TalkTheme", description: "TalkTheme 문의, 결제, 개인정보 요청과 사업자 정보" };
export default function SupportPage() { return <PolicyDocumentPage document={getPolicyDocument("support")} businessInfo={getPublicBusinessInfo()} />; }
