import type { Metadata } from "next";
import { createPrivatePageMetadata } from "@/lib/seo/site";
import { Suspense } from "react";
import TemplateEditorClient from "@/components/template/TemplateEditorClient";

export const metadata: Metadata = createPrivatePageMetadata(
  "테마 편집",
  "고른 템플릿의 이미지와 색상을 바꿔 나만의 카카오톡 테마를 만듭니다.",
);

export default function EditPage() {
  return <Suspense fallback={null}><TemplateEditorClient /></Suspense>;
}
