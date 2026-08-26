"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { FlipHorizontal, ImagePlus, Info, LoaderCircle, Move, RotateCw, Sparkles, X } from "lucide-react";
import * as Dialog from "@radix-ui/react-dialog";
import * as Popover from "@radix-ui/react-popover";
import { ThemeColorPicker } from "@/components/project/ThemeColorPicker";
import { themeColorRgbHex, themeColorToCss } from "@/lib/theme/color";
import {
  bubbleBodyScalePresets,
  bubbleCanvasScaleRange,
  bubbleDecorationMaxScale,
  createBubbleDecorationLayer,
  createBubbleFamilyDesignSpec,
  crossesBubbleStretch,
  generateBubbleAsset,
  getBubbleDecorationHandleRadius,
  getBubbleDecorationLayers,
  getBubbleDecorationRect,
  getBubbleBodyScalePreset,
  getBubbleCanvasScale,
  getBubbleRadiusMax,
  getBubbleVariantGeometry,
  rectsOverlap,
  type BubbleBuilderSide,
  type BubbleBuilderVariant,
  type BubbleDecorationLayer,
  type BubbleDecorationSourceSize,
  type BubbleDecorationTransform,
  type BubbleFamilyDesignSpec,
  type GeneratedBubbleDesign,
} from "@/lib/theme/bubbleBuilder";
import type { ThemePlatform } from "@/lib/theme/types";

const clampNumber = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

type DecorationFiles = Partial<Record<string, File>>;

type BubbleBuilderDialogProps = {
  open: boolean;
  side: BubbleBuilderSide;
  variant: BubbleBuilderVariant;
  slotLabel: string;
  platform: ThemePlatform;
  initialSpec?: BubbleFamilyDesignSpec;
  initialDecorationFiles?: DecorationFiles;
  onOpenChange: (open: boolean) => void;
  onApply: (result: GeneratedBubbleDesign, decorationFiles: DecorationFiles) => void;
};

type BubbleBuilderEditorProps = Omit<BubbleBuilderDialogProps, "open" | "onOpenChange"> & {
  active?: boolean;
  onClose?: () => void;
  closeOnApply?: boolean;
};

const decorationMimeTypes = new Set(["image/png", "image/jpeg", "image/webp"]);

export function getBubblePreviewScale(availableWidth: number | undefined, canvasWidth: number) {
  if (!availableWidth || canvasWidth <= 0) return 1.35;
  return Math.min(1.35, Math.max(0.65, availableWidth / canvasWidth));
}

/**
 * 미리보기 상자의 치수.
 *
 * 배율을 **현재** 캔버스 폭으로 잡으면 `getBubblePreviewScale`이 남는 폭에 맞춰 되돌려서
 * 프레임을 키워도 화면 위 상자가 그대로다 — 모서리 손잡이를 끌어도 아무 일이 없는 것처럼 보인다.
 * 그래서 배율은 프레임 상한 기준으로 고정하고, 그 크기의 바깥 상자 안에서 무대만 커지고 줄어든다.
 * 바깥 상자가 고정이라 프레임을 줄여도 미리보기 영역이 들썩이지 않고, 손잡이를 바깥으로 끌 여백도 남는다.
 */
export function getBubblePreviewLayout(
  canvas: { width: number; height: number },
  maxCanvas: { width: number; height: number },
  availableWidth: number | undefined,
) {
  const scale = getBubblePreviewScale(availableWidth, maxCanvas.width);
  return {
    scale,
    stageWidth: canvas.width * scale,
    stageHeight: canvas.height * scale,
    boundsWidth: maxCanvas.width * scale,
    boundsHeight: maxCanvas.height * scale,
  };
}

