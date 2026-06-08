import { ArrowRight, Trash2 } from "lucide-react";
import type { UserTemplateSummary } from "@/lib/theme/userTemplates";

export default function UserTemplateCard({
  template,
  formattedDate,
  onDelete,
  onContinue,
}: {
  template: UserTemplateSummary;
  formattedDate: string;
  onDelete: (event: React.MouseEvent<HTMLButtonElement>, template: UserTemplateSummary) => void;
  onContinue: (template: UserTemplateSummary) => void;
}) {
  return (
    <article className="grid min-h-[214px] content-between rounded-[24px] border border-[var(--color-outline-variant)] bg-[var(--color-surface-lowest)] p-4 shadow-[0_14px_32px_rgba(42,103,103,0.05)] transition hover:-translate-y-1 hover:shadow-[0_20px_40px_rgba(42,103,103,0.1)]">
      <div className="grid gap-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <strong className="block truncate text-lg font-black text-[var(--color-on-surface)]">{template.name}</strong>
            <p className="mt-1 text-sm leading-6 text-[var(--color-on-surface-variant)]">
              업로드 {template.uploadCount}개 · 색상 {template.colorCount}개
            </p>
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

        <div className="grid grid-cols-[auto_1fr] gap-3 rounded-[20px] bg-[var(--color-surface-low)] p-3">
          <div className="h-16 w-16 rounded-[18px] bg-[linear-gradient(135deg,var(--color-secondary-container),var(--color-surface-lowest))]" />
          <div className="grid content-between gap-2">
            <span className="inline-flex w-fit rounded-full bg-white px-2.5 py-1 text-[11px] font-black text-[var(--color-on-surface-variant)]">
              {template.platform === "android" ? "Android" : "iOS"}
            </span>
            <span className="text-xs font-bold text-[var(--color-on-surface-variant)]">{formattedDate}</span>
          </div>
        </div>
      </div>

      <button
        type="button"
        className="hover:ring hover:ring-black inline-flex w-fit items-center gap-2  mt-2 rounded-full bg-[var(--color-primary-container)] px-4 py-2.5 text-sm font-black text-[var(--color-on-primary-container)] shadow-[0_10px_22px_rgba(254,229,0,0.22)]"
        onClick={() => onContinue(template)}
      >
        편집 계속하기
        <ArrowRight className="w-4 h-4" />
      </button>
    </article>
  );
}
