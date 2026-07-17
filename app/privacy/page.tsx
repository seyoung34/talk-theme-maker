import type { Metadata } from "next";
import PolicyDocumentPage from "@/components/policy/PolicyDocumentPage";
import { getPolicyDocument } from "@/lib/policies/documents";
import { getPublicBusinessInfo } from "@/lib/policies/publicConfig";

export const metadata: Metadata = { title: "개인정보 처리방침 | TalkTheme", description: "TalkTheme 개인정보 처리와 파일 보관·삭제 안내" };
export default function PrivacyPage() { return <PolicyDocumentPage document={getPolicyDocument("privacy")} businessInfo={getPublicBusinessInfo()} />; }
