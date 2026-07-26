import type { Metadata } from "next";
import { createPublicPageMetadata } from "@/lib/seo/site";
import TemplateGalleryClient from "@/components/template/TemplateGalleryClient";

export const metadata: Metadata = createPublicPageMetadata({
  title: "테마 템플릿 고르기",
  description: "연인·캐릭터·반려동물 등 원하는 분위기의 카카오톡 테마 템플릿을 고르고 Android 또는 iOS로 바로 편집을 시작하세요.",
  path: "/template",
});

export default function TemplatePage() {
  return <TemplateGalleryClient />;
}
