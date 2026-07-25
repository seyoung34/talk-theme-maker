"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Check, FlipHorizontal2, LoaderCircle, Move, RotateCcw, X } from "lucide-react";
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

  useEffect(() => {
    if (!open) return;
    setState(initialState ?? defaultImageEditState);
    setError(null);
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

  const previewStyle = useMemo<CSSProperties>(
    () => ({
      transform: `translate(${state.offsetX}px, ${state.offsetY}px) scaleX(${state.flipX ? -1 : 1}) scale(${clampImageScale(state.scale)})`,
      objectFit: state.fitMode === "cover" ? "cover" : state.fitMode === "contain" ? "contain" : "none",
    }),
    [state],
  );
  const frameSize = target ?? sourceSize;
  const frameStyle = useMemo<CSSProperties | undefined>(() => {
    if (!frameSize?.width || !frameSize.height) return undefined;
    return { aspectRatio: `${frameSize.width} / ${frameSize.height}` };
  }, [frameSize]);
  const outputLabel = target
    ? `${target.label ?? "슬롯 권장 크기"} · ${target.width}×${target.height}px`
    : sourceSize
      ? `원본 이미지 크기 · ${sourceSize.width}×${sourceSize.height}px`
      : "원본 이미지 크기";
  const outputSize = target ?? sourceSize;
  const hasChanges = !isDefaultImageEditState(state);
  const sourceSizeLabel = sourceSize ? `${sourceSize.width}×${sourceSize.height}px` : "분석 중";
  const outputSizeLabel = outputSize ? `${outputSize.width}×${outputSize.height}px` : "원본 기준";

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
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[91] grid max-h-[calc(100dvh-24px)] w-[min(920px,calc(100vw-24px))] -translate-x-1/2 -translate-y-1/2 grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden rounded-[28px] border border-[#dbe3ed] bg-white shadow-[0_28px_80px_rgba(15,23,42,0.24)] outline-none">
          <header className="flex items-start justify-between gap-4 border-b border-[#e5e7eb] px-5 py-4">
            <div className="min-w-0">
              <Dialog.Title className="text-lg font-black text-[#0f172a]">이미지 편집</Dialog.Title>
              <Dialog.Description className="mt-1 text-sm font-medium leading-6 text-[#64748b]">
                {slotLabel} 이미지를 원본 보존 방식으로 조정합니다. 적용하면 새 업로드 후보로 추가됩니다.
              </Dialog.Description>
              <p className="mt-2 w-fit rounded-full bg-[#f1f5f9] px-3 py-1 text-xs font-bold text-[#475569]">출력 기준: {outputLabel}</p>
            </div>
            <Dialog.Close asChild>
              <button type="button" className="grid size-10 shrink-0 place-items-center rounded-full border border-[#e5e7eb] bg-white text-[#475569] transition hover:bg-[#f8fafc]" disabled={isApplying} aria-label="이미지 편집 닫기">
                <X size={18} aria-hidden="true" />
              </button>
            </Dialog.Close>
          </header>

          <div className="grid min-h-0 gap-4 overflow-y-auto p-5 [scrollbar-width:thin] lg:grid-cols-[minmax(0,1fr)_320px]">
            <section className="grid min-h-[360px] place-items-center rounded-[24px] border border-[#e2e8f0] bg-[linear-gradient(45deg,#e2e8f0_25%,transparent_25%),linear-gradient(-45deg,#e2e8f0_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#e2e8f0_75%),linear-gradient(-45deg,transparent_75%,#e2e8f0_75%)] bg-[length:18px_18px] bg-[position:0_0,0_9px,9px_-9px,-9px_0px] p-4">
              <div className="grid max-h-[58dvh] min-h-40 w-full max-w-[420px] place-items-center overflow-hidden rounded-[22px] border border-white/80 bg-white/70 shadow-[inset_0_0_0_1px_rgba(15,23,42,0.04)]" style={frameStyle}>
                {sourceUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={sourceUrl} alt="" className="max-h-full max-w-full select-none transition-transform duration-150 ease-out" style={previewStyle} draggable={false} />
                ) : (
                  <p className="px-6 text-center text-sm font-semibold text-[#64748b]">편집할 이미지를 찾지 못했습니다.</p>
                )}
              </div>
            </section>

            <aside className="grid content-start gap-4">
              <div className="rounded-[20px] border border-[#bfdbfe] bg-[#eff6ff] p-4">
                <p className="text-xs font-black uppercase tracking-[0.12em] text-[#1d4ed8]">Edit summary</p>
                <div className="mt-3 grid gap-2 text-xs font-bold text-[#334155]">
                  <InfoPill label="원본" value={sourceSizeLabel} />
                  <InfoPill label="출력" value={outputSizeLabel} />
                  <InfoPill label="상태" value={hasChanges ? "편집값 있음" : "원본 기준"} tone={hasChanges ? "active" : "muted"} />
                </div>
                <p className="mt-3 text-[11px] font-semibold leading-5 text-[#475569]">적용해도 원본 파일은 유지되고, 편집 결과가 새 업로드 후보로 추가됩니다.</p>
              </div>

              <div className="rounded-[20px] border border-[#e5e7eb] bg-[#f8fafc] p-4">
                <p className="text-xs font-black uppercase tracking-[0.12em] text-[#64748b]">Transform</p>
                <div className="mt-3 grid gap-2">
                  <button type="button" className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border px-4 text-sm font-black transition ${state.flipX ? "border-[#2563eb] bg-[#eff6ff] text-[#1d4ed8]" : "border-[#d1d5db] bg-white text-[#334155] hover:bg-[#f8fafc]"}`} onClick={() => setState((current) => ({ ...current, flipX: !current.flipX }))}>
                    <FlipHorizontal2 size={17} aria-hidden="true" />
                    좌우반전
                  </button>
                  <button type="button" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[#d1d5db] bg-white px-4 text-sm font-black text-[#334155] transition hover:bg-[#f8fafc] disabled:cursor-not-allowed disabled:opacity-45" disabled={!hasChanges} onClick={() => setState(defaultImageEditState)}>
                    <RotateCcw size={17} aria-hidden="true" />
                    원본 상태로 되돌리기
                  </button>
                </div>
              </div>

              <div className="rounded-[20px] border border-[#e5e7eb] bg-white p-4">
                <label className="grid gap-2 text-sm font-black text-[#0f172a]">
                  크기
                  <span className="flex items-center gap-3">
                    <input type="range" min="25" max="300" value={Math.round(state.scale * 100)} className="w-full accent-[#2563eb]" onChange={(event) => { const scale = clampImageScale(Number(event.currentTarget.value) / 100); setState((current) => ({ ...current, scale })); }} />
                    <span className="w-12 text-right text-xs font-black text-[#475569]">{Math.round(state.scale * 100)}%</span>
                  </span>
                </label>
              </div>

              <div className="rounded-[20px] border border-[#e5e7eb] bg-white p-4">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-sm font-black text-[#0f172a]">
                    <Move size={16} aria-hidden="true" />
                    위치
                  </div>
                  <button type="button" className="rounded-full border border-[#e5e7eb] px-3 py-1.5 text-[11px] font-black text-[#475569] transition hover:bg-[#f8fafc] disabled:cursor-not-allowed disabled:opacity-45" disabled={state.offsetX === 0 && state.offsetY === 0} onClick={() => setState((current) => ({ ...current, offsetX: 0, offsetY: 0 }))}>
                    중앙
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <NumberControl label="가로" value={state.offsetX} onChange={(value) => setState((current) => ({ ...current, offsetX: value }))} />
                  <NumberControl label="세로" value={state.offsetY} onChange={(value) => setState((current) => ({ ...current, offsetY: value }))} />
                </div>
              </div>

              <div className="rounded-[20px] border border-[#e5e7eb] bg-white p-4">
                <p className="text-sm font-black text-[#0f172a]">맞춤 방식</p>
                <div className="mt-3 grid gap-2">
                  {[
                    ["contain", "전체 보이게", "잘림 없이 슬롯 안에 맞춥니다."],
                    ["cover", "영역 채우기", "빈 공간 없이 채우며 일부가 잘릴 수 있습니다."],
                    ["original", "원본 크기", "원본 픽셀 크기를 기준으로 배치합니다."],
                  ].map(([mode, label, description]) => (
                    <button key={mode} type="button" className={`rounded-xl border px-3 py-2.5 text-left text-sm font-bold transition ${state.fitMode === mode ? "border-[#2563eb] bg-[#eff6ff] text-[#1d4ed8]" : "border-[#e5e7eb] bg-white text-[#475569] hover:bg-[#f8fafc]"}`} onClick={() => setState((current) => ({ ...current, fitMode: mode as ImageEditState["fitMode"] }))}>
                      <span className="block">{label}</span>
                      <span className={`mt-0.5 block text-[11px] font-semibold leading-4 ${state.fitMode === mode ? "text-[#1e40af]" : "text-[#64748b]"}`}>{description}</span>
                    </button>
                  ))}
                </div>
              </div>

              {error ? <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-700" role="alert">{error}</p> : null}
            </aside>
          </div>

          <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-[#e5e7eb] bg-[#f8fafc] px-5 py-4">
            <p className="text-xs font-semibold leading-5 text-[#64748b]">원본은 유지되고 편집 결과가 새 업로드 이미지로 추가됩니다.</p>
            <div className="flex gap-2">
              <Dialog.Close asChild>
                <button type="button" className="rounded-xl border border-[#d1d5db] bg-white px-4 py-2.5 text-sm font-black text-[#475569] transition hover:bg-white/80" disabled={isApplying}>취소</button>
              </Dialog.Close>
              <button type="button" className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#0f172a] px-4 py-2.5 text-sm font-black text-white transition hover:bg-[#1e293b] disabled:cursor-not-allowed disabled:opacity-55" disabled={!sourceFile || isApplying} onClick={() => void apply()}>
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

function InfoPill({ label, value, tone = "muted" }: { label: string; value: string; tone?: "active" | "muted" }) {
  return (
    <span className={`flex items-center justify-between gap-2 rounded-xl px-3 py-2 ${tone === "active" ? "bg-white text-[#1d4ed8]" : "bg-white/70 text-[#475569]"}`}>
      <span className="text-[11px] font-black uppercase tracking-[0.08em] text-[#64748b]">{label}</span>
      <span className="truncate text-right">{value}</span>
    </span>
  );
}

function NumberControl({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <label className="grid gap-1.5 text-xs font-bold text-[#64748b]">
      {label}
      <input type="number" value={Math.round(value)} className="h-10 rounded-xl border border-[#d1d5db] bg-white px-3 text-sm font-bold text-[#0f172a] outline-none focus:border-[#60a5fa] focus:ring-2 focus:ring-[#bfdbfe]" onChange={(event) => onChange(Number(event.currentTarget.value) || 0)} />
    </label>
  );
}

function isDefaultImageEditState(state: ImageEditState) {
  return !state.flipX && state.scale === defaultImageEditState.scale && state.offsetX === 0 && state.offsetY === 0 && state.fitMode === defaultImageEditState.fitMode;
}
