"use client";

import { useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { FlipHorizontal, ImagePlus, Info, LoaderCircle, Maximize, Minus, Move, Plus, RotateCw, Sparkles, X } from "lucide-react";
import * as Dialog from "@radix-ui/react-dialog";
import * as Popover from "@radix-ui/react-popover";
import {
  bubblePreviewZoomRange,
  bubblePreviewZoomStep,
  clampBubblePreviewPan,
  clampBubblePreviewZoom,
  getBubblePreviewLayout,
  getBubblePreviewZoomPan,
  type BubblePreviewPan,
  type BubblePreviewSize,
} from "@/components/editor/bubblePreviewLayout";
import { ThemeColorPicker } from "@/components/project/ThemeColorPicker";
import { themeColorRgbHex, themeColorToCss } from "@/lib/theme/color";
import {
  bubbleCanvasSizeRange,
  bubbleDecorationMaxScale,
  createBubbleDecorationLayer,
  createBubbleFamilyDesignSpec,
  crossesBubbleStretch,
  generateBubbleAsset,
  getBubbleDecorationHandleRadius,
  getBubbleDecorationLayers,
  getBubbleDecorationRect,
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

/** 바깥(다이얼로그)에서 닫기를 요청하는 통로. Esc·바깥 클릭도 ✕와 같은 확인 절차를 타야 한다. */
export type BubbleBuilderEditorHandle = { requestClose: () => void };

type BubbleBuilderEditorProps = Omit<BubbleBuilderDialogProps, "open" | "onOpenChange"> & {
  active?: boolean;
  ref?: React.Ref<BubbleBuilderEditorHandle>;
  /**
   * 감싸는 쪽이 높이를 확정해 주는가.
   *
   * 다이얼로그는 확정해 준다(`inset-0` 또는 고정 높이). 그 안에서는 높이를 물려받아 캔버스가
   * 남는 자리를 전부 쓰고 컨트롤만 스크롤한다. `/admin`처럼 문서 흐름에 그냥 놓이는 자리는
   * 물려받을 높이가 없으므로 최소 높이로 버틴다.
   */
  fill?: boolean;
  onClose?: () => void;
  closeOnApply?: boolean;
};

const decorationMimeTypes = new Set(["image/png", "image/jpeg", "image/webp"]);

/**
 * 지금 어느 셸을 쓸지.
 *
 * 두 셸을 CSS로만 감추면 둘 다 마운트돼서 미리보기가 두 벌 돌아간다 — 캔버스 DOM도, 크기를
 * 지켜보는 ResizeObserver도, 줌·이동 상태도 두 개다. 감춰진 쪽은 크기가 0이라 배율 계산이
 * 엉뚱한 값으로 돌고, 화면 폭이 바뀌어 셸이 교대하면 그 값이 그대로 나타난다.
 *
 * 다이얼로그는 열 때 비로소 마운트되는 클라이언트 전용 트리라 서버 렌더 값이 쓰일 일이 없다.
 * 그래도 `useSyncExternalStore`를 쓰는 것은 첫 클라이언트 렌더부터 올바른 값을 읽어 한 프레임의
 * 깜빡임을 없애기 위해서다.
 */
const desktopShellQuery = "(min-width: 1024px)";

function useDesktopShell() {
  return useSyncExternalStore(
    (onChange) => {
      const query = window.matchMedia(desktopShellQuery);
      query.addEventListener("change", onChange);
      return () => query.removeEventListener("change", onChange);
    },
    () => window.matchMedia(desktopShellQuery).matches,
    () => true,
  );
}

/**
 * "이번에 무언가 바꿨는가"를 재는 지문.
 *
 * `updatedAt`은 뺀다 — 값이 그대로여도 손대는 순간마다 올라가서, 넣어 두면 늘 바뀐 것이 된다.
 * 올린 원본 파일도 함께 센다. 이미지 세 장을 얹고 닫으면 그 세 장이 통째로 사라지는데,
 * 디자인 값만 보면 레이어가 지워진 경우와 구분되지 않는다.
 */
export function getBubbleEditSignature(spec: BubbleFamilyDesignSpec, decorationFiles: DecorationFiles) {
  const files = Object.entries(decorationFiles)
    .filter((entry): entry is [string, File] => Boolean(entry[1]))
    .map(([layerId, file]) => `${layerId}:${file.name}:${file.size}:${file.lastModified}`)
    .sort();
  return JSON.stringify({ design: spec.design, files });
}


export function BubbleBuilderEditor({ side, variant, slotLabel, platform, initialSpec, initialDecorationFiles, onApply, active = true, ref, fill = false, onClose, closeOnApply = true }: BubbleBuilderEditorProps) {
  const [spec, setSpec] = useState(() => initialSpec ?? createBubbleFamilyDesignSpec(side));
  const [decorationFiles, setDecorationFiles] = useState<DecorationFiles>({});
  const [decorationUrls, setDecorationUrls] = useState<Partial<Record<string, string>>>({});
  const [decorationSizes, setDecorationSizes] = useState<Partial<Record<string, BubbleDecorationSourceSize>>>({});
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);
  const [isApplying, setIsApplying] = useState(false);
  const [error, setError] = useState<string>();
  const [dragActive, setDragActive] = useState(false);
  const [activeTab, setActiveTab] = useState<"bubble" | "decoration">("bubble");
  // 모바일 컨트롤 시트의 높이. 캔버스와 세로를 나눠 갖는다.
  const [sheetExpanded, setSheetExpanded] = useState(false);
  const [closeConfirmOpen, setCloseConfirmOpen] = useState(false);
  const isDesktop = useDesktopShell();
  const baselineRef = useRef("");

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
    const normalized = {
      ...source,
      design: {
        ...source.design,
        preset: "rounded" as const,
        radius: Math.min(source.design.radius, getBubbleRadiusMax("rounded", variant, source.design.bodyScale)),
        decoration: undefined,
        decorations: sourceLayers,
      },
    };
    setSpec(normalized);
    setDecorationFiles({ ...(initialDecorationFiles ?? {}) });
    /*
      "안 바뀌었다"의 기준은 `initialSpec`이 아니라 **여기서 정규화한 결과**다.
      이 효과가 preset을 rounded로 강제하고 반지름을 새 상한으로 누르며 옛 단일 장식을
      배열로 옮기기 때문에, 원본과 비교하면 옛 spec은 아무것도 건드리지 않아도 열자마자
      바뀐 것으로 읽힌다.
    */
    baselineRef.current = getBubbleEditSignature(normalized, initialDecorationFiles ?? {});
    setSelectedLayerId(sourceLayers[0]?.id ?? null);
    setError(undefined);
    setDragActive(false);
    setActiveTab("bubble");
    setSheetExpanded(false);
    setCloseConfirmOpen(false);
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
   * Esc는 가장 안쪽 것부터 되돌린다.
   *
   * 되묻기가 떠 있으면 그것부터 닫고, 장식을 고른 상태면 선택만 푼다. 곧장 다이얼로그를 닫으면
   * "선택만 풀려던" 동작이 작업을 통째로 버린다. 캡처 단계에서 잡아 Radix의 닫기 처리로 넘어가지
   * 않게 막고, 되돌릴 것이 없을 때만 평소대로 닫히게 둔다.
   */
  useEffect(() => {
    if (!active || (!selectedLayerId && !closeConfirmOpen)) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      if (closeConfirmOpen) setCloseConfirmOpen(false);
      else setSelectedLayerId(null);
    };
    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, [active, closeConfirmOpen, selectedLayerId]);

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

  /**
   * 프레임을 줄이면 장식도 같이 데려온다.
   *
   * 프레임은 그대로 잘라 내보내는 경계라, 밖으로 나간 장식은 조용히 사라진다. 끌어서 옮길 때는
   * 캔버스 안으로 눌러 주면서 프레임을 줄일 때는 두지 않으면, 줄였다 늘리는 사이에 그림이
   * 없어졌다 나타난다. 배율 필드도 함께 지운다 — 픽셀과 배율이 같이 남으면 어느 쪽이 참인지
   * `getBubbleCanvasSize`의 우선순위에만 적혀 있게 된다.
   */
  const updateCanvasSize = useCallback((size: { width: number; height: number }) => {
    setSpec((current) => ({
      ...current,
      design: {
        ...current.design,
        canvasWidth: size.width,
        canvasHeight: size.height,
        canvasScale: undefined,
        canvasScaleX: undefined,
        canvasScaleY: undefined,
        decorations: (current.design.decorations ?? []).map((layer) => ({
          ...layer,
          offsetX: clampNumber(layer.offsetX, -size.width / 2, size.width / 2),
          offsetY: clampNumber(layer.offsetY, -size.height / 2, size.height / 2),
        })),
      },
      updatedAt: Date.now(),
    }));
  }, []);

  const apply = async () => {
    if (layers.some((layer) => !decorationFiles[layer.id])) {
      setError("저장된 장식 원본을 찾지 못했습니다. 이미지를 다시 선택하거나 장식을 제거해 주세요.");
      return false;
    }
    // 겹침·늘어남은 막지 않는다. 판정이 보는 것은 이미지의 사각형이라 실제로 걸친 것이 투명한
    // 여백뿐일 수 있고, 글자 위에 무늬를 얹는 것처럼 일부러 겹치는 디자인도 있다.
    try {
      setIsApplying(true);
      setError(undefined);
      const nextSpec = { ...spec, decorationSourceName: undefined, updatedAt: Date.now() };
      const result = await generateBubbleAsset({ spec: nextSpec, platform, variant, decorationFiles });
      onApply(result, decorationFiles);
      // 적용한 순간이 새 기준이다. 그러지 않으면 적용 직후 닫아도 확인 창이 뜬다.
      baselineRef.current = getBubbleEditSignature(nextSpec, decorationFiles);
      if (closeOnApply) onClose?.();
      return true;
    } catch (cause) {
      console.error(cause);
      setError("말풍선 이미지를 만들지 못했습니다. 장식 이미지를 바꾸거나 다시 시도해 주세요.");
      return false;
    } finally {
      setIsApplying(false);
    }
  };

  /**
   * 닫기는 잃을 것이 있을 때만 되묻는다.
   *
   * 닫는 길이 셋이다 — ✕, Esc, 바깥 클릭. 셋 다 아무 말 없이 편집을 버렸고, 올린 꾸미기
   * 이미지까지 함께 사라졌다. 세 길을 모두 이 함수로 모은다.
   */
  const dirty = getBubbleEditSignature(spec, decorationFiles) !== baselineRef.current;
  const requestClose = useCallback(() => {
    if (isApplying) return;
    if (dirty) setCloseConfirmOpen(true);
    else onClose?.();
  }, [dirty, isApplying, onClose]);
  useImperativeHandle(ref, () => ({ requestClose }), [requestClose]);

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
        `말풍선 크기(작게/기본/크게)`를 없앴다.

        이 값은 화면에 보이는 말풍선 크기를 바꾸지 않는다. 9-slice에서 보이는 말풍선 가로는
        `글자폭 + 2 × (테두리 굵기 + 10 + 둥글기 × 0.29)`이고 본체 배율이 들어가지 않는다.
        실제로 바뀌는 것은 프레임 대비 투명 여백((프레임 - 본체) / 2)뿐인데, 그건 프레임 손잡이가
        반대 방향으로 조절하는 바로 그 값이다 — 컨트롤 두 개가 한 결과를 두고 씨름했고, `크게`를
        고르면 채팅방에서 말풍선이 차지하는 최소 폭이 오히려 줄었다.
        `작게`(0.8)는 group에서 이미 고장나 있었다. 본체 95×60에서 content 높이가 24px 바닥에
        눌려 테두리·둥글기 조절이 화면에 반영되지 않는다.

        저장된 값은 계속 읽는다(`getVariantMetrics`). 1로 눌러 버리면 이미 만들어 둔 테마의
        여백이 조용히 달라진다.
      */}
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

  const helpPopover = (
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
  );

  const closeButton = onClose
    ? <button type="button" disabled={isApplying} onClick={requestClose} className="grid size-10 shrink-0 place-items-center rounded-full text-slate-500 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:opacity-50" aria-label="닫기"><X size={20} /></button>
    : null;

  const preview = (
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
      onCanvasSizeChange={updateCanvasSize}
    />
  );

  const textColorField = (
    <div className="grid gap-2">
      <label className="flex items-center gap-2 text-xs font-bold text-slate-700"><input type="checkbox" checked={spec.design.syncTextColorOnApply} onChange={(event) => updateDesign({ syncTextColorOnApply: event.currentTarget.checked })} className="size-4 accent-blue-600" />글자색도 함께 맞추기</label>
      {spec.design.syncTextColorOnApply ? <ColorField label="말풍선 글자색" value={spec.design.textColor} onChange={(textColor) => updateDesign({ textColor })} /> : null}
    </div>
  );

  const errorNote = error ? <p className="rounded-xl bg-rose-50 p-3 text-xs font-bold text-rose-700" role="alert">{error}</p> : null;

  // 탭. 순서가 없으므로 번호가 아니라 이름으로 고른다.
  const tabList = (
    <div className="grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1" role="tablist" aria-label="편집 항목">
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
  );

  /*
    셸을 둘로 나눈다.

    한 벌로 버티던 동안 모바일은 중앙 모달 안의 세로 스크롤이었고, 390px 화면에서 내용 969px 중
    787px만 보였다 — `적용하기`가 열자마자 화면 밖(모달 하단보다 117px 아래)이라, 못 찾고 ✕로
    나가는 것이 자연스러운 결과였다. 캔버스도 386px 안의 한 블록이라 손으로 끌어 맞출 자리가
    없었다. 세로가 귀한 쪽과 가로가 남는 쪽은 배치의 답이 달라서, 한 트리로 둘 다 맞출 수 없다.
  */
  return (
    <>
      {isDesktop ? null : <>{/*
        모바일: 전체 화면. 앱바(적용하기 고정) · 캔버스 · 컨트롤 시트.
        높이는 `100dvh`가 아니라 `h-full`로 받는다. 감싸는 `Dialog.Content`가 `inset-0`이라
        이미 확정 높이인데, 여기서 dvh를 다시 재면 주소창 높이만큼 어긋나 시트 아래가 잘린다.
        flex를 쓰는 것은 시트의 `max-h-*%`가 컨테이너 높이를 기준으로 풀리게 하기 위해서다
        (grid 행에서는 퍼센트가 auto 크기 행을 만나 무시된다).
      */}
      <section className={`flex min-w-0 flex-col bg-white text-slate-950 ${fill ? "h-full" : "min-h-[40rem]"}`}>
        <header className="flex shrink-0 items-center gap-1 border-b border-slate-100 px-2 py-1.5">
          {closeButton}
          <h2 className="min-w-0 flex-1 truncate px-1 text-base font-black">나만의 말풍선 만들기</h2>
          {helpPopover}
          {/*
            적용하기는 앱바에 둔다. 스크롤 맨 아래에 있던 동안에는 열자마자 화면 밖이라,
            버튼을 못 찾고 ✕로 나가면서 편집을 통째로 잃는 일이 구조적으로 일어났다.
          */}
          <button
            type="button"
            disabled={isApplying}
            className="inline-flex min-h-10 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl bg-blue-600 px-3.5 text-sm font-black text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            onClick={() => void apply()}
          >
            {isApplying ? <LoaderCircle size={16} className="animate-spin" /> : <Sparkles size={16} />}{isApplying ? "만드는 중" : "적용하기"}
          </button>
        </header>

        <div className="min-h-0 flex-1 px-3 pt-2">{preview}</div>

        <ControlSheet expanded={sheetExpanded} onExpandedChange={setSheetExpanded}>
          {tabList}
          {tabs.find((tab) => tab.id === activeTab)?.node}
          {textColorField}
          {errorNote}
        </ControlSheet>
      </section>
      </>}

      {isDesktop ? <>{/*
        데스크톱: 넓은 컬럼은 캔버스가 가진다.
        반대로 두었을 때는 색 두 칸과 슬라이더 두 개가 488px를 쓰고, 손으로 끌어 맞추는 캔버스가
        340px에 눌려 원본보다 작은 0.88배로 그려졌다. 직접 조작이 일어나는 쪽에 자리를 준다.
      */}
      <section className={`grid min-w-0 w-full grid-rows-[auto_minmax(0,1fr)] gap-5 bg-white p-6 text-slate-950 ${fill ? "h-full" : "min-h-[34rem]"}`}>
        <div className="flex items-start justify-between gap-2">
          {/*
            어느 슬롯에 적용되는지는 도움말 팝오버가 이미 문장으로 설명한다. 헤더에서 같은 말을
            한 줄 더 쓰지 않는다.
          */}
          <h2 className="min-w-0 text-xl font-black text-slate-950">나만의 말풍선 만들기</h2>
          <div className="flex shrink-0 items-center gap-1">
            {helpPopover}
            {closeButton}
          </div>
        </div>

        <div className="grid min-h-0 min-w-0 w-full grid-cols-[minmax(0,1fr)_340px] gap-5">
          <aside className="grid min-h-0 min-w-0 grid-rows-[minmax(0,1fr)_auto] gap-3 rounded-2xl bg-slate-50 p-4">
            {preview}
            {textColorField}
          </aside>

          {/*
            컨트롤만 스크롤한다.

            두 컬럼이 같은 행에 있어서, 예전에는 오른쪽 내용이 길어지면 행이 높아지고 왼쪽 캔버스가
            거기에 늘어났다. 경고 두 줄이 뜨고 사라지는 것만으로 캔버스가 140px 커졌다 작아지고
            배율이 129%↔141%로 흔들렸다 — 장식을 끄는 도중에 그 일이 벌어지면 화면 이동량을
            캔버스 좌표로 되돌리는 나눗셈의 분모가 바뀌어 손끝과 그림이 어긋난다.
            높이를 바깥에서 고정하고 넘치는 쪽만 스크롤시키면, 경고뿐 아니라 레이어 추가·에러·
            글자색 칸까지 무엇이 들고 나든 캔버스가 가만히 있는다.
          */}
          <div className="grid min-h-0 grid-rows-[minmax(0,1fr)_auto] gap-4">
            <div className="grid content-start gap-5 overflow-y-auto pr-1 [scrollbar-color:#cbd5e1_transparent] [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[#cbd5e1]">
              {bubbleSection}
              {decorationSection}
              {errorNote}
            </div>
            {/* 적용하기는 스크롤 밖에 둔다. 모바일 앱바와 같은 이유다. */}
            {applyButton}
          </div>
        </div>
      </section>
      </> : null}

      {closeConfirmOpen ? (
        <CloseConfirm
          busy={isApplying}
          onKeepEditing={() => setCloseConfirmOpen(false)}
          onDiscard={() => { setCloseConfirmOpen(false); onClose?.(); }}
          onApplyAndClose={() => void apply().then((ok) => { setCloseConfirmOpen(false); if (ok) onClose?.(); })}
        />
      ) : null}
    </>
  );
}

