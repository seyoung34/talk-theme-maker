"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { Check, FlipHorizontal2, Info, LoaderCircle, Maximize2, RotateCcw } from "lucide-react";
import { loadNinePatchDataUrl } from "@/lib/theme/android/ninepatch";
import { flipBubbleInsetsHorizontally, flipBubbleMarkersHorizontally, flipBubbleStretchHorizontally } from "@/lib/theme/bubbleEditTransforms";
import { defaultInsets, defaultStretch } from "@/lib/theme/preview/bubbleCanvas";
import { defaultImageEditState, renderEditedImageFile, type ImageEditState, type ImageEditTarget } from "@/lib/theme/imageEdit";
import type { ThemeAssetSlot } from "@/lib/theme/templates";
import type { BubbleAsset, BubbleSlot, Insets, Markers, StretchPoint, ThemePlatform } from "@/lib/theme/types";

type MobileBubbleEditDraft = {
  imageState: ImageEditState;
  markers: Markers;
  insets: Insets;
  stretch: StretchPoint;
};

type DragKind = "image" | "scale" | "top-start" | "top-end" | "left-start" | "left-end" | "content-left" | "content-right" | "content-top" | "content-bottom" | "inset-left" | "inset-right" | "inset-top" | "inset-bottom" | "stretch";

