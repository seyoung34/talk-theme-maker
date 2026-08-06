"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Check, FlipHorizontal2, Info, LoaderCircle, Maximize2, RotateCcw, X } from "lucide-react";
import { clampImageScale, defaultImageEditState, renderEditedImageFile, type ImageEditState, type ImageEditTarget } from "@/lib/theme/imageEdit";

export function ImageEditDialog({
  open,
  sourceFile,
  slotLabel,
  initialState,
  target,
  preserveNinePatchBorder = false,
  onOpenChange,
  onApply,
}: {
  open: boolean;
  sourceFile: File | null;
  slotLabel: string;
  initialState?: ImageEditState;
  target?: ImageEditTarget;
  preserveNinePatchBorder?: boolean;
  onOpenChange: (open: boolean) => void;
  onApply: (file: File, state: ImageEditState, outputSize?: { width: number; height: number }) => void;
}) {
  const [state, setState] = useState<ImageEditState>(initialState ?? defaultImageEditState);
  const [sourceUrl, setSourceUrl] = useState("");
  const [sourceSize, setSourceSize] = useState<{ width: number; height: number } | null>(null);
  const [isApplying, setIsApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [previewPixelScale, setPreviewPixelScale] = useState(1);
  const previewFrameRef = useRef<HTMLDivElement | null>(null);
  const previewDragRef = useRef<{ kind: "move" | "scale"; startX: number; startY: number; startState: ImageEditState } | null>(null);

  useEffect(() => {
    if (!open) return;
    setState(initialState ?? defaultImageEditState);
    setError(null);
    setHelpOpen(false);
  }, [initialState, open, sourceFile]);

  useEffect(() => {
    if (!sourceFile || !open) {
      setSourceUrl("");
      setSourceSize(null);
      return;
    }
    const nextUrl = URL.createObjectURL(sourceFile);
    setSourceUrl(nextUrl);
    let active = true;
    createImageBitmap(sourceFile)
      .then((bitmap) => {
        if (active) setSourceSize({ width: bitmap.width, height: bitmap.height });
        bitmap.close();
      })
      .catch(() => {
        if (active) setSourceSize(null);
      });
    return () => {
      active = false;
      URL.revokeObjectURL(nextUrl);
    };
  }, [open, sourceFile]);

  const frameSize = target ?? sourceSize;
  const frameStyle = useMemo<CSSProperties | undefined>(() => {
    if (!frameSize?.width || !frameSize.height) return undefined;
    return { aspectRatio: `${frameSize.width} / ${frameSize.height}` };
  }, [frameSize]);
  const outputSize = target ?? sourceSize;
  const previewImageScale = sourceSize && outputSize
    ? getPreviewFitScale(state.fitMode, sourceSize.width, sourceSize.height, outputSize.width, outputSize.height) * previewPixelScale * clampImageScale(state.scale)
    : clampImageScale(state.scale);
  const previewStyle = useMemo<CSSProperties>(
    () => ({
      width: sourceSize?.width,
      height: sourceSize?.height,
      maxWidth: "none",
      maxHeight: "none",
      transformOrigin: "center",
      transform: `translate(${state.offsetX * previewPixelScale}px, ${state.offsetY * previewPixelScale}px) scaleX(${state.flipX ? -1 : 1}) scale(${previewImageScale})`,
    }),
    [previewImageScale, previewPixelScale, sourceSize, state],
  );
  const hasChanges = !isDefaultImageEditState(state);
  const outputWidth = outputSize?.width;
  const outputHeight = outputSize?.height;

  useEffect(() => {
    const frame = previewFrameRef.current;
    if (!frame || !outputWidth || !outputHeight) return;
    const updatePreviewPixelScale = () => {
      const rect = frame.getBoundingClientRect();
      const nextScale = Math.min(rect.width / outputWidth, rect.height / outputHeight);
      setPreviewPixelScale(Number.isFinite(nextScale) && nextScale > 0 ? nextScale : 1);
    };
    updatePreviewPixelScale();
    const observer = new ResizeObserver(updatePreviewPixelScale);
    observer.observe(frame);
    return () => observer.disconnect();
  }, [outputHeight, outputWidth]);

  const beginPreviewDrag = (kind: "move" | "scale") => (event: PointerEvent<HTMLDivElement | HTMLButtonElement>) => {
    if (!sourceUrl || isApplying) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    previewDragRef.current = { kind, startX: event.clientX, startY: event.clientY, startState: state };
  };

  const updatePreviewDrag = (event: PointerEvent<HTMLDivElement>) => {
    const drag = previewDragRef.current;
    if (!drag) return;
    const pixelScale = Math.max(previewPixelScale, 0.01);
    if (drag.kind === "move") {
      setState((current) => ({ ...current, offsetX: Math.round(drag.startState.offsetX + (event.clientX - drag.startX) / pixelScale), offsetY: Math.round(drag.startState.offsetY + (event.clientY - drag.startY) / pixelScale) }));
      return;
    }
    const delta = ((event.clientX - drag.startX) + (event.clientY - drag.startY)) / Math.max(Math.min(event.currentTarget.clientWidth, event.currentTarget.clientHeight), 120);
    setState((current) => ({ ...current, scale: clampImageScale(drag.startState.scale + delta) }));
  };

  const endPreviewDrag = (event: PointerEvent<HTMLDivElement>) => {
    previewDragRef.current = null;
    try { event.currentTarget.releasePointerCapture(event.pointerId); } catch { /* pointer may already be released */ }
  };

  const apply = async () => {
    if (!sourceFile || isApplying) return;
    try {
      setIsApplying(true);
      setError(null);
      const editedFile = await renderEditedImageFile(sourceFile, state, undefined, target, { preserveNinePatchBorder });
      onApply(editedFile, state, outputSize ? { width: outputSize.width, height: outputSize.height } : undefined);
      onOpenChange(false);
    } catch (applyError) {
      console.error(applyError);
      setError(applyError instanceof Error ? applyError.message : "이미지를 편집하지 못했습니다.");
    } finally {
      setIsApplying(false);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={(nextOpen) => !isApplying && onOpenChange(nextOpen)}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[90] bg-slate-950/45 backdrop-blur-[2px]" />
        <Dialog.Content className="fixed inset-0 z-[91] grid h-[100dvh] w-screen grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden bg-white outline-none sm:left-1/2 sm:top-1/2 sm:h-auto sm:max-h-[calc(100dvh-24px)] sm:w-[min(920px,calc(100vw-24px))] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-[28px] sm:border sm:border-[#dbe3ed] sm:shadow-[0_28px_80px_rgba(15,23,42,0.24)]">
          <header className="border-b border-[#e5e7eb] px-4 py-3 sm:px-5 sm:py-4">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0"><Dialog.Title className="text-base font-black text-[#0f172a] sm:text-lg">이미지 편집</Dialog.Title><Dialog.Description className="sr-only">{slotLabel} 이미지를 직접 조정합니다.</Dialog.Description></div>
              <div className="flex items-center gap-1.5">
                <button type="button" className={`grid size-10 place-items-center rounded-full border transition ${helpOpen ? "border-[#bfdbfe] bg-[#eff6ff] text-[#1d4ed8]" : "border-[#e5e7eb] bg-white text-[#475569] hover:bg-[#f8fafc]"}`} onClick={() => setHelpOpen((current) => !current)} aria-expanded={helpOpen} aria-label="편집 도움말">
                  <Info size={18} aria-hidden="true" />
                </button>
                <Dialog.Close asChild><button type="button" className="grid size-10 place-items-center rounded-full border border-[#e5e7eb] bg-white text-[#475569] transition hover:bg-[#f8fafc]" disabled={isApplying} aria-label="이미지 편집 닫기"><X size={18} aria-hidden="true" /></button></Dialog.Close>
              </div>
            </div>
            {helpOpen ? <p className="mt-3 rounded-xl bg-[#eff6ff] px-3 py-2.5 text-xs font-semibold leading-5 text-[#334155]" role="status">미리보기를 드래그해 위치를 옮기고, 우하단 핸들을 드래그해 크기를 조절하세요. 적용하면 편집 결과가 새 후보로 저장됩니다.</p> : null}
          </header>

          <div className="grid min-h-0 gap-3 overflow-y-auto p-3 sm:gap-4 sm:p-5 lg:grid-cols-[minmax(0,1fr)_300px]">
            <section className="grid h-[clamp(260px,48dvh,460px)] min-h-0 place-items-center rounded-[24px] border border-[#d8e2ef] bg-[radial-gradient(circle_at_50%_30%,#ffffff_0%,#edf4fb_72%)] p-3 sm:h-[min(62dvh,520px)] sm:min-h-[360px] sm:bg-[linear-gradient(45deg,#e2e8f0_25%,transparent_25%),linear-gradient(-45deg,#e2e8f0_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#e2e8f0_75%),linear-gradient(-45deg,transparent_75%,#e2e8f0_75%)] sm:bg-[length:18px_18px] sm:bg-[position:0_0,0_9px,9px_-9px,-9px_0px] sm:p-4">
              <div ref={previewFrameRef} className="relative grid min-h-0 min-w-0 max-h-full w-full max-w-[420px] touch-none place-items-center overflow-hidden rounded-[22px] border border-white/80 bg-white/75 shadow-[inset_0_0_0_1px_rgba(15,23,42,0.04)] cursor-grab active:cursor-grabbing" style={frameStyle} onPointerDown={beginPreviewDrag("move")} onPointerMove={updatePreviewDrag} onPointerUp={endPreviewDrag} onPointerCancel={endPreviewDrag}>
                {sourceUrl ? <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={sourceUrl} alt="" className="pointer-events-none select-none transition-transform duration-100 ease-out" style={previewStyle} draggable={false} />
                  <button type="button" aria-label="이미지 크기 조절" className="absolute bottom-3 right-3 grid size-10 cursor-nwse-resize place-items-center rounded-full border border-[#bfdbfe] bg-white text-[#2563eb] shadow-[0_8px_20px_rgba(37,99,235,0.2)] touch-none" onPointerDown={beginPreviewDrag("scale")}><Maximize2 size={17} aria-hidden="true" /></button>
                </> : <p className="px-6 text-center text-sm font-semibold text-[#64748b]">편집할 이미지를 찾지 못했습니다.</p>}
              </div>
            </section>

            <aside className="grid min-w-0 grid-cols-2 gap-2 lg:content-start lg:grid-cols-1 lg:gap-3">
              <button type="button" className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border px-4 text-sm font-black transition ${state.flipX ? "border-[#2563eb] bg-[#eff6ff] text-[#1d4ed8]" : "border-[#d1d5db] bg-white text-[#334155] hover:bg-[#f8fafc]"}`} onClick={() => setState((current) => ({ ...current, flipX: !current.flipX }))}><FlipHorizontal2 size={17} aria-hidden="true" />좌우반전</button>
              <button type="button" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-[#d1d5db] bg-white px-4 text-sm font-black text-[#334155] transition hover:bg-[#f8fafc] disabled:cursor-not-allowed disabled:opacity-45" disabled={!hasChanges} onClick={() => setState(defaultImageEditState)}><RotateCcw size={17} aria-hidden="true" />원본으로</button>
              <div className="col-span-2 grid min-w-0 gap-3 rounded-[20px] border border-[#e5e7eb] bg-white p-3 lg:hidden">
                <label className="grid min-w-0 gap-2 text-sm font-black text-[#0f172a]">크기<span className="flex min-w-0 items-center gap-3"><input type="range" min="25" max="300" value={Math.round(state.scale * 100)} className="min-w-0 w-full accent-[#2563eb]" onChange={(event) => { const scale = clampImageScale(Number(event.currentTarget.value) / 100); setState((current) => ({ ...current, scale })); }} /><span className="w-12 shrink-0 text-right text-xs font-black text-[#475569]">{Math.round(state.scale * 100)}%</span></span></label>
                <div className="grid min-w-0 grid-cols-2 gap-2"><NumberControl label="가로 위치" value={state.offsetX} onChange={(value) => setState((current) => ({ ...current, offsetX: value }))} /><NumberControl label="세로 위치" value={state.offsetY} onChange={(value) => setState((current) => ({ ...current, offsetY: value }))} /></div>
              </div>
              <div className="col-span-2 hidden rounded-[20px] border border-[#e5e7eb] bg-white p-4 lg:grid">
                <label className="grid gap-2 text-sm font-black text-[#0f172a]">크기<span className="flex items-center gap-3"><input type="range" min="25" max="300" value={Math.round(state.scale * 100)} className="w-full accent-[#2563eb]" onChange={(event) => { const scale = clampImageScale(Number(event.currentTarget.value) / 100); setState((current) => ({ ...current, scale })); }} /><span className="w-12 text-right text-xs font-black text-[#475569]">{Math.round(state.scale * 100)}%</span></span></label>
              </div>
              <div className="col-span-2 hidden rounded-[20px] border border-[#e5e7eb] bg-white p-4 lg:grid">
                <div className="mb-3 flex items-center justify-between gap-2"><span className="text-sm font-black text-[#0f172a]">위치</span><button type="button" className="rounded-full border border-[#e5e7eb] px-3 py-1.5 text-[11px] font-black text-[#475569] transition hover:bg-[#f8fafc] disabled:cursor-not-allowed disabled:opacity-45" disabled={state.offsetX === 0 && state.offsetY === 0} onClick={() => setState((current) => ({ ...current, offsetX: 0, offsetY: 0 }))}>중앙</button></div>
                <div className="grid min-w-0 grid-cols-2 gap-3"><NumberControl label="가로 위치" value={state.offsetX} onChange={(value) => setState((current) => ({ ...current, offsetX: value }))} /><NumberControl label="세로 위치" value={state.offsetY} onChange={(value) => setState((current) => ({ ...current, offsetY: value }))} /></div>
              </div>
              {error ? <p className="col-span-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-700" role="alert">{error}</p> : null}
            </aside>
          </div>

          <footer className="grid grid-cols-2 gap-2 border-t border-[#e5e7eb] bg-white px-3 py-3 sm:flex sm:items-center sm:justify-end sm:px-5 sm:py-4">
            <div className="contents sm:flex sm:gap-2">
              <Dialog.Close asChild>
                <button type="button" className="min-h-12 rounded-xl border border-[#d1d5db] bg-white px-4 py-2.5 text-sm font-black text-[#475569] transition hover:bg-white/80 sm:min-h-11" disabled={isApplying}>취소</button>
              </Dialog.Close>
              <button type="button" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#0f172a] px-4 py-2.5 text-sm font-black text-white transition hover:bg-[#1e293b] disabled:cursor-not-allowed disabled:opacity-55 sm:min-h-11" disabled={!sourceFile || isApplying} onClick={() => void apply()}>
                {isApplying ? <LoaderCircle size={17} className="animate-spin" aria-hidden="true" /> : <Check size={17} aria-hidden="true" />}
                적용하기
              </button>
            </div>
          </footer>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function NumberControl({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <label className="grid gap-1.5 text-xs font-bold text-[#64748b]">
      {label}
      <input type="number" value={Math.round(value)} inputMode="numeric" className="h-10 min-w-0 w-full rounded-xl border border-[#d1d5db] bg-white px-2.5 text-sm font-bold text-[#0f172a] outline-none focus:border-[#60a5fa] focus:ring-2 focus:ring-[#bfdbfe]" onChange={(event) => onChange(Number(event.currentTarget.value) || 0)} />
    </label>
  );
}

function getPreviewFitScale(mode: ImageEditState["fitMode"], sourceWidth: number, sourceHeight: number, outputWidth: number, outputHeight: number) {
  if (mode === "original") return 1;
  const widthRatio = outputWidth / Math.max(1, sourceWidth);
  const heightRatio = outputHeight / Math.max(1, sourceHeight);
  return mode === "cover" ? Math.max(widthRatio, heightRatio) : Math.min(widthRatio, heightRatio);
}

function isDefaultImageEditState(state: ImageEditState) {
  return !state.flipX && state.scale === defaultImageEditState.scale && state.offsetX === 0 && state.offsetY === 0 && state.fitMode === defaultImageEditState.fitMode;
}