/**
 * 닫기 전 되묻기.
 *
 * `적용하고 나가기`를 맨 위에 둔다. 여기까지 온 사람은 대체로 적용하기를 못 찾았을 뿐이라
 * 되묻기의 기본 답이 곧 원래 하려던 일이다. 버리는 쪽은 마지막에 두고 색으로만 구분한다.
 */
function CloseConfirm({ busy, onKeepEditing, onDiscard, onApplyAndClose }: {
  busy: boolean;
  onKeepEditing: () => void;
  onDiscard: () => void;
  onApplyAndClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[95] grid place-items-center bg-slate-950/50 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="말풍선 편집 종료 확인">
      <section className="grid w-full max-w-[360px] gap-4 rounded-3xl bg-white p-5 text-slate-950 shadow-2xl">
        <div className="grid gap-1">
          <h3 className="text-lg font-black">적용하지 않은 변경 사항이 있어요</h3>
          <p className="text-sm font-medium leading-6 text-slate-500">지금 나가면 이번에 바꾼 색·모양과 올린 꾸미기 이미지가 사라져요.</p>
        </div>
        <div className="grid gap-2">
          <button type="button" disabled={busy} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-black text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50" onClick={onApplyAndClose}>
            {busy ? <LoaderCircle size={18} className="animate-spin" /> : <Sparkles size={18} />}{busy ? "만드는 중" : "적용하고 나가기"}
          </button>
          <button type="button" disabled={busy} className="min-h-12 rounded-xl border border-slate-200 px-4 text-sm font-black text-slate-700 hover:bg-slate-50 disabled:opacity-50" onClick={onKeepEditing}>계속 편집하기</button>
          <button type="button" disabled={busy} className="min-h-11 rounded-xl px-4 text-sm font-bold text-rose-600 hover:bg-rose-50 disabled:opacity-50" onClick={onDiscard}>적용하지 않고 나가기</button>
        </div>
      </section>
    </div>
  );
}

