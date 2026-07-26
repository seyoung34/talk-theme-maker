"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import * as Popover from "@radix-ui/react-popover";
import { Check, FlipHorizontal2, Info, LoaderCircle, RotateCcw } from "lucide-react";
import { loadNinePatchDataUrl } from "@/lib/theme/android/ninepatch";
import { defaultInsets, defaultStretch } from "@/lib/theme/preview/bubbleCanvas";
import { defaultImageEditState, renderEditedImageFile, type ImageEditState, type ImageEditTarget } from "@/lib/theme/imageEdit";
import { isMobileBubbleEditDirty, type MobileBubbleEditDraft } from "@/lib/theme/mobileBubbleEdit";
import { bubbleGeometryToLegacyEdit, flipBubbleGeometryHorizontally, normalizeBubbleGeometry, resolveBubbleGeometry } from "@/lib/theme/bubbleGeometry";
import type { ThemeAssetSlot } from "@/lib/theme/templates";
import type { BubbleAsset, BubbleGeometry, BubbleSlot, Insets, Markers, StretchPoint, ThemePlatform } from "@/lib/theme/types";

type ArtworkMetrics = {
  width: number;
  height: number;
  offsetX: number;
  offsetY: number;
};

type DragKind = "content-left" | "content-right" | "content-top" | "content-bottom" | "stretch";

