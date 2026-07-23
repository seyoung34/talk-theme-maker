"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FlipHorizontal, ImagePlus, Info, LoaderCircle, RotateCw, Sparkles, X } from "lucide-react";
import * as Dialog from "@radix-ui/react-dialog";
import * as Popover from "@radix-ui/react-popover";
import {
  bubbleDecorationBaseSize,
  bubbleDecorationMaxScale,
  createBubbleFamilyDesignSpec,
  generateBubbleAsset,
  getBubbleRadiusMax,
  getBubbleVariantGeometry,
  type BubbleBuilderSide,
  type BubbleBuilderVariant,
  type BubbleDecorationTransform,
  type BubbleFamilyDesignSpec,
  type GeneratedBubbleDesign,
} from "@/lib/theme/bubbleBuilder";
import type { ThemePlatform } from "@/lib/theme/types";

const defaultDecoration: BubbleDecorationTransform = { offsetX: 0, offsetY: 0, scale: 1, flipX: false, rotation: 0 };
const clampNumber = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

type BubbleBuilderDialogProps = {
  open: boolean;
  side: BubbleBuilderSide;
  variant: BubbleBuilderVariant;
  slotLabel: string;
  platform: ThemePlatform;
  initialSpec?: BubbleFamilyDesignSpec;
  initialDecorationFile?: File;
  onOpenChange: (open: boolean) => void;
  onApply: (result: GeneratedBubbleDesign, decorationFile?: File) => void;
};

const decorationMimeTypes = new Set(["image/png", "image/jpeg", "image/webp"]);

