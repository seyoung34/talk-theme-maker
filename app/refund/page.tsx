import type { Metadata } from "next";
import PolicyDocumentPage from "@/components/policy/PolicyDocumentPage";
import { getPolicyDocument } from "@/lib/policies/documents";
import { getPublicBusinessInfo } from "@/lib/policies/publicConfig";

export const metadata: Metadata = { title: "환불·청약철회 안내 | TalkTheme", description: "TalkTheme 크레딧 결제 취소와 환불 안내" };
export default function RefundPage() { return <PolicyDocumentPage document={getPolicyDocument("refund")} businessInfo={getPublicBusinessInfo()} />; }
