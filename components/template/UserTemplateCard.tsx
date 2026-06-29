import { ArrowRight, Eye, Layers3, Palette, Search, Settings, Trash2, UserRound } from "lucide-react";
import type { TemplatePreviewVisual } from "@/lib/theme/systemTemplates/preview";
import type { UserTemplateSummary } from "@/lib/theme/userTemplates";

export default function UserTemplateCard({
  template,
  visual,
  formattedDate,
  onDelete,
  onContinue,
  onPreview,
}: {
  template: UserTemplateSummary;
  visual?: TemplatePreviewVisual;
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
          {visual ? <UserTemplateMiniPreview visual={visual} /> : <UserTemplatePreviewSkeleton />}
          <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-black text-[var(--color-on-surface-variant)] shadow-sm">
            <Eye className="size-3" aria-hidden="true" />
            {visual ? "저장본 미리보기" : "준비 중"}
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

function UserTemplateMiniPreview({ visual }: { visual: TemplatePreviewVisual }) {
  return (
    <div className="grid aspect-[4/3] grid-cols-[0.82fr_1fr] gap-2">
      <div
        className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden rounded-[18px] bg-white/75 bg-cover bg-center shadow-[0_10px_24px_rgba(42,103,103,0.08)]"
        style={{ backgroundColor: visual.mainBackgroundColor, backgroundImage: visual.mainBackgroundImage ? `url(${visual.mainBackgroundImage})` : undefined }}
      >
        <div className="flex h-8 items-center justify-between px-3 text-[var(--color-on-surface)]">
          <span className="grid grid-cols-[18px_minmax(0,1fr)] items-center gap-1.5">
            <MiniAvatar src={visual.profileImage} />
            <span className="h-3 w-12 rounded-full bg-black/15" />
          </span>
          <span className="flex gap-1.5">
            <Search className="size-3.5" aria-hidden="true" />
            <Settings className="size-3.5" aria-hidden="true" />
          </span>
        </div>
        <div className="grid content-start gap-2 px-3 py-2">
          <span className="h-7 rounded-full bg-white/75 shadow-sm" />
          <MiniFriendLine visual={visual} width="w-4/5" />
          <MiniFriendLine visual={visual} width="w-full" />
        </div>
        <div className="grid h-7 grid-cols-5 items-center bg-cover bg-center px-2" style={{ backgroundColor: visual.tabBackgroundColor, backgroundImage: visual.tabBackgroundImage ? `url(${visual.tabBackgroundImage})` : undefined }}>
          {Array.from({ length: 5 }).map((_, index) => (
            <span key={index} className={`mx-auto rounded-full ${index === 1 ? "size-4 bg-[var(--color-primary-container)]" : "size-3 bg-black/15"}`} />
          ))}
        </div>
      </div>
      <div
        className="grid content-between overflow-hidden rounded-[18px] bg-cover bg-center p-2 shadow-[0_10px_24px_rgba(42,103,103,0.08)]"
        style={{ backgroundColor: visual.chatBackgroundColor, backgroundImage: visual.chatBackgroundImage ? `url(${visual.chatBackgroundImage})` : undefined }}
      >
        <span className="h-6 w-20 rounded-full bg-white/80" />
        <div className="grid gap-2">
          <MiniBubble visual={visual} tone="friend" width="w-4/5" />
          <MiniBubble visual={visual} tone="me" width="w-3/4" />
          <MiniBubble visual={visual} tone="friend" width="w-5/6" />
        </div>
      </div>
    </div>
  );
}

function UserTemplatePreviewSkeleton() {
  return (
    <div className="grid aspect-[4/3] grid-cols-[0.8fr_1fr] gap-2">
      <div className="grid grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden rounded-[18px] bg-white shadow-[0_10px_24px_rgba(42,103,103,0.08)]">
        <div className="flex h-8 items-center justify-between px-3">
          <span className="h-3 w-12 rounded-full bg-black/12" />
          <span className="grid size-4 place-items-center rounded-full bg-black/10" />
        </div>
        <div className="grid content-start gap-2 px-3 py-2">
          <span className="h-7 animate-pulse rounded-full bg-[var(--color-primary-container)]/70" />
          <span className="h-4 w-3/4 animate-pulse rounded-full bg-black/10" />
          <span className="h-4 w-5/6 animate-pulse rounded-full bg-black/10" />
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
          <span className="h-8 w-4/5 animate-pulse rounded-[14px] bg-white" />
          <span className="h-8 w-3/4 justify-self-end animate-pulse rounded-[14px] bg-[var(--color-primary-container)]" />
          <span className="h-8 w-5/6 animate-pulse rounded-[14px] bg-white" />
        </div>
      </div>
    </div>
  );
}

function MiniFriendLine({ visual, width }: { visual: TemplatePreviewVisual; width: string }) {
  return (
    <span className={`grid grid-cols-[18px_minmax(0,1fr)] items-center gap-1.5 ${width}`}>
      <MiniAvatar src={visual.profileImage} />
      <span className="h-3 rounded-full bg-black/12" />
    </span>
  );
}

function MiniAvatar({ src }: { src?: string }) {
  return (
    <span className="grid size-[18px] place-items-center overflow-hidden rounded-full bg-[var(--color-primary-container)]/65">
      {src ? <img src={src} alt="" className="h-full w-full object-cover" /> : <UserRound className="size-3 text-[var(--color-on-primary-container)]" aria-hidden="true" />}
    </span>
  );
}

function MiniBubble({ visual, tone, width }: { visual: TemplatePreviewVisual; tone: "me" | "friend"; width: string }) {
  const mine = tone === "me";
  const image = mine ? visual.myBubbleImage : visual.friendBubbleImage;
  if (image) {
    return (
      <span className={`${width} ${mine ? "justify-self-end" : ""}`}>
        <img src={image} alt="" className="h-8 w-full object-contain" />
      </span>
    );
  }

  return (
    <span
      className={`${width} h-8 rounded-[14px] ${mine ? "justify-self-end" : ""}`}
      style={{ backgroundColor: mine ? visual.myBubbleColor : visual.friendBubbleColor }}
    />
  );
}
