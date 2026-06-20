import { Suspense } from "react";
import CreditsClient from "@/components/billing/CreditsClient";

export default function CreditsPage() {
  return <Suspense fallback={null}><CreditsClient /></Suspense>;
}
