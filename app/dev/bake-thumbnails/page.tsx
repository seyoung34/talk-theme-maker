import { notFound } from "next/navigation";
import BakeThumbnailsClient from "@/components/dev/BakeThumbnailsClient";

export const dynamic = "force-dynamic";

// 개발 전용 화면. 내장 기본 템플릿의 갤러리 카드 썸네일을 굽는다.
export default function BakeThumbnailsPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <BakeThumbnailsClient />;
}