export function MobileBubbleEditor({
  slot,
  bubbleSlot,
  platform,
  sourceFile,
  sourceUrl,
  initialImageState,
  target,
  geometry,
  markers,
  insets,
  stretch,
  onApply,
  onDirtyChange,
}: {
  slot: ThemeAssetSlot;
  bubbleSlot: BubbleSlot;
  platform: ThemePlatform;
  sourceFile: File | null;
  sourceUrl?: string;
  initialImageState?: ImageEditState;
  target?: ImageEditTarget;
  geometry?: BubbleGeometry;
  markers?: Markers;
  insets?: Insets;
  stretch?: StretchPoint;
  onApply: (input: { editedFile?: File; sourceFile: File; imageState: ImageEditState; target?: ImageEditTarget; geometry: BubbleGeometry; markers: Markers; insets: Insets; stretch: StretchPoint }) => void;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const [preparedFile, setPreparedFile] = useState<File | null>(sourceFile);
  const [asset, setAsset] = useState<BubbleAsset | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 });
  const [draft, setDraft] = useState<MobileBubbleEditDraft | null>(null);
  const [activeDragKind, setActiveDragKind] = useState<DragKind | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ kind: DragKind; startX: number; startY: number; draft: MobileBubbleEditDraft } | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function prepare() {
      setError(null);
      if (sourceFile) {
        setPreparedFile(sourceFile);
        return;
      }
      if (!sourceUrl) {
        setPreparedFile(null);
        return;
      }
      setLoading(true);
      try {
        const response = await fetch(sourceUrl, { cache: "force-cache" });
        if (!response.ok) throw new Error("이미지를 불러오지 못했습니다.");
        const blob = await response.blob();
        if (!cancelled) setPreparedFile(new File([blob], slot.fileName ?? `${slot.id}.png`, { type: blob.type || "image/png" }));
      } catch {
        if (!cancelled) setError("현재 말풍선을 편집용으로 불러오지 못했습니다.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void prepare();
    return () => { cancelled = true; };
  }, [slot.fileName, slot.id, sourceFile, sourceUrl]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!preparedFile) {
        setAsset(null);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const dataUrl = await fileToDataUrl(preparedFile);
        const nextAsset = await loadNinePatchDataUrl(dataUrl, preparedFile.name, bubbleSlot);
        if (!cancelled) setAsset(nextAsset);
      } catch {
        if (!cancelled) setError("말풍선 이미지를 준비하지 못했습니다.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [bubbleSlot, preparedFile]);

  const initialDraft = useMemo<MobileBubbleEditDraft | null>(() => {
    if (!asset) return null;
    const imageState = initialImageState ?? defaultImageEditState;
    const source = getArtworkMetrics(asset, platform);
    const resolved = resolveBubbleGeometry({
      platform,
      geometry,
      markers,
      insets,
      stretch,
      fallbackMarkers: asset.markers,
      fallbackInsets: defaultInsets[bubbleSlot],
      fallbackStretch: defaultStretch[bubbleSlot],
      width: source.width,
      height: source.height,
    });
    const hasPersistedGeometry = Boolean(geometry || markers || insets || stretch);
    return {
      imageState,
      geometry: imageState.flipX && !hasPersistedGeometry ? flipBubbleGeometryHorizontally(resolved, source.width) : resolved,
    };
  }, [asset, bubbleSlot, geometry, initialImageState, insets, markers, platform, stretch]);

  useEffect(() => {
    setDraft(initialDraft);
    setActiveDragKind(null);
  }, [initialDraft]);

  useEffect(() => {
    if (!draft || !initialDraft) return;
    onDirtyChange?.(isMobileBubbleEditDirty(draft, initialDraft));
  }, [draft, initialDraft, onDirtyChange]);

  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const update = () => setStageSize({ width: stage.clientWidth, height: stage.clientHeight });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(stage);
    return () => observer.disconnect();
  }, [asset]);

  const imageUrl = useMemo(() => preparedFile ? URL.createObjectURL(preparedFile) : "", [preparedFile]);
  useEffect(() => () => { if (imageUrl) URL.revokeObjectURL(imageUrl); }, [imageUrl]);

  const stageScale = asset && stageSize.width && stageSize.height
    ? Math.min(2.25, (stageSize.width - 64) / asset.width, (stageSize.height - 64) / asset.height)
    : 1;
  const effectiveScale = stageScale * (draft?.imageState.scale ?? 1);
  const artwork = asset ? getArtworkMetrics(asset, platform) : null;
  const artboardStyle = draft && asset ? {
    width: asset.width * stageScale,
    height: asset.height * stageScale,
    transform: `translate(${draft.imageState.offsetX * stageScale}px, ${draft.imageState.offsetY * stageScale}px) scale(${draft.imageState.scale})`,
  } satisfies CSSProperties : undefined;

  const beginDrag = (kind: DragKind) => (event: PointerEvent<HTMLDivElement | HTMLButtonElement>) => {
    if (!draft || !asset || loading) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { kind, startX: event.clientX, startY: event.clientY, draft };
    setActiveDragKind(kind);
  };

  const updateDrag = (event: PointerEvent<HTMLDivElement>) => {
    const active = dragRef.current;
    if (!active || !asset || !artwork) return;
    const scale = Math.max(effectiveScale, 0.01);
    const dx = (event.clientX - active.startX) / scale;
    const dy = (event.clientY - active.startY) / scale;
    setDraft(updateDraftForDrag(active, dx, dy, artwork));
  };

  const endDrag = (event: PointerEvent<HTMLDivElement>) => {
    dragRef.current = null;
    setActiveDragKind(null);
    try { event.currentTarget.releasePointerCapture(event.pointerId); } catch { /* already released */ }
  };

  const reset = () => {
    setDraft(initialDraft);
    setActiveDragKind(null);
  };
  const flip = () => {
    setDraft((current) => {
      if (!current || !artwork) return current;
      return {
        ...current,
        imageState: { ...current.imageState, flipX: !current.imageState.flipX },
        geometry: flipBubbleGeometryHorizontally(current.geometry, artwork.width),
      };
    });
  };
  const apply = async () => {
    if (!draft || !preparedFile || !initialDraft || !asset || !artwork) return;
    setLoading(true);
    setError(null);
    try {
      const imageChanged = JSON.stringify(draft.imageState) !== JSON.stringify(initialDraft.imageState);
      const editedFile = imageChanged ? await renderEditedImageFile(preparedFile, draft.imageState, undefined, target, { preserveNinePatchBorder: platform === "android" }) : undefined;
      const legacy = bubbleGeometryToLegacyEdit(draft.geometry, artwork.width, artwork.height);
      onApply({ editedFile, sourceFile: preparedFile, imageState: draft.imageState, target, ...legacy });
    } catch (applyError) {
      setError(applyError instanceof Error ? applyError.message : "말풍선 편집을 적용하지 못했습니다.");
    } finally {
      setLoading(false);
    }
  };

  if (loading && !asset) return <div className="grid min-h-48 place-items-center rounded-[22px] border border-[#dbe3ed] bg-white text-sm font-bold text-[#64748b]"><span className="inline-flex items-center gap-2"><LoaderCircle size={16} className="animate-spin" />편집 준비 중</span></div>;
  if (error && !asset) return <p className="rounded-[22px] border border-[#fecaca] bg-[#fff1f2] px-4 py-4 text-sm font-bold text-[#be123c]">{error}</p>;
  if (!asset || !draft) return <p className="rounded-[22px] border border-dashed border-[#dbe3ed] bg-[#f8fafc] px-4 py-5 text-center text-sm font-semibold text-[#64748b]">편집할 말풍선을 선택하세요.</p>;

  const isDirty = isMobileBubbleEditDirty(draft, initialDraft);
  return (
    <section className="grid gap-3 rounded-[24px] border border-[#d8e2ef] bg-[linear-gradient(160deg,#f8fbff_0%,#edf5ff_100%)] p-3 shadow-[0_12px_28px_rgba(37,99,235,0.08)]">
      <header className="flex min-h-11 items-center justify-between gap-3 px-1">
        <div className="flex min-w-0 items-center gap-2">
          <h3 className="truncate text-[15px] font-black tracking-[-0.02em] text-[#0f172a]">말풍선 편집</h3>
          {isDirty ? <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[#fff7ed] px-2 py-1 text-[10px] font-black text-[#c2410c]" role="status"><span className="size-1.5 rounded-full bg-[#f97316]" aria-hidden="true" />미적용</span> : null}
        </div>
        <Popover.Root>
          <Popover.Trigger asChild>
            <button type="button" title="편집 도움말" className="grid size-11 shrink-0 place-items-center text-[#64748b] transition hover:text-[#2563eb] focus-visible:rounded-lg focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#2563eb] data-[state=open]:text-[#2563eb]" aria-label="편집 도움말"><Info size={18} aria-hidden="true" /></button>
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Content side="bottom" align="end" sideOffset={8} collisionPadding={16} className="radix-popover-content z-[120] w-[min(256px,calc(100vw-32px))] rounded-2xl border border-[#dbeafe] bg-white p-3.5 text-[12px] font-medium leading-[1.55] text-[#475569] shadow-[0_16px_38px_rgba(15,23,42,0.16)] outline-none">
              <p className="font-black text-[#0f172a]">편집 안내</p>
              <p className="mt-1.5"><span className="font-bold text-[#0284c7]">파란 교차점</span>은 말풍선이 늘어나는 위치입니다.</p>
              <p className="mt-1"><span className="font-bold text-[#059669]">초록 테두리</span>는 글자가 들어갈 여백입니다.</p>
              <Popover.Arrow className="fill-white" width={14} height={7} />
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>
      </header>
      <div
        ref={stageRef}
        className="relative grid min-h-[300px] touch-pan-y place-items-center overflow-hidden rounded-[20px] border border-white"
        style={{ backgroundColor: "#f8fafc", backgroundImage: "conic-gradient(#e6ebf1 25%, transparent 0 50%, #e6ebf1 0 75%, transparent 0)", backgroundSize: "16px 16px" }}
        onPointerMove={updateDrag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <div className="relative origin-center" style={artboardStyle}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={imageUrl} alt="" className="pointer-events-none block size-full origin-center select-none" style={{ transform: `scaleX(${draft.imageState.flipX ? -1 : 1})` }} draggable={false} />
          {artwork ? <BubbleGeometryOverlay geometry={draft.geometry} artwork={artwork} scale={stageScale} onDrag={beginDrag} /> : null}
        </div>
        <div className="absolute left-2 top-2 z-30 flex items-center gap-1.5">
          <button type="button" title="좌우 반전" aria-label="좌우 반전" className={`grid size-10 place-items-center rounded-full border border-white/85 bg-white/85 text-[#475569] backdrop-blur-sm transition focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#2563eb] ${draft.imageState.flipX ? "bg-[#eff6ff] text-[#1d4ed8]" : "hover:bg-[#f1f5f9] hover:text-[#1d4ed8]"}`} onClick={flip}><FlipHorizontal2 size={16} aria-hidden="true" /></button>
          <button type="button" title="마지막 적용 상태로 되돌리기" aria-label="마지막 적용 상태로 되돌리기" className="grid size-10 place-items-center rounded-full border border-white/85 bg-white/85 text-[#64748b] backdrop-blur-sm transition hover:bg-[#f1f5f9] hover:text-[#334155] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#2563eb] disabled:cursor-not-allowed disabled:opacity-35" disabled={!isDirty} onClick={reset}><RotateCcw size={16} aria-hidden="true" /></button>
        </div>
        <BubbleValueFeedback geometry={draft.geometry} activeKind={activeDragKind} />
      </div>
      {error ? <p className="rounded-xl border border-[#fecaca] bg-[#fff1f2] px-3 py-2 text-xs font-bold text-[#be123c]" role="alert">{error}</p> : null}
      <div className="grid grid-cols-2 gap-2"><button type="button" className="min-h-12 rounded-xl border border-[#d1d5db] bg-white px-4 text-sm font-black text-[#475569] disabled:opacity-45" disabled={!isDirty || loading} onClick={reset}>취소</button><button type="button" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#0f172a] px-4 text-sm font-black text-white disabled:opacity-45" disabled={!isDirty || loading} onClick={() => void apply()}>{loading ? <LoaderCircle size={16} className="animate-spin" /> : <Check size={16} />}적용</button></div>
    </section>
  );
}

function BubbleGeometryOverlay({
  geometry,
  artwork,
  scale,
  onDrag,
}: {
  geometry: BubbleGeometry;
  artwork: ArtworkMetrics;
  scale: number;
  onDrag: (kind: DragKind) => (event: PointerEvent<HTMLButtonElement>) => void;
}) {
  const left = (artwork.offsetX + geometry.contentInsets.left) * scale;
  const top = (artwork.offsetY + geometry.contentInsets.top) * scale;
  const right = (artwork.offsetX + artwork.width - geometry.contentInsets.right) * scale;
  const bottom = (artwork.offsetY + artwork.height - geometry.contentInsets.bottom) * scale;
  const stretchX = (artwork.offsetX + geometry.stretch.x) * scale;
  const stretchY = (artwork.offsetY + geometry.stretch.y) * scale;
  const handle = "pointer-events-auto absolute z-20 grid size-11 touch-none -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#10b981]";
  const contentDot = <span className="size-4 rounded-full border-2 border-white bg-[#10b981] shadow-[0_2px_8px_rgba(16,185,129,0.35)]" aria-hidden="true" />;

  return <div className="pointer-events-none absolute inset-0">
    <span className="absolute w-0.5 -translate-x-1/2 bg-sky-500/90" style={{ left: stretchX, top: artwork.offsetY * scale, height: artwork.height * scale }} />
    <span className="absolute h-0.5 -translate-y-1/2 bg-sky-500/90" style={{ left: artwork.offsetX * scale, top: stretchY, width: artwork.width * scale }} />
    <span className="absolute border-2 border-emerald-500/90" style={{ left, top, width: Math.max(1, right - left), height: Math.max(1, bottom - top) }} />
    <button type="button" aria-label="늘어나는 위치 조절" className="pointer-events-auto absolute z-20 grid size-11 touch-none -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#0ea5e9]" style={{ left: stretchX, top: stretchY }} onPointerDown={onDrag("stretch")}><span className="grid size-5 place-items-center rounded-full border-2 border-white bg-sky-500 shadow" aria-hidden="true"><span className="size-1.5 rounded-full bg-white" /></span></button>
    <button type="button" aria-label="글자 여백 왼쪽 조절" className={handle} style={{ left, top: (top + bottom) / 2 }} onPointerDown={onDrag("content-left")}>{contentDot}</button>
    <button type="button" aria-label="글자 여백 오른쪽 조절" className={handle} style={{ left: right, top: (top + bottom) / 2 }} onPointerDown={onDrag("content-right")}>{contentDot}</button>
    <button type="button" aria-label="글자 여백 위 조절" className={handle} style={{ left: (left + right) / 2, top }} onPointerDown={onDrag("content-top")}>{contentDot}</button>
    <button type="button" aria-label="글자 여백 아래 조절" className={handle} style={{ left: (left + right) / 2, top: bottom }} onPointerDown={onDrag("content-bottom")}>{contentDot}</button>
  </div>;
}

function updateDraftForDrag(active: { kind: DragKind; startX: number; startY: number; draft: MobileBubbleEditDraft }, dx: number, dy: number, artwork: ArtworkMetrics) {
  const next = structuredClone(active.draft);
  if (active.kind === "stretch") {
    next.geometry.stretch.x += dx;
    next.geometry.stretch.y += dy;
  }
  if (active.kind === "content-left") next.geometry.contentInsets.left += dx;
  if (active.kind === "content-right") next.geometry.contentInsets.right -= dx;
  if (active.kind === "content-top") next.geometry.contentInsets.top += dy;
  if (active.kind === "content-bottom") next.geometry.contentInsets.bottom -= dy;
  next.geometry = normalizeBubbleGeometry(next.geometry, artwork.width, artwork.height);
  return next;
}

function BubbleValueFeedback({ geometry, activeKind }: { geometry: BubbleGeometry; activeKind: DragKind | null }) {
  if (!activeKind) return null;
  const value = activeKind === "stretch"
    ? `늘어나는 위치 X ${geometry.stretch.x} · Y ${geometry.stretch.y}`
    : activeKind === "content-left"
      ? `왼쪽 여백 ${geometry.contentInsets.left}`
      : activeKind === "content-right"
        ? `오른쪽 여백 ${geometry.contentInsets.right}`
        : activeKind === "content-top"
          ? `위 여백 ${geometry.contentInsets.top}`
          : `아래 여백 ${geometry.contentInsets.bottom}`;
  return <output className="pointer-events-none absolute bottom-3 left-1/2 z-30 -translate-x-1/2 rounded-full border border-white/80 bg-[#0f172a]/85 px-3 py-1.5 text-[11px] font-bold text-white shadow-lg backdrop-blur" aria-live="polite">{value}</output>;
}
function getArtworkMetrics(asset: BubbleAsset, platform: ThemePlatform): ArtworkMetrics {
  const hasMarkerBorder = platform === "android" || asset.name.toLowerCase().endsWith(".9.png");
  const source = hasMarkerBorder ? asset.innerCanvas : asset.fullCanvas;
  return {
    width: source.width,
    height: source.height,
    offsetX: hasMarkerBorder ? 1 : 0,
    offsetY: hasMarkerBorder ? 1 : 0,
  };
}
function fileToDataUrl(file: File) { return new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("이미지를 읽지 못했습니다.")); reader.onerror = () => reject(reader.error); reader.readAsDataURL(file); }); }
