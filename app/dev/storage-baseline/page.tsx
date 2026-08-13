import { notFound } from "next/navigation";
import StorageBaselineClient from "@/components/dev/StorageBaselineClient";

export const dynamic = "force-dynamic";

// 개발 전용 화면. 저장 구조 변경(계획 Phase 2~5)의 착수 조건인 baseline을 잰다.
export default function StorageBaselinePage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <StorageBaselineClient />;
}
