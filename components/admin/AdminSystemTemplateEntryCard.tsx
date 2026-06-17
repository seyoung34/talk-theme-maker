"use client";

import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { templateStartStorageKey } from "@/lib/theme/templates";
import type { ThemePlatform } from "@/lib/theme/types";

export default function AdminSystemTemplateEntryCard() {
  const router = useRouter();

  const startNewSystemTemplate = (platform: ThemePlatform) => {
    localStorage.setItem(
      templateStartStorageKey,
      JSON.stringify({
        templateId: "basic",
        platform,
        editMode: "admin",
      }),
    );
    router.push("/admin/edit");
  };

  return (
    <section className="grid min-h-[160px] content-between rounded-[28px] border border-[var(--color-outline-variant)] bg-white p-5 shadow-[0_16px_36px_rgba(42,103,103,0.06)]">
      <div>
        <strong className="font-[var(--font-display)] text-2xl font-semibold text-[var(--color-on-surface)]">시스템 템플릿</strong>
        <p className="mt-2 text-sm font-semibold leading-6 text-[var(--color-on-surface-variant)]">새 시스템 템플릿을 추가하거나 아래 목록에서 편집합니다.</p>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        <button
          type="button"
          className="inline-flex w-fit items-center gap-2 rounded-full border border-[var(--color-outline-variant)] bg-white px-4 py-2 text-sm font-black text-[var(--color-on-surface)] transition hover:bg-[var(--color-primary-container)]"
          onClick={() => startNewSystemTemplate("android")}
        >
          Android 추가
          <ArrowRight className="h-4 w-4" />
        </button>
        <button
          type="button"
          className="inline-flex w-fit items-center gap-2 rounded-full border border-[var(--color-outline-variant)] bg-white px-4 py-2 text-sm font-black text-[var(--color-on-surface)] transition hover:bg-[var(--color-primary-container)]"
          onClick={() => startNewSystemTemplate("ios")}
        >
          iOS 추가
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </section>
  );
}
