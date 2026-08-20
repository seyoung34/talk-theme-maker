"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import * as Popover from "@radix-ui/react-popover";
import { FlipHorizontal2, Info, LoaderCircle, Minus, Plus, RotateCcw } from "lucide-react";
import { loadNinePatchBlob } from "@/lib/theme/android/ninepatch";
import { defaultImageEditState, renderEditedImageFile, type ImageEditState, type ImageEditTarget } from "@/lib/theme/imageEdit";
import { bubbleEditorHelpHint, hasSeenHint, markHintSeen } from "@/lib/shared/hintStorage";
import { isMobileBubbleEditDirty, type MobileBubbleEditDraft } from "@/lib/theme/mobileBubbleEdit";
import { bubbleGeometryToLegacyEdit, centeredBubbleGeometry, flipBubbleGeometryHorizontally, normalizeBubbleGeometry, resolveBubbleGeometry } from "@/lib/theme/bubbleGeometry";
import { isAndroidNinePatchSourceName } from "@/lib/theme/sourceImage";
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
  flipX = false,
  showFlip = true,
  resetGeometryOnSourceChange = false,
  onApply,
  onFlipXChange,
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
  /**
   * 슬롯별 좌우반전. 파일에 굽지 않고 프로젝트 상태로만 들고 있다가 결과물을 만들 때 적용한다.
   * `initialImageState.flipX`(파일에 이미 구워진 legacy 값)와는 별개다.
   */
  flipX?: boolean;
  /** 관리자 라이브러리처럼 대상 슬롯에서 방향을 결정하는 흐름은 숨길 수 있다. */
  showFlip?: boolean;
  /** 새 원본 이미지가 들어오면 이전 픽셀 좌표 대신 새 이미지 중앙에서 geometry를 시작한다. */
  resetGeometryOnSourceChange?: boolean;
  onApply: (input: { editedFile?: File; sourceFile: File; imageState: ImageEditState; target?: ImageEditTarget; geometry: BubbleGeometry; markers: Markers; insets: Insets; stretch: StretchPoint }) => void;
  onFlipXChange?: (next: boolean) => void;
  onPreviewChange?: (input: { geometry: BubbleGeometry; markers: Markers; insets: Insets; stretch: StretchPoint; flipX: boolean }) => void;
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
  // "처음 상태로 되돌리기"의 기준. 이 슬롯/그림을 열었을 때의 반전 상태다.
  const originalFlipXRef = useRef(flipX);
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
        // 추천 타일은 CSS background-image(no-cors)로 먼저 캐시될 수 있다. 그 응답을
        // force-cache로 재사용하면 CORS 헤더가 없는 캐시 항목이 되어 편집용 fetch가 실패한다.
        const response = await fetch(sourceUrl, { cache: "no-store", mode: "cors" });
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

  const originalDraftSource = asset && preparedFile ? `${slot.id}:${preparedFile.name}:${preparedFile.size}:${preparedFile.lastModified}:${asset.width}:${asset.height}` : null;
  const sourceChanged = Boolean(originalDraftSourceRef.current && originalDraftSource && originalDraftSourceRef.current !== originalDraftSource);

  const initialDraft = useMemo<MobileBubbleEditDraft | null>(() => {
    if (!asset) return null;
    const imageState = initialImageState ?? defaultImageEditState;
    const source = getArtworkMetrics(asset);
    // 저장된 편집값이 없으면 이미지 크기에 맞춘 가운데 값에서 시작한다.
    const centered = centeredBubbleGeometry(source.width, source.height);
    const hasPersistedGeometry = Boolean(geometry || markers || insets || stretch);
    // 관리자 에셋은 이미지 교체 시 이전 픽셀 좌표를 재사용하지 않는다. 새 파일의 크기가
    // 달라도 조정점이 한쪽 모서리에 몰리지 않도록 새 artwork 중앙에서 시작한다.
    // 첫 마운트를 "원본이 바뀐 것"으로 세지 않는다. 세면 저장된 조정값이 있어도 첫 렌더가
    // 가운데 값으로 계산되고, 그 값이 되돌리기 기준선으로 굳는다(아래 이펙트는 같은 source에
    // 대해 다시 잡지 않는다). 후보 라이브러리 ↔ 말풍선 편집을 오갈 때마다 편집기가 다시
    // 마운트되므로, 사용자가 맞춰 둔 위치가 가운데 기본값으로 덮였다.
    // 새 파일을 받을 때는 부모가 geometry·조정값을 먼저 비우므로 이 분기가 없어도 가운데에서 시작한다.
    const sourceNeedsCenteredGeometry = resetGeometryOnSourceChange && sourceChanged;
    const shouldCenter = resetGeometryOnSourceChange && (!hasPersistedGeometry || sourceNeedsCenteredGeometry);
    const resolved = shouldCenter
      ? centered
      : resolveBubbleGeometry({
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
    return {
      imageState,
      // draft.geometry는 항상 canonical — "선택한 파일(effective file) 기준" 좌표다.
      // 저장값이 없어 원본 asset의 marker에서 시작할 때만, 파일에 이미 구워진 legacy 반전만큼
      // 한 번 돌려 effective 좌표로 맞춘다. 슬롯 반전(flipX)은 여기서 다루지 않는다.
      geometry: imageState.flipX && (!hasPersistedGeometry || sourceNeedsCenteredGeometry) ? flipBubbleGeometryHorizontally(resolved, source.width) : resolved,
    };
  }, [asset, geometry, initialImageState, insets, markers, platform, resetGeometryOnSourceChange, sourceChanged, stretch]);

  useEffect(() => {
    if (!initialDraft || !originalDraftSource) return;
    if (originalDraftSourceRef.current === originalDraftSource) return;
    originalDraftSourceRef.current = originalDraftSource;
    originalDraftRef.current = initialDraft;
    // 반전 기준선도 같은 시점에만 갱신한다. 매 렌더 갱신하면 되돌리기가 항상 비활성이 된다.
    originalFlipXRef.current = flipX;
    // 기준선은 "다른 그림으로 바뀐 순간"에만 잡는다. flipX가 바뀔 때마다 다시 잡으면 안 된다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const artwork = asset ? getArtworkMetrics(asset) : null;

  useEffect(() => {
    if (!draft || !artwork || !previewChangeRef.current) return;
    const frame = window.requestAnimationFrame(() => {
      const legacy = bubbleGeometryToLegacyEdit(draft.geometry, artwork.width, artwork.height);
      previewChangeRef.current?.({ ...legacy, flipX });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [artwork, draft, flipX]);

  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const update = () => setStageSize({ width: stage.clientWidth, height: stage.clientHeight });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(stage);
    return () => observer.disconnect();
  }, [asset]);

  // Android .9 원본은 marker를 읽는 데 필요하지만, 편집 화면에는 marker 1px 테두리를
  // 제외한 artwork만 보여준다. geometry는 같은 asset에서 이미 계산되므로 편집·내보내기
  // 원본과 화면 표시를 분리해도 stretch/text 영역 좌표가 달라지지 않는다.
  useEffect(() => {
    if (!asset) {
      setImageUrl("");
      return;
    }
    setImageUrl(asset.innerCanvas.toDataURL("image/png"));
  }, [asset]);

  // 원본이 작은 말풍선도 편집 영역을 충분히 활용하도록 자동 맞춤의 상한을 넉넉히 둔다.
  // 별도 확대는 이 값의 배율로만 적용되며, 실제 말풍선 편집값에는 저장하지 않는다.
  const fitScale = asset && stageSize.width && stageSize.height
    ? Math.min(6, (stageSize.width - 64) / (artwork?.width ?? asset.width), (stageSize.height - 64) / (artwork?.height ?? asset.height))
    : 1;
  const stageScale = fitScale * viewerZoom;
  const effectiveScale = stageScale * (draft?.imageState.scale ?? 1);
  const artboardStyle = draft && asset ? {
    width: (artwork?.width ?? asset.width) * stageScale,
    height: (artwork?.height ?? asset.height) * stageScale,
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
    const nextDraft = updateDraftForDrag(active, dx, dy, artwork, flipX);
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
    if (flipX !== originalFlipXRef.current) onFlipXChange?.(originalFlipXRef.current);
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
  /**
   * 좌우반전은 슬롯 상태만 뒤집는다.
   *
   * 예전에는 `imageState.flipX`를 뒤집고 `renderEditedImageFile()`로 새 파일을 구웠다. 그래서
   * 토글할 때마다 업로드 목록이 하나씩 늘었고, 같은 그림을 방향만 다르게 쓰려면 별개의 두
   * 업로드가 필요했다. 저장 geometry는 canonical 그대로 두므로 왕복해도 값이 흔들리지 않는다.
   */
  const flip = () => {
    onFlipXChange?.(!flipX);
  };

  if (loading && !asset) return <div className="grid min-h-48 place-items-center rounded-[22px] border border-[#dbe3ed] bg-white text-sm font-bold text-[#64748b]"><span className="inline-flex items-center gap-2"><LoaderCircle size={16} className="animate-spin" />편집 준비 중</span></div>;
  if (error && !asset) return <p className="rounded-[22px] border border-[#fecaca] bg-[#fff1f2] px-4 py-4 text-sm font-bold text-[#be123c]">{error}</p>;
  if (!asset || !draft) return <p className="rounded-[22px] border border-dashed border-[#dbe3ed] bg-[#f8fafc] px-4 py-5 text-center text-sm font-semibold text-[#64748b]">편집할 말풍선을 선택하세요.</p>;

  // 화면에 보이는 방향. 파일에 이미 구워진 legacy 반전과 슬롯 반전이 겹치면 서로 상쇄된다.
  const displayFlipX = Boolean(draft.imageState.flipX) !== flipX;
  // 저장값은 canonical이고 오버레이는 화면 좌표를 쓴다. 반전 중일 때만 파생해서 그린다.
  const displayGeometry = flipX && artwork ? flipBubbleGeometryHorizontally(draft.geometry, artwork.width) : draft.geometry;
  const isDirty = isMobileBubbleEditDirty(draft, originalDraftRef.current ?? initialDraft) || flipX !== originalFlipXRef.current;
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
                <p className="mt-1"><span className="font-bold text-[#64748b]">회색 점선</span>은 이미지의 경계입니다.</p>
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
          <img src={imageUrl} alt="" className="pointer-events-none block size-full origin-center select-none" style={{ transform: `scaleX(${displayFlipX ? -1 : 1})` }} draggable={false} />
          {artwork ? <BubbleGeometryOverlay geometry={displayGeometry} artwork={artwork} scale={stageScale} activeKind={activeDragKind} onDrag={beginDrag} /> : null}
        </div>
        <div className="absolute left-2 top-2 z-30 flex items-center gap-1.5">
          {showFlip ? <button type="button" title="좌우 반전" aria-label="좌우 반전" className={`grid size-10 place-items-center rounded-full border border-white/85 bg-white/85 text-[#475569] backdrop-blur-sm transition focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#2563eb] ${flipX ? "bg-[#eff6ff] text-[#1d4ed8]" : "hover:bg-[#f1f5f9] hover:text-[#1d4ed8]"}`} aria-pressed={flipX} onClick={flip}><FlipHorizontal2 size={16} aria-hidden="true" /></button> : null}
          <button type="button" title="처음 상태로 되돌리기" aria-label="처음 상태로 되돌리기" className="grid size-10 place-items-center rounded-full border border-white/85 bg-white/85 text-[#64748b] backdrop-blur-sm transition hover:bg-[#f1f5f9] hover:text-[#334155] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#2563eb] disabled:cursor-not-allowed disabled:opacity-35" disabled={!isDirty || loading} onClick={reset}><RotateCcw size={16} aria-hidden="true" /></button>
        </div>
        <BubbleValueFeedback geometry={displayGeometry} activeKind={activeDragKind} />
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
    {/*
      이미지 경계. 배경이 체커보드라 투명한 여백이 넓은 말풍선은 어디까지가 이미지인지 보이지
      않는다. 그러면 글자 여백을 이미지 밖으로 끌어낸 것인지, 늘어나는 선이 이미지의 어디쯤을
      지나는지 판단할 기준이 없다. 나인패치의 1px 마커 테두리는 뺀 실제 그림 영역을 그린다.
    */}
    <span className="absolute border-2 border-dashed border-slate-400/80" style={{ left: artwork.offsetX * scale, top: artwork.offsetY * scale, width: artwork.width * scale, height: artwork.height * scale }} />
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

/**
 * 핸들은 화면에 보이는 좌표(표시 좌표)에서 움직인다. 저장값은 canonical 좌표이므로 반전 중이면
 * 표시 좌표로 내렸다가 드래그를 적용하고 다시 canonical로 되돌린다.
 * `flipBubbleGeometryHorizontally`는 대합이라 이 왕복에서 값이 변하지 않는다.
 */
function updateDraftForDrag(active: { kind: DragKind; startX: number; startY: number; draft: MobileBubbleEditDraft }, dx: number, dy: number, artwork: ArtworkMetrics, flipX: boolean) {
  const next = structuredClone(active.draft);
  const display = flipX ? flipBubbleGeometryHorizontally(next.geometry, artwork.width) : next.geometry;
  if (active.kind === "stretch") {
    display.stretch.x += dx;
    display.stretch.y += dy;
  }
  if (active.kind === "content-left") display.contentInsets.left += dx;
  if (active.kind === "content-right") display.contentInsets.right -= dx;
  if (active.kind === "content-top") display.contentInsets.top += dy;
  if (active.kind === "content-bottom") display.contentInsets.bottom -= dy;
  const normalized = normalizeBubbleGeometry(display, artwork.width, artwork.height);
  next.geometry = flipX ? flipBubbleGeometryHorizontally(normalized, artwork.width) : normalized;
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
function getArtworkMetrics(asset: BubbleAsset): ArtworkMetrics {
  const hasMarkerBorder = isAndroidNinePatchSourceName(asset.name);
  const source = hasMarkerBorder ? asset.innerCanvas : asset.fullCanvas;
  return {
    width: source.width,
    height: source.height,
    // 편집 화면도 innerCanvas를 그리므로 geometry는 항상 표시 artwork의 좌상단을 기준으로 한다.
    offsetX: 0,
    offsetY: 0,
  };
}
