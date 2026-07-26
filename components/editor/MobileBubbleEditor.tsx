"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { Check, FlipHorizontal2, Info, LoaderCircle, Maximize2, RotateCcw } from "lucide-react";
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

type DragKind = "scale" | "content-left" | "content-right" | "content-top" | "content-bottom" | "stretch";

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
  const [helpOpen, setHelpOpen] = useState(false);
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 });
  const [draft, setDraft] = useState<MobileBubbleEditDraft | null>(null);
  const [activeDragKind, setActiveDragKind] = useState<DragKind | null>(null);
  const [valueFeedbackKey, setValueFeedbackKey] = useState(0);
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
    setHelpOpen(false);
    setActiveDragKind(null);
    setValueFeedbackKey(0);
  }, [initialDraft]);

  useEffect(() => {
    if (!draft || !initialDraft) return;
    onDirtyChange?.(isMobileBubbleEditDirty(draft, initialDraft));
  }, [draft, initialDraft, onDirtyChange]);

  useEffect(() => {
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
    ? Math.min((stageSize.width - 32) / asset.width, (stageSize.height - 32) / asset.height)
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
    setDraft(updateDraftForDrag(active, dx, dy, asset, artwork));
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
    setValueFeedbackKey((current) => current + 1);
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
  const activeValueGroup = getActiveValueGroup(activeDragKind);

  return (
    <section className="grid gap-3 rounded-[24px] border border-[#d8e2ef] bg-[linear-gradient(160deg,#f8fbff_0%,#edf5ff_100%)] p-3 shadow-[0_12px_28px_rgba(37,99,235,0.08)]">
      <header className="flex min-h-11 items-center justify-between gap-3 px-1">
        <div className="flex min-w-0 items-center gap-2">
          <h3 className="truncate text-[15px] font-black tracking-[-0.02em] text-[#0f172a]">말풍선 편집</h3>
          {isDirty ? <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[#fff7ed] px-2 py-1 text-[10px] font-black text-[#c2410c]" role="status"><span className="size-1.5 rounded-full bg-[#f97316]" aria-hidden="true" />미적용</span> : null}
        </div>
        <button type="button" title="편집 도움말" className={`grid size-11 shrink-0 place-items-center rounded-xl border transition ${helpOpen ? "border-[#bfdbfe] bg-[#eff6ff] text-[#1d4ed8]" : "border-[#d1d5db] bg-white text-[#475569]"}`} aria-label="편집 도움말" aria-expanded={helpOpen} onClick={() => setHelpOpen((current) => !current)}><Info size={18} aria-hidden="true" /></button>
      </header>
      {helpOpen ? <p className="rounded-xl bg-white/80 px-3 py-2.5 text-xs font-semibold leading-5 text-[#475569]">파란 교차점을 움직여 이미지가 늘어나는 위치를, 초록 테두리의 핸들을 움직여 글자 여백을 조절하세요.</p> : null}
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
          <button type="button" aria-label="이미지 크기 조절" className="absolute -bottom-[22px] -right-[22px] grid size-11 touch-none cursor-nwse-resize place-items-center rounded-full border border-[#bfdbfe] bg-white text-[#2563eb] shadow-[0_8px_20px_rgba(37,99,235,0.22)]" onPointerDown={beginDrag("scale")}><Maximize2 size={17} aria-hidden="true" /></button>
        </div>
      </div>
      <BubbleValueReadout geometry={draft.geometry} activeGroup={activeValueGroup} feedbackKey={valueFeedbackKey} />
      <div className="flex gap-2">
        <button type="button" title="좌우 반전" aria-label="좌우 반전" className={`grid size-11 place-items-center rounded-xl border transition ${draft.imageState.flipX ? "border-[#2563eb] bg-[#eff6ff] text-[#1d4ed8]" : "border-[#d1d5db] bg-white text-[#334155]"}`} onClick={flip}><FlipHorizontal2 size={18} aria-hidden="true" /></button>
        <button type="button" title="마지막 적용 상태로 되돌리기" aria-label="마지막 적용 상태로 되돌리기" className="grid size-11 place-items-center rounded-xl border border-[#d1d5db] bg-white text-[#475569] transition disabled:opacity-45" disabled={!isDirty} onClick={reset}><RotateCcw size={18} aria-hidden="true" /></button>
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

function updateDraftForDrag(active: { kind: DragKind; startX: number; startY: number; draft: MobileBubbleEditDraft }, dx: number, dy: number, asset: BubbleAsset, artwork: ArtworkMetrics) {
  const next = structuredClone(active.draft);
  if (active.kind === "scale") {
    next.imageState.scale = Math.min(3, Math.max(0.25, active.draft.imageState.scale + (dx + dy) / Math.max(asset.width, asset.height)));
    return next;
  }
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

function BubbleValueReadout({ geometry, activeGroup, feedbackKey }: { geometry: BubbleGeometry; activeGroup: "stretch" | "content" | null; feedbackKey: number }) {
  return <div className="grid grid-cols-2 gap-2" aria-label="현재 영역 값">
    <ValueCard key={`stretch-${feedbackKey}`} label="늘어나는 위치" values={[`X ${geometry.stretch.x}`, `Y ${geometry.stretch.y}`]} tone="blue" active={activeGroup === "stretch"} flash={feedbackKey > 0} />
    <ValueCard key={`content-${feedbackKey}`} label="글자 여백" values={[`왼 ${geometry.contentInsets.left} · 오른 ${geometry.contentInsets.right}`, `위 ${geometry.contentInsets.top} · 아래 ${geometry.contentInsets.bottom}`]} tone="green" active={activeGroup === "content"} flash={feedbackKey > 0} />
  </div>;
}

function ValueCard({ label, values, tone, active, flash }: { label: string; values: string[]; tone: "blue" | "green"; active: boolean; flash: boolean }) {
  const colors = tone === "blue" ? "border-[#bfdbfe] bg-[#f8fbff] text-[#1d4ed8]" : "border-[#a7f3d0] bg-[#f4fffa] text-[#047857]";
  const activeStyle = active ? tone === "blue" ? "scale-[1.02] ring-2 ring-[#60a5fa]/40 shadow-[0_6px_16px_rgba(37,99,235,0.12)]" : "scale-[1.02] ring-2 ring-[#34d399]/40 shadow-[0_6px_16px_rgba(16,185,129,0.12)]" : "";
  return <div className={`rounded-xl border px-3 py-2 transition duration-150 ${colors} ${activeStyle} ${flash ? "motion-safe:animate-[bubble-value-flash_420ms_cubic-bezier(0.22,1,0.36,1)]" : ""}`}>
    <p className="text-[10px] font-black tracking-[-0.01em]">{label}</p>
    <div className="mt-1 grid gap-0.5 font-mono text-[11px] font-bold leading-4 text-[#334155]">{values.map((value) => <span key={value}>{value}</span>)}</div>
  </div>;
}

function getActiveValueGroup(kind: DragKind | null): "stretch" | "content" | null {
  if (!kind || kind === "scale") return null;
  if (kind === "stretch") return "stretch";
  return "content";
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