export function BubbleBuilderDialog({ open, side, variant, slotLabel, platform, initialSpec, initialDecorationFile, onOpenChange, onApply }: BubbleBuilderDialogProps) {
  const [spec, setSpec] = useState(() => initialSpec ?? createBubbleFamilyDesignSpec(side));
  const [decorationFile, setDecorationFile] = useState<File | undefined>();
  const [decorationUrl, setDecorationUrl] = useState<string>();
  const [isApplying, setIsApplying] = useState(false);
  const [error, setError] = useState<string>();
  const [dragActive, setDragActive] = useState(false);
  const [step, setStep] = useState(0);
  const acceptDecorationFile = useCallback((file: File | undefined) => {
    if (!file) return;
    if (!decorationMimeTypes.has(file.type)) {
      setError("PNG, JPG 또는 WebP 이미지 파일을 사용해 주세요.");
      return;
    }
    setDecorationFile(file);
    setSpec((current) => ({ ...current, decorationSourceName: file.name, updatedAt: Date.now() }));
    setError(undefined);
  }, []);
  const decorationCollision = useMemo(() => {
    if (!decorationFile || !spec.design.decoration) return false;
    const geometry = getBubbleVariantGeometry(spec.design, variant);
    const size = bubbleDecorationBaseSize * spec.design.decoration.scale;
    const decoration = { x: geometry.canvas.width / 2 + spec.design.decoration.offsetX - size / 2, y: geometry.canvas.height / 2 + spec.design.decoration.offsetY - size / 2, width: size, height: size };
    return decoration.x < geometry.content.x + geometry.content.width && decoration.x + decoration.width > geometry.content.x && decoration.y < geometry.content.y + geometry.content.height && decoration.y + decoration.height > geometry.content.y;
  }, [decorationFile, spec, variant]);

  useEffect(() => {
    if (!open) return;
    const source = initialSpec ?? createBubbleFamilyDesignSpec(side);
    setSpec({
      ...source,
      design: {
        ...source.design,
        preset: "rounded",
        radius: Math.min(source.design.radius, getBubbleRadiusMax("rounded", variant)),
      },
    });
    setDecorationFile(initialDecorationFile);
    setError(undefined);
    setDragActive(false);
    setStep(0);
  }, [initialDecorationFile, initialSpec, open, side, variant]);

  useEffect(() => {
    if (!open) return;
    const handlePaste = (event: ClipboardEvent) => {
      const file = Array.from(event.clipboardData?.files ?? []).find((candidate) => decorationMimeTypes.has(candidate.type));
      if (!file) return;
      event.preventDefault();
      acceptDecorationFile(file);
    };
    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [acceptDecorationFile, open]);

  useEffect(() => {
    if (!decorationFile) {
      setDecorationUrl(undefined);
      return;
    }
    const url = URL.createObjectURL(decorationFile);
    setDecorationUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [decorationFile]);

  const updateDesign = (patch: Partial<BubbleFamilyDesignSpec["design"]>) => {
    setSpec((current) => ({ ...current, design: { ...current.design, ...patch }, updatedAt: Date.now() }));
  };

  const patchDecoration = useCallback((patch: Partial<BubbleDecorationTransform>) => {
    setSpec((current) => ({ ...current, design: { ...current.design, decoration: { ...defaultDecoration, ...current.design.decoration, ...patch } }, updatedAt: Date.now() }));
  }, []);

  const apply = async () => {
    if (spec.decorationSourceName && !decorationFile) {
      setError("저장된 장식 원본을 찾지 못했습니다. 이미지를 다시 선택하거나 장식을 제거해 주세요.");
      return;
    }
    if (decorationCollision) {
      setError("꾸미기 이미지가 글자 영역과 겹칩니다. 안전한 위치로 이동한 뒤 적용해 주세요.");
      return;
    }
    try {
      setIsApplying(true);
      setError(undefined);
      const nextSpec = {
        ...spec,
        decorationSourceName: decorationFile?.name ?? spec.decorationSourceName,
        updatedAt: Date.now(),
      };
      const result = await generateBubbleAsset({ spec: nextSpec, platform, variant, decorationFile });
      onApply(result, decorationFile);
      onOpenChange(false);
    } catch (cause) {
      console.error(cause);
      setError("말풍선 이미지를 만들지 못했습니다. 장식 이미지를 바꾸거나 다시 시도해 주세요.");
    } finally {
      setIsApplying(false);
    }
  };

  const shapeSection = (
    <BuilderSection title="1. 말풍선 모양">
      <RangeField label="모서리 둥글기" value={spec.design.radius} min={0} max={getBubbleRadiusMax("rounded", variant)} onChange={(radius) => updateDesign({ preset: "rounded", radius })} />
      <div className="flex justify-between text-[11px] font-bold text-slate-400"><span>각진 사각형</span><span>최대로 둥글게</span></div>
    </BuilderSection>
  );

  const colorSection = (
    <BuilderSection title="2. 색상과 테두리">
      <div className="grid grid-cols-2 gap-3">
        <ColorField label="배경색" value={spec.design.fill} onChange={(fill) => updateDesign({ fill })} />
        <ColorField label="테두리색" value={spec.design.borderColor} onChange={(borderColor) => updateDesign({ borderColor })} />
      </div>
      <RangeField label="테두리 굵기" value={spec.design.borderWidth} min={0} max={10} onChange={(borderWidth) => updateDesign({ borderWidth })} />
    </BuilderSection>
  );

  const decorationSection = (
    <BuilderSection title="3. 이미지로 꾸미기 (선택)">
      <div
        data-testid="bubble-decoration-dropzone"
        className={`rounded-2xl border-2 border-dashed p-3 transition ${dragActive ? "border-blue-500 bg-blue-100 ring-4 ring-blue-50" : "border-blue-300 bg-blue-50"}`}
        onDragEnter={(event) => { event.preventDefault(); setDragActive(true); }}
        onDragOver={(event) => { event.preventDefault(); setDragActive(true); }}
        onDragLeave={(event) => { event.preventDefault(); if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragActive(false); }}
        onDrop={(event) => { event.preventDefault(); setDragActive(false); acceptDecorationFile(Array.from(event.dataTransfer.files).find((file) => decorationMimeTypes.has(file.type)) ?? event.dataTransfer.files[0]); }}
      >
        <label className="flex min-h-20 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl text-center text-blue-700 hover:bg-white/50">
          <span className="flex items-center gap-2 text-sm font-black"><ImagePlus size={19} />{decorationFile ? decorationFile.name : "꾸미기 이미지 추가"}</span>
          <span className="text-[11px] font-bold text-blue-600/80">클릭해서 선택 · Ctrl+V 붙여넣기 · 파일 끌어놓기</span>
          <span className="text-[10px] font-medium text-slate-500">PNG · JPG · WebP</span>
          <input className="hidden" type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => acceptDecorationFile(event.currentTarget.files?.[0])} />
        </label>
      </div>
      {spec.decorationSourceName ? <button type="button" className="justify-self-start text-xs font-bold text-rose-600 underline underline-offset-4" onClick={() => { setDecorationFile(undefined); setSpec((current) => ({ ...current, decorationSourceName: undefined, updatedAt: Date.now() })); }}>장식 제거</button> : null}
      {decorationFile ? <>
        <p className="rounded-xl bg-slate-50 p-3 text-[11px] font-medium leading-4 text-slate-500">미리보기에서 이미지를 드래그해 옮기고, 손잡이로 크기·회전·좌우 반전을 바로 조절할 수 있어요. 말풍선도 드래그해 위치를 옮길 수 있어요.</p>
        {decorationCollision ? <div className="flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-bold text-amber-800"><span>그림이 글자 영역과 겹쳐요.</span><button type="button" className="shrink-0 rounded-lg bg-white px-2 py-1 text-blue-700 shadow-sm" onClick={() => patchDecoration({ offsetX: 0, offsetY: -64 })}>안전하게 이동</button></div> : null}
      </> : null}
    </BuilderSection>
  );

  const mobileSteps = [
    { name: "모양", node: shapeSection },
    { name: "색상과 테두리", node: colorSection },
    { name: "꾸미기", node: decorationSection },
  ];
  const isLastStep = step === mobileSteps.length - 1;

  const applyButton = (
    <button type="button" disabled={isApplying || decorationCollision} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-black text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50" onClick={() => void apply()}>{isApplying ? <LoaderCircle size={18} className="animate-spin" /> : <Sparkles size={18} />}{isApplying ? "만드는 중" : "이 말풍선 적용하기"}</button>
  );

  return (
    <Dialog.Root open={open} onOpenChange={(next) => !isApplying && onOpenChange(next)}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[90] bg-slate-950/45 backdrop-blur-sm" />
        <Dialog.Content className="fixed inset-x-3 top-1/2 z-[91] mx-auto max-h-[92dvh] w-auto max-w-4xl -translate-y-1/2 overflow-y-auto rounded-3xl bg-white p-4 shadow-2xl focus:outline-none [scrollbar-color:#cbd5e1_transparent] [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[#cbd5e1] md:p-6">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <Dialog.Title className="flex items-center gap-2 text-xl font-black text-slate-950">나만의 말풍선 만들기</Dialog.Title>
              <Dialog.Description className="mt-1 truncate text-sm font-medium text-slate-500">{slotLabel} 슬롯에 적용됩니다.</Dialog.Description>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <Popover.Root>
                <Popover.Trigger className="grid size-10 place-items-center rounded-full text-slate-500 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2" aria-label="도움말"><Info size={20} /></Popover.Trigger>
                <Popover.Portal>
                  <Popover.Content sideOffset={8} align="end" className="z-[92] w-64 rounded-2xl border border-slate-200 bg-white p-4 text-xs font-medium leading-5 text-slate-600 shadow-xl focus:outline-none">
                    <p className="mb-2 text-sm font-black text-slate-900">미리보기 안내</p>
                    <ul className="grid gap-1.5">
                      <li className="flex items-center gap-2"><span className="inline-block h-2.5 w-4 shrink-0 rounded-sm border border-dashed border-emerald-600/80" /><span><b className="font-bold text-slate-800">글자 영역</b> · 그림은 여기를 피해 두세요.</span></li>
                      <li className="flex items-center gap-2"><span className="inline-block h-2.5 w-4 shrink-0 rounded-sm bg-sky-400/70" /><span><b className="font-bold text-slate-800">늘어나는 구간</b> · 긴 메시지에서 늘어나는 곳이에요.</span></li>
                    </ul>
                    <p className="mt-3 border-t border-slate-100 pt-3">현재 선택한 {slotLabel} 슬롯 하나에만 적용되고, 다른 말풍선은 바뀌지 않아요.</p>
                    <Popover.Arrow className="fill-white" />
                  </Popover.Content>
                </Popover.Portal>
              </Popover.Root>
              <Dialog.Close className="grid size-10 place-items-center rounded-full text-slate-500 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2" aria-label="닫기"><X size={20} /></Dialog.Close>
            </div>
          </div>

          <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
            {/* 데스크톱: 모든 섹션을 한 화면에 표시 */}
            <div className="hidden gap-5 lg:grid">
              {shapeSection}
              {colorSection}
              {decorationSection}
            </div>

            {/* 미리보기: 모바일은 인디케이터 아래 고정, 데스크톱은 우측 컬럼 */}
            <aside className="rounded-2xl bg-slate-50 p-4 lg:sticky lg:top-0 lg:self-start">
              <BubblePreview spec={spec} variant={variant} decorationUrl={decorationUrl} onDecorationChange={decorationFile ? patchDecoration : undefined} onBodyChange={updateDesign} />
              <label className="mt-4 flex items-center gap-2 text-xs font-bold text-slate-700"><input type="checkbox" checked={spec.design.syncTextColorOnApply} onChange={(event) => updateDesign({ syncTextColorOnApply: event.currentTarget.checked })} className="size-4 accent-blue-600" />글자색도 함께 맞추기</label>
              {spec.design.syncTextColorOnApply ? <div className="mt-2"><ColorField label="말풍선 글자색" value={spec.design.textColor} onChange={(textColor) => updateDesign({ textColor })} /></div> : null}
              {/* 데스크톱 전용 적용 영역 */}
              <div className="hidden lg:block">
                {error ? <p className="mt-3 rounded-xl bg-rose-50 p-3 text-xs font-bold text-rose-700" role="alert">{error}</p> : null}
                <div className="mt-4">{applyButton}</div>
              </div>
            </aside>

            {/* 모바일 전용: 단계 인디케이터를 최상단으로 */}
            <div className="order-first flex items-center justify-center gap-2 lg:hidden" aria-label={`${step + 1} / ${mobileSteps.length} 단계`}>
              {mobileSteps.map((entry, index) => (
                <Fragment key={entry.name}>
                  <span className={`grid size-6 shrink-0 place-items-center rounded-full text-[11px] font-black ${index === step ? "bg-blue-600 text-white" : index < step ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-400"}`}>{index + 1}</span>
                  {index < mobileSteps.length - 1 ? <span className={`h-0.5 w-8 rounded-full ${index < step ? "bg-blue-200" : "bg-slate-100"}`} /> : null}
                </Fragment>
              ))}
            </div>

            {/* 모바일 전용: 현재 단계 컨트롤 */}
            <div className="lg:hidden">
              {mobileSteps[step].node}
              {error ? <p className="mt-3 rounded-xl bg-rose-50 p-3 text-xs font-bold text-rose-700" role="alert">{error}</p> : null}
              <div className="mt-4 flex gap-2">
                {step > 0 ? <button type="button" className="min-h-12 flex-1 rounded-xl border border-slate-200 px-4 text-sm font-black text-slate-700 hover:bg-slate-50" onClick={() => setStep((current) => Math.max(0, current - 1))}>이전</button> : null}
                {isLastStep ? applyButton : <button type="button" className="min-h-12 flex-1 rounded-xl bg-blue-600 px-4 text-sm font-black text-white hover:bg-blue-700" onClick={() => setStep((current) => Math.min(mobileSteps.length - 1, current + 1))}>다음</button>}
              </div>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

type PreviewDrag =
  | { kind: "move" | "resize" | "rotate"; startX: number; startY: number; deco: BubbleDecorationTransform }
  | { kind: "body"; startX: number; startY: number; bodyX: number; bodyY: number };

const checkerboardStyle: React.CSSProperties = {
  backgroundColor: "#ffffff",
  backgroundImage: "conic-gradient(#e2e8f0 25%, transparent 0 50%, #e2e8f0 0 75%, transparent 0)",
  backgroundSize: "16px 16px",
};

function BubblePreview({ spec, variant, decorationUrl, onDecorationChange, onBodyChange }: { spec: BubbleFamilyDesignSpec; variant: "first" | "group"; decorationUrl?: string; onDecorationChange?: (patch: Partial<BubbleDecorationTransform>) => void; onBodyChange?: (patch: { bodyOffsetX: number; bodyOffsetY: number }) => void }) {
  const geometry = useMemo(() => getBubbleVariantGeometry(spec.design, variant), [spec, variant]);
  const scale = 1.35;
  const stretchThickness = Math.max(2, Math.round(3 * scale));
  const stageRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<PreviewDrag | null>(null);
  const decoration = spec.design.decoration;
  const decoSize = bubbleDecorationBaseSize * (decoration?.scale ?? 1);
  const centerX = geometry.canvas.width / 2 + (decoration?.offsetX ?? 0);
  const centerY = geometry.canvas.height / 2 + (decoration?.offsetY ?? 0);
  const interactive = Boolean(onDecorationChange && decoration);

  const beginDecoDrag = (kind: "move" | "resize" | "rotate") => (event: React.PointerEvent) => {
    if (!interactive || !decoration) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { kind, startX: event.clientX, startY: event.clientY, deco: decoration };
  };
  const beginBodyDrag = (event: React.PointerEvent) => {
    if (!onBodyChange) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { kind: "body", startX: event.clientX, startY: event.clientY, bodyX: spec.design.bodyOffsetX ?? 0, bodyY: spec.design.bodyOffsetY ?? 0 };
  };
  const handleMove = (event: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    if (drag.kind === "body") {
      onBodyChange?.({ bodyOffsetX: drag.bodyX + (event.clientX - drag.startX) / scale, bodyOffsetY: drag.bodyY + (event.clientY - drag.startY) / scale });
      return;
    }
    if (!onDecorationChange || !stageRef.current) return;
    if (drag.kind === "move") {
      onDecorationChange({
        offsetX: clampNumber(drag.deco.offsetX + (event.clientX - drag.startX) / scale, -geometry.canvas.width / 2, geometry.canvas.width / 2),
        offsetY: clampNumber(drag.deco.offsetY + (event.clientY - drag.startY) / scale, -geometry.canvas.height / 2, geometry.canvas.height / 2),
      });
      return;
    }
    const rect = stageRef.current.getBoundingClientRect();
    const cx = rect.left + (geometry.canvas.width / 2 + drag.deco.offsetX) * scale;
    const cy = rect.top + (geometry.canvas.height / 2 + drag.deco.offsetY) * scale;
    if (drag.kind === "resize") {
      const dist = Math.hypot(event.clientX - cx, event.clientY - cy) / scale;
      onDecorationChange({ scale: clampNumber((dist / (bubbleDecorationBaseSize * Math.SQRT1_2)), 0.3, bubbleDecorationMaxScale) });
    } else {
      const angle = (Math.atan2(event.clientY - cy, event.clientX - cx) * 180) / Math.PI + 90;
      onDecorationChange({ rotation: Math.round(((angle + 180) % 360) - 180) });
    }
  };
  const endDrag = (event: React.PointerEvent) => {
    dragRef.current = null;
    try { event.currentTarget.releasePointerCapture(event.pointerId); } catch { /* noop */ }
  };

  return (
    <div>
      <div ref={stageRef} className="relative mx-auto touch-none overflow-hidden rounded-xl ring-1 ring-slate-200" style={{ width: geometry.canvas.width * scale, height: geometry.canvas.height * scale, ...checkerboardStyle }} onPointerMove={handleMove} onPointerUp={endDrag}>
        <div className={onBodyChange ? "absolute cursor-move" : "absolute"} style={{ left: geometry.body.x * scale, top: geometry.body.y * scale, width: geometry.body.width * scale, height: geometry.body.height * scale, borderRadius: geometry.radius * scale, background: spec.design.fill, border: spec.design.borderWidth ? `${spec.design.borderWidth * scale}px solid ${spec.design.borderColor}` : undefined }} onPointerDown={onBodyChange ? beginBodyDrag : undefined} />
        {/* 늘어나는 구간(stretch) 시각화: 세로/가로 십자 */}
        <div className="pointer-events-none absolute bg-sky-400/70" style={{ left: geometry.stretch.x * scale - stretchThickness / 2, top: geometry.body.y * scale, width: stretchThickness, height: geometry.body.height * scale }} />
        <div className="pointer-events-none absolute bg-sky-400/70" style={{ top: geometry.stretch.y * scale - stretchThickness / 2, left: geometry.body.x * scale, width: geometry.body.width * scale, height: stretchThickness }} />
        <div className="pointer-events-none absolute grid place-items-center border-2 border-dashed border-emerald-600/80 px-1 text-center text-[11px] font-bold leading-4" style={{ left: geometry.content.x * scale, top: geometry.content.y * scale, width: geometry.content.width * scale, height: geometry.content.height * scale, color: spec.design.textColor }}><span>테스트<br />글자</span></div>
        {decorationUrl && decoration ? (
          <div
            className={`absolute ${interactive ? "cursor-move" : "pointer-events-none"}`}
            style={{ left: (centerX - decoSize / 2) * scale, top: (centerY - decoSize / 2) * scale, width: decoSize * scale, height: decoSize * scale, transform: `rotate(${decoration.rotation ?? 0}deg)` }}
            onPointerDown={beginDecoDrag("move")}
          >
            <div role="img" aria-label="장식 미리보기" className="absolute inset-0 bg-contain bg-center bg-no-repeat" style={{ backgroundImage: `url(${decorationUrl})`, transform: decoration.flipX ? "scaleX(-1)" : undefined }} />
            {interactive ? <>
              <span className="absolute inset-0 rounded-sm ring-1 ring-blue-400/70" />
              <button type="button" aria-label="회전" className="absolute -top-3 left-1/2 grid size-6 -translate-x-1/2 cursor-grab place-items-center rounded-full border border-blue-200 bg-white text-blue-600 shadow" onPointerDown={beginDecoDrag("rotate")}><RotateCw size={13} /></button>
              <button type="button" aria-label="좌우 반전" className="absolute -bottom-2.5 -left-2.5 grid size-6 place-items-center rounded-full border border-blue-200 bg-white text-blue-600 shadow" onPointerDown={(event) => event.stopPropagation()} onClick={() => onDecorationChange?.({ flipX: !decoration.flipX })}><FlipHorizontal size={13} /></button>
              <button type="button" aria-label="크기 조절" className="absolute -bottom-2.5 -right-2.5 size-5 cursor-nwse-resize rounded-full border border-blue-200 bg-white shadow" onPointerDown={beginDecoDrag("resize")} />
            </> : null}
          </div>
        ) : null}
      </div>
      <div className="mt-2 flex items-center justify-center gap-4 text-[10px] font-bold text-slate-500">
        <span className="flex items-center gap-1"><span className="inline-block h-2 w-3 rounded-sm border border-dashed border-emerald-600/80" />글자 영역</span>
        <span className="flex items-center gap-1"><span className="inline-block h-2 w-3 rounded-sm bg-sky-400/70" />늘어나는 구간</span>
      </div>
    </div>
  );
}

function BuilderSection({ title, children }: { title: string; children: React.ReactNode }) { return <section className="grid gap-3 rounded-2xl border border-slate-200 p-4"><h2 className="text-sm font-black text-slate-900">{title}</h2>{children}</section>; }
function RangeField({ label, value, min, max, suffix = "", onChange }: { label: string; value: number; min: number; max: number; suffix?: string; onChange: (value: number) => void }) { return <label className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-xs font-bold text-slate-600"><span>{label}</span><span>{Math.round(value)}{suffix}</span><input type="range" className="col-span-2 accent-blue-600" min={min} max={max} value={value} onChange={(event) => onChange(Number(event.currentTarget.value))} /></label>; }
function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) { return <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600"><input type="color" value={value.slice(0, 7)} onChange={(event) => onChange(event.currentTarget.value.toUpperCase())} className="size-8 cursor-pointer rounded border-0 bg-transparent p-0" /><span>{label}</span><span className="ml-auto font-mono text-[11px] text-slate-400">{value.slice(0, 7)}</span></label>; }
