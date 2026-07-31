"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import * as Popover from "@radix-ui/react-popover";
import { FlipHorizontal2, Info, LoaderCircle, Minus, Plus, RotateCcw } from "lucide-react";
import { loadNinePatchBlob } from "@/lib/theme/android/ninepatch";
import { defaultImageEditState, renderEditedImageFile, type ImageEditState, type ImageEditTarget } from "@/lib/theme/imageEdit";
import { bubbleEditorHelpHint, hasSeenHint, markHintSeen } from "@/lib/shared/hintStorage";
import { isMobileBubbleEditDirty, type MobileBubbleEditDraft } from "@/lib/theme/mobileBubbleEdit";
import { bubbleGeometryToLegacyEdit, centeredBubbleGeometry, flipBubbleGeometryHorizontally, normalizeBubbleGeometry, resolveBubbleGeometry } from "@/lib/theme/bubbleGeometry";
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
  onPreviewChange,
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
  onPreviewChange?: (input: { geometry: BubbleGeometry; markers: Markers; insets: Insets; stretch: StretchPoint }) => void;
}) {
  const [preparedFile, setPreparedFile] = useState<File | null>(sourceFile);
  const [imageUrl, setImageUrl] = useState("");
  const [asset, setAsset] = useState<BubbleAsset | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 });
  const [draft, setDraft] = useState<MobileBubbleEditDraft | null>(null);
  const [activeDragKind, setActiveDragKind] = useState<DragKind | null>(null);
  const [viewerZoom, setViewerZoom] = useState(1);
  const [helpOpen, setHelpOpen] = useState(false);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ kind: DragKind; startX: number; startY: number; draft: MobileBubbleEditDraft } | null>(null);
  const draftRef = useRef<MobileBubbleEditDraft | null>(null);
  const originalDraftRef = useRef<MobileBubbleEditDraft | null>(null);
  const originalDraftSourceRef = useRef<string | null>(null);
  const previewChangeRef = useRef(onPreviewChange);

  useEffect(() => {
    previewChangeRef.current = onPreviewChange;
  }, [onPreviewChange]);

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
        const nextAsset = await loadNinePatchBlob(preparedFile, preparedFile.name, bubbleSlot);
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
    // 저장된 편집값이 없으면 이미지 크기에 맞춘 가운데 값에서 시작한다.
    const centered = centeredBubbleGeometry(source.width, source.height);
    const resolved = resolveBubbleGeometry({
      platform,
      geometry,
      markers,
      insets,
      stretch,
      fallbackMarkers: asset.markers,
      fallbackInsets: centered.contentInsets,
      fallbackStretch: centered.stretch,
      width: source.width,
      height: source.height,
    });
    const hasPersistedGeometry = Boolean(geometry || markers || insets || stretch);
    return {
      imageState,
      geometry: imageState.flipX && !hasPersistedGeometry ? flipBubbleGeometryHorizontally(resolved, source.width) : resolved,
    };
  }, [asset, geometry, initialImageState, insets, markers, platform, stretch]);
  const originalDraftSource = asset && preparedFile ? `${slot.id}:${preparedFile.name}:${preparedFile.size}:${preparedFile.lastModified}:${asset.width}:${asset.height}` : null;

  useEffect(() => {
    if (!initialDraft || !originalDraftSource) return;
    if (originalDraftSourceRef.current === originalDraftSource) return;
    originalDraftSourceRef.current = originalDraftSource;
    originalDraftRef.current = initialDraft;
  }, [initialDraft, originalDraftSource]);

  useEffect(() => {
    setDraft(initialDraft);
    draftRef.current = initialDraft;
    setActiveDragKind(null);
  }, [initialDraft]);

  // 새 말풍선을 고르면 그 말풍선의 크기에 맞춘 기본 보기부터 시작한다.
  useEffect(() => {
    setViewerZoom(1);
  }, [preparedFile, slot.id]);

  // 마운트 이후에 읽는다. 렌더 중 localStorage를 보면 서버 출력과 어긋나 hydration이 깨진다.
  useEffect(() => {
    if (hasSeenHint(bubbleEditorHelpHint)) return;
    markHintSeen(bubbleEditorHelpHint);
    setHelpOpen(true);
  }, []);

  const artwork = asset ? getArtworkMetrics(asset, platform) : null;

  useEffect(() => {
    if (!draft || !artwork || !previewChangeRef.current) return;
    const frame = window.requestAnimationFrame(() => {
      const legacy = bubbleGeometryToLegacyEdit(draft.geometry, artwork.width, artwork.height);
      previewChangeRef.current?.(legacy);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [artwork, draft]);

  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const update = () => setStageSize({ width: stage.clientWidth, height: stage.clientHeight });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(stage);
    return () => observer.disconnect();
  }, [asset]);

  // Blob URL의 생성과 해제는 같은 effect에서 관리한다. 렌더 중 URL을 만들면
  // React Strict Mode의 effect 재실행에서 아직 화면에 쓰는 URL이 먼저 해제되어
  // 새로고침 직후 이미지가 깨질 수 있다.
  useEffect(() => {
    if (!preparedFile) {
      setImageUrl("");
      return;
    }
    const nextImageUrl = URL.createObjectURL(preparedFile);
    setImageUrl(nextImageUrl);
    return () => URL.revokeObjectURL(nextImageUrl);
  }, [preparedFile]);

  // 원본이 작은 말풍선도 편집 영역을 충분히 활용하도록 자동 맞춤의 상한을 넉넉히 둔다.
  // 별도 확대는 이 값의 배율로만 적용되며, 실제 말풍선 편집값에는 저장하지 않는다.
  const fitScale = asset && stageSize.width && stageSize.height
    ? Math.min(6, (stageSize.width - 64) / asset.width, (stageSize.height - 64) / asset.height)
    : 1;
  const stageScale = fitScale * viewerZoom;
  const effectiveScale = stageScale * (draft?.imageState.scale ?? 1);
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
    const nextDraft = updateDraftForDrag(active, dx, dy, artwork);
    draftRef.current = nextDraft;
    setDraft(nextDraft);
  };

  const endDrag = (event: PointerEvent<HTMLDivElement>) => {
    const nextDraft = draftRef.current;
    dragRef.current = null;
    setActiveDragKind(null);
    try { event.currentTarget.releasePointerCapture(event.pointerId); } catch { /* already released */ }
    if (nextDraft) void applyDraft(nextDraft);
  };

  const reset = () => {
    const resetDraft = originalDraftRef.current ?? initialDraft;
    if (!resetDraft) return;
    draftRef.current = resetDraft;
    setDraft(resetDraft);
    setActiveDragKind(null);
    void applyDraft(resetDraft, true);
  };
  const applyDraft = async (draftToApply: MobileBubbleEditDraft, force = false) => {
    if (!preparedFile || !initialDraft || !asset || !artwork) return;
    if (!force && !isMobileBubbleEditDirty(draftToApply, initialDraft)) return;
    const imageChanged = JSON.stringify(draftToApply.imageState) !== JSON.stringify(initialDraft.imageState);
    if (imageChanged) setLoading(true);
    setError(null);
    try {
      const editedFile = imageChanged ? await renderEditedImageFile(preparedFile, draftToApply.imageState, undefined, target, { preserveNinePatchBorder: platform === "android" }) : undefined;
      const legacy = bubbleGeometryToLegacyEdit(draftToApply.geometry, artwork.width, artwork.height);
      onApply({ editedFile, sourceFile: preparedFile, imageState: draftToApply.imageState, target, ...legacy });
    } catch (applyError) {
      setError(applyError instanceof Error ? applyError.message : "말풍선 편집을 적용하지 못했습니다.");
    } finally {
      if (imageChanged) setLoading(false);
    }
  };
  const fitViewer = () => setViewerZoom(1);
  const zoomIn = () => setViewerZoom((current) => Math.min(2.5, Number((current + 0.25).toFixed(2))));
  const zoomOut = () => setViewerZoom((current) => Math.max(0.5, Number((current - 0.25).toFixed(2))));
  const flip = () => {
    const current = draftRef.current;
    if (!current || !artwork) return;
    const nextDraft = {
      ...current,
      imageState: { ...current.imageState, flipX: !current.imageState.flipX },
      geometry: flipBubbleGeometryHorizontally(current.geometry, artwork.width),
    };
    draftRef.current = nextDraft;
    setDraft(nextDraft);
    void applyDraft(nextDraft);
  };

  if (loading && !asset) return <div className="grid min-h-48 place-items-center rounded-[22px] border border-[#dbe3ed] bg-white text-sm font-bold text-[#64748b]"><span className="inline-flex items-center gap-2"><LoaderCircle size={16} className="animate-spin" />편집 준비 중</span></div>;
  if (error && !asset) return <p className="rounded-[22px] border border-[#fecaca] bg-[#fff1f2] px-4 py-4 text-sm font-bold text-[#be123c]">{error}</p>;
  if (!asset || !draft) return <p className="rounded-[22px] border border-dashed border-[#dbe3ed] bg-[#f8fafc] px-4 py-5 text-center text-sm font-semibold text-[#64748b]">편집할 말풍선을 선택하세요.</p>;

  const isDirty = isMobileBubbleEditDirty(draft, originalDraftRef.current ?? initialDraft);
  return (
    <section className="grid gap-3 rounded-[24px] border border-[#d8e2ef] bg-[linear-gradient(160deg,#f8fbff_0%,#edf5ff_100%)] p-3 shadow-[0_12px_28px_rgba(37,99,235,0.08)]">
      <header className="flex min-h-11 items-center justify-between gap-2 px-1">
        <div className="flex min-w-0 items-center gap-1.5">
          <h3 className="truncate text-[15px] font-black tracking-[-0.02em] text-[#0f172a]">말풍선 편집</h3>
          {/* 교차점·테두리의 의미를 모르고 지나치기 쉬워 이 브라우저에서 처음 한 번만 펼쳐 둔다. */}
          <Popover.Root open={helpOpen} onOpenChange={setHelpOpen}>
            <Popover.Trigger asChild>
              <button type="button" title="편집 도움말" className="grid size-8 shrink-0 place-items-center rounded-lg text-[#64748b] transition hover:text-[#2563eb] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#2563eb] data-[state=open]:text-[#2563eb]" aria-label="편집 도움말"><Info size={17} aria-hidden="true" /></button>
            </Popover.Trigger>
            <Popover.Portal>
              {/* 자동으로 열리는 만큼 포커스는 옮기지 않는다. 슬롯을 고른 직후 포커스가 도움말로 튀면 안 된다. */}
              <Popover.Content onOpenAutoFocus={(event) => event.preventDefault()} side="bottom" align="start" sideOffset={8} collisionPadding={16} className="radix-popover-content z-[120] w-[min(256px,calc(100vw-32px))] rounded-2xl border border-[#dbeafe] bg-white p-3.5 text-[12px] font-medium leading-[1.55] text-[#475569] shadow-[0_16px_38px_rgba(15,23,42,0.16)] outline-none">
                <p className="font-black text-[#0f172a]">편집 안내</p>
                <p className="mt-1.5"><span className="font-bold text-[#0284c7]">파란 교차점</span>은 말풍선이 늘어나는 위치입니다.</p>
                <p className="mt-1"><span className="font-bold text-[#059669]">초록 테두리</span>는 글자가 들어갈 여백입니다.</p>
                <Popover.Arrow className="fill-white" width={14} height={7} />
              </Popover.Content>
            </Popover.Portal>
          </Popover.Root>
        </div>
        <div className="inline-flex h-9 shrink-0 overflow-hidden rounded-xl border border-[#d7e0ec] bg-white shadow-[0_2px_7px_rgba(15,23,42,0.04)]" aria-label="편집 화면 크기 조절">
          <button type="button" className="px-2.5 text-[12px] font-black text-[#334155] transition hover:bg-[#eff6ff] hover:text-[#1d4ed8] focus-visible:relative focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-[#2563eb] disabled:cursor-default disabled:bg-[#f8fafc] disabled:text-[#94a3b8]" onClick={fitViewer} disabled={viewerZoom === 1}>맞춤</button>
          <button type="button" title="확대" aria-label="확대" className="grid w-9 place-items-center border-l border-[#e2e8f0] text-[#475569] transition hover:bg-[#eff6ff] hover:text-[#1d4ed8] focus-visible:relative focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-[#2563eb] disabled:cursor-not-allowed disabled:text-[#cbd5e1]" onClick={zoomIn} disabled={viewerZoom >= 2.5}><Plus size={16} aria-hidden="true" /></button>
          <button type="button" title="축소" aria-label="축소" className="grid w-9 place-items-center border-l border-[#e2e8f0] text-[#475569] transition hover:bg-[#eff6ff] hover:text-[#1d4ed8] focus-visible:relative focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-[#2563eb] disabled:cursor-not-allowed disabled:text-[#cbd5e1]" onClick={zoomOut} disabled={viewerZoom <= 0.5}><Minus size={16} aria-hidden="true" /></button>
        </div>
      </header>
      <div
        ref={stageRef}
        className="relative grid h-[clamp(300px,42vh,460px)] touch-pan-y place-items-center overflow-hidden rounded-[20px] border border-white"
        style={{ backgroundColor: "#f8fafc", backgroundImage: "conic-gradient(#e6ebf1 25%, transparent 0 50%, #e6ebf1 0 75%, transparent 0)", backgroundSize: "16px 16px" }}
        onPointerMove={updateDrag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <div className="relative origin-center" style={artboardStyle}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={imageUrl} alt="" className="pointer-events-none block size-full origin-center select-none" style={{ transform: `scaleX(${draft.imageState.flipX ? -1 : 1})` }} draggable={false} />
          {artwork ? <BubbleGeometryOverlay geometry={draft.geometry} artwork={artwork} scale={stageScale} activeKind={activeDragKind} onDrag={beginDrag} /> : null}
        </div>
        <div className="absolute left-2 top-2 z-30 flex items-center gap-1.5">
          <button type="button" title="좌우 반전" aria-label="좌우 반전" className={`grid size-10 place-items-center rounded-full border border-white/85 bg-white/85 text-[#475569] backdrop-blur-sm transition focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#2563eb] ${draft.imageState.flipX ? "bg-[#eff6ff] text-[#1d4ed8]" : "hover:bg-[#f1f5f9] hover:text-[#1d4ed8]"}`} onClick={flip}><FlipHorizontal2 size={16} aria-hidden="true" /></button>
          <button type="button" title="처음 상태로 되돌리기" aria-label="처음 상태로 되돌리기" className="grid size-10 place-items-center rounded-full border border-white/85 bg-white/85 text-[#64748b] backdrop-blur-sm transition hover:bg-[#f1f5f9] hover:text-[#334155] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#2563eb] disabled:cursor-not-allowed disabled:opacity-35" disabled={!isDirty || loading} onClick={reset}><RotateCcw size={16} aria-hidden="true" /></button>
        </div>
        <BubbleValueFeedback geometry={draft.geometry} activeKind={activeDragKind} />
      </div>
      {error ? <p className="rounded-xl border border-[#fecaca] bg-[#fff1f2] px-3 py-2 text-xs font-bold text-[#be123c]" role="alert">{error}</p> : null}
    </section>
  );
}