export function BubbleBuilderEditor({ side, variant, slotLabel, platform, initialSpec, initialDecorationFiles, onApply, active = true, onClose, closeOnApply = true }: BubbleBuilderEditorProps) {
  const [spec, setSpec] = useState(() => initialSpec ?? createBubbleFamilyDesignSpec(side));
  const [decorationFiles, setDecorationFiles] = useState<DecorationFiles>({});
  const [decorationUrls, setDecorationUrls] = useState<Partial<Record<string, string>>>({});
  const [decorationSizes, setDecorationSizes] = useState<Partial<Record<string, BubbleDecorationSourceSize>>>({});
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);
  const [isApplying, setIsApplying] = useState(false);
  const [error, setError] = useState<string>();
  const [dragActive, setDragActive] = useState(false);
  const [activeTab, setActiveTab] = useState<"bubble" | "decoration">("bubble");

  const layers = useMemo(() => spec.design.decorations ?? [], [spec.design.decorations]);

  const acceptDecorationFile = useCallback((file: File | undefined) => {
    if (!file) return;
    if (!decorationMimeTypes.has(file.type)) {
      setError("PNG, JPG 또는 WebP 이미지 파일을 사용해 주세요.");
      return;
    }
    const layer = createBubbleDecorationLayer(crypto.randomUUID(), file.name);
    setDecorationFiles((current) => ({ ...current, [layer.id]: file }));
    setSpec((current) => ({
      ...current,
      design: { ...current.design, decorations: [...(current.design.decorations ?? []), layer] },
      updatedAt: Date.now(),
    }));
    setSelectedLayerId(layer.id);
    setError(undefined);
  }, []);

  const removeLayer = useCallback((layerId: string) => {
    setSpec((current) => ({
      ...current,
      design: { ...current.design, decorations: (current.design.decorations ?? []).filter((layer) => layer.id !== layerId) },
      updatedAt: Date.now(),
    }));
    setDecorationFiles((current) => {
      const next = { ...current };
      delete next[layerId];
      return next;
    });
    setSelectedLayerId((current) => (current === layerId ? null : current));
  }, []);

  const patchLayer = useCallback((layerId: string, patch: Partial<BubbleDecorationTransform>) => {
    setSpec((current) => ({
      ...current,
      design: {
        ...current.design,
        decorations: (current.design.decorations ?? []).map((layer) => (layer.id === layerId ? { ...layer, ...patch } : layer)),
      },
      updatedAt: Date.now(),
    }));
  }, []);

  /**
   * 장식이 걸린 곳을 두 가지로 나눠 본다.
   *
   * 글자 영역과 겹치면 메시지를 못 읽으니 적용을 막고, 늘어나는 선을 지나가면 긴 메시지에서
   * 그림이 늘어나니 알리기만 한다. 뒤쪽은 일부러 그러는 경우(말풍선과 이어지는 무늬)가 있어서
   * 막을 일이 아니고, 본체를 덮는 큰 장식은 선을 지나가지 않을 방법이 아예 없다.
   */
  const { collidingLayerIds, stretchedLayerIds } = useMemo(() => {
    const geometry = getBubbleVariantGeometry(spec.design, variant);
    const colliding: string[] = [];
    const stretched: string[] = [];
    for (const layer of layers) {
      const rect = getBubbleDecorationRect(layer, geometry.canvas, decorationSizes[layer.id]);
      if (rectsOverlap(rect, geometry.content)) colliding.push(layer.id);
      if (crossesBubbleStretch(rect, geometry.stretch)) stretched.push(layer.id);
    }
    return { collidingLayerIds: colliding, stretchedLayerIds: stretched };
  }, [decorationSizes, layers, spec.design, variant]);
  const decorationCollision = collidingLayerIds.length > 0;
  const decorationStretched = stretchedLayerIds.length > 0;

  useEffect(() => {
    if (!active) return;
    const source = initialSpec ?? createBubbleFamilyDesignSpec(side);
    const sourceLayers = getBubbleDecorationLayers(source);
    setSpec({
      ...source,
      design: {
        ...source.design,
        preset: "rounded",
        radius: Math.min(source.design.radius, getBubbleRadiusMax("rounded", variant, source.design.bodyScale)),
        decoration: undefined,
        decorations: sourceLayers,
      },
    });
    setDecorationFiles({ ...(initialDecorationFiles ?? {}) });
    setSelectedLayerId(sourceLayers[0]?.id ?? null);
    setError(undefined);
    setDragActive(false);
    setActiveTab("bubble");
  }, [active, initialDecorationFiles, initialSpec, side, variant]);

  useEffect(() => {
    if (!active) return;
    const handlePaste = (event: ClipboardEvent) => {
      const file = Array.from(event.clipboardData?.files ?? []).find((candidate) => decorationMimeTypes.has(candidate.type));
      if (!file) return;
      event.preventDefault();
      acceptDecorationFile(file);
    };
    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [acceptDecorationFile, active]);

  /**
   * Esc는 먼저 선택을 푼다.
   *
   * 장식을 고른 상태에서 Esc가 곧장 다이얼로그를 닫으면, 편집 중이던 사람이 "선택만 풀려던"
   * 동작으로 작업을 통째로 잃는다. 캡처 단계에서 잡아 Radix의 닫기 처리로 넘어가지 않게 막고,
   * 고른 장식이 없을 때만 평소대로 닫히게 둔다.
   */
  useEffect(() => {
    if (!active || !selectedLayerId) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      setSelectedLayerId(null);
    };
    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, [active, selectedLayerId]);

  useEffect(() => {
    const created: Record<string, string> = {};
    for (const [layerId, file] of Object.entries(decorationFiles)) {
      if (file) created[layerId] = URL.createObjectURL(file);
    }
    setDecorationUrls(created);
    /*
      원본 크기를 읽어 둔다. 클릭 영역·겹침 판정·미리보기 상자가 모두 이 값으로 실제 그려지는
      사각형을 잡는다. 이미 읽어 둔 레이어는 그대로 두고 새 레이어만 읽는다 — 전부 비우면
      두 번째 이미지를 추가할 때 첫 번째가 잠깐 정사각형 근사로 되돌아가 상자가 튄다.
    */
    let cancelled = false;
    setDecorationSizes((current) => Object.fromEntries(
      Object.keys(created).flatMap((layerId) => (current[layerId] ? [[layerId, current[layerId]] as const] : [])),
    ));
    for (const [layerId, url] of Object.entries(created)) {
      const image = new Image();
      image.onload = () => {
        if (cancelled) return;
        setDecorationSizes((current) => ({ ...current, [layerId]: { width: image.naturalWidth, height: image.naturalHeight } }));
      };
      image.src = url;
    }
    return () => {
      cancelled = true;
      for (const url of Object.values(created)) URL.revokeObjectURL(url);
    };
  }, [decorationFiles]);

  const updateDesign = (patch: Partial<BubbleFamilyDesignSpec["design"]>) => {
    setSpec((current) => ({ ...current, design: { ...current.design, ...patch }, updatedAt: Date.now() }));
  };

  const apply = async () => {
    if (layers.some((layer) => !decorationFiles[layer.id])) {
      setError("저장된 장식 원본을 찾지 못했습니다. 이미지를 다시 선택하거나 장식을 제거해 주세요.");
      return;
    }
    // 겹침·늘어남은 막지 않는다. 판정이 보는 것은 이미지의 사각형이라 실제로 걸친 것이 투명한
    // 여백뿐일 수 있고, 글자 위에 무늬를 얹는 것처럼 일부러 겹치는 디자인도 있다.
    try {
      setIsApplying(true);
      setError(undefined);
      const nextSpec = { ...spec, decorationSourceName: undefined, updatedAt: Date.now() };
      const result = await generateBubbleAsset({ spec: nextSpec, platform, variant, decorationFiles });
      onApply(result, decorationFiles);
      if (closeOnApply) onClose?.();
    } catch (cause) {
      console.error(cause);
      setError("말풍선 이미지를 만들지 못했습니다. 장식 이미지를 바꾸거나 다시 시도해 주세요.");
    } finally {
      setIsApplying(false);
    }
  };

  const bodyScale = spec.design.bodyScale ?? 1;
  const radiusMax = getBubbleRadiusMax("rounded", variant, bodyScale);

  const bubbleSection = (
    <BuilderSection>
      <div className="grid grid-cols-2 gap-3">
        <ColorField label="배경색" value={spec.design.fill} onChange={(fill) => updateDesign({ fill })} />
        <ColorField label="테두리색" value={spec.design.borderColor} onChange={(borderColor) => updateDesign({ borderColor })} />
      </div>
      <RangeField label="테두리 굵기" value={spec.design.borderWidth} min={0} max={10} onChange={(borderWidth) => updateDesign({ borderWidth })} />
      <RangeField label="모서리 둥글기" value={spec.design.radius} min={0} max={radiusMax} onChange={(radius) => updateDesign({ preset: "rounded", radius })} />
      {/*
        본체를 키우면 9-slice의 코너가 두꺼워져 짧은 메시지의 말풍선이 커진다. 둥글기 상한도 같이
        움직이므로, 줄일 때는 저장된 반지름을 새 상한으로 눌러 준다(그러지 않으면 슬라이더 손잡이가
        범위 밖에 남아 값이 안 바뀐 것처럼 보인다).
      */}
      <ChoiceField
        label="말풍선 크기"
        value={getBubbleBodyScalePreset(spec.design.bodyScale)}
        options={bubbleBodyScalePresets}
        onChange={(presetId) => {
          const nextScale = bubbleBodyScalePresets.find((preset) => preset.id === presetId)?.value ?? 1;
          updateDesign({ bodyScale: nextScale, radius: Math.min(spec.design.radius, getBubbleRadiusMax("rounded", variant, nextScale)) });
        }}
      />
      {/* 프레임 크기는 숫자보다 눈으로 맞추는 값이라 미리보기의 손잡이로 옮겼다. */}
      <p className="text-[11px] font-bold text-slate-400">프레임(점선)은 장식이 삐져나올 자리예요. 미리보기의 손잡이를 끌어 넓힐 수 있어요.</p>
    </BuilderSection>
  );

  const decorationSection = (
    <BuilderSection>
      <div
        data-testid="bubble-decoration-dropzone"
        className={`rounded-2xl border-2 border-dashed p-3 transition ${dragActive ? "border-blue-500 bg-blue-100 ring-4 ring-blue-50" : "border-blue-300 bg-blue-50"}`}
        onDragEnter={(event) => { event.preventDefault(); setDragActive(true); }}
        onDragOver={(event) => { event.preventDefault(); setDragActive(true); }}
        onDragLeave={(event) => { event.preventDefault(); if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragActive(false); }}
        onDrop={(event) => { event.preventDefault(); setDragActive(false); acceptDecorationFile(Array.from(event.dataTransfer.files).find((file) => decorationMimeTypes.has(file.type)) ?? event.dataTransfer.files[0]); }}
      >
        <label className="flex min-h-20 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl text-center text-blue-700 hover:bg-white/50">
          <span className="flex items-center gap-2 text-sm font-black"><ImagePlus size={19} />꾸미기 이미지 추가</span>
          <span className="text-[11px] font-bold text-blue-600/80">클릭해서 선택 · Ctrl+V 붙여넣기 · 파일 끌어놓기</span>
          <span className="text-[10px] font-medium text-slate-500">PNG · JPG · WebP · 여러 장 추가 가능</span>
          <input className="hidden" type="file" accept="image/png,image/jpeg,image/webp" multiple onChange={(event) => { for (const file of Array.from(event.currentTarget.files ?? [])) acceptDecorationFile(file); event.currentTarget.value = ""; }} />
        </label>
      </div>
      {layers.length > 0 ? <>
        <div className="grid gap-1.5">
          {layers.map((layer, index) => (
            <button
              key={layer.id}
              type="button"
              aria-pressed={selectedLayerId === layer.id}
              onClick={() => setSelectedLayerId(layer.id)}
              className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-left text-xs font-bold transition ${selectedLayerId === layer.id ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}
            >
              <span className="size-7 shrink-0 rounded-md border border-slate-200 bg-slate-50 bg-contain bg-center bg-no-repeat" style={{ backgroundImage: decorationUrls[layer.id] ? `url(${decorationUrls[layer.id]})` : undefined }} aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate">{layer.sourceName ?? `이미지 ${index + 1}`}</span>
              {collidingLayerIds.includes(layer.id) ? <span className="shrink-0 text-[10px] font-black text-amber-600">겹침</span> : null}
              {stretchedLayerIds.includes(layer.id) ? <span className="shrink-0 text-[10px] font-black text-amber-600">늘어남</span> : null}
            </button>
          ))}
        </div>
        {/*
          둘 다 amber로 둔다. 바로 아래 에러 표시가 rose를 쓰고 있어서, 막지 않는 알림에 rose를
          주면 같은 자리에서 두 색의 뜻이 갈린다.
        */}
        {decorationCollision ? <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-bold text-amber-800">그림이 <b>글자 영역</b>과 겹쳐요. 투명한 여백만 걸친 것이라면 그대로 두어도 괜찮아요.</p> : null}
        {decorationStretched ? <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-bold text-amber-800">그림이 <b>늘어나는 선</b>을 지나가요. 긴 메시지에서는 그 부분이 늘어나 보여요.</p> : null}
      </> : null}
    </BuilderSection>
  );

  /**
   * 단계가 아니라 탭이다.
   *
   * 위저드였을 때는 `적용하기`가 마지막 단계에만 있어서, 배경색만 바꾸려는 사람도 `다음`을 눌러
   * 끝까지 가야 했다 — 가장 흔한 경로에 가장 많은 탭이 붙어 있었다. 남은 묶음이 둘뿐이라
   * 순서를 강제할 이유도 없어서, 순서 없는 탭으로 바꾸고 `적용하기`를 항상 띄운다.
   */
  const tabs = [
    { id: "bubble", name: "말풍선", node: bubbleSection },
    { id: "decoration", name: "꾸미기", node: decorationSection },
  ] as const;

  const applyButton = (
    <button type="button" disabled={isApplying} className="inline-flex min-h-12 w-full items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-blue-600 px-4 text-sm font-black text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50" onClick={() => void apply()}>{isApplying ? <LoaderCircle size={18} className="animate-spin" /> : <Sparkles size={18} />}{isApplying ? "만드는 중" : "적용하기"}</button>
  );

  return (
    <section className="grid min-w-0 w-full gap-3 bg-white p-4 text-slate-950 md:p-6 lg:gap-5">
          <div className="flex items-start justify-between gap-2">
            {/*
              어느 슬롯에 적용되는지는 도움말 팝오버가 이미 문장으로 설명한다. 헤더에서 같은 말을
              한 줄 더 쓰지 않는다.
            */}
            <div className="min-w-0">
              <h2 className="flex items-center gap-2 text-lg font-black text-slate-950 lg:text-xl">나만의 말풍선 만들기</h2>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <Popover.Root>
                <Popover.Trigger className="grid size-10 place-items-center rounded-full text-slate-500 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2" aria-label="도움말"><Info size={20} /></Popover.Trigger>
                <Popover.Portal>
                  <Popover.Content sideOffset={8} align="end" className="z-[92] w-64 rounded-2xl border border-slate-200 bg-white p-4 text-xs font-medium leading-5 text-slate-600 shadow-xl focus:outline-none">
                    <p className="mb-2 text-sm font-black text-slate-900">미리보기 안내</p>
                    <ul className="grid gap-1.5">
                      <li className="flex items-center gap-2"><span className="inline-block h-2.5 w-4 shrink-0 rounded-sm border border-dashed border-emerald-600/80" /><span><b className="font-bold text-slate-800">글자 영역</b> · 그림이 여기를 덮으면 메시지가 가려요.</span></li>
                      <li className="flex items-center gap-2"><span className="inline-block h-2.5 w-4 shrink-0 rounded-sm bg-sky-400/70" /><span><b className="font-bold text-slate-800">늘어나는 구간</b> · 긴 메시지에서 늘어나는 곳이에요. 이 선을 가로지르는 그림도 함께 늘어나요.</span></li>
                    </ul>
                    <p className="mt-3 border-t border-slate-100 pt-3">현재 선택한 {slotLabel} 슬롯 하나에만 적용되고, 다른 말풍선은 바뀌지 않아요.</p>
                    <Popover.Arrow className="fill-white" />
                  </Popover.Content>
                </Popover.Portal>
              </Popover.Root>
              {onClose ? <button type="button" disabled={isApplying} onClick={onClose} className="grid size-10 place-items-center rounded-full text-slate-500 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:opacity-50" aria-label="닫기"><X size={20} /></button> : null}
            </div>
          </div>

          {/* 모바일 탭. 순서가 없으므로 번호가 아니라 이름으로 고른다. */}
          <div className="grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1 lg:hidden" role="tablist" aria-label="편집 항목">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={activeTab === tab.id}
                className={`min-h-10 rounded-lg text-xs font-black transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${activeTab === tab.id ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.name}
              </button>
            ))}
          </div>

          <div className="grid min-w-0 w-full gap-4 lg:mt-5 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-5">
            {/* 데스크톱: 모든 섹션을 한 화면에 표시. 순서는 모바일 탭과 같게 유지한다. */}
            <div className="hidden gap-5 lg:grid">
              {bubbleSection}
              {decorationSection}
            </div>

            {/* 미리보기: 모바일은 인디케이터 아래 고정, 데스크톱은 우측 컬럼 */}
            <aside className="min-w-0 rounded-2xl bg-slate-50 p-4 lg:sticky lg:top-0 lg:self-start">
              <BubblePreview
                spec={spec}
                variant={variant}
                layers={layers}
                decorationUrls={decorationUrls}
                decorationSizes={decorationSizes}
                selectedLayerId={selectedLayerId}
                onSelectLayer={setSelectedLayerId}
                onRemoveLayer={removeLayer}
                onDecorationChange={patchLayer}
                onBodyChange={updateDesign}
                onCanvasScaleChange={updateDesign}
              />
              <label className="mt-4 flex items-center gap-2 text-xs font-bold text-slate-700"><input type="checkbox" checked={spec.design.syncTextColorOnApply} onChange={(event) => updateDesign({ syncTextColorOnApply: event.currentTarget.checked })} className="size-4 accent-blue-600" />글자색도 함께 맞추기</label>
              {spec.design.syncTextColorOnApply ? <div className="mt-2"><ColorField label="말풍선 글자색" value={spec.design.textColor} onChange={(textColor) => updateDesign({ textColor })} /></div> : null}
              {/* 데스크톱 전용 적용 영역 */}
              <div className="hidden lg:block">
                {error ? <p className="mt-3 rounded-xl bg-rose-50 p-3 text-xs font-bold text-rose-700" role="alert">{error}</p> : null}
                <div className="mt-4">{applyButton}</div>
              </div>
            </aside>

            {/* 모바일 전용: 선택한 탭 컨트롤. 적용하기는 어느 탭에 있든 항상 보인다. */}
            <div className="lg:hidden">
              {tabs.find((tab) => tab.id === activeTab)?.node}
              {error ? <p className="mt-3 rounded-xl bg-rose-50 p-3 text-xs font-bold text-rose-700" role="alert">{error}</p> : null}
              <div className="mt-4">{applyButton}</div>
            </div>
          </div>
    </section>
  );
}

export function BubbleBuilderDialog({ open, onOpenChange, ...editorProps }: BubbleBuilderDialogProps) {
  return (
    <Dialog.Root open={open} onOpenChange={(next) => onOpenChange(next)}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[90] bg-slate-950/45 backdrop-blur-sm" />
        <Dialog.Content className="fixed inset-x-3 top-1/2 z-[91] mx-auto max-h-[92dvh] min-w-0 w-auto max-w-4xl -translate-y-1/2 overflow-y-auto rounded-3xl bg-white shadow-2xl focus:outline-none [scrollbar-color:#cbd5e1_transparent] [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[#cbd5e1]">
          <BubbleBuilderEditor {...editorProps} active={open} onClose={() => onOpenChange(false)} />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

type PreviewDrag =
  | { kind: "move" | "resize" | "rotate"; startX: number; startY: number; deco: BubbleDecorationTransform }
  | { kind: "body"; startX: number; startY: number; bodyX: number; bodyY: number };

/** 배율은 소수라 부동소수 오차를 감안해 비교한다. */
function atCanvasScaleLimit(scale: { x: number; y: number }, bound: "min" | "max") {
  const limit = bubbleCanvasScaleRange[bound];
  return Math.abs(scale.x - limit) < 0.001 || Math.abs(scale.y - limit) < 0.001;
}

const checkerboardStyle: React.CSSProperties = {
  backgroundColor: "#ffffff",
  backgroundImage: "conic-gradient(#e2e8f0 25%, transparent 0 50%, #e2e8f0 0 75%, transparent 0)",
  backgroundSize: "16px 16px",
};

type BubblePreviewProps = {
  spec: BubbleFamilyDesignSpec;
  variant: "first" | "group";
  layers: BubbleDecorationLayer[];
  decorationUrls: Partial<Record<string, string>>;
  decorationSizes: Partial<Record<string, BubbleDecorationSourceSize>>;
  selectedLayerId: string | null;
  onSelectLayer?: (layerId: string | null) => void;
  onRemoveLayer?: (layerId: string) => void;
  onDecorationChange?: (layerId: string, patch: Partial<BubbleDecorationTransform>) => void;
  onBodyChange?: (patch: { bodyOffsetX: number; bodyOffsetY: number }) => void;
  onCanvasScaleChange?: (patch: { canvasScaleX: number; canvasScaleY: number }) => void;
};

function BubblePreview({ spec, variant, layers, decorationUrls, decorationSizes, selectedLayerId, onSelectLayer, onRemoveLayer, onDecorationChange, onBodyChange, onCanvasScaleChange }: BubblePreviewProps) {
  const geometry = useMemo(() => getBubbleVariantGeometry(spec.design, variant), [spec, variant]);
  /**
   * 표시 배율은 **최대 프레임** 기준으로 잡는다.
   *
   * 현재 캔버스 폭으로 잡으면 `getBubblePreviewScale`이 남는 폭에 맞춰 배율을 되돌려서, 프레임을
   * 키워도 화면 위 상자 크기가 그대로다 — 모서리를 끌어도 아무 일이 안 일어난 것처럼 보인다.
   * 상한 기준으로 고정하면 상자가 실제로 커지고 줄어들며, 바깥 여백도 늘 확보돼 손잡이를 바깥으로
   * 끌 자리가 남는다.
   */
  const maxCanvas = useMemo(() => getBubbleVariantGeometry({ ...spec.design, canvasScale: undefined, canvasScaleX: bubbleCanvasScaleRange.max, canvasScaleY: bubbleCanvasScaleRange.max }, variant).canvas, [spec.design, variant]);
  const [availableWidth, setAvailableWidth] = useState<number>();
  const frameRef = useRef<HTMLDivElement>(null);
  const { scale, stageWidth, stageHeight, boundsWidth, boundsHeight } = getBubblePreviewLayout(geometry.canvas, maxCanvas, availableWidth);
  const stretchThickness = Math.max(2, Math.round(3 * scale));
  const stageRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<PreviewDrag | null>(null);
  const activeLayerRef = useRef<string | null>(null);
  const [bodyDragging, setBodyDragging] = useState(false);
  const canvasScale = getBubbleCanvasScale(spec.design);
  const frameDragRef = useRef<FrameDrag | null>(null);
  const [frameDragging, setFrameDragging] = useState(false);
  const dragging = frameDragging || bodyDragging;
  /**
   * 한계에 닿았는지 알려 준다. 숫자만 멈추면 "안 움직인다"로 읽혀서, 제한이 있다는 사실 자체를
   * 알 수 없다 — 손잡이만 남기고 슬라이더를 없앤 뒤로는 이게 유일한 통로다.
   */
  const frameLimit = atCanvasScaleLimit(canvasScale, "max") ? "최대" : atCanvasScaleLimit(canvasScale, "min") ? "최소" : undefined;

  useLayoutEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const update = () => setAvailableWidth(frame.clientWidth);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(frame);
    return () => observer.disconnect();
  }, []);

  /**
   * 고르지 않은 장식은 고르기만 하고 움직이지 않는다.
   *
   * 장식은 말풍선 본체 위에 겹쳐 얹는 것이 정상이라, 아무 장식이나 바로 끌리면 본체를 잡으려던
   * 손이 그림을 옮겨 버린다. 한 번 고른 뒤에야 끌리게 하면 실수로 움직이는 일이 사라지고,
   * 고른 장식은 예전처럼 한 번에 끌 수 있다. 손잡이(회전·크기)는 고른 장식에만 나타나므로
   * 여기서 따로 막지 않는다.
   */
  const beginDecoDrag = (kind: "move" | "resize" | "rotate", layer: BubbleDecorationLayer) => (event: React.PointerEvent) => {
    if (!onDecorationChange) return;
    event.preventDefault();
    event.stopPropagation();
    if (kind === "move" && selectedLayerId !== layer.id) {
      onSelectLayer?.(layer.id);
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    activeLayerRef.current = layer.id;
    onSelectLayer?.(layer.id);
    dragRef.current = { kind, startX: event.clientX, startY: event.clientY, deco: layer };
  };
  // 빈 자리를 누르면 선택이 풀린다. 본체를 누를 때도 마찬가지 — 다른 것을 잡았다는 뜻이다.
  const clearSelection = () => onSelectLayer?.(null);
  const beginBodyDrag = (event: React.PointerEvent) => {
    if (!onBodyChange) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { kind: "body", startX: event.clientX, startY: event.clientY, bodyX: spec.design.bodyOffsetX ?? 0, bodyY: spec.design.bodyOffsetY ?? 0 };
    setBodyDragging(true);
  };
  const handleMove = (event: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    if (drag.kind === "body") {
      onBodyChange?.({ bodyOffsetX: drag.bodyX + (event.clientX - drag.startX) / scale, bodyOffsetY: drag.bodyY + (event.clientY - drag.startY) / scale });
      return;
    }
    const layerId = activeLayerRef.current;
    if (!onDecorationChange || !stageRef.current || !layerId) return;
    if (drag.kind === "move") {
      onDecorationChange(layerId, {
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
      onDecorationChange(layerId, { scale: clampNumber(dist / getBubbleDecorationHandleRadius(decorationSizes[layerId]), 0.3, bubbleDecorationMaxScale) });
    } else {
      const angle = (Math.atan2(event.clientY - cy, event.clientX - cx) * 180) / Math.PI + 90;
      onDecorationChange(layerId, { rotation: Math.round(((angle + 180) % 360) - 180) });
    }
  };
  const endDrag = (event: React.PointerEvent) => {
    dragRef.current = null;
    activeLayerRef.current = null;
    setBodyDragging(false);
    try { event.currentTarget.releasePointerCapture(event.pointerId); } catch { /* noop */ }
  };

  const applyCanvasScale = (next: { x: number; y: number }) => onCanvasScaleChange?.({
    canvasScaleX: clampNumber(next.x, bubbleCanvasScaleRange.min, bubbleCanvasScaleRange.max),
    canvasScaleY: clampNumber(next.y, bubbleCanvasScaleRange.min, bubbleCanvasScaleRange.max),
  });
  /**
   * 잡은 손잡이가 가진 방향만 움직인다.
   *
   * 두 축을 한 값으로 묶으면 대각선으로만 커져서 원본 비율(가로:세로)을 벗어날 수 없다. 축을 나눠
   * 놓으면 모서리는 두 축을 동시에, 변 가운데 손잡이는 한 축만 바꿔서 직사각형 프레임을 만들 수 있다.
   * 프레임은 바깥 상자 안에서 가운데 정렬이라 한쪽 모서리를 dx만큼 끌면 폭은 2dx 변한다.
   */
  const beginFrameDrag = (handle: FrameHandle) => (event: React.PointerEvent) => {
    if (!onCanvasScaleChange) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    frameDragRef.current = {
      handle,
      startX: event.clientX,
      startY: event.clientY,
      startScaleX: canvasScale.x,
      startScaleY: canvasScale.y,
      startStageWidth: Math.max(1, stageWidth),
      startStageHeight: Math.max(1, stageHeight),
    };
    setFrameDragging(true);
  };
  const moveFrameDrag = (event: React.PointerEvent) => {
    const drag = frameDragRef.current;
    if (!drag) return;
    const dx = (event.clientX - drag.startX) * drag.handle.dirX;
    const dy = (event.clientY - drag.startY) * drag.handle.dirY;
    applyCanvasScale({
      x: drag.startScaleX * ((drag.startStageWidth + 2 * dx) / drag.startStageWidth),
      y: drag.startScaleY * ((drag.startStageHeight + 2 * dy) / drag.startStageHeight),
    });
  };
  const endFrameDrag = (event: React.PointerEvent) => {
    frameDragRef.current = null;
    setFrameDragging(false);
    try { event.currentTarget.releasePointerCapture(event.pointerId); } catch { /* noop */ }
  };
  // 슬라이더를 없앤 대신 키보드로도 조절할 수 있게 남겨 둔다. 손잡이가 가진 축만 움직인다.
  const handleFrameKey = (handle: FrameHandle) => (event: React.KeyboardEvent) => {
    const step = event.key === "ArrowUp" || event.key === "ArrowRight" ? 0.02 : event.key === "ArrowDown" || event.key === "ArrowLeft" ? -0.02 : 0;
    if (!step) return;
    event.preventDefault();
    applyCanvasScale({ x: canvasScale.x + step * Math.abs(handle.dirX), y: canvasScale.y + step * Math.abs(handle.dirY) });
  };

  return (
    <div ref={frameRef} className="min-w-0 w-full">
      {/* 바깥 상자는 최대 프레임 크기로 고정한다. 프레임을 줄여도 미리보기 영역이 들썩이지 않는다. */}
      <div className="relative mx-auto max-w-full" style={{ width: boundsWidth, height: boundsHeight }}>
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2" style={{ width: stageWidth, height: stageHeight }}>
          {/* 내보내는 PNG는 모서리가 각진 사각형이라 미리보기도 각지게 둔다. 둥글리면 실제와 어긋난다. */}
          <div ref={stageRef} className="absolute inset-0 touch-none overflow-hidden" style={{ ...checkerboardStyle }} onPointerDown={clearSelection} onPointerMove={handleMove} onPointerUp={endDrag}>
            {/* 프레임(내보내는 PNG의 경계). 체커보드만으로는 어디까지가 결과물인지 읽히지 않는다. */}
            <span className={`pointer-events-none absolute inset-0 border-2 border-dashed transition ${frameDragging ? "border-blue-500" : "border-slate-400/70"}`} aria-hidden="true" />
            <div
              className={onBodyChange ? "group absolute cursor-move" : "absolute"}
              style={{ left: geometry.body.x * scale, top: geometry.body.y * scale, width: geometry.body.width * scale, height: geometry.body.height * scale, borderRadius: geometry.radius * scale, background: spec.design.fill, border: spec.design.borderWidth ? `${spec.design.borderWidth * scale}px solid ${spec.design.borderColor}` : undefined }}
              onPointerDown={onBodyChange ? beginBodyDrag : undefined}
              aria-label={onBodyChange ? "말풍선 본체 (끌어서 이동)" : undefined}
            >
              {onBodyChange ? <BodyMoveAffordance active={bodyDragging} /> : null}
            </div>
            <div className="pointer-events-none absolute grid place-items-center border-2 border-dashed border-emerald-600/80 px-1 text-center text-[11px] font-bold leading-4" style={{ left: geometry.content.x * scale, top: geometry.content.y * scale, width: geometry.content.width * scale, height: geometry.content.height * scale, color: spec.design.textColor }}><span>테스트<br />글자</span></div>
            {layers.map((layer) => {
              const url = decorationUrls[layer.id];
              if (!url) return null;
              // 실제 그려지는 사각형. 정사각형 근사를 쓰던 동안에는 넓적한 그림의 빈 위아래가
              // 클릭을 먹어 그 아래의 말풍선 본체를 잡을 수 없었다.
              const rect = getBubbleDecorationRect(layer, geometry.canvas, decorationSizes[layer.id]);
              const interactive = Boolean(onDecorationChange);
              const isSelected = selectedLayerId === layer.id;
              return (
                <div
                  key={layer.id}
                  className={`absolute ${interactive ? (isSelected ? "cursor-move" : "cursor-pointer") : "pointer-events-none"}`}
                  style={{ left: rect.x * scale, top: rect.y * scale, width: rect.width * scale, height: rect.height * scale, transform: `rotate(${layer.rotation ?? 0}deg)` }}
                  onPointerDown={beginDecoDrag("move", layer)}
                >
                  <div role="img" aria-label={layer.sourceName ?? "장식 미리보기"} className="absolute inset-0 bg-contain bg-center bg-no-repeat" style={{ backgroundImage: `url(${url})`, transform: layer.flipX ? "scaleX(-1)" : undefined }} />
                  {interactive && isSelected ? <>
                    <span className="absolute inset-0 rounded-sm ring-1 ring-blue-400/70" />
                    <button type="button" aria-label="회전" className="absolute -top-3 left-1/2 grid size-6 -translate-x-1/2 cursor-grab place-items-center rounded-full border border-blue-200 bg-white text-blue-600 shadow" onPointerDown={beginDecoDrag("rotate", layer)}><RotateCw size={13} /></button>
                    <button type="button" aria-label="이미지 제거" className="absolute -right-2.5 -top-2.5 grid size-6 place-items-center rounded-full border border-rose-200 bg-white text-rose-600 shadow" onPointerDown={(event) => event.stopPropagation()} onClick={() => onRemoveLayer?.(layer.id)}><X size={13} /></button>
                    <button type="button" aria-label="좌우 반전" className="absolute -bottom-2.5 -left-2.5 grid size-6 place-items-center rounded-full border border-blue-200 bg-white text-blue-600 shadow" onPointerDown={(event) => event.stopPropagation()} onClick={() => onDecorationChange?.(layer.id, { flipX: !layer.flipX })}><FlipHorizontal size={13} /></button>
                    <button type="button" aria-label="크기 조절" className="absolute -bottom-2.5 -right-2.5 size-5 cursor-nwse-resize rounded-full border border-blue-200 bg-white shadow" onPointerDown={beginDecoDrag("resize", layer)} />
                  </> : null}
                </div>
              );
            })}
            {/*
              늘어나는 구간(stretch)은 **이미지 전체**를 가른다.
              Android는 마커를 캔버스의 위쪽·왼쪽 변에 찍고(`bubbleGeometryToAndroidMarkers`),
              iOS도 이미지 전체를 그 지점에서 늘린다. 본체 폭만큼만 그리면 이 선을 가로지르는
              장식이 긴 메시지에서 늘어난다는 사실이 미리보기에서 보이지 않는다.

              장식보다 뒤에 그린다. 확인해야 할 것이 "무엇이 이 선을 지나가는가"라서, 장식에
              가려 버리면 전체 폭으로 늘린 의미가 없다.
            */}
            <div className="pointer-events-none absolute inset-y-0 bg-sky-400/70" style={{ left: geometry.stretch.x * scale - stretchThickness / 2, width: stretchThickness }} />
            <div className="pointer-events-none absolute inset-x-0 bg-sky-400/70" style={{ top: geometry.stretch.y * scale - stretchThickness / 2, height: stretchThickness }} />
          </div>
          {/*
            손잡이는 stage 바깥에 둔다. stage는 `overflow-hidden`이라 안에 넣으면 모서리 밖으로
            내민 절반이 잘려 잡을 면적이 줄어든다.
          */}
          {onCanvasScaleChange ? <FrameResizeHandles active={frameDragging} onBegin={beginFrameDrag} onMove={moveFrameDrag} onEnd={endFrameDrag} onKeyDown={handleFrameKey} /> : null}
        </div>
      </div>
      {/*
        크기 표시는 상시로 두고 끄는 동안만 강조한다. 세 가지를 한 줄로 해결한다 —
        끌 때의 피드백, 안 끌 때의 조회(슬라이더를 없애 다른 확인 경로가 없다),
        그리고 "이건 조절할 수 있는 값"이라는 힌트.
      */}
      <p className={`mt-2 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-center transition ${dragging ? "text-xs font-black text-slate-900" : "text-[11px] font-bold text-slate-400"}`} aria-live="polite">
        <span>프레임 {geometry.canvas.width} × {geometry.canvas.height}</span>
        {frameLimit ? <span className="rounded-full bg-amber-100 px-1.5 text-[10px] font-black text-amber-700">{frameLimit}</span> : null}
        <span aria-hidden="true" className="text-slate-300">·</span>
        <span>말풍선 {geometry.body.width} × {geometry.body.height}</span>
      </p>
      <div className="mt-1.5 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[10px] font-bold text-slate-500">
        <span className="flex items-center gap-1"><span className="inline-block h-2 w-3 rounded-sm border border-dashed border-slate-400/70" />프레임</span>
        <span className="flex items-center gap-1"><span className="inline-block h-2 w-3 rounded-sm border border-dashed border-emerald-600/80" />글자 영역</span>
        <span className="flex items-center gap-1"><span className="inline-block h-2 w-3 rounded-sm bg-sky-400/70" />늘어나는 구간</span>
      </div>
    </div>
  );
}

/**
 * 프레임 손잡이. `dirX`/`dirY`는 그 손잡이를 바깥으로 끌 때의 화면 좌표 방향이며, 0이면 그 축은
 * 건드리지 않는다 — 변 가운데 손잡이가 한 축만 바꾸는 근거다.
 */
type FrameHandle = { label: string; position: string; cursor: string; dirX: number; dirY: number };

type FrameDrag = {
  handle: FrameHandle;
  startX: number;
  startY: number;
  startScaleX: number;
  startScaleY: number;
  startStageWidth: number;
  startStageHeight: number;
};

/**
 * 위치는 24px 버튼 기준이다. 보이는 사각형은 그 안의 12px이고, 버튼이 모서리에 중심을 맞추도록
 * 절반인 12px(`-3`)만큼 물린다. WCAG 2.2의 최소 타깃 크기가 24px이라 보이는 크기로는 미달이었다.
 */
const frameHandles: FrameHandle[] = [
  { label: "왼쪽 위", position: "-left-3 -top-3", cursor: "cursor-nwse-resize", dirX: -1, dirY: -1 },
  { label: "오른쪽 위", position: "-right-3 -top-3", cursor: "cursor-nesw-resize", dirX: 1, dirY: -1 },
  { label: "왼쪽 아래", position: "-bottom-3 -left-3", cursor: "cursor-nesw-resize", dirX: -1, dirY: 1 },
  { label: "오른쪽 아래", position: "-bottom-3 -right-3", cursor: "cursor-nwse-resize", dirX: 1, dirY: 1 },
  { label: "위", position: "-top-3 left-1/2 -translate-x-1/2", cursor: "cursor-ns-resize", dirX: 0, dirY: -1 },
  { label: "아래", position: "-bottom-3 left-1/2 -translate-x-1/2", cursor: "cursor-ns-resize", dirX: 0, dirY: 1 },
  { label: "왼쪽", position: "-left-3 top-1/2 -translate-y-1/2", cursor: "cursor-ew-resize", dirX: -1, dirY: 0 },
  { label: "오른쪽", position: "-right-3 top-1/2 -translate-y-1/2", cursor: "cursor-ew-resize", dirX: 1, dirY: 0 },
];

/**
 * 프레임(내보내는 PNG) 크기를 끌어서 조절하는 손잡이.
 *
 * 퍼센트 슬라이더를 대신한다. 프레임은 장식이 삐져나올 자리를 눈으로 맞추는 값이라 숫자보다
 * 직접 끄는 편이 맞고, 조작 대상이 미리보기 안에 있어 결과를 보면서 정할 수 있다.
 * 모서리는 가로·세로를 동시에, 변 가운데는 한 축만 바꾼다.
 */
function FrameResizeHandles({ active, onBegin, onMove, onEnd, onKeyDown }: {
  active: boolean;
  onBegin: (handle: FrameHandle) => (event: React.PointerEvent) => void;
  onMove: (event: React.PointerEvent) => void;
  onEnd: (event: React.PointerEvent) => void;
  onKeyDown: (handle: FrameHandle) => (event: React.KeyboardEvent) => void;
}) {
  return (
    <>
      {frameHandles.map((handle) => (
        <button
          key={handle.label}
          type="button"
          aria-label={`프레임 크기 조절 (${handle.label})`}
          className={`absolute ${handle.position} ${handle.cursor} grid size-6 touch-none place-items-center rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500`}
          onPointerDown={onBegin(handle)}
          onPointerMove={onMove}
          onPointerUp={onEnd}
          onPointerCancel={onEnd}
          onKeyDown={onKeyDown(handle)}
        >
          <span className={`size-3 border bg-white shadow-sm transition ${active ? "border-blue-500 ring-2 ring-blue-200" : "border-slate-400"}`} />
        </button>
      ))}
    </>
  );
}

/**
 * 말풍선 본체가 끌어서 옮길 수 있다는 표시.
 *
 * 네 모서리에 점을 찍었더니 리사이즈 손잡이로 읽혔다 — 바로 바깥의 프레임 손잡이가 실제로
 * 그 모양이라 더 헷갈렸다. 본체에 걸린 동작은 이동 하나뿐이므로, 뜻이 하나로 읽히는
 * 사방 화살표를 오른쪽 아래에 하나만 둔다. `pointer-events-none`이라 본체 끌기를 가로채지 않고,
 * 끌기는 여전히 본체 어디서나 시작할 수 있다.
 */
function BodyMoveAffordance({ active }: { active: boolean }) {
  return (
    <span
      className={`pointer-events-none absolute -bottom-1.5 -right-1.5 grid size-5 place-items-center rounded-full border bg-white shadow-sm transition ${active ? "border-blue-500 text-blue-600" : "border-slate-300 text-slate-500 group-hover:border-blue-500 group-hover:text-blue-600"}`}
      aria-hidden="true"
    >
      <Move size={11} />
    </span>
  );
}

function BuilderSection({ children }: { children: React.ReactNode }) { return <section className="grid gap-3 rounded-2xl border border-slate-200 p-4">{children}</section>; }
function RangeField({ label, value, min, max, suffix = "", onChange }: { label: string; value: number; min: number; max: number; suffix?: string; onChange: (value: number) => void }) { return <label className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-xs font-bold text-slate-600"><span>{label}</span><span>{Math.round(value)}{suffix}</span><input type="range" className="col-span-2 accent-blue-600" min={min} max={max} value={value} onChange={(event) => onChange(Number(event.currentTarget.value))} /></label>; }

/**
 * 눈금이 아니라 몇 개의 선택지로 고르는 값. 연속값이 의미 없는 설정에 쓴다.
 */
function ChoiceField<T extends string>({ label, value, options, onChange }: {
  label: string;
  value: T;
  options: readonly { id: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="grid gap-1.5 text-xs font-bold text-slate-600">
      <span id={`${label}-label`}>{label}</span>
      <div className="grid grid-flow-col gap-1 rounded-xl bg-slate-100 p-1" role="group" aria-labelledby={`${label}-label`}>
        {options.map((option) => (
          <button
            key={option.id}
            type="button"
            aria-pressed={value === option.id}
            className={`min-h-9 rounded-lg text-xs font-black transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${value === option.id ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}
            onClick={() => onChange(option.id)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}
/**
 * 라벨과 색상 코드를 한 줄에 나란히 두면 2열 배치의 좁은 폭(360px 기기에서 약 149px)에서
 * 자리가 모자라 줄바꿈이 일어나 카드 높이가 두 배가 된다. 견본 옆에 두 줄로 쌓아 폭을 아낀다.
 */
function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600">
      <ThemeColorPicker value={value} label={label} onChange={onChange}>
        <button
          type="button"
          aria-label={`${label} 색상 선택 열기`}
          className="relative size-8 shrink-0 cursor-pointer overflow-hidden rounded-lg border border-black/10 shadow-sm transition hover:ring-2 hover:ring-blue-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 active:scale-95"
        >
          <span className="absolute inset-0" style={{ backgroundColor: themeColorToCss(value) }} aria-hidden="true" />
        </button>
      </ThemeColorPicker>
      <span className="grid min-w-0 leading-tight">
        <span className="truncate">{label}</span>
        <span className="truncate font-mono text-[10px] font-medium text-slate-400">{themeColorRgbHex(value)}</span>
      </span>
    </div>
  );
}
