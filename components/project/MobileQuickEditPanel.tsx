"use client";

import { useEffect, useId, useRef, useState, type MutableRefObject } from "react";
import { ImageOff, Maximize2, Minimize2, Plus, Sliders, X } from "lucide-react";
import { MobileBubbleEditor } from "@/components/editor/MobileBubbleEditor";
import { getCandidateLayoutKind, getMobileCandidatePageCount, getMobileCandidatePageIndex, mobileCandidatePageSize } from "@/components/project/candidateLayout";
import { ThemeColorPicker } from "@/components/project/ThemeColorPicker";
import { useUploadPreviewUrls } from "@/components/project/hooks/useUploadPreviewUrls";
import {
  buildSlotCandidates,
  disabledImageCandidateId,
  getDefaultColor,
  getResolvedColor,
  getSelectedCandidate,
  getSelectedUpload,
  getSharedSlotUploadEntries,
  hasUnlinkedAutoColorSlots,
  isRemovableUploadCandidate,
  getDerivedColorLink,
  type AutoColorLinkSummary,
  type SlotCandidate,
  type SlotCandidateSelections,
  type SlotColors,
  type SlotUploads,
  type BubbleEditState,
  getCandidateAccessibleName,
} from "@/components/project/projectModel";
import type { SlotContrastWarning } from "@/components/project/slotContrast";
import type { AdminAssetCandidate } from "@/lib/theme/adminAssets";
import { supportsColorAlpha } from "@/lib/theme/project/platformColor";
import { getBackgroundSourcePair, getImageEditTarget } from "@/components/project/projectImporterHelpers";
import type { ImageEditState, ImageEditTarget } from "@/lib/theme/imageEdit";
import type { ThemeProjectFile } from "@/lib/theme/project/types";
import type { ThemeAssetSlot, ThemeTemplate, ThemeTemplateId } from "@/lib/theme/templates";
import type { BubbleGeometry, BubbleSlot, Insets, Markers, StretchPoint, ThemePlatform } from "@/lib/theme/types";
import { readableThemeForeground, setThemeColorAlpha, setThemeColorRgb, themeColorAlphaPercent, themeColorRgbHex, themeColorToCss } from "@/lib/theme/color";

type MobileQuickEditPanelProps = {
  slot?: ThemeAssetSlot;
  slots: ThemeAssetSlot[];
  file?: ThemeProjectFile;
  uploads: SlotUploads;
  colors: SlotColors;
  selections: SlotCandidateSelections;
  adminAssets: Array<AdminAssetCandidate & { previewUrl?: string }>;
  templateId: ThemeTemplateId;
  template: ThemeTemplate;
  platform: ThemePlatform;
  selectedBubbleSlot: BubbleSlot | null;
  pairedBubbleSlot?: ThemeAssetSlot;
  geometry?: BubbleGeometry;
  markers?: Markers;
  insets?: Insets;
  stretch?: StretchPoint;
  contrastWarning?: SlotContrastWarning;
  imageColorPaletteError?: string | null;
  recommendedColor?: string;
  isAutoColor: boolean;
  canApplyAutoColor: boolean;
  canApplyAutoColorToAll: boolean;
  autoColorSummary: AutoColorLinkSummary;
  fileInputRefs: MutableRefObject<Record<string, HTMLInputElement | null>>;
  onUpload: (slot: ThemeAssetSlot, files: FileList | readonly File[] | null) => void;
  onEditedUpload: (slot: ThemeAssetSlot, file: File, editState: ImageEditState, sourceFile: File, target?: ImageEditTarget) => void;
  onRemoveUpload: (slot: ThemeAssetSlot, uploadId: string) => void;
  onColorChange: (slot: ThemeAssetSlot, value: string) => void;
  /** 직접 지정을 해제해 기준 색 연동으로 되돌린다. */
  onUnlinkColor: (slot: ThemeAssetSlot) => void;
  onSelectCandidate: (slot: ThemeAssetSlot, candidateId: string) => void;
  onSelectAdminAsset: (slot: ThemeAssetSlot, asset: AdminAssetCandidate) => void;
  onApplyAutoColor: () => void;
  onApplyAutoColorToAll: () => void;
  onGeometryChange: (geometry: BubbleGeometry) => void;
  onMarkersChange: (markers: Markers) => void;
  onInsetsChange: (insets: Insets) => void;
  onStretchChange: (stretch: StretchPoint) => void;
  flipX?: boolean;
  onFlipXChange: (next: boolean) => void;
  onOpenBubbleBuilder: () => void;
  onCopyBubbleToPair: (slot: ThemeAssetSlot) => void;
  onBubblePreviewChange?: (edit: BubbleEditState) => void;
  candidateGridExpanded?: boolean;
  onToggleCandidateGrid?: () => void;
};