/**
 * 모바일 컨트롤 시트.
 *
 * 높이를 `dvh`로 묶어 캔버스와 자리를 나눈다 — 부모 높이를 기준으로 잡으면 캔버스는 시트가
 * 남긴 높이를, 시트는 캔버스가 남긴 높이를 서로 참조해 순환한다. 내용이 상한보다 짧으면 그만큼만
 * 차지하므로 `말풍선` 탭에서는 캔버스가 더 넓어진다.
 *
 * 손잡이는 눌러도 접히고 끌어도 접힌다. 시트를 처음 보는 사람은 누르고, 익숙한 사람은 끈다.
 */
function ControlSheet({ expanded, onExpandedChange, children }: { expanded: boolean; onExpandedChange: (expanded: boolean) => void; children: React.ReactNode }) {
  const dragStartRef = useRef<number | null>(null);
  return (
    <section className={`grid min-h-0 shrink-0 grid-rows-[auto_minmax(0,1fr)] rounded-t-2xl border-t border-slate-200 bg-white shadow-[0_-8px_24px_rgba(15,23,42,0.06)] transition-[max-height] ${expanded ? "max-h-[75%]" : "max-h-[40%]"}`}>
      <button
        type="button"
        aria-expanded={expanded}
        aria-label={expanded ? "설정 영역 줄이기" : "설정 영역 넓히기"}
        className="grid touch-none place-items-center py-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500"
        onClick={() => onExpandedChange(!expanded)}
        onPointerDown={(event) => { dragStartRef.current = event.clientY; }}
        onPointerUp={(event) => {
          const start = dragStartRef.current;
          dragStartRef.current = null;
          if (start === null) return;
          const distance = event.clientY - start;
          // 끌었다고 볼 만큼 움직였을 때만 방향을 읽는다. 그 아래는 click이 받아 토글한다.
          if (Math.abs(distance) < 12) return;
          onExpandedChange(distance < 0);
        }}
      >
        <span className="h-1 w-10 rounded-full bg-slate-300" aria-hidden="true" />
      </button>
      <div className="grid min-h-0 content-start gap-3 overflow-y-auto px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">{children}</div>
    </section>
  );
}

