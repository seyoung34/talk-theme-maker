"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { Check, FlipHorizontal2, Info, LoaderCircle, Maximize2, RotateCcw } from "lucide-react";
import { loadNinePatchDataUrl } from "@/lib/theme/android/ninepatch";
import { flipBubbleInsetsHorizontally, flipBubbleMarkersHorizontally, flipBubbleStretchHorizontally } from "@/lib/theme/bubbleEditTransforms";
import { defaultInsets, defaultStretch } from "@/lib/theme/preview/bubbleCanvas";
import { defaultImageEditState, renderEditedImageFile, type ImageEditState, type ImageEditTarget } from "@/lib/theme/imageEdit";
import { clampBubbleStretchPoint, isMobileBubbleEditDirty, normalizeBubbleInsets, normalizeBubbleMarkers, type MobileBubbleEditDraft } from "@/lib/theme/mobileBubbleEdit";
import type { ThemeAssetSlot } from "@/lib/theme/templates";
import type { BubbleAsset, BubbleSlot, Insets, Markers, StretchPoint, ThemePlatform } from "@/lib/theme/types";

type DragKind = "scale" | "top-start" | "top-end" | "left-start" | "left-end" | "content-left" | "content-right" | "content-top" | "content-bottom" | "inset-left" | "inset-right" | "inset-top" | "inset-bottom" | "stretch";

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
      <div ref={stageRef} className="relative grid min-h-[300px] touch-pan-y place-items-center overflow-hidden rounded-[20px] border border-white bg-[radial-gradient(circle_at_50%_35%,#ffffff_0%,#e7f0fa_76%)]" onPointerMove={updateDrag} onPointerUp={endDrag} onPointerCancel={endDrag}>
        <div className="relative origin-center" style={artboardStyle}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={imageUrl} alt="" className="pointer-events-none block size-full select-none" draggable={false} />
          {platform === "android" ? <AndroidOverlay asset={asset} markers={draft.markers} scale={stageScale} onDrag={beginDrag} /> : <IosOverlay asset={asset} insets={draft.insets} stretch={draft.stretch} scale={stageScale} onDrag={beginDrag} />}
          <button type="button" aria-label="이미지 크기 조절" className="absolute -bottom-4 -right-4 grid size-10 touch-none cursor-nwse-resize place-items-center rounded-full border border-[#bfdbfe] bg-white text-[#2563eb] shadow-[0_8px_20px_rgba(37,99,235,0.22)]" onPointerDown={beginDrag("scale")}><Maximize2 size={17} aria-hidden="true" /></button>
        </div>
      </div>
      <BubbleValueReadout platform={platform} markers={draft.markers} insets={draft.insets} stretch={draft.stretch} />
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          <button type="button" title="좌우 반전" aria-label="좌우 반전" className={`grid size-11 place-items-center rounded-xl border transition ${draft.imageState.flipX ? "border-[#2563eb] bg-[#eff6ff] text-[#1d4ed8]" : "border-[#d1d5db] bg-white text-[#334155]"}`} onClick={flip}><FlipHorizontal2 size={18} aria-hidden="true" /></button>
          <button type="button" title="마지막 적용 상태로 되돌리기" aria-label="마지막 적용 상태로 되돌리기" className="grid size-11 place-items-center rounded-xl border border-[#d1d5db] bg-white text-[#475569] transition disabled:opacity-45" disabled={!isMobileBubbleEditDirty(draft, initialDraft)} onClick={reset}><RotateCcw size={18} aria-hidden="true" /></button>
        </div>
        <button type="button" title="편집 도움말" className={`grid size-11 place-items-center rounded-xl border transition ${helpOpen ? "border-[#bfdbfe] bg-[#eff6ff] text-[#1d4ed8]" : "border-[#d1d5db] bg-white text-[#475569]"}`} aria-label="편집 도움말" aria-expanded={helpOpen} onClick={() => setHelpOpen((current) => !current)}><Info size={18} aria-hidden="true" /></button>
      </div>
      {helpOpen ? <p className="rounded-xl bg-white/80 px-3 py-2.5 text-xs font-semibold leading-5 text-[#475569]">{platform === "android" ? "파란 영역의 양끝을 움직여 늘어나는 구간을, 초록 테두리의 핸들을 움직여 글자 영역을 조절하세요." : "초록 테두리의 핸들로 글자 여백을, 파란 점으로 이미지가 늘어나는 기준을 조절하세요."}</p> : null}
      {error ? <p className="rounded-xl border border-[#fecaca] bg-[#fff1f2] px-3 py-2 text-xs font-bold text-[#be123c]" role="alert">{error}</p> : null}
      <div className="grid grid-cols-2 gap-2"><button type="button" className="min-h-12 rounded-xl border border-[#d1d5db] bg-white px-4 text-sm font-black text-[#475569] disabled:opacity-45" disabled={!isMobileBubbleEditDirty(draft, initialDraft) || loading} onClick={reset}>취소</button><button type="button" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#0f172a] px-4 text-sm font-black text-white disabled:opacity-45" disabled={!isMobileBubbleEditDirty(draft, initialDraft) || loading} onClick={() => void apply()}>{loading ? <LoaderCircle size={16} className="animate-spin" /> : <Check size={16} />}적용</button></div>
    </section>
  );
}

