"use client";

import { useState } from "react";
import { generateSystemTemplateThumbnail } from "@/lib/theme/systemTemplates/thumbnail";
import { getThemeTemplate } from "@/lib/theme/templates";

// 내장 기본 템플릿은 시스템 템플릿 저장 경로를 타지 않아 카드 썸네일이 없다.
// 시스템 템플릿과 같은 9-slice 렌더러로 한 번 구워 public/에 저장한다.
export default function BakeThumbnailsClient() {
  const [status, setStatus] = useState<string>();
  const [previewUrl, setPreviewUrl] = useState<string>();
  const [isBaking, setIsBaking] = useState(false);

  const bake = async () => {
    setIsBaking(true);
    setStatus("굽는 중…");
    try {
      const template = getThemeTemplate("basic");
      const blob = await generateSystemTemplateThumbnail({
        baseTemplateId: "basic",
        platform: template.defaults.platform,
        overrides: {
          colors: {},
          uploads: {},
          candidateSelections: {},
          bubbleEdits: { geometry: {}, markers: {}, insets: {}, stretch: {}, designs: {} },
        },
      });
      if (!blob) throw new Error("썸네일을 만들지 못했습니다.");

      setPreviewUrl(URL.createObjectURL(blob));
      const formData = new FormData();
      formData.append("file", blob, "card-preview.webp");
      formData.append("fileName", "card-preview.webp");
      const response = await fetch("/api/dev/bake-base-thumbnail", { method: "POST", body: formData });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "저장 실패");
      setStatus(`저장 완료: ${payload.path} (${Math.round(payload.bytes / 1024)}KB, platform=${template.defaults.platform})`);
    } catch (error) {
      console.error(error);
      setStatus(error instanceof Error ? error.message : "실패했습니다.");
    } finally {
      setIsBaking(false);
    }
  };

  return (
    <main className="mx-auto grid max-w-2xl gap-4 p-8">
      <h1 className="text-2xl font-black">기본 템플릿 카드 썸네일 굽기</h1>
      <p className="text-sm font-medium leading-6 text-slate-600">
        내장 <code>basic</code> 템플릿의 갤러리 카드 썸네일을 시스템 템플릿과 동일한 9-slice 렌더러로 생성해
        <code className="mx-1">public/template-assets/basic/card-preview.webp</code>에 저장합니다. 개발 환경에서만 동작합니다.
      </p>
      <button
        type="button"
        data-testid="bake-thumbnail"
        disabled={isBaking}
        onClick={() => void bake()}
        className="inline-flex min-h-12 w-fit items-center rounded-xl bg-blue-600 px-5 text-sm font-black text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {isBaking ? "굽는 중" : "썸네일 굽기"}
      </button>
      {status ? <p className="rounded-xl bg-slate-100 p-3 text-sm font-bold text-slate-700">{status}</p> : null}
      {previewUrl ? <img src={previewUrl} alt="생성된 썸네일" className="w-[320px] rounded-xl border border-slate-200" /> : null}
    </main>
  );
}
