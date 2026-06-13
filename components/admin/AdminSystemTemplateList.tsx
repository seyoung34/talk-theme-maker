"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, RefreshCw } from "lucide-react";
import { localSystemTemplateRepository, type SystemTemplateSummary } from "@/lib/theme/systemTemplates";
import { templateStartStorageKey } from "@/lib/theme/templates";

export default function AdminSystemTemplateList() {
  const router = useRouter();
  const [templates, setTemplates] = useState<SystemTemplateSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  const editTemplate = (template: SystemTemplateSummary) => {
    localStorage.setItem(
      templateStartStorageKey,
      JSON.stringify({
        templateId: template.baseTemplateId,
        platform: template.platform,
        systemTemplateId: template.id,
        editMode: "admin",
      }),
    );
    router.push("/admin/edit");
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

      {error ? <p className="rounded-[18px] border border-red-100 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</p> : null}

      {templates.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {templates.map((template) => (
            <article key={template.id} className="grid min-h-[184px] content-between rounded-[24px] border border-[var(--color-outline-variant)] bg-white p-4 shadow-[0_12px_28px_rgba(42,103,103,0.06)]">
              <div className="grid gap-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="rounded-full bg-[var(--color-tertiary-container)]/50 px-2.5 py-1 text-[11px] font-black text-[var(--color-on-tertiary-container)]">{template.status}</span>
                  <span className="rounded-full bg-[var(--color-surface-low)] px-2.5 py-1 text-[11px] font-black uppercase text-[var(--color-on-surface-variant)]">{template.platform}</span>
                </div>
                <div>
                  <strong className="line-clamp-1 font-[var(--font-display)] text-xl font-semibold text-[var(--color-on-surface)]">{template.title}</strong>
                  {template.description ? <p className="mt-1 line-clamp-2 text-sm font-semibold leading-6 text-[var(--color-on-surface-variant)]">{template.description}</p> : null}
                </div>
              </div>

              <button
                type="button"
                className="mt-4 inline-flex w-fit items-center gap-2 rounded-full border border-[var(--color-outline-variant)] bg-white px-4 py-2 text-sm font-black text-[var(--color-on-surface)] transition hover:bg-[var(--color-primary-container)]"
                onClick={() => editTemplate(template)}
              >
                Edit
                <ArrowRight className="h-4 w-4" />
              </button>
            </article>
          ))}
        </div>
      ) : (
        <div className="rounded-[24px] border border-dashed border-[var(--color-outline-variant)] bg-[var(--color-surface-low)] p-5 text-sm font-bold text-[var(--color-on-surface-variant)]">
          {isLoading ? "Loading system templates." : "No system templates saved yet."}
        </div>
      )}
    </section>
  );
}