function AndroidOverlay({ asset, markers, scale, onDrag }: { asset: BubbleAsset; markers: Markers; scale: number; onDrag: (kind: DragKind) => (event: PointerEvent<HTMLButtonElement>) => void }) {
  const handle = "pointer-events-auto absolute z-20 size-7 touch-none -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-[#2563eb] shadow-[0_2px_8px_rgba(37,99,235,0.35)]";
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
  const handle = "pointer-events-auto absolute z-20 size-7 touch-none -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-emerald-500 shadow-[0_2px_8px_rgba(16,185,129,0.35)]";
  return <div className="pointer-events-none absolute inset-0">
    <span className="absolute border-2 border-emerald-500/90" style={{ left, top, width: Math.max(1, right - left), height: Math.max(1, bottom - top) }} />
    <span className="absolute h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-sky-500 shadow" style={{ left: stretch.x * scale, top: stretch.y * scale }} />
    <button type="button" aria-label="글자 영역 왼쪽 조절" className={handle} style={{ left, top: (top + bottom) / 2 }} onPointerDown={onDrag("inset-left")} />
    <button type="button" aria-label="글자 영역 오른쪽 조절" className={handle} style={{ left: right, top: (top + bottom) / 2 }} onPointerDown={onDrag("inset-right")} />
    <button type="button" aria-label="글자 영역 위 조절" className={handle} style={{ left: (left + right) / 2, top }} onPointerDown={onDrag("inset-top")} />
    <button type="button" aria-label="글자 영역 아래 조절" className={handle} style={{ left: (left + right) / 2, top: bottom }} onPointerDown={onDrag("inset-bottom")} />
    <button type="button" aria-label="늘어나는 기준점 조절" className="pointer-events-auto absolute z-20 grid size-8 touch-none -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-2 border-white bg-sky-500 shadow" style={{ left: stretch.x * scale, top: stretch.y * scale }} onPointerDown={onDrag("stretch")}><span className="size-2 rounded-full bg-white" /></button>
  </div>;
}

function updateDraftForDrag(active: { kind: DragKind; startX: number; startY: number; draft: MobileBubbleEditDraft }, dx: number, dy: number, asset: BubbleAsset, platform: ThemePlatform) {
  const next = structuredClone(active.draft);
  const width = asset.width;
  const height = asset.height;
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
    return { ...next, markers: normalizeBubbleMarkers(next.markers, width, height) };
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
  return { ...next, insets: normalizeBubbleInsets(next.insets, source.width, source.height), stretch: clampBubbleStretchPoint(next.stretch, source.width, source.height) };
}

function BubbleValueReadout({ platform, markers, insets, stretch }: { platform: ThemePlatform; markers: Markers; insets: Insets; stretch: StretchPoint }) {
  if (platform === "android") {
    return <div className="grid grid-cols-2 gap-2" aria-label="현재 영역 값">
      <ValueCard label="늘어나는 구간" values={[`가로 ${markers.top.start}–${markers.top.end}`, `세로 ${markers.left.start}–${markers.left.end}`]} tone="blue" />
      <ValueCard label="글자 영역" values={[`가로 ${markers.bottom.start}–${markers.bottom.end}`, `세로 ${markers.right.start}–${markers.right.end}`]} tone="green" />
    </div>;
  }
  return <div className="grid grid-cols-2 gap-2" aria-label="현재 영역 값">
    <ValueCard label="늘어나는 기준" values={[`X ${stretch.x}`, `Y ${stretch.y}`]} tone="blue" />
    <ValueCard label="글자 여백" values={[`왼 ${insets.left} · 오른 ${insets.right}`, `위 ${insets.top} · 아래 ${insets.bottom}`]} tone="green" />
  </div>;
}

function ValueCard({ label, values, tone }: { label: string; values: string[]; tone: "blue" | "green" }) {
  const colors = tone === "blue" ? "border-[#bfdbfe] bg-[#f8fbff] text-[#1d4ed8]" : "border-[#a7f3d0] bg-[#f4fffa] text-[#047857]";
  return <div className={`rounded-xl border px-3 py-2 ${colors}`}>
    <p className="text-[10px] font-black tracking-[-0.01em]">{label}</p>
    <div className="mt-1 grid gap-0.5 font-mono text-[11px] font-bold leading-4 text-[#334155]">{values.map((value) => <span key={value}>{value}</span>)}</div>
  </div>;
}
function fileToDataUrl(file: File) { return new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("이미지를 읽지 못했습니다.")); reader.onerror = () => reject(reader.error); reader.readAsDataURL(file); }); }
