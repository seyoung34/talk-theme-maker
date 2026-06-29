import { ArrowRight, Eye, Layers3, Palette, Trash2 } from "lucide-react";
import type { UserTemplateSummary } from "@/lib/theme/userTemplates";

export default function UserTemplateCard({
  template,
  formattedDate,
  onDelete,
  onContinue,
  onPreview,
}: {
  template: UserTemplateSummary;
  formattedDate: string;
  onDelete: (event: React.MouseEvent<HTMLButtonElement>, template: UserTemplateSummary) => void;
  onContinue: (template: UserTemplateSummary) => void;
  onPreview: (template: UserTemplateSummary) => void;
}) {
  return (
    <article className="grid min-h-[320px] content-between overflow-hidden rounded-[28px] border border-[var(--color-outline-variant)] bg-white p-4 shadow-[0_14px_32px_rgba(42,103,103,0.05)] transition hover:-translate-y-1 hover:shadow-[0_20px_40px_rgba(42,103,103,0.1)]">
      <div className="grid gap-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <strong className="block truncate text-lg font-black text-[var(--color-on-surface)]">{template.name}</strong>
            <p className="mt-1 text-sm leading-6 text-[var(--color-on-surface-variant)]">최근 수정 {formattedDate}</p>
          </div>
          <button
            type="button"
            aria-label={`${template.name} 삭제`}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-[var(--color-outline-variant)] bg-white text-[var(--color-on-surface-variant)] transition hover:border-[var(--color-error)] hover:text-[var(--color-error)]"
            onClick={(event) => onDelete(event, template)}
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>

        <div className="relative overflow-hidden rounded-[24px] border border-[var(--color-outline-variant)] bg-[var(--color-surface-low)] p-3">
          <div className="grid aspect-[4/3] grid-cols-[0.8fr_1fr] gap-2">
            <div className="grid grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden rounded-[18px] bg-white shadow-[0_10px_24px_rgba(42,103,103,0.08)]">
              <div className="flex h-8 items-center justify-between px-3">
                <span className="h-3 w-12 rounded-full bg-black/12" />
                <span className="grid size-4 place-items-center rounded-full bg-black/10" />
              </div>
              <div className="grid content-start gap-2 px-3 py-2">
                <span className="h-7 rounded-full bg-[var(--color-primary-container)]/70" />
                <span className="h-4 w-3/4 rounded-full bg-black/10" />
                <span className="h-4 w-5/6 rounded-full bg-black/10" />
              </div>
              <div className="grid h-7 grid-cols-5 items-center bg-white/90 px-2">
                {Array.from({ length: 5 }).map((_, index) => (
                  <span key={index} className={`mx-auto rounded-full ${index === 1 ? "size-4 bg-[var(--color-primary-container)]" : "size-3 bg-black/15"}`} />
                ))}
              </div>
            </div>
            <div className="grid content-between overflow-hidden rounded-[18px] bg-[linear-gradient(160deg,var(--color-secondary-container),white)] p-2 shadow-[0_10px_24px_rgba(42,103,103,0.08)]">
              <span className="h-6 w-20 rounded-full bg-white/80" />
              <div className="grid gap-2">
                <span className="h-8 w-4/5 rounded-[14px] bg-white" />
                <span className="h-8 w-3/4 justify-self-end rounded-[14px] bg-[var(--color-primary-container)]" />
                <span className="h-8 w-5/6 rounded-[14px] bg-white" />
              </div>
            </div>
          </div>
          <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-black text-[var(--color-on-surface-variant)] shadow-sm">
            <Eye className="size-3" aria-hidden="true" />
            미리보기
          </span>
          <span className="absolute right-3 top-3 rounded-full bg-[var(--color-inverse-surface)] px-2.5 py-1 text-[11px] font-black text-[var(--color-inverse-on-surface)]">
            {template.platform === "android" ? "Android" : "iOS"}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <span className="inline-flex items-center gap-2 rounded-2xl bg-[var(--color-surface-low)] px-3 py-2 text-xs font-black text-[var(--color-on-surface-variant)]">
            <Layers3 className="size-4" aria-hidden="true" />
            이미지 {template.uploadCount}
          </span>
          <span className="inline-flex items-center gap-2 rounded-2xl bg-[var(--color-surface-low)] px-3 py-2 text-xs font-black text-[var(--color-on-surface-variant)]">
            <Palette className="size-4" aria-hidden="true" />
            색상 {template.colorCount}
          </span>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-full border border-[var(--color-outline-variant)] bg-white px-4 py-2.5 text-sm font-black text-[var(--color-on-surface)] transition hover:-translate-y-0.5 hover:bg-[var(--color-surface-low)] active:translate-y-0"
          onClick={() => onPreview(template)}
        >
          미리보기
          <Eye className="w-4 h-4" />
        </button>
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-full bg-[var(--color-primary-container)] px-4 py-2.5 text-sm font-black text-[var(--color-on-primary-container)] shadow-[0_10px_22px_rgba(254,229,0,0.22)] transition hover:-translate-y-0.5 hover:ring hover:ring-black/10 active:translate-y-0"
          onClick={() => onContinue(template)}
        >
          편집 계속하기
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </article>
  );
}