export function BubbleBuilderDialog({ open, onOpenChange, ...editorProps }: BubbleBuilderDialogProps) {
  const editorRef = useRef<BubbleBuilderEditorHandle>(null);
  /*
    Esc와 바깥 클릭도 ✕와 같은 길을 타게 한다. Radix는 둘 다 `onOpenChange(false)`로 알려 오는데,
    `open`이 통제 대상이라 여기서 내리지 않으면 열린 채로 남는다. 그 사이에 편집기가 되물을지
    그냥 닫을지 정한다.
  */
  return (
    <Dialog.Root open={open} onOpenChange={(next) => { if (next) onOpenChange(true); else editorRef.current?.requestClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[90] bg-slate-950/45 backdrop-blur-sm" />
        {/*
          어느 쪽이든 바깥 스크롤이 없다.

          모달이 내용에 따라 늘었다 줄면 캔버스도 같이 흔들리고, 가운데 정렬이라 모달 자체가
          위아래로 움직인다. 높이를 여기서 확정하고 안에서 넘치는 부분만 스크롤시킨다.
          `44rem` 상한은 큰 모니터에서 모달이 화면 끝까지 늘어나지 않게 하는 선이다.
        */}
        <Dialog.Content className="fixed inset-0 z-[91] overflow-hidden bg-white focus:outline-none lg:inset-x-3 lg:top-1/2 lg:mx-auto lg:inset-y-auto lg:h-[min(92dvh,44rem)] lg:min-w-0 lg:w-auto lg:max-w-4xl lg:-translate-y-1/2 lg:rounded-3xl lg:shadow-2xl">
          <BubbleBuilderEditor {...editorProps} ref={editorRef} active={open} fill onClose={() => onOpenChange(false)} />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

type PreviewDrag =
  | { kind: "move" | "resize" | "rotate"; startX: number; startY: number; deco: BubbleDecorationTransform }
  | { kind: "body"; startX: number; startY: number; bodyX: number; bodyY: number };

/** 어느 한 축이라도 범위 끝에 닿았는가. */
function atCanvasSizeLimit(canvas: { width: number; height: number }, bound: "min" | "max") {
  const limit = bubbleCanvasSizeRange[bound];
  return canvas.width === limit || canvas.height === limit;
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
  onCanvasSizeChange?: (size: { width: number; height: number }) => void;
};

function BubblePreview({ spec, variant, layers, decorationUrls, decorationSizes, selectedLayerId, onSelectLayer, onRemoveLayer, onDecorationChange, onBodyChange, onCanvasSizeChange }: BubblePreviewProps) {
  const geometry = useMemo(() => getBubbleVariantGeometry(spec.design, variant), [spec, variant]);
  /** 배율의 기준은 프레임 **상한**이다. 근거는 `getBubblePreviewFitScale` 주석에 있다. */
  const maxCanvas = { width: bubbleCanvasSizeRange.max, height: bubbleCanvasSizeRange.max };
  const [viewportSize, setViewportSize] = useState<Partial<BubblePreviewSize>>({});
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState<BubblePreviewPan>({ x: 0, y: 0 });
  const viewportRef = useRef<HTMLDivElement>(null);
  const { fitScale, scale, stageWidth, stageHeight } = getBubblePreviewLayout(geometry.canvas, maxCanvas, viewportSize, zoom);
  const stretchThickness = Math.max(2, Math.round(3 * scale));
  const stageRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<PreviewDrag | null>(null);
  const activeLayerRef = useRef<string | null>(null);
  const [bodyDragging, setBodyDragging] = useState(false);
  const frameDragRef = useRef<FrameDrag | null>(null);
  const [frameDragging, setFrameDragging] = useState(false);
  const dragging = frameDragging || bodyDragging;
  /**
   * 한계에 닿았는지 알려 준다. 숫자만 멈추면 "안 움직인다"로 읽혀서, 제한이 있다는 사실 자체를
   * 알 수 없다 — 손잡이만 남기고 슬라이더를 없앤 뒤로는 이게 유일한 통로다.
   */
  const frameLimit = atCanvasSizeLimit(geometry.canvas, "max") ? "최대" : atCanvasSizeLimit(geometry.canvas, "min") ? "최소" : undefined;

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const update = () => setViewportSize({ width: viewport.clientWidth, height: viewport.clientHeight || undefined });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, []);

  const stageSizeRef = useRef({ width: stageWidth, height: stageHeight });
  stageSizeRef.current = { width: stageWidth, height: stageHeight };
  const viewportSizeRef = useRef(viewportSize);
  viewportSizeRef.current = viewportSize;
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const panRef = useRef(pan);
  panRef.current = pan;

  /*
    보기 상태는 ref에 먼저 쓰고 state에 넘긴다.

    휠과 핀치는 한 번 그리는 사이에 여러 번 들어온다. 렌더가 갱신해 주는 값만 읽으면 그 사이의
    호출이 모두 같은 출발점을 보고 계산해서 중간 단계가 통째로 사라진다. ref를 그 자리에서
    갱신하면 이어지는 호출이 앞의 결과를 이어받는다.
  */
  const movePan = useCallback((next: BubblePreviewPan) => {
    const clamped = clampBubblePreviewPan(next, stageSizeRef.current, viewportSizeRef.current);
    panRef.current = clamped;
    setPan(clamped);
  }, []);

  /**
   * 집은 점을 제자리에 두고 배율만 바꾼다. `anchor`는 뷰포트 중심 기준 좌표다.
   *
   * `setZoom` 업데이터 **안에서** `setPan`을 부르지 않는다. 업데이터는 순수해야 하고, React는
   * 이를 여러 번 실행할 수 있다(개발 모드의 StrictMode에서는 확정적으로 두 번). 그러면 앵커
   * 보정이 두 번 적용돼 집은 지점이 갈 자리의 두 배로 밀려난다 — 측정으로 확인한 값이다.
   */
  const applyZoom = useCallback((nextZoom: number, anchor: BubblePreviewPan = { x: 0, y: 0 }) => {
    const current = zoomRef.current;
    const clamped = clampBubblePreviewZoom(nextZoom);
    if (Math.abs(clamped - current) < 0.0001) return;
    const ratio = clamped / current;
    const stage = { width: stageSizeRef.current.width * ratio, height: stageSizeRef.current.height * ratio };
    const nextPan = clampBubblePreviewPan(
      getBubblePreviewZoomPan(panRef.current, anchor, ratio),
      stage,
      viewportSizeRef.current,
    );
    zoomRef.current = clamped;
    panRef.current = nextPan;
    stageSizeRef.current = stage;
    setZoom(clamped);
    setPan(nextPan);
  }, []);

  const fitToViewport = useCallback(() => {
    zoomRef.current = 1;
    panRef.current = { x: 0, y: 0 };
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  /** 뷰포트 중심 기준으로 옮긴 포인터 좌표. 줌 앵커와 핀치 중점이 같은 공간을 쓰게 한다. */
  const viewportPoint = useCallback((clientX: number, clientY: number): BubblePreviewPan => {
    const rect = viewportRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return { x: clientX - rect.left - rect.width / 2, y: clientY - rect.top - rect.height / 2 };
  }, []);

  /*
    휠은 네이티브로 붙인다. React의 onWheel은 passive로 등록돼 preventDefault가 먹지 않아,
    Ctrl+휠 확대가 브라우저 전체 확대로 새어 나간다.
  */
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      if (event.ctrlKey || event.metaKey) {
        applyZoom(zoomRef.current * Math.exp(-event.deltaY / 240), viewportPoint(event.clientX, event.clientY));
        return;
      }
      movePan({ x: panRef.current.x - event.deltaX, y: panRef.current.y - event.deltaY });
    };
    viewport.addEventListener("wheel", handleWheel, { passive: false });
    return () => viewport.removeEventListener("wheel", handleWheel);
  }, [applyZoom, movePan, viewportPoint]);

  /*
    손가락 두 개는 확대·이동, 하나는 편집. 포인터 장부는 캡처 단계에서 적는다 — 무대 안의
    장식·본체 드래그가 전파를 멈추기 때문에, 버블 단계에서는 두 번째 손가락이 보이지 않는다.
  */
  const pointersRef = useRef(new Map<number, BubblePreviewPan>());
  const pinchRef = useRef<{ distance: number; zoom: number; center: BubblePreviewPan; pan: BubblePreviewPan } | null>(null);
  const viewportPanRef = useRef<{ x: number; y: number; pan: BubblePreviewPan; moved: boolean } | null>(null);

  const pinchState = () => {
    const points = [...pointersRef.current.values()];
    if (points.length < 2) return null;
    const [first, second] = points;
    return {
      distance: Math.max(1, Math.hypot(second.x - first.x, second.y - first.y)),
      center: viewportPoint((first.x + second.x) / 2, (first.y + second.y) / 2),
    };
  };

  const handleViewportPointerDownCapture = (event: React.PointerEvent) => {
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const pinch = pinchState();
    if (!pinch) return;
    // 두 번째 손가락이 닿으면 진행 중이던 한 손가락 편집은 취소한다. 핀치 도중 그림이 딸려간다.
    dragRef.current = null;
    activeLayerRef.current = null;
    frameDragRef.current = null;
    viewportPanRef.current = null;
    setBodyDragging(false);
    setFrameDragging(false);
    pinchRef.current = { distance: pinch.distance, zoom: zoomRef.current, center: pinch.center, pan: panRef.current };
  };

  const handleViewportPointerMoveCapture = (event: React.PointerEvent) => {
    if (!pointersRef.current.has(event.pointerId)) return;
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const pinch = pinchRef.current;
    if (!pinch) return;
    const next = pinchState();
    if (!next) return;
    const ratio = next.distance / pinch.distance;
    const nextZoom = clampBubblePreviewZoom(pinch.zoom * ratio);
    const applied = nextZoom / pinch.zoom;
    const zoomed = getBubblePreviewZoomPan(pinch.pan, pinch.center, applied);
    // 핀치 시작값(`pinch`)에서 매번 다시 계산하므로 누적 오차가 없다. ref만 따라 갱신한다.
    zoomRef.current = nextZoom;
    const nextPan = clampBubblePreviewPan(
      { x: zoomed.x + (next.center.x - pinch.center.x), y: zoomed.y + (next.center.y - pinch.center.y) },
      { width: geometry.canvas.width * fitScale * nextZoom, height: geometry.canvas.height * fitScale * nextZoom },
      viewportSizeRef.current,
    );
    panRef.current = nextPan;
    setZoom(nextZoom);
    setPan(nextPan);
  };

  const handleViewportPointerUpCapture = (event: React.PointerEvent) => {
    pointersRef.current.delete(event.pointerId);
    if (pointersRef.current.size < 2) pinchRef.current = null;
  };

  /*
    빈 자리를 끌면 화면을 밀고, 끌지 않고 떼면 선택이 풀린다.

    확대해 두면 무대가 뷰포트를 넘겨 여백이 사라지므로, 무대 안의 빈 체커보드에서도 밀 수 있어야
    한다 — 장식·본체·손잡이는 전파를 멈추므로 여기까지 올라오는 것은 빈 자리뿐이다.
    선택 해제를 pointerdown이 아니라 뗄 때로 미룬 것은, 밀려고 잡은 것까지 선택 해제로
    읽지 않기 위해서다.
  */
  const beginViewportPan = (event: React.PointerEvent) => {
    if (pinchRef.current) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    viewportPanRef.current = { x: event.clientX, y: event.clientY, pan: panRef.current, moved: false };
  };
  const moveViewportPan = (event: React.PointerEvent) => {
    const drag = viewportPanRef.current;
    if (!drag || pinchRef.current) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) < 4) return;
    drag.moved = true;
    movePan({ x: drag.pan.x + dx, y: drag.pan.y + dy });
  };
  /**
   * 두 번 두드리면 확대와 맞춤을 오간다. **손가락과 펜에서만.**
   *
   * 휠이 없고 핀치가 한 손으로 어려운 화면을 위한 통로다. 마우스에는 휠과 버튼이 이미 있는데,
   * 여기서까지 받으면 빈 자리를 두 번 클릭한 것이 배율 초기화로 읽혀 "확대가 안 된다"가 된다.
   */
  const lastTapRef = useRef<{ time: number; x: number; y: number } | null>(null);
  const endViewportPan = (event: React.PointerEvent) => {
    const drag = viewportPanRef.current;
    viewportPanRef.current = null;
    try { event.currentTarget.releasePointerCapture(event.pointerId); } catch { /* noop */ }
    if (!drag || drag.moved || pinchRef.current) return;
    if (event.pointerType === "mouse") {
      clearSelection();
      return;
    }
    const now = Date.now();
    const last = lastTapRef.current;
    if (last && now - last.time < 320 && Math.hypot(event.clientX - last.x, event.clientY - last.y) < 24) {
      lastTapRef.current = null;
      if (zoom > 1.05) fitToViewport();
      else applyZoom(2, viewportPoint(event.clientX, event.clientY));
      return;
    }
    lastTapRef.current = { time: now, x: event.clientX, y: event.clientY };
    clearSelection();
  };

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
    // 본체를 잡았다는 것은 장식에서 손을 뗐다는 뜻이고, 화면 밀기까지 같이 시작하면 안 된다.
    event.stopPropagation();
    clearSelection();
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

  const applyCanvasSize = (next: { width: number; height: number }) => onCanvasSizeChange?.({
    width: Math.round(clampNumber(next.width, bubbleCanvasSizeRange.min, bubbleCanvasSizeRange.max)),
    height: Math.round(clampNumber(next.height, bubbleCanvasSizeRange.min, bubbleCanvasSizeRange.max)),
  });
  /**
   * 잡은 손잡이가 가진 방향만 움직인다.
   *
   * 두 축을 한 값으로 묶으면 대각선으로만 커져서 원본 비율(가로:세로)을 벗어날 수 없다. 축을 나눠
   * 놓으면 모서리는 두 축을 동시에, 변 가운데 손잡이는 한 축만 바꿔서 직사각형 프레임을 만들 수 있다.
   * 프레임은 뷰포트 안에서 가운데 정렬이라 한쪽 모서리를 dx만큼 끌면 폭은 2dx 변한다.
   * `dirX`/`dirY`가 0인 변 가운데 손잡이는 그 축의 이동량이 0이 되어 저절로 한 축만 남는다.
   */
  const beginFrameDrag = (handle: FrameHandle) => (event: React.PointerEvent) => {
    if (!onCanvasSizeChange) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    frameDragRef.current = {
      handle,
      startX: event.clientX,
      startY: event.clientY,
      startWidth: geometry.canvas.width,
      startHeight: geometry.canvas.height,
    };
    setFrameDragging(true);
  };
  const moveFrameDrag = (event: React.PointerEvent) => {
    const drag = frameDragRef.current;
    if (!drag) return;
    // 화면 픽셀을 캔버스 픽셀로 되돌린다. 확대해 둔 상태에서도 손끝과 모서리가 같이 움직인다.
    const dx = ((event.clientX - drag.startX) * drag.handle.dirX) / scale;
    const dy = ((event.clientY - drag.startY) * drag.handle.dirY) / scale;
    applyCanvasSize({ width: drag.startWidth + 2 * dx, height: drag.startHeight + 2 * dy });
  };
  const endFrameDrag = (event: React.PointerEvent) => {
    frameDragRef.current = null;
    setFrameDragging(false);
    try { event.currentTarget.releasePointerCapture(event.pointerId); } catch { /* noop */ }
  };
  // 슬라이더를 없앤 대신 키보드로도 조절할 수 있게 남겨 둔다. 손잡이가 가진 축만 움직인다.
  const handleFrameKey = (handle: FrameHandle) => (event: React.KeyboardEvent) => {
    const step = event.key === "ArrowUp" || event.key === "ArrowRight" ? 4 : event.key === "ArrowDown" || event.key === "ArrowLeft" ? -4 : 0;
    if (!step) return;
    event.preventDefault();
    applyCanvasSize({
      width: geometry.canvas.width + step * Math.abs(handle.dirX),
      height: geometry.canvas.height + step * Math.abs(handle.dirY),
    });
  };

  return (
    <div className="grid h-full min-h-0 min-w-0 w-full grid-rows-[minmax(0,1fr)_auto_auto] gap-1.5">
      {/*
        뷰포트 크기는 바깥 레이아웃이 정한다(모바일은 화면을 채우고, 데스크톱은 넓은 컬럼을 채운다).
        프레임 크기가 뷰포트를 정하던 시절에는 프레임을 줄일수록 편집할 자리도 같이 줄었다.
      */}
      <div
        ref={viewportRef}
        className="relative min-h-[260px] w-full touch-none overflow-hidden rounded-xl"
        onPointerDownCapture={handleViewportPointerDownCapture}
        onPointerMoveCapture={handleViewportPointerMoveCapture}
        onPointerUpCapture={handleViewportPointerUpCapture}
        onPointerCancelCapture={handleViewportPointerUpCapture}
        onPointerDown={beginViewportPan}
        onPointerMove={moveViewportPan}
        onPointerUp={endViewportPan}
        onPointerCancel={endViewportPan}
      >
        <div className="absolute left-1/2 top-1/2" style={{ transform: `translate(-50%, -50%) translate(${pan.x}px, ${pan.y}px)`, width: stageWidth, height: stageHeight }}>
          {/* 내보내는 PNG는 모서리가 각진 사각형이라 미리보기도 각지게 둔다. 둥글리면 실제와 어긋난다. */}
          <div ref={stageRef} className="absolute inset-0 touch-none overflow-hidden" style={{ ...checkerboardStyle }} onPointerMove={handleMove} onPointerUp={endDrag}>
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
          {onCanvasSizeChange ? <FrameResizeHandles active={frameDragging} onBegin={beginFrameDrag} onMove={moveFrameDrag} onEnd={endFrameDrag} onKeyDown={handleFrameKey} /> : null}
        </div>
        <ZoomControls
          percent={Math.round(scale * 100)}
          canZoomOut={zoom > bubblePreviewZoomRange.min + 0.001}
          canZoomIn={zoom < bubblePreviewZoomRange.max - 0.001}
          onZoomOut={() => applyZoom(zoom / bubblePreviewZoomStep)}
          onZoomIn={() => applyZoom(zoom * bubblePreviewZoomStep)}
          onFit={fitToViewport}
        />
      </div>
      {/*
        크기 표시는 상시로 두고 끄는 동안만 강조한다. 세 가지를 한 줄로 해결한다 —
        끌 때의 피드백, 안 끌 때의 조회(슬라이더를 없애 다른 확인 경로가 없다),
        그리고 "이건 조절할 수 있는 값"이라는 힌트.
      */}
      <p className={`flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-center transition ${dragging ? "text-xs font-black text-slate-900" : "text-[11px] font-bold text-slate-400"}`} aria-live="polite">
        <span>프레임 {geometry.canvas.width} × {geometry.canvas.height}</span>
        {frameLimit ? <span className="rounded-full bg-amber-100 px-1.5 text-[10px] font-black text-amber-700">{frameLimit}</span> : null}
        <span aria-hidden="true" className="text-slate-300">·</span>
        <span>말풍선 {geometry.body.width} × {geometry.body.height}</span>
      </p>
      <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[10px] font-bold text-slate-500">
        <span className="flex items-center gap-1"><span className="inline-block h-2 w-3 rounded-sm border border-dashed border-slate-400/70" />프레임</span>
        <span className="flex items-center gap-1"><span className="inline-block h-2 w-3 rounded-sm border border-dashed border-emerald-600/80" />글자 영역</span>
        <span className="flex items-center gap-1"><span className="inline-block h-2 w-3 rounded-sm bg-sky-400/70" />늘어나는 구간</span>
      </div>
    </div>
  );
}