export function MobileBubbleEditor({
  slot,
  bubbleSlot,
  platform,
  sourceFile,
  sourceUrl,
  initialImageState,
  target,
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
  markers?: Markers;
  insets?: Insets;
  stretch?: StretchPoint;
  onApply: (input: { editedFile?: File; sourceFile: File; imageState: ImageEditState; target?: ImageEditTarget; markers: Markers; insets: Insets; stretch: StretchPoint }) => void;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const [preparedFile, setPreparedFile] = useState<File | null>(sourceFile);
  const [asset, setAsset] = useState<BubbleAsset | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 });
  const [draft, setDraft] = useState<MobileBubbleEditDraft | null>(null);
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
    const isFlipped = imageState.flipX;
    return {
      imageState,
      markers: markers ?? (isFlipped ? flipBubbleMarkersHorizontally(asset.markers, asset.width) : asset.markers),
      insets: insets ?? (isFlipped ? flipBubbleInsetsHorizontally(defaultInsets[bubbleSlot]) : defaultInsets[bubbleSlot]),
      stretch: stretch ?? (isFlipped ? flipBubbleStretchHorizontally(defaultStretch[bubbleSlot], asset.width) : defaultStretch[bubbleSlot]),
    };
  }, [asset, bubbleSlot, initialImageState, insets, markers, stretch]);

  useEffect(() => {
    setDraft(initialDraft);
    setHelpOpen(false);
  }, [initialDraft]);

  useEffect(() => {
    if (!draft || !initialDraft) return;
    onDirtyChange?.(JSON.stringify(draft) !== JSON.stringify(initialDraft));
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
  const artboardStyle = draft && asset ? {
    width: asset.width * stageScale,
    height: asset.height * stageScale,
    transform: `translate(${draft.imageState.offsetX * stageScale}px, ${draft.imageState.offsetY * stageScale}px) scaleX(${draft.imageState.flipX ? -1 : 1}) scale(${draft.imageState.scale})`,
  } satisfies CSSProperties : undefined;

  const beginDrag = (kind: DragKind) => (event: PointerEvent<HTMLDivElement | HTMLButtonElement>) => {
    if (!draft || !asset || loading) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { kind, startX: event.clientX, startY: event.clientY, draft };
  };

  const updateDrag = (event: PointerEvent<HTMLDivElement>) => {
    const active = dragRef.current;
    if (!active || !asset) return;
    const scale = Math.max(effectiveScale, 0.01);
    const dx = (event.clientX - active.startX) / scale * (active.draft.imageState.flipX ? -1 : 1);
    const dy = (event.clientY - active.startY) / scale;
    setDraft(updateDraftForDrag(active, dx, dy, asset, platform));
  };

  const endDrag = (event: PointerEvent<HTMLDivElement>) => {
    dragRef.current = null;
    try { event.currentTarget.releasePointerCapture(event.pointerId); } catch { /* already released */ }
  };

  const reset = () => setDraft(initialDraft);
  const flip = () => setDraft((current) => {
    if (!current || !asset) return current;
    return {
      ...current,
      imageState: { ...current.imageState, flipX: !current.imageState.flipX },
      markers: flipBubbleMarkersHorizontally(current.markers, asset.width),
      insets: flipBubbleInsetsHorizontally(current.insets),
      stretch: flipBubbleStretchHorizontally(current.stretch, asset.width),
    };
  });
  const apply = async () => {
    if (!draft || !preparedFile || !initialDraft || !asset) return;
    setLoading(true);
    setError(null);
    try {
      const imageChanged = JSON.stringify(draft.imageState) !== JSON.stringify(initialDraft.imageState);
      const editedFile = imageChanged ? await renderEditedImageFile(preparedFile, draft.imageState, undefined, target, { preserveNinePatchBorder: platform === "android" }) : undefined;
      onApply({ editedFile, sourceFile: preparedFile, imageState: draft.imageState, target, markers: draft.markers, insets: draft.insets, stretch: draft.stretch });
    } catch (applyError) {
      setError(applyError instanceof Error ? applyError.message : "말풍선 편집을 적용하지 못했습니다.");
    } finally {
      setLoading(false);
    }
  };

  if (loading && !asset) return <div className="grid min-h-48 place-items-center rounded-[22px] border border-[#dbe3ed] bg-white text-sm font-bold text-[#64748b]"><span className="inline-flex items-center gap-2"><LoaderCircle size={16} className="animate-spin" />편집 준비 중</span></div>;
  if (error && !asset) return <p className="rounded-[22px] border border-[#fecaca] bg-[#fff1f2] px-4 py-4 text-sm font-bold text-[#be123c]">{error}</p>;
  if (!asset || !draft) return <p className="rounded-[22px] border border-dashed border-[#dbe3ed] bg-[#f8fafc] px-4 py-5 text-center text-sm font-semibold text-[#64748b]">편집할 말풍선을 선택하세요.</p>;

  return (
    <section className="grid gap-3 rounded-[24px] border border-[#d8e2ef] bg-[linear-gradient(160deg,#f8fbff_0%,#edf5ff_100%)] p-3 shadow-[0_12px_28px_rgba(37,99,235,0.08)]">
      <div ref={stageRef} className="relative grid min-h-[300px] touch-none place-items-center overflow-hidden rounded-[20px] border border-white bg-[radial-gradient(circle_at_50%_35%,#ffffff_0%,#e7f0fa_76%)]" onPointerDown={beginDrag("image")} onPointerMove={updateDrag} onPointerUp={endDrag} onPointerCancel={endDrag}>
        <div className="relative origin-center" style={artboardStyle}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={imageUrl} alt="" className="pointer-events-none block size-full select-none" draggable={false} />
          {platform === "android" ? <AndroidOverlay asset={asset} markers={draft.markers} scale={stageScale} onDrag={beginDrag} /> : <IosOverlay asset={asset} insets={draft.insets} stretch={draft.stretch} scale={stageScale} onDrag={beginDrag} />}
          <button type="button" aria-label="이미지 크기 조절" className="absolute -bottom-4 -right-4 grid size-10 cursor-nwse-resize place-items-center rounded-full border border-[#bfdbfe] bg-white text-[#2563eb] shadow-[0_8px_20px_rgba(37,99,235,0.22)]" onPointerDown={beginDrag("scale")}><Maximize2 size={17} aria-hidden="true" /></button>
        </div>
      </div>
      <div className="grid grid-cols-[1fr_1fr_auto] gap-2">
        <button type="button" className={`inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border px-3 text-[13px] font-black transition ${draft.imageState.flipX ? "border-[#2563eb] bg-[#eff6ff] text-[#1d4ed8]" : "border-[#d1d5db] bg-white text-[#334155]"}`} onClick={flip}><FlipHorizontal2 size={16} aria-hidden="true" />반전</button>
        <button type="button" className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-[#d1d5db] bg-white px-3 text-[13px] font-black text-[#475569] disabled:opacity-45" disabled={JSON.stringify(draft) === JSON.stringify(initialDraft)} onClick={reset}><RotateCcw size={16} aria-hidden="true" />원본</button>
        <button type="button" className={`grid min-h-11 place-items-center rounded-xl border px-3 transition ${helpOpen ? "border-[#bfdbfe] bg-[#eff6ff] text-[#1d4ed8]" : "border-[#d1d5db] bg-white text-[#475569]"}`} aria-label="편집 도움말" aria-expanded={helpOpen} onClick={() => setHelpOpen((current) => !current)}><Info size={17} aria-hidden="true" /></button>
      </div>
      {helpOpen ? <p className="rounded-xl bg-white/80 px-3 py-2.5 text-xs font-semibold leading-5 text-[#475569]">{platform === "android" ? "빈 곳을 드래그하면 이미지가 이동합니다. 파란 영역은 늘어나는 구간이고, 초록 테두리는 글자가 들어갈 영역입니다." : "빈 곳을 드래그하면 이미지가 이동합니다. 초록 테두리는 글자 영역이고, 파란 점은 이미지가 늘어나는 기준점입니다."}</p> : null}
      {error ? <p className="rounded-xl border border-[#fecaca] bg-[#fff1f2] px-3 py-2 text-xs font-bold text-[#be123c]" role="alert">{error}</p> : null}
      <div className="grid grid-cols-2 gap-2"><button type="button" className="min-h-12 rounded-xl border border-[#d1d5db] bg-white px-4 text-sm font-black text-[#475569] disabled:opacity-45" disabled={JSON.stringify(draft) === JSON.stringify(initialDraft) || loading} onClick={reset}>취소</button><button type="button" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#0f172a] px-4 text-sm font-black text-white disabled:opacity-45" disabled={JSON.stringify(draft) === JSON.stringify(initialDraft) || loading} onClick={() => void apply()}>{loading ? <LoaderCircle size={16} className="animate-spin" /> : <Check size={16} />}적용</button></div>
    </section>
  );
}

function AndroidOverlay({ asset, markers, scale, onDrag }: { asset: BubbleAsset; markers: Markers; scale: number; onDrag: (kind: DragKind) => (event: PointerEvent<HTMLButtonElement>) => void }) {
  const handle = "pointer-events-auto absolute z-20 size-7 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-[#2563eb] shadow-[0_2px_8px_rgba(37,99,235,0.35)]";
  return <div className="pointer-events-none absolute inset-0">
    <span className="absolute inset-y-0 bg-sky-400/25" style={{ left: markers.top.start * scale, width: (markers.top.end - markers.top.start) * scale }} />
    <span className="absolute inset-x-0 bg-sky-400/25" style={{ top: markers.left.start * scale, height: (markers.left.end - markers.left.start) * scale }} />
    <span className="absolute border-2 border-emerald-500/90" style={{ left: markers.bottom.start * scale, top: markers.right.start * scale, width: (markers.bottom.end - markers.bottom.start) * scale, height: (markers.right.end - markers.right.start) * scale }} />
    <button type="button" aria-label="가로 늘어남 시작 조절" className={handle} style={{ left: markers.top.start * scale, top: 0 }} onPointerDown={onDrag("top-start")} />
    <button type="button" aria-label="가로 늘어남 끝 조절" className={handle} style={{ left: markers.top.end * scale, top: 0 }} onPointerDown={onDrag("top-end")} />
    <button type="button" aria-label="세로 늘어남 시작 조절" className={handle} style={{ left: 0, top: markers.left.start * scale }} onPointerDown={onDrag("left-start")} />
    <button type="button" aria-label="세로 늘어남 끝 조절" className={handle} style={{ left: 0, top: markers.left.end * scale }} onPointerDown={onDrag("left-end")} />
    <button type="button" aria-label="글자 영역 왼쪽 조절" className={handle} style={{ left: markers.bottom.start * scale, top: asset.height * scale }} onPointerDown={onDrag("content-left")} />
    <button type="button" aria-label="글자 영역 오른쪽 조절" className={handle} style={{ left: markers.bottom.end * scale, top: asset.height * scale }} onPointerDown={onDrag("content-right")} />
    <button type="button" aria-label="글자 영역 위 조절" className={handle} style={{ left: asset.width * scale, top: markers.right.start * scale }} onPointerDown={onDrag("content-top")} />
    <button type="button" aria-label="글자 영역 아래 조절" className={handle} style={{ left: asset.width * scale, top: markers.right.end * scale }} onPointerDown={onDrag("content-bottom")} />
  </div>;
}

function IosOverlay({ asset, insets, stretch, scale, onDrag }: { asset: BubbleAsset; insets: Insets; stretch: StretchPoint; scale: number; onDrag: (kind: DragKind) => (event: PointerEvent<HTMLButtonElement>) => void }) {
  const source = asset.name.toLowerCase().endsWith(".9.png") ? asset.innerCanvas : asset.fullCanvas;
  const width = source.width;
  const height = source.height;
  const left = insets.left * scale;
  const top = insets.top * scale;
  const right = (width - insets.right) * scale;
  const bottom = (height - insets.bottom) * scale;
  const handle = "pointer-events-auto absolute z-20 size-7 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-emerald-500 shadow-[0_2px_8px_rgba(16,185,129,0.35)]";
  return <div className="pointer-events-none absolute inset-0">
    <span className="absolute border-2 border-emerald-500/90" style={{ left, top, width: Math.max(1, right - left), height: Math.max(1, bottom - top) }} />
    <span className="absolute h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-sky-500 shadow" style={{ left: stretch.x * scale, top: stretch.y * scale }} />
    <button type="button" aria-label="글자 영역 왼쪽 조절" className={handle} style={{ left, top: (top + bottom) / 2 }} onPointerDown={onDrag("inset-left")} />
    <button type="button" aria-label="글자 영역 오른쪽 조절" className={handle} style={{ left: right, top: (top + bottom) / 2 }} onPointerDown={onDrag("inset-right")} />
    <button type="button" aria-label="글자 영역 위 조절" className={handle} style={{ left: (left + right) / 2, top }} onPointerDown={onDrag("inset-top")} />
    <button type="button" aria-label="글자 영역 아래 조절" className={handle} style={{ left: (left + right) / 2, top: bottom }} onPointerDown={onDrag("inset-bottom")} />
    <button type="button" aria-label="늘어나는 기준점 조절" className="pointer-events-auto absolute z-20 grid size-8 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-2 border-white bg-sky-500 shadow" style={{ left: stretch.x * scale, top: stretch.y * scale }} onPointerDown={onDrag("stretch")}><span className="size-2 rounded-full bg-white" /></button>
  </div>;
}

function updateDraftForDrag(active: { kind: DragKind; startX: number; startY: number; draft: MobileBubbleEditDraft }, dx: number, dy: number, asset: BubbleAsset, platform: ThemePlatform) {
  const next = structuredClone(active.draft);
  const width = asset.width;
  const height = asset.height;
  if (active.kind === "image") {
    next.imageState.offsetX = Math.round(active.draft.imageState.offsetX + dx);
    next.imageState.offsetY = Math.round(active.draft.imageState.offsetY + dy);
    return next;
  }
  if (active.kind === "scale") {
    next.imageState.scale = Math.min(3, Math.max(0.25, active.draft.imageState.scale + (dx + dy) / Math.max(width, height)));
    return next;
  }
  if (platform === "android") {
    if (active.kind === "top-start") next.markers.top.start += dx;
    if (active.kind === "top-end") next.markers.top.end += dx;
    if (active.kind === "left-start") next.markers.left.start += dy;
    if (active.kind === "left-end") next.markers.left.end += dy;
    if (active.kind === "content-left") next.markers.bottom.start += dx;
    if (active.kind === "content-right") next.markers.bottom.end += dx;
    if (active.kind === "content-top") next.markers.right.start += dy;
    if (active.kind === "content-bottom") next.markers.right.end += dy;
    return { ...next, markers: normalizeMarkers(next.markers, width, height) };
  }
  const source = asset.name.toLowerCase().endsWith(".9.png") ? asset.innerCanvas : asset.fullCanvas;
  if (active.kind === "inset-left") next.insets.left += dx;
  if (active.kind === "inset-right") next.insets.right -= dx;
  if (active.kind === "inset-top") next.insets.top += dy;
  if (active.kind === "inset-bottom") next.insets.bottom -= dy;
  if (active.kind === "stretch") {
    next.stretch.x += dx;
    next.stretch.y += dy;
  }
  return { ...next, insets: normalizeInsets(next.insets, source.width, source.height), stretch: { x: clamp(Math.round(next.stretch.x), 0, source.width - 1), y: clamp(Math.round(next.stretch.y), 0, source.height - 1) } };
}

function normalizeMarkers(markers: Markers, width: number, height: number): Markers {
  return { top: normalizeRange(markers.top, width), bottom: normalizeRange(markers.bottom, width), left: normalizeRange(markers.left, height), right: normalizeRange(markers.right, height) };
}
function normalizeRange(range: { start: number; end: number }, max: number) {
  const start = clamp(Math.round(range.start), 1, Math.max(1, max - 2));
  const end = clamp(Math.round(range.end), start + 1, Math.max(start + 1, max - 1));
  return { start, end };
}
function normalizeInsets(insets: Insets, width: number, height: number): Insets {
  const left = clamp(Math.round(insets.left), 0, Math.max(0, width - 1));
  const right = clamp(Math.round(insets.right), 0, Math.max(0, width - left - 1));
  const top = clamp(Math.round(insets.top), 0, Math.max(0, height - 1));
  const bottom = clamp(Math.round(insets.bottom), 0, Math.max(0, height - top - 1));
  return { left, right, top, bottom };
}
function clamp(value: number, min: number, max: number) { return Math.max(min, Math.min(max, value)); }
function fileToDataUrl(file: File) { return new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("이미지를 읽지 못했습니다.")); reader.onerror = () => reject(reader.error); reader.readAsDataURL(file); }); }
