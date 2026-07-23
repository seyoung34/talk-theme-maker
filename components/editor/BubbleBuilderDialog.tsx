"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ImagePlus, LoaderCircle, Sparkles, X } from "lucide-react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  createBubbleFamilyDesignSpec,
  generateBubbleAsset,
  getBubbleRadiusMax,
  getBubbleVariantGeometry,
  type BubbleBuilderSide,
  type BubbleBuilderVariant,
  type BubbleFamilyDesignSpec,
  type GeneratedBubbleDesign,
} from "@/lib/theme/bubbleBuilder";
import type { ThemePlatform } from "@/lib/theme/types";

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
    const size = 30 * spec.design.decoration.scale;
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

  return (
    <Dialog.Root open={open} onOpenChange={(next) => !isApplying && onOpenChange(next)}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[90] bg-slate-950/45 backdrop-blur-sm" />
        <Dialog.Content className="fixed inset-x-3 top-1/2 z-[91] mx-auto max-h-[92dvh] w-auto max-w-4xl -translate-y-1/2 overflow-y-auto rounded-3xl bg-white p-4 shadow-2xl focus:outline-none md:p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <Dialog.Title className="flex items-center gap-2 text-xl font-black text-slate-950"><Sparkles size={20} className="text-blue-600" />나만의 말풍선 만들기</Dialog.Title>
              <Dialog.Description className="mt-1 text-sm font-medium text-slate-500">{slotLabel} 슬롯에 적용할 모양과 색을 정하면 안전 영역과 늘어나는 구간을 자동으로 맞춥니다.</Dialog.Description>
            </div>
            <Dialog.Close className="grid size-10 shrink-0 place-items-center rounded-full text-slate-500 hover:bg-slate-100" aria-label="닫기"><X size={20} /></Dialog.Close>
          </div>

          <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
            <div className="grid gap-5">
              <BuilderSection title="1. 말풍선 모양">
                <div className="rounded-xl border border-blue-100 bg-blue-50/70 p-3 text-xs font-bold leading-5 text-blue-800">
                  기본 사각형에서 모서리만 조절합니다. 0은 각진 사각형이고, 최댓값으로 갈수록 양끝이 둥근 형태가 됩니다.
                </div>
                <RangeField label="모서리 둥글기" value={spec.design.radius} min={0} max={getBubbleRadiusMax("rounded", variant)} onChange={(radius) => updateDesign({ preset: "rounded", radius })} />
                <div className="flex justify-between text-[11px] font-bold text-slate-400"><span>각진 사각형</span><span>최대로 둥글게</span></div>
              </BuilderSection>

              <BuilderSection title="2. 색상과 테두리">
                <div className="grid grid-cols-2 gap-3">
                  <ColorField label="배경색" value={spec.design.fill} onChange={(fill) => updateDesign({ fill })} />
                  <ColorField label="테두리색" value={spec.design.borderColor} onChange={(borderColor) => updateDesign({ borderColor })} />
                </div>
                <RangeField label="테두리 굵기" value={spec.design.borderWidth} min={0} max={10} onChange={(borderWidth) => updateDesign({ borderWidth })} />
                <label className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 px-3 py-3 text-sm font-bold text-slate-700"><span>은은한 그림자</span><input type="checkbox" checked={spec.design.shadow === "soft"} onChange={(event) => updateDesign({ shadow: event.currentTarget.checked ? "soft" : "none" })} className="size-5 accent-blue-600" /></label>
              </BuilderSection>

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
                  <RangeField label="크기" value={Math.round((spec.design.decoration?.scale ?? 1) * 100)} min={30} max={100} suffix="%" onChange={(value) => updateDesign({ decoration: { ...(spec.design.decoration ?? { offsetX: 0, offsetY: 0, scale: 1, flipX: false }), scale: value / 100 } })} />
                  <RangeField label="가로 위치" value={spec.design.decoration?.offsetX ?? 0} min={-95} max={95} onChange={(offsetX) => updateDesign({ decoration: { ...(spec.design.decoration ?? { offsetX: 0, offsetY: 0, scale: 1, flipX: false }), offsetX } })} />
                  <RangeField label="세로 위치" value={spec.design.decoration?.offsetY ?? 0} min={-60} max={60} onChange={(offsetY) => updateDesign({ decoration: { ...(spec.design.decoration ?? { offsetX: 0, offsetY: 0, scale: 1, flipX: false }), offsetY } })} />
                  <label className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 px-3 py-3 text-sm font-bold text-slate-700"><span>좌우 반전</span><input type="checkbox" checked={spec.design.decoration?.flipX ?? false} onChange={(event) => updateDesign({ decoration: { ...(spec.design.decoration ?? { offsetX: 0, offsetY: 0, scale: 1, flipX: false }), flipX: event.currentTarget.checked } })} className="size-5 accent-blue-600" /></label>
                  {decorationCollision ? <div className="flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-bold text-amber-800"><span>그림이 글자 영역과 겹쳐요.</span><button type="button" className="shrink-0 rounded-lg bg-white px-2 py-1 text-blue-700 shadow-sm" onClick={() => updateDesign({ decoration: { ...(spec.design.decoration ?? { offsetX: 0, offsetY: 0, scale: 1, flipX: false }), offsetX: side === "me" ? 90 : -90, offsetY: -55 } })}>안전하게 이동</button></div> : null}
                </> : null}
              </BuilderSection>
            </div>

            <aside className="rounded-2xl bg-slate-50 p-4 lg:sticky lg:top-0 lg:self-start">
              <div className="flex items-center justify-between"><strong className="text-sm font-black text-slate-900">자동 적용 미리보기</strong><span className="rounded-full bg-white px-2 py-1 text-[11px] font-bold text-slate-500">{platform === "ios" ? "iOS @3x" : "Android xxhdpi"}</span></div>
              <div className="mt-4 grid gap-4">
                <BubblePreview spec={spec} variant={variant} decorationUrl={decorationUrl} />
              </div>
              <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-bold leading-5 text-emerald-800">초록 점선은 글자가 안전하게 들어가는 영역입니다. 현재 선택한 {slotLabel} 슬롯 하나에만 결과가 적용됩니다.</div>
              <label className="mt-3 flex items-center gap-2 text-xs font-bold text-slate-700"><input type="checkbox" checked={spec.design.syncTextColorOnApply} onChange={(event) => updateDesign({ syncTextColorOnApply: event.currentTarget.checked })} className="size-4 accent-blue-600" />글자색도 함께 맞추기</label>
              {spec.design.syncTextColorOnApply ? <div className="mt-2"><ColorField label="말풍선 글자색" value={spec.design.textColor} onChange={(textColor) => updateDesign({ textColor })} /></div> : null}
              {error ? <p className="mt-3 rounded-xl bg-rose-50 p-3 text-xs font-bold text-rose-700" role="alert">{error}</p> : null}
              <button type="button" disabled={isApplying || decorationCollision} className="mt-4 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-black text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50" onClick={() => void apply()}>{isApplying ? <LoaderCircle size={18} className="animate-spin" /> : <Sparkles size={18} />}{isApplying ? "만드는 중" : "이 말풍선 적용하기"}</button>
              <p className="mt-2 text-center text-[11px] font-medium leading-4 text-slate-500">다른 말풍선 슬롯은 변경되지 않습니다.</p>
            </aside>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function BubblePreview({ spec, variant, decorationUrl }: { spec: BubbleFamilyDesignSpec; variant: "first" | "group"; decorationUrl?: string }) {
  const geometry = useMemo(() => getBubbleVariantGeometry(spec.design, variant), [spec, variant]);
  const scale = 1.35;
  return <div><span className="mb-1 block text-xs font-bold text-slate-500">현재 슬롯 적용 결과</span><div className="relative mx-auto overflow-hidden rounded-xl bg-white" style={{ width: geometry.canvas.width * scale, height: geometry.canvas.height * scale }}><div className="absolute" style={{ left: geometry.body.x * scale, top: geometry.body.y * scale, width: geometry.body.width * scale, height: geometry.body.height * scale, borderRadius: geometry.radius * scale, background: spec.design.fill, border: spec.design.borderWidth ? `${spec.design.borderWidth * scale}px solid ${spec.design.borderColor}` : undefined, boxShadow: spec.design.shadow === "soft" ? "0 5px 12px rgb(15 23 42 / 18%)" : undefined }} />{decorationUrl ? <div role="img" aria-label="장식 미리보기" className="pointer-events-none absolute left-1/2 top-1/2 bg-contain bg-center bg-no-repeat" style={{ width: 30 * scale, height: 30 * scale, backgroundImage: `url(${decorationUrl})`, transform: `translate(calc(-50% + ${(spec.design.decoration?.offsetX ?? 0) * scale}px), calc(-50% + ${(spec.design.decoration?.offsetY ?? 0) * scale}px)) scale(${spec.design.decoration?.scale ?? 1}) rotateY(${spec.design.decoration?.flipX ? 180 : 0}deg)` }} /> : null}<div className="absolute grid place-items-center border-2 border-dashed border-emerald-600/80 px-1 text-center text-[11px] font-bold leading-4" style={{ left: geometry.content.x * scale, top: geometry.content.y * scale, width: geometry.content.width * scale, height: geometry.content.height * scale, color: spec.design.textColor }}><span>오늘 저녁에<br />같이 갈래?</span></div></div></div>;
}

function BuilderSection({ title, children }: { title: string; children: React.ReactNode }) { return <section className="grid gap-3 rounded-2xl border border-slate-200 p-4"><h2 className="text-sm font-black text-slate-900">{title}</h2>{children}</section>; }
function RangeField({ label, value, min, max, suffix = "", onChange }: { label: string; value: number; min: number; max: number; suffix?: string; onChange: (value: number) => void }) { return <label className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-xs font-bold text-slate-600"><span>{label}</span><span>{Math.round(value)}{suffix}</span><input type="range" className="col-span-2 accent-blue-600" min={min} max={max} value={value} onChange={(event) => onChange(Number(event.currentTarget.value))} /></label>; }
function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) { return <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600"><input type="color" value={value.slice(0, 7)} onChange={(event) => onChange(event.currentTarget.value.toUpperCase())} className="size-8 cursor-pointer rounded border-0 bg-transparent p-0" /><span>{label}</span><span className="ml-auto font-mono text-[11px] text-slate-400">{value.slice(0, 7)}</span></label>; }