/**
 * 보기 배율 조절.
 *
 * 핀치와 Ctrl+휠만으로는 "확대할 수 있다"는 사실이 어디에도 드러나지 않고, 마우스만 쓰는
 * 사람과 키보드 사용자에게는 통로 자체가 없다. 퍼센트를 늘 띄워 두는 것은 지금 보고 있는 것이
 * 실제 크기가 아님을 알리는 유일한 표시라서다.
 */
function ZoomControls({ percent, canZoomIn, canZoomOut, onZoomIn, onZoomOut, onFit }: {
  percent: number;
  canZoomIn: boolean;
  canZoomOut: boolean;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFit: () => void;
}) {
  const button = "grid size-8 place-items-center rounded-lg text-slate-600 transition hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-35";
  return (
    /*
      이 막대는 뷰포트 **안**에 있다. 전파를 멈추지 않으면 버튼을 누른 것이 "빈 자리를 두드렸다"로도
      읽혀서 두 가지가 따라온다 — 빠르게 두 번 누르면 두 번째가 더블탭으로 잡혀 배율이 맞춤으로
      되돌아가고(확대가 안 되는 것처럼 보인다), 누를 때마다 골라 둔 장식의 선택이 풀린다.
    */
    <div
      className="pointer-events-auto absolute bottom-2 right-2 flex items-center gap-0.5 rounded-xl border border-slate-200 bg-white/95 p-1 shadow-sm backdrop-blur"
      onPointerDown={(event) => event.stopPropagation()}
    >
      <button type="button" className={button} aria-label="축소" disabled={!canZoomOut} onClick={onZoomOut}><Minus size={15} /></button>
      <span className="min-w-11 text-center text-[11px] font-black tabular-nums text-slate-500" aria-live="polite">{percent}%</span>
      <button type="button" className={button} aria-label="확대" disabled={!canZoomIn} onClick={onZoomIn}><Plus size={15} /></button>
      <button type="button" className={button} aria-label="화면에 맞추기" title="화면에 맞추기" onClick={onFit}><Maximize size={15} /></button>
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
  startWidth: number;
  startHeight: number;
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
