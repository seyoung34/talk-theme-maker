"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, RefreshCw, Trash2 } from "lucide-react";
import { localSystemTemplateRepository, type SystemTemplateSummary } from "@/lib/theme/systemTemplates";
import { templateStartStorageKey } from "@/lib/theme/templates";
import type { ThemePlatform } from "@/lib/theme/types";

type SystemTemplateBundleSummary = {
  id: string;
  title: string;
  description?: string;
  variants: Partial<Record<ThemePlatform, SystemTemplateSummary>>;
  updatedAt: number;
};

export default function AdminSystemTemplateList() {
  const router = useRouter();
  const [templates, setTemplates] = useState<SystemTemplateSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<SystemTemplateBundleSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadTemplates = async () => {
    try {
      setIsLoading(true);
      setError(null);
      setTemplates(await localSystemTemplateRepository.list());
    } catch (loadError) {
      console.error(loadError);
      setError("System templates could not be loaded.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadTemplates();
  }, []);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 2800);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const bundles = groupSystemTemplateBundles(templates);

  const editTemplate = (template: SystemTemplateSummary) => {
    localStorage.setItem(
      templateStartStorageKey,
      JSON.stringify({
        templateId: template.baseTemplateId,
        platform: template.platform,
        systemTemplateId: template.id,
        systemTemplateBundleId: template.bundleId ?? template.id,
        editMode: "admin",
      }),
    );
    router.push("/admin/edit");
  };

  const createVariant = (bundle: SystemTemplateBundleSummary, platform: ThemePlatform) => {
    const fallback = bundle.variants.android ?? bundle.variants.ios;
    localStorage.setItem(
      templateStartStorageKey,
      JSON.stringify({
        templateId: fallback?.baseTemplateId ?? "basic",
        platform,
        systemTemplateBundleId: bundle.id,
        sourceSystemTemplateId: fallback?.id,
        editMode: "admin",
      }),
    );
    router.push("/admin/edit");
  };

  const deleteTemplate = async () => {
    if (!deleteTarget) return;

    try {
      setIsDeleting(true);
      setError(null);
      const ids = Object.values(deleteTarget.variants).map((template) => template.id);
      await Promise.all(ids.map((id) => localSystemTemplateRepository.delete(id)));
      setTemplates((current) => current.filter((template) => !ids.includes(template.id)));
      setNotice("시스템 템플릿을 삭제했습니다.");
      setDeleteTarget(null);
    } catch (deleteError) {
      console.error(deleteError);
      setError("시스템 템플릿을 삭제하지 못했습니다.");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <section className="grid gap-4 rounded-[32px] border border-[var(--color-outline-variant)] bg-white/92 p-5 shadow-[0_18px_48px_rgba(42,103,103,0.08)]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-[var(--font-display)] text-2xl font-semibold text-[var(--color-on-surface)]">System Templates</h2>
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-full border border-[var(--color-outline-variant)] bg-white px-3 py-2 text-xs font-black text-[var(--color-on-surface)] transition hover:bg-[var(--color-primary-container)]"
          onClick={() => void loadTemplates()}
          disabled={isLoading}
        >
          <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {notice ? <p className="rounded-[18px] border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700">{notice}</p> : null}
      {error ? <p className="rounded-[18px] border border-red-100 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</p> : null}

      {bundles.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {bundles.map((bundle) => (
            <article key={bundle.id} className="grid min-h-[220px] content-between rounded-[24px] border border-[var(--color-outline-variant)] bg-white p-4 shadow-[0_12px_28px_rgba(42,103,103,0.06)]">
              <div className="grid gap-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="rounded-full bg-[var(--color-tertiary-container)]/50 px-2.5 py-1 text-[11px] font-black text-[var(--color-on-tertiary-container)]">System</span>
                  <span className="rounded-full bg-[var(--color-surface-low)] px-2.5 py-1 text-[11px] font-black uppercase text-[var(--color-on-surface-variant)]">{Object.keys(bundle.variants).join(" / ")}</span>
                </div>
                <div>
                  <strong className="line-clamp-1 font-[var(--font-display)] text-xl font-semibold text-[var(--color-on-surface)]">{bundle.title}</strong>
                  {bundle.description ? <p className="mt-1 line-clamp-2 text-sm font-semibold leading-6 text-[var(--color-on-surface-variant)]">{bundle.description}</p> : null}
                </div>
                <div className="grid gap-2">
                  {(["android", "ios"] as const).map((platform) => {
                    const variant = bundle.variants[platform];
                    return (
                      <div key={platform} className="flex items-center justify-between gap-3 rounded-2xl bg-[var(--color-surface-low)] px-3 py-2">
                        <span className="text-xs font-black uppercase text-[var(--color-on-surface-variant)]">{platform}</span>
                        <button
                          type="button"
                          className="rounded-full border border-[var(--color-outline-variant)] bg-white px-3 py-1.5 text-xs font-black text-[var(--color-on-surface)] transition hover:bg-[var(--color-primary-container)]"
                          onClick={() => (variant ? editTemplate(variant) : createVariant(bundle, platform))}
                        >
                          {variant ? "편집" : "추가"}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {bundle.variants.android ? (
                  <button
                    type="button"
                    className="inline-flex w-fit items-center gap-2 rounded-full border border-[var(--color-outline-variant)] bg-white px-4 py-2 text-sm font-black text-[var(--color-on-surface)] transition hover:bg-[var(--color-primary-container)]"
                    onClick={() => editTemplate(bundle.variants.android!)}
                  >
                    Edit
                    <ArrowRight className="h-4 w-4" />
                  </button>
                ) : null}
                <button
                  type="button"
                  className="inline-flex w-fit items-center gap-2 rounded-full border border-red-100 bg-red-50 px-4 py-2 text-sm font-black text-red-700 transition hover:bg-red-100"
                  onClick={() => setDeleteTarget(bundle)}
                >
                  삭제
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="rounded-[24px] border border-dashed border-[var(--color-outline-variant)] bg-[var(--color-surface-low)] p-5 text-sm font-bold text-[var(--color-on-surface-variant)]">
          {isLoading ? "Loading system templates." : "No system templates saved yet."}
        </div>
      )}

      {deleteTarget ? (
        <DeleteSystemTemplateDialog
          template={deleteTarget}
          isDeleting={isDeleting}
          onClose={() => {
            if (!isDeleting) setDeleteTarget(null);
          }}
          onConfirm={() => void deleteTemplate()}
        />
      ) : null}
    </section>
  );
}

function DeleteSystemTemplateDialog({
  template,
  isDeleting,
  onClose,
  onConfirm,
}: {
  template: SystemTemplateBundleSummary;
  isDeleting: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[100] grid place-items-center bg-[rgba(15,23,42,0.42)] p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="시스템 템플릿 삭제">
      <section className="grid w-full max-w-[440px] gap-5 rounded-[28px] border border-[#e5e7eb] bg-white p-5 shadow-[0_24px_60px_rgba(15,23,42,0.18)]">
        <div className="grid gap-2">
          <span className="w-fit rounded-full bg-red-50 px-3 py-1 text-xs font-black text-red-700">삭제 확인</span>
          <h3 className="font-[var(--font-display)] text-2xl font-semibold text-[var(--color-on-surface)]">{template.title}</h3>
          <p className="text-sm font-semibold leading-6 text-[var(--color-on-surface-variant)]">삭제한 시스템 템플릿과 연결된 Android/iOS variant는 목록과 템플릿 갤러리에서 사라집니다.</p>
        </div>

        <div className="flex justify-end gap-2">
          <button type="button" className="rounded-xl border border-[#d1d5db] bg-white px-4 py-2 text-sm font-semibold text-[#334155]" onClick={onClose} disabled={isDeleting}>
            취소
          </button>
          <button type="button" className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white disabled:cursor-wait disabled:opacity-60" onClick={onConfirm} disabled={isDeleting}>
            {isDeleting ? "삭제 중.." : "삭제"}
          </button>
        </div>
      </section>
    </div>
  );
}

function groupSystemTemplateBundles(templates: SystemTemplateSummary[]): SystemTemplateBundleSummary[] {
  const map = new Map<string, SystemTemplateBundleSummary>();

  for (const template of templates) {
    const bundleId = template.bundleId ?? template.id;
    const current = map.get(bundleId);
    if (current) {
      current.variants[template.platform] = template;
      current.updatedAt = Math.max(current.updatedAt, template.updatedAt);
      continue;
    }
    map.set(bundleId, {
      id: bundleId,
      title: template.title,
      description: template.description,
      variants: { [template.platform]: template },
      updatedAt: template.updatedAt,
    });
  }

  return Array.from(map.values()).sort((left, right) => right.updatedAt - left.updatedAt);
}