export function MobileQuickEditPanel(props: MobileQuickEditPanelProps) {
  const { slot, slots, file, uploads, colors, selections, adminAssets, templateId, template } = props;
  const uploadPreviewUrls = useUploadPreviewUrls(uploads);

  if (!slot) {
    return <p className="px-1 py-6 text-center text-[13px] font-medium text-[#94a3b8]">편집할 슬롯을 선택하세요.</p>;
  }

  const candidates = buildSlotCandidates(slot, uploads, colors, selections, templateId, template, slots, adminAssets, uploadPreviewUrls);
  const backgroundSourcePair = getBackgroundSourcePair(slot, slots);

  const applyCandidate = (candidate: SlotCandidate) => {
    // "기본 색상 따라가기"는 색을 정하는 게 아니라 직접 지정을 해제하는 동작이다.
    if (slot.kind === "color" && candidate.source === "palette" && candidate.colorValue) {
      props.onColorChange(slot, candidate.colorValue);
      return;
    }
    if (candidate.source === "admin" && candidate.adminAsset) {
      props.onSelectAdminAsset(slot, candidate.adminAsset);
      return;
    }
    props.onSelectCandidate(slot, candidate.id);
  };

  return (
    <div className="grid gap-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <strong className="block truncate text-[14px] font-bold text-[#0f172a]">{slot.label}</strong>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {/* 펼친 뒤에도 계속 보여야 접을 수 있다. 예전에는 펼침 상태에서 버튼이 사라져 돌아갈 길이 없었다. */}
          {slot.kind !== "color" && props.onToggleCandidateGrid ? (
            <button
              type="button"
              className="grid size-11 shrink-0 place-items-center rounded-full text-[#1d4ed8] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563eb]"
              onClick={props.onToggleCandidateGrid}
              aria-pressed={Boolean(props.candidateGridExpanded)}
              aria-label={props.candidateGridExpanded ? "후보 간단히 보기" : "후보 펼쳐 보기"}
              title={props.candidateGridExpanded ? "간단히 보기" : "펼쳐 보기"}
            >
              <span className="grid size-8 place-items-center rounded-full border border-[#bfdbfe] bg-[#eff6ff] transition hover:bg-[#dbeafe]" aria-hidden="true">
                {props.candidateGridExpanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
              </span>
            </button>
          ) : null}
          {props.contrastWarning ? (
            <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">대비 확인</span>
          ) : null}
        </div>
      </div>

      {slot.kind === "color" ? (
        backgroundSourcePair ? (
          <BackgroundSourceControls {...props} imageSlot={backgroundSourcePair.imageSlot} colorSlot={backgroundSourcePair.colorSlot} file={backgroundSourcePair.imageSlot.id === slot.id ? file : undefined} uploadPreviewUrls={uploadPreviewUrls} />
        ) : (
          <ColorControls {...props} slot={slot} candidates={candidates} />
        )
      ) : backgroundSourcePair ? (
        <BackgroundSourceControls {...props} imageSlot={backgroundSourcePair.imageSlot} colorSlot={backgroundSourcePair.colorSlot} file={file} uploadPreviewUrls={uploadPreviewUrls} />
      ) : (
        <ImageControls {...props} slot={slot} file={file} candidates={candidates} applyCandidate={applyCandidate} uploadPreviewUrls={uploadPreviewUrls} />
      )}
    </div>
  );
}

function BackgroundSourceControls({
  imageSlot,
  colorSlot,
  file,
  uploadPreviewUrls,
  ...props
}: MobileQuickEditPanelProps & {
  imageSlot: ThemeAssetSlot;
  colorSlot: ThemeAssetSlot;
  file?: ThemeProjectFile;
  uploadPreviewUrls: Record<string, string>;
}) {
  const [modeOverride, setModeOverride] = useState<"image" | "color" | null>(null);
  const imageDisabled = props.selections[imageSlot.id] === disabledImageCandidateId;
  const mode = modeOverride ?? (imageDisabled ? "color" : "image");
  const imageCandidates = buildSlotCandidates(imageSlot, props.uploads, props.colors, props.selections, props.templateId, props.template, props.slots, props.adminAssets, uploadPreviewUrls).filter((candidate) => candidate.id !== disabledImageCandidateId);
  const colorCandidates = buildSlotCandidates(colorSlot, props.uploads, props.colors, props.selections, props.templateId, props.template, props.slots, props.adminAssets, uploadPreviewUrls);

  useEffect(() => {
    setModeOverride(null);
  }, [imageSlot.id, colorSlot.id]);

  const applyImageCandidate = (candidate: SlotCandidate) => {
    setModeOverride(null);
    if (candidate.source === "admin" && candidate.adminAsset) {
      props.onSelectAdminAsset(imageSlot, candidate.adminAsset);
      return;
    }
    props.onSelectCandidate(imageSlot, candidate.id);
  };

  const selectImageMode = () => {
    setModeOverride("image");
    const selectedCandidate = imageCandidates.find((candidate) => candidate.selected);
    if (selectedCandidate) applyImageCandidate(selectedCandidate);
  };

  const selectColorMode = () => {
    setModeOverride(null);
    props.onSelectCandidate(imageSlot, disabledImageCandidateId);
  };

  return (
    <div className="grid gap-3">
      <div className="grid grid-cols-2 gap-1 rounded-2xl border border-[#dbe3ed] bg-[#f8fafc] p-1">
        <button
          type="button"
          className={`min-h-11 rounded-xl px-3 text-[13px] font-bold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563eb] ${mode === "image" ? "bg-white text-[#1d4ed8] shadow-sm ring-1 ring-[#bfdbfe]" : "text-[#64748b] hover:bg-white/80 hover:text-[#0f172a]"}`}
          aria-pressed={mode === "image"}
          onClick={selectImageMode}
        >
          이미지로 설정
        </button>
        <button
          type="button"
          className={`min-h-11 rounded-xl px-3 text-[13px] font-bold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563eb] ${mode === "color" ? "bg-white text-[#1d4ed8] shadow-sm ring-1 ring-[#bfdbfe]" : "text-[#64748b] hover:bg-white/80 hover:text-[#0f172a]"}`}
          aria-pressed={mode === "color"}
          onClick={selectColorMode}
        >
          색상으로 설정
        </button>
      </div>

      {mode === "image" ? (
        <ImageControls {...props} slot={imageSlot} file={file} candidates={imageCandidates} applyCandidate={applyImageCandidate} uploadPreviewUrls={uploadPreviewUrls} />
      ) : (
        <ColorControls {...props} slot={colorSlot} candidates={colorCandidates} />
      )}
    </div>
  );
}

function ColorControls({
  slot,
  colors,
  selections,
  templateId,
  template,
  platform,
  slots,
  candidates,
  contrastWarning,
  imageColorPaletteError,
  recommendedColor,
  isAutoColor,
  canApplyAutoColor,
  canApplyAutoColorToAll,
  autoColorSummary,
  onColorChange,
  onUnlinkColor,
  onApplyAutoColor,
  onApplyAutoColorToAll,
  candidateGridExpanded = false,
}: MobileQuickEditPanelProps & { slot: ThemeAssetSlot; candidates: SlotCandidate[] }) {
  // 연동 중이면 기준 색에서 파생된 실제 값이 나와야 한다. 파생 슬롯 자기 기본값을 보여 주면
  // 프리뷰·내보내기와 어긋나고, 그 값에서 편집을 시작하는 순간 연동이 끊긴다.
  const value = getResolvedColor(slot, colors, selections, templateId, template, slots) ?? getDefaultColor(slot, templateId, template);
  const hex = themeColorRgbHex(value);
  const alpha = themeColorAlphaPercent(value);
  // iOS CSS는 색상 코드에 알파를 담지 못한다. 표현할 자리가 없는 슬롯에 슬라이더를 보여 주면
  // 사용자가 조작한 투명도가 내보내기에서 조용히 사라진다.
  const alphaSupported = supportsColorAlpha(slot.role, platform);
  const swatchCandidates = candidates
    .filter((candidate) => candidate.colorValue)
    .sort((left, right) => Number(right.source === "default") - Number(left.source === "default"));
  // 기준 슬롯 연동. 배경 파생 슬롯의 자동 맞춤 버튼과 같은 개념이라 같은 UI로 그린다.
  const derivedLink = getDerivedColorLink(slot, colors, selections, templateId, template, slots);
  const colorInputId = useId();

  return (
    <div className="grid gap-3">
      <div className="flex items-center gap-2">
        <ThemeColorPicker value={value} label={slot.label} onChange={(nextValue) => onColorChange(slot, nextValue)}>
          <button
            id={colorInputId}
            type="button"
            aria-label={`${slot.label} 색상 선택 열기`}
            className="relative size-11 shrink-0 overflow-hidden rounded-xl border border-black/10 shadow-sm ring-offset-2 transition hover:ring-2 hover:ring-[#bfdbfe] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563eb] active:scale-95"
          >
            <span className="absolute inset-0" style={{ backgroundColor: themeColorToCss(value) }} aria-hidden="true" />
          </button>
        </ThemeColorPicker>
        <label className="sr-only" htmlFor={`mqe-hex-${slot.id}`}>색상 코드</label>
        <input
          id={`mqe-hex-${slot.id}`}
          type="text"
          value={hex}
          inputMode="text"
          spellCheck={false}
          className="min-w-0 flex-1 rounded-xl border border-[#d1d5db] bg-white px-3 py-2.5 font-mono text-sm font-semibold text-[#0f172a] focus-visible:outline-2 focus-visible:outline-[#2563eb]"
          onChange={(event) => onColorChange(slot, setThemeColorRgb(value, event.currentTarget.value))}
        />
      </div>

      {alphaSupported ? <div className="flex items-center gap-2">
        <span className="w-12 shrink-0 text-[11px] font-bold text-[#64748b]">투명도</span>
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={alpha}
          className="min-w-0 flex-1 accent-[#2563eb]"
          onChange={(event) => onColorChange(slot, setThemeColorAlpha(value, Number(event.currentTarget.value)))}
          aria-label="투명도"
        />
        <span className="w-9 shrink-0 text-right text-[11px] font-bold text-[#334155]">{Math.round(alpha)}%</span>
      </div> : null}

      {swatchCandidates.length > 0 ? (
        <div className={candidateGridExpanded ? "grid grid-cols-6 gap-2 min-[430px]:grid-cols-8" : "flex gap-2 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"}>
          {swatchCandidates.map((candidate) => (
            <button
              key={candidate.id}
              type="button"
              aria-label={candidate.title}
              aria-pressed={candidate.selected}
              className={`size-9 shrink-0 rounded-lg border shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563eb] ${candidate.selected ? "border-[#2563eb] ring-2 ring-[#93c5fd]" : "border-black/10"}`}
              style={{ backgroundColor: themeColorToCss(candidate.colorValue ?? "#ffffff") }}
              onClick={() => (candidate.colorValue ? onColorChange(slot, candidate.colorValue) : undefined)}
            />
          ))}
        </div>
      ) : null}

      {imageColorPaletteError && !recommendedColor ? <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-semibold leading-5 text-amber-900" role="status">{imageColorPaletteError}</p> : null}

      {derivedLink ? (
        // 데스크톱 카드는 기준 슬롯 이름과 계산 방식을 함께 보여 준다. 버튼 문구만 있으면
        // 무엇을 기준으로 맞추는지 알 수 없어 같은 설명을 캡션으로 붙인다.
        <div className="grid gap-1">
          <button
            type="button"
            className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-[#bfdbfe] bg-[#eff6ff] px-3 text-[13px] font-bold text-[#1d4ed8] transition hover:bg-[#dbeafe] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563eb] disabled:cursor-not-allowed disabled:opacity-45"
            disabled={derivedLink.linked}
            onClick={() => onUnlinkColor(slot)}
          >
            <Sliders size={15} strokeWidth={2.2} aria-hidden="true" />
            {derivedLink.linked ? "자동 색상 적용됨" : "추천 색상 자동 적용"}
            {derivedLink.color ? <span className="ml-1 border rounded size-4 border-black/10" style={{ backgroundColor: themeColorToCss(derivedLink.color) }} aria-hidden="true" /> : null}
          </button>
          <p className="px-1 text-[11px] font-medium leading-4 text-[#64748b]">{derivedLink.description}</p>
        </div>
      ) : null}

      {canApplyAutoColor ? (
        <button
          type="button"
          className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-[#bfdbfe] bg-[#eff6ff] px-3 text-[13px] font-bold text-[#1d4ed8] transition hover:bg-[#dbeafe] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563eb]"
          onClick={onApplyAutoColor}
        >
          <Sliders size={15} strokeWidth={2.2} aria-hidden="true" />
          {isAutoColor ? "자동 색상 적용됨" : "추천 색상 자동 적용"}
          {recommendedColor ? <span className="ml-1 border rounded size-4 border-black/10" style={{ backgroundColor: themeColorToCss(recommendedColor) }} aria-hidden="true" /> : null}
        </button>
      ) : null}

      {canApplyAutoColorToAll ? (
        <div className="grid gap-1">
          <button
            type="button"
            className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-[#bfdbfe] bg-white px-3 text-[13px] font-bold text-[#1d4ed8] transition hover:bg-[#eff6ff] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563eb] disabled:cursor-not-allowed disabled:opacity-45"
            disabled={!hasUnlinkedAutoColorSlots(autoColorSummary)}
            onClick={onApplyAutoColorToAll}
          >
            <Sliders size={15} strokeWidth={2.2} aria-hidden="true" />
            {hasUnlinkedAutoColorSlots(autoColorSummary) ? "끊긴 연동 모두 다시 잇기" : "모두 연동됨"}
          </button>
          {autoColorSummary.total > 0 ? (
            <p className="px-1 text-center text-[11px] font-medium leading-4 text-[#64748b]">
              배경 자동 연동 <span className="font-bold text-[#1d4ed8]">{autoColorSummary.linked}/{autoColorSummary.total}</span>개
            </p>
          ) : null}
        </div>
      ) : null}

      {contrastWarning ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2">
          <p className="text-[11px] font-semibold leading-5 text-amber-900">{contrastWarning.message} 현재 {contrastWarning.ratio.toFixed(1)}:1 / 권장 {contrastWarning.minimumRatio}:1 이상</p>
          <button type="button" className="rounded-lg bg-white px-2.5 py-1.5 text-[11px] font-bold text-amber-900 shadow-sm" onClick={() => onColorChange(slot, readableThemeForeground(contrastWarning.background, contrastWarning.minimumRatio))}>대비 맞춤</button>
        </div>
      ) : null}
    </div>
  );
}

function ImageControls({
  slot,
  slots,
  uploads,
  candidates,
  applyCandidate,
  uploadPreviewUrls,
  fileInputRefs,
  onUpload,
  onEditedUpload,
  onRemoveUpload,
  platform,
  selectedBubbleSlot,
  geometry,
  markers,
  insets,
  stretch,
  onGeometryChange,
  onMarkersChange,
  onInsetsChange,
  onStretchChange,
  flipX,
  onFlipXChange,
  onOpenBubbleBuilder,
  pairedBubbleSlot,
  onCopyBubbleToPair,
  onBubblePreviewChange,
  file,
  selections,
  templateId,
  template,
  candidateGridExpanded = false,
}: MobileQuickEditPanelProps & {
  slot: ThemeAssetSlot;
  candidates: SlotCandidate[];
  applyCandidate: (candidate: SlotCandidate) => void;
  uploadPreviewUrls: Record<string, string>;
}) {
  // 공유 풀이라 다른 말풍선 슬롯이 owner인 업로드도 여기에 들어온다. 실제 삭제 가능 여부는
  // 후보의 ownerSlotId와 역참조로 판정하므로 이 집합은 "지울 수 있는 종류인가"만 본다.
  //
  // `template`도 포함한다. 저장된 시스템 템플릿을 열면 그때 올린 에셋이 원격 ref에서
  // hydrate되어 `source: "template"`으로 돌아오는데, 이걸 빼면 관리자가 방금 자기가 올린
  // 에셋을 지울 수 없다. admin 에셋은 공용 라이브러리라 여기서 다루지 않는다.
  const removableUploadIds = new Set(
    getSharedSlotUploadEntries(slot, uploads, slots)
      .filter(({ entry }) => (entry.source ?? "user") !== "admin")
      .map(({ entry }) => entry.id),
  );
  const selectedCandidate = getSelectedCandidate(slot, selections, templateId, template);
  const selectedUploadEntry = getSelectedUpload(slot, uploads, selections, slots);
  const selectedPickerCandidate = candidates.find((candidate) => candidate.selected);
  const directEditableSourceFile = selectedUploadEntry?.imageEdit?.originalFile ?? selectedUploadEntry?.file ?? file?.file ?? null;
  const editableSourceUrl = !directEditableSourceFile ? file?.sourceUrl ?? selectedCandidate?.assetUrl ?? selectedPickerCandidate?.previewUrl ?? selectedCandidate?.previewUrl : undefined;
  const imageEditTarget = selectedUploadEntry?.imageEdit?.target ?? getImageEditTarget(selectedCandidate);
  const layoutKind = getCandidateLayoutKind(slot);
  const expandedCollectionClassName = layoutKind === "wallpaper"
    ? "grid grid-cols-3 gap-2 min-[430px]:grid-cols-4"
    : "grid grid-cols-4 gap-2 min-[430px]:grid-cols-5";
  const compactCardClassName = layoutKind === "wallpaper" ? "w-[68px] shrink-0" : "w-[84px] shrink-0";
  const previewAspectClassName = layoutKind === "wallpaper" ? "aspect-[1/2]" : "aspect-square";
  const orderedCandidates = [...candidates].sort((left, right) => Number(right.source === "default") - Number(left.source === "default"));
  /**
   * 말풍선만 가로 페이지, 나머지는 세로 그리드.
   *
   * 다른 슬롯은 이미지를 고르면 끝이라 훑어보기 좋은 세로 스크롤이 맞다. 말풍선은 고른 뒤
   * **아래에서 편집(9-slice·반전)까지 이어진다.** 목록이 세로로 길어지면 고를 때마다 편집 영역이
   * 화면 밖으로 밀려나므로, 높이를 고정한 페이지에서 옆으로 넘겨 고르고 바로 아래에서 편집한다.
   *
   * 그래서 이 분기는 "말풍선 그룹인가"가 아니라 **"아래에 편집 UI가 붙는가"** 를 뜻한다.
   */
  const usePagedCandidateGrid = candidateGridExpanded && slot.editableInBubbleEditor;
  const candidatePagerItems: Array<{ kind: "upload" } | { kind: "candidate"; candidate: SlotCandidate }> = [
    { kind: "upload" },
    ...orderedCandidates.map((candidate) => ({ kind: "candidate" as const, candidate })),
  ];
  const candidatePageCount = getMobileCandidatePageCount(candidatePagerItems.length);
  const candidatePages = Array.from({ length: candidatePageCount }, (_, pageIndex) =>
    candidatePagerItems.slice(pageIndex * mobileCandidatePageSize, (pageIndex + 1) * mobileCandidatePageSize),
  );
  const selectedPagerItemIndex = Math.max(0, orderedCandidates.findIndex((candidate) => candidate.id === selectedPickerCandidate?.id) + 1);
  const [candidatePage, setCandidatePage] = useState(0);
  const candidatePagerRef = useRef<HTMLDivElement | null>(null);
  const requestCandidate = (candidate: SlotCandidate) => {
    if (candidate.inherited || candidate.id === selectedPickerCandidate?.id) return;
    applyCandidate(candidate);
  };

  useEffect(() => {
    if (!usePagedCandidateGrid) return;
    const nextPage = Math.min(candidatePageCount - 1, getMobileCandidatePageIndex(selectedPagerItemIndex));
    setCandidatePage(nextPage);
    const frame = window.requestAnimationFrame(() => {
      const pager = candidatePagerRef.current;
      if (pager) pager.scrollTo({ left: pager.clientWidth * nextPage, behavior: "auto" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [candidatePageCount, selectedPagerItemIndex, slot.id, usePagedCandidateGrid]);

  const renderUploadTile = (expanded: boolean) => (
    <button
      key="candidate-upload"
      type="button"
      className={`grid min-w-0 place-items-center gap-1 rounded-xl border border-dashed border-[#bfdbfe] bg-[#eff6ff] p-1.5 text-center text-[#1d4ed8] transition hover:bg-[#dbeafe] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563eb] ${expanded ? "h-full grid-rows-[minmax(0,1fr)_auto]" : compactCardClassName}`}
      onClick={() => fileInputRefs.current[slot.id]?.click()}
    >
      <span className={`grid w-full place-items-center rounded-lg bg-white/80 ${previewAspectClassName}`}>
        <Plus size={20} strokeWidth={2.4} aria-hidden="true" />
      </span>
      <span className="truncate text-[10px] font-bold">업로드</span>
    </button>
  );

  const renderCandidateTile = (candidate: SlotCandidate, expanded: boolean) => {
    // 타일은 축소본을 우선한다. 원본은 편집기를 열 때만 받는다(`editableSourceUrl`).
    const preview = candidate.thumbnailUrl ?? candidate.previewUrl ?? (candidate.id.startsWith(slot.id) ? uploadPreviewUrls[candidate.id] : undefined);
    const removable = isRemovableUploadCandidate(candidate) && removableUploadIds.has(candidate.id);
    return (
      <div key={candidate.id} className={`relative min-w-0 ${expanded ? "h-full" : compactCardClassName}`}>
        <button
          type="button"
          aria-pressed={candidate.selected}
          aria-disabled={candidate.inherited}
          aria-label={getCandidateAccessibleName(candidate)}
          title={getCandidateAccessibleName(candidate)}
          className={`grid w-full gap-1 rounded-xl border p-1.5 text-center transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563eb] ${expanded ? "h-full grid-rows-[minmax(0,1fr)_auto]" : ""} ${candidate.selected ? "border-[#60a5fa] bg-[#eff6ff]" : "border-[#e5e7eb] bg-white"}`}
          onClick={() => {
            if (candidate.inherited) return;
            requestCandidate(candidate);
          }}
        >
          <span className={`grid place-items-center overflow-hidden rounded-lg bg-[#f8fafc] ${previewAspectClassName}`}>
            {preview ? (
              <span className={`block h-full w-full bg-center bg-no-repeat ${layoutKind === "wallpaper" ? "bg-cover" : "bg-contain"}`} style={{ backgroundImage: `url(${preview})` }} />
            ) : (
              <ImageOff size={16} className="text-[#94a3b8]" aria-hidden="true" />
            )}
          </span>
          <span className="truncate text-center text-[10px] font-semibold text-[#334155]">{candidate.title}</span>
        </button>
        {removable ? (
          <button
            type="button"
            aria-label={`${getCandidateAccessibleName(candidate)} 삭제`}
            className="absolute right-0.5 top-0.5 z-10 grid size-5 place-items-center rounded-full bg-[#ef4444] text-white shadow-sm ring-2 ring-white transition hover:bg-[#dc2626] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ef4444]"
            onClick={() => onRemoveUpload(slot, candidate.id)}
          >
            <X size={12} strokeWidth={2.5} aria-hidden="true" />
          </button>
        ) : null}
      </div>
    );
  };

  return (
    <div className="grid gap-3">
      {usePagedCandidateGrid ? (
        <div className="grid gap-2">
          <div
            ref={candidatePagerRef}
            className="flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            aria-label="말풍선 후보 페이지"
            onScroll={(event) => {
              const width = event.currentTarget.clientWidth;
              if (!width) return;
              const nextPage = Math.max(0, Math.min(candidatePageCount - 1, Math.round(event.currentTarget.scrollLeft / width)));
              setCandidatePage((current) => current === nextPage ? current : nextPage);
            }}
          >
            {candidatePages.map((pageItems, pageIndex) => (
              <div key={`candidate-page-${pageIndex}`} role="group" aria-label={`${pageIndex + 1}/${candidatePageCount} 페이지`} className="grid w-full shrink-0 snap-start grid-cols-4 auto-rows-[100px] gap-2 min-[430px]:auto-rows-[112px]">
                {pageItems.map((item) => item.kind === "upload" ? renderUploadTile(true) : renderCandidateTile(item.candidate, true))}
                {Array.from({ length: mobileCandidatePageSize - pageItems.length }, (_, emptyIndex) => (
                  <span key={`candidate-page-${pageIndex}-empty-${emptyIndex}`} aria-hidden="true" />
                ))}
              </div>
            ))}
          </div>
          {candidatePageCount > 1 ? (
            <div className="flex items-center justify-center gap-1.5" role="status" aria-live="polite" aria-label={`후보 ${candidatePage + 1}/${candidatePageCount} 페이지`}>
              {Array.from({ length: candidatePageCount }, (_, pageIndex) => (
                <span key={`candidate-page-indicator-${pageIndex}`} className={`rounded-full transition ${candidatePage === pageIndex ? "size-2 bg-[#2563eb]" : "size-1.5 bg-[#cbd5e1]"}`} aria-hidden="true" />
              ))}
              <span className="sr-only">후보 {candidatePage + 1}/{candidatePageCount} 페이지</span>
            </div>
          ) : null}
        </div>
      ) : (
        <div className={candidateGridExpanded ? expandedCollectionClassName : "flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"}>
          {renderUploadTile(candidateGridExpanded)}
          {orderedCandidates.map((candidate) => renderCandidateTile(candidate, candidateGridExpanded))}
        </div>
      )}

      <input
        ref={(node) => {
          fileInputRefs.current[slot.id] = node;
        }}
        className="hidden"
        type="file"
        accept="image/png,image/jpeg,image/webp"
        onChange={(event) => onUpload(slot, event.currentTarget.files)}
      />

      {slot.editableInBubbleEditor ? (
        <>
        <button type="button" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[#cfe0ff] bg-[#f7fbff] px-4 text-[13px] font-bold text-[#2f6bbf] transition hover:bg-[#eef5ff] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563eb]" onClick={onOpenBubbleBuilder}>
          <Sliders size={17} aria-hidden="true" />나만의 말풍선 만들기
        </button>
        {pairedBubbleSlot ? <button type="button" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[#bfdbfe] bg-[#eff6ff] px-4 text-[13px] font-black text-[#1d4ed8] transition hover:bg-[#dbeafe]" onClick={() => onCopyBubbleToPair(slot)}>
          같은 말풍선 적용
        </button> : null}
        {selectedBubbleSlot ? <MobileBubbleEditor
          slot={slot}
          bubbleSlot={selectedBubbleSlot}
          platform={platform}
          sourceFile={directEditableSourceFile}
          sourceUrl={editableSourceUrl}
          initialImageState={selectedUploadEntry?.imageEdit?.state}
          target={imageEditTarget}
          geometry={geometry}
          markers={markers}
          insets={insets}
          stretch={stretch}
          flipX={flipX}
          onFlipXChange={onFlipXChange}
          onApply={({ editedFile, sourceFile, imageState, target, geometry, markers, insets, stretch }) => {
            if (editedFile) onEditedUpload(slot, editedFile, imageState, sourceFile, target);
            onGeometryChange(geometry);
            onMarkersChange(markers);
            onInsetsChange(insets);
            onStretchChange(stretch);
          }}
          onPreviewChange={onBubblePreviewChange}
        /> : null}
        </>
      ) : null}
    </div>
  );
}