function BubbleGeometryOverlay({
  geometry,
  artwork,
  scale,
  activeKind,
  onDrag,
}: {
  geometry: BubbleGeometry;
  artwork: ArtworkMetrics;
  scale: number;
  activeKind: DragKind | null;
  onDrag: (kind: DragKind) => (event: PointerEvent<HTMLButtonElement>) => void;
}) {
  const left = (artwork.offsetX + geometry.contentInsets.left) * scale;
  const top = (artwork.offsetY + geometry.contentInsets.top) * scale;
  const right = (artwork.offsetX + artwork.width - geometry.contentInsets.right) * scale;
  const bottom = (artwork.offsetY + artwork.height - geometry.contentInsets.bottom) * scale;
  const stretchX = (artwork.offsetX + geometry.stretch.x) * scale;
  const stretchY = (artwork.offsetY + geometry.stretch.y) * scale;
  const handle = (kind: DragKind, color: "emerald" | "sky") => {
    const active = activeKind === kind;
    const focusColor = color === "emerald" ? "focus-visible:outline-[#10b981]" : "focus-visible:outline-[#0ea5e9]";
    return `pointer-events-auto absolute z-20 grid size-10 touch-none -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full transition-[transform,filter] duration-150 ease-out focus-visible:outline-2 focus-visible:outline-offset-1 ${focusColor} ${active ? "scale-110 drop-shadow-[0_5px_10px_rgba(15,23,42,0.2)]" : "hover:scale-105 active:scale-110"}`;
  };
  const contentDot = (kind: DragKind) => <span className={`rounded-full border-2 border-white bg-[#10b981] shadow-[0_2px_8px_rgba(16,185,129,0.35)] transition-[width,height,box-shadow] duration-150 ${activeKind === kind ? "size-[18px] shadow-[0_4px_12px_rgba(16,185,129,0.5)]" : "size-3.5"}`} aria-hidden="true" />;

  return <div className="pointer-events-none absolute inset-0">
    <span className="absolute w-0.5 -translate-x-1/2 bg-sky-500/90" style={{ left: stretchX, top: artwork.offsetY * scale, height: artwork.height * scale }} />
    <span className="absolute h-0.5 -translate-y-1/2 bg-sky-500/90" style={{ left: artwork.offsetX * scale, top: stretchY, width: artwork.width * scale }} />
    <span className="absolute border-2 border-emerald-500/90" style={{ left, top, width: Math.max(1, right - left), height: Math.max(1, bottom - top) }} />
    <button type="button" aria-label="늘어나는 위치 조절" className={handle("stretch", "sky")} style={{ left: stretchX, top: stretchY }} onPointerDown={onDrag("stretch")}><span className={`grid rounded-full border-2 border-white bg-sky-500 shadow transition-[width,height,box-shadow] duration-150 ${activeKind === "stretch" ? "size-[22px] shadow-[0_4px_12px_rgba(14,165,233,0.5)]" : "size-[18px]"}`} aria-hidden="true"><span className={`rounded-full bg-white transition-[width,height] duration-150 ${activeKind === "stretch" ? "size-2" : "size-1.5"}`} /></span></button>
    <button type="button" aria-label="글자 여백 왼쪽 조절" className={handle("content-left", "emerald")} style={{ left, top: (top + bottom) / 2 }} onPointerDown={onDrag("content-left")}>{contentDot("content-left")}</button>
    <button type="button" aria-label="글자 여백 오른쪽 조절" className={handle("content-right", "emerald")} style={{ left: right, top: (top + bottom) / 2 }} onPointerDown={onDrag("content-right")}>{contentDot("content-right")}</button>
    <button type="button" aria-label="글자 여백 위 조절" className={handle("content-top", "emerald")} style={{ left: (left + right) / 2, top }} onPointerDown={onDrag("content-top")}>{contentDot("content-top")}</button>
    <button type="button" aria-label="글자 여백 아래 조절" className={handle("content-bottom", "emerald")} style={{ left: (left + right) / 2, top: bottom }} onPointerDown={onDrag("content-bottom")}>{contentDot("content-bottom")}</button>
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
