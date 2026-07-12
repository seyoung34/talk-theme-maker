import { Plus, Search, SendHorizontal, Settings, UserRound } from "lucide-react";
import type { TemplatePreviewVisual } from "@/lib/theme/systemTemplates/preview";

export default function TemplateVisualPreview({
  visual,
  size = "card",
}: {
  visual: TemplatePreviewVisual;
  size?: "card" | "thumb";
}) {
  const isThumb = size === "thumb";
  const radiusClass = isThumb ? "rounded-[12px]" : "rounded-[22px]";

  if (visual.cardPreviewImage) {
    return (
      <img
        src={visual.cardPreviewImage}
        alt=""
        loading="lazy"
        decoding="async"
        className={`aspect-[16/15] w-full border border-[var(--color-outline-variant)] bg-[var(--color-surface-low)] object-cover ${radiusClass}`}
      />
    );
  }

  if (isThumb) {
    return (
      <div className="relative aspect-[16/15] overflow-hidden rounded-[12px] border border-[var(--color-outline-variant)] shadow-[inset_0_1px_0_rgba(255,255,255,0.65)]">
        <div className="grid h-full grid-cols-[0.84fr_1fr] gap-1 p-1">
          <div
            className="rounded-[8px] bg-cover bg-center"
            style={{ backgroundColor: visual.mainBackgroundColor, backgroundImage: visual.mainBackgroundImage ? `url(${visual.mainBackgroundImage})` : undefined }}
          />
          <div
            className="grid grid-rows-3 gap-0.5 rounded-[8px] bg-cover bg-center p-1"
            style={{ backgroundColor: visual.chatBackgroundColor, backgroundImage: visual.chatBackgroundImage ? `url(${visual.chatBackgroundImage})` : undefined }}
          >
            <MiniBubbleSwatch visual={visual} tone="friend" width="w-[70%]" />
            <MiniBubbleSwatch visual={visual} tone="me" width="w-[78%]" />
            <MiniBubbleSwatch visual={visual} tone="friend" width="w-[85%]" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative aspect-[16/15] overflow-hidden rounded-[22px] border border-[var(--color-outline-variant)] bg-cover bg-center shadow-[inset_0_1px_0_rgba(255,255,255,0.65)]">
      <div className="relative grid h-full grid-cols-[0.84fr_1fr] gap-2.5 p-3">
        <div
          className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden rounded-[18px] bg-white/70 bg-contain bg-center bg-no-repeat shadow-[0_12px_26px_rgba(42,103,103,0.08)]"
          style={{ backgroundColor: visual.mainBackgroundColor, backgroundImage: visual.mainBackgroundImage ? `url(${visual.mainBackgroundImage})` : undefined }}
        >
          <div className="flex h-9 items-center justify-between px-3">
            <strong className="text-sm font-black text-[var(--color-on-surface)]">친구</strong>
            <div className="flex items-center gap-1.5 text-[var(--color-on-surface)]">
              <Search className="h-3.5 w-3.5" />
              <Settings className="h-3.5 w-3.5" />
            </div>
          </div>
          <div className="grid gap-2 px-3 pb-3">
            <MiniFriendRow visual={visual} width="w-[74%]" />
            <MiniFriendRow visual={visual} width="w-[92%]" />
          </div>
          <MiniTabBar visual={visual} />
        </div>
        <div
          className="relative grid min-h-0 content-between overflow-hidden rounded-[18px] bg-cover bg-center p-2.5 shadow-[0_12px_26px_rgba(42,103,103,0.08)]"
          style={{ backgroundColor: visual.chatBackgroundColor, backgroundImage: visual.chatBackgroundImage ? `url(${visual.chatBackgroundImage})` : undefined }}
        >
          <div className="grid h-full w-full grid-rows-3 gap-1.5">
            <MiniBubble visual={visual} tone="friend" width="w-[72%]" />
            <MiniBubble visual={visual} tone="me" width="w-[78%]" />
            <MiniBubble visual={visual} tone="friend" width="w-[88%]" />
          </div>
          <div className="absolute bottom-1 left-2 grid w-[90%] grid-cols-[18px_minmax(0,1fr)_18px] items-center gap-1.5 rounded-full bg-white/82 p-1.5">
            <Plus className="h-3.5 w-3.5 justify-self-center text-[var(--color-on-surface-variant)]" />
            <span className="h-3 rounded-full bg-black/8" />
            <SendHorizontal className="h-3.5 w-3.5 justify-self-center text-[var(--color-on-surface-variant)]" />
          </div>
        </div>
      </div>
    </div>
  );
}

function MiniFriendRow({ visual, width }: { visual: TemplatePreviewVisual; width: string }) {
  return (
    <div className={`grid grid-cols-[22px_minmax(0,1fr)] items-center gap-2 ${width}`}>
      <MiniAvatar src={visual.profileImage} />
      <span className="h-4 rounded-full bg-black/10" />
    </div>
  );
}

function MiniAvatar({ src }: { src?: string }) {
  return (
    <span className="grid h-6 w-6 place-items-center overflow-hidden rounded-full bg-[var(--color-primary-container)]/55">
      {src ? <img src={src} alt="" className="h-full w-full object-cover" /> : <UserRound className="h-3.5 w-3.5 text-[var(--color-on-primary-container)]" />}
    </span>
  );
}

function MiniTabBar({ visual }: { visual: TemplatePreviewVisual }) {
  return (
    <div className="grid h-8 grid-cols-5 items-center bg-cover bg-center px-2" style={{ backgroundColor: visual.tabBackgroundColor, backgroundImage: visual.tabBackgroundImage ? `url(${visual.tabBackgroundImage})` : undefined }}>
      {Array.from({ length: 5 }).map((_, index) => (
        <span key={index} className={`h-3.5 w-3.5 justify-self-center rounded-full ${index === 1 ? "bg-[var(--color-primary-container)]" : "bg-black/14"}`} />
      ))}
    </div>
  );
}

function MiniBubble({ visual, tone, width }: { visual: TemplatePreviewVisual; tone: "me" | "friend"; width: string }) {
  const mine = tone === "me";
  const bubbleImage = mine ? visual.myBubbleImage : visual.friendBubbleImage;
  if (bubbleImage) {
    return (
      <span className={`${width} relative block h-full min-h-0 overflow-hidden ${mine ? "justify-self-end" : ""}`}>
        <img src={bubbleImage} alt="" className="absolute inset-[-2px] h-[calc(100%+4px)] w-[calc(100%+4px)] max-w-none object-fill" />
      </span>
    );
  }
  return <span className={`${width} h-7 rounded-[12px] ${mine ? "justify-self-end" : ""}`} style={{ backgroundColor: mine ? visual.myBubbleFillColor : visual.friendBubbleFillColor }} />;
}

function MiniBubbleSwatch({ visual, tone, width }: { visual: TemplatePreviewVisual; tone: "me" | "friend"; width: string }) {
  const mine = tone === "me";
  const bubbleImage = mine ? visual.myBubbleImage : visual.friendBubbleImage;
  if (bubbleImage) {
    return (
      <span className={`${width} relative block h-full min-h-0 overflow-hidden ${mine ? "justify-self-end" : ""}`}>
        <img src={bubbleImage} alt="" className="absolute inset-[-2px] h-[calc(100%+4px)] w-[calc(100%+4px)] max-w-none object-fill" />
      </span>
    );
  }
  return <span className={`${width} h-full rounded-full ${mine ? "justify-self-end" : ""}`} style={{ backgroundColor: mine ? visual.myBubbleFillColor : visual.friendBubbleFillColor }} />;
}
