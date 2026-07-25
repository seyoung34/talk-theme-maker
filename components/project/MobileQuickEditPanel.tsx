"use client";

import { useEffect, useId, useState, type MutableRefObject } from "react";
import { Edit3, ImageOff, Plus, RefreshCw, Sliders, X } from "lucide-react";
import InlineBubbleAdjuster from "@/components/editor/InlineBubbleAdjuster";
import { ImageEditDialog } from "@/components/image-editor/ImageEditDialog";
import { ThemeColorPicker } from "@/components/project/ThemeColorPicker";
import { useUploadPreviewUrls } from "@/components/project/hooks/useUploadPreviewUrls";
import {
  buildSlotCandidates,
  disabledImageCandidateId,
  getDefaultColor,
  getSelectedCandidate,
  getSelectedUpload,
  getSlotUploadEntries,
  slotStatusLabel,
  type SlotCandidate,
  type SlotCandidateSelections,
  type SlotColors,
  type SlotUploads,
} from "@/components/project/projectModel";
import type { SlotContrastWarning } from "@/components/project/slotContrast";
import type { AdminAssetCandidate } from "@/lib/theme/adminAssets";
import type { ImageEditState, ImageEditTarget } from "@/lib/theme/imageEdit";
import { getImageColorFallbackRole } from "@/lib/theme/project/state";
import type { ThemeProjectFile } from "@/lib/theme/project/types";
import type { ThemeAssetSlot, ThemeTemplate, ThemeTemplateId } from "@/lib/theme/templates";
import type { BubbleSlot, Insets, Markers, StretchPoint, ThemePlatform } from "@/lib/theme/types";
import { setThemeColorAlpha, setThemeColorRgb, themeColorAlphaPercent, themeColorRgbHex, themeColorToCss } from "@/lib/theme/color";

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
  markers?: Markers;
  insets?: Insets;
  stretch?: StretchPoint;
  contrastWarning?: SlotContrastWarning;
  recommendedColor?: string;
  isAutoColor: boolean;
  canApplyAutoColor: boolean;
  fileInputRefs: MutableRefObject<Record<string, HTMLInputElement | null>>;
  onUpload: (slot: ThemeAssetSlot, files: FileList | readonly File[] | null) => void;
  onEditedUpload: (slot: ThemeAssetSlot, file: File, editState: ImageEditState, sourceFile: File, target?: ImageEditTarget) => void;
  onRemoveUpload: (slot: ThemeAssetSlot, uploadId: string) => void;
  onColorChange: (slot: ThemeAssetSlot, value: string) => void;
  onSelectCandidate: (slot: ThemeAssetSlot, candidateId: string) => void;
  onSelectAdminAsset: (slot: ThemeAssetSlot, asset: AdminAssetCandidate) => void;
  onApplyAutoColor: () => void;
  onMarkersChange: (markers: Markers) => void;
  onInsetsChange: (insets: Insets) => void;
  onStretchChange: (stretch: StretchPoint) => void;
  onPullSheet: () => void;
  onOpenBubbleBuilder: () => void;
  onCopyBubbleToPair: (slot: ThemeAssetSlot) => void;
  onBubbleFlip: (slot: ThemeAssetSlot, width: number) => void;
};

export function MobileQuickEditPanel(props: MobileQuickEditPanelProps) {
  const { slot, slots, file, uploads, colors, selections, adminAssets, templateId, template } = props;
  const uploadPreviewUrls = useUploadPreviewUrls(uploads);

  if (!slot) {
    return <p className="px-1 py-6 text-center text-[13px] font-medium text-[#94a3b8]">편집할 슬롯을 선택하세요.</p>;
  }

  const status = slotStatusLabel(slot, uploads, colors, selections, templateId, template, slots);
  const candidates = buildSlotCandidates(slot, uploads, colors, selections, templateId, template, slots, adminAssets, uploadPreviewUrls);
  const backgroundSourcePair = getBackgroundSourcePair(slot, slots);
  const displayStatus = backgroundSourcePair
    ? selections[backgroundSourcePair.imageSlot.id] === disabledImageCandidateId
      ? `색상 사용 중 · ${backgroundSourcePair.colorSlot.label}`
      : `이미지 우선 적용 중 · ${backgroundSourcePair.imageSlot.label}`
    : status;

  const applyCandidate = (candidate: SlotCandidate) => {
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
          <span className="mt-0.5 block truncate text-[12px] font-medium text-[#64748b]">{displayStatus}</span>
        </div>
        {props.contrastWarning ? (
          <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">대비 확인</span>
        ) : null}
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
  candidates,
  recommendedColor,
  isAutoColor,
  canApplyAutoColor,
  onColorChange,
  onApplyAutoColor,
}: MobileQuickEditPanelProps & { slot: ThemeAssetSlot; candidates: SlotCandidate[] }) {
  const value = colors[slot.id] ?? getSelectedCandidate(slot, selections, templateId, template)?.colorValue ?? getDefaultColor(slot, templateId, template);
  const hex = themeColorRgbHex(value);
  const alpha = themeColorAlphaPercent(value);
  const swatchCandidates = candidates.filter((candidate) => candidate.colorValue);
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

      <div className="flex items-center gap-2">
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
      </div>

      {swatchCandidates.length > 0 ? (
        <div className="flex gap-2 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
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
    </div>
  );
}

function ImageControls({
  slot,
  uploads,
  adminAssets,
  candidates,
  applyCandidate,
  uploadPreviewUrls,
  fileInputRefs,
  onUpload,
  onEditedUpload,
  onRemoveUpload,
  platform,
  selectedBubbleSlot,
  markers,
  insets,
  stretch,
  onMarkersChange,
  onInsetsChange,
  onStretchChange,
  onPullSheet,
  onOpenBubbleBuilder,
  pairedBubbleSlot,
  onCopyBubbleToPair,
  onBubbleFlip,
  file,
  selections,
  templateId,
  template,
}: MobileQuickEditPanelProps & {
  slot: ThemeAssetSlot;
  candidates: SlotCandidate[];
  applyCandidate: (candidate: SlotCandidate) => void;
  uploadPreviewUrls: Record<string, string>;
}) {
  const adminAssetIds = new Set(adminAssets.map((asset) => asset.id));
  const userUploadIds = new Set(getSlotUploadEntries(slot, uploads).filter((entry) => (entry.source ?? "user") === "user" && !adminAssetIds.has(entry.id)).map((entry) => entry.id));
  const hasImage = Boolean(file?.file || file?.sourceUrl);
  const [bubbleEditorOpen, setBubbleEditorOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [preparedEditSourceFile, setPreparedEditSourceFile] = useState<File | null>(null);
  const [isPreparingEditSource, setIsPreparingEditSource] = useState(false);
  const [editSourceError, setEditSourceError] = useState<string | null>(null);
  const selectedCandidate = getSelectedCandidate(slot, selections, templateId, template);
  const selectedUploadEntry = getSelectedUpload(slot, uploads, selections);
  const selectedPickerCandidate = candidates.find((candidate) => candidate.selected);
  const directEditableSourceFile = selectedUploadEntry?.imageEdit?.originalFile ?? selectedUploadEntry?.file ?? file?.file ?? null;
  const editableSourceUrl = !directEditableSourceFile ? file?.sourceUrl ?? selectedPickerCandidate?.previewUrl ?? selectedCandidate?.previewUrl ?? selectedCandidate?.assetUrl : undefined;
  const editableSourceFile = preparedEditSourceFile ?? directEditableSourceFile;
  const canOpenImageEditor = Boolean(directEditableSourceFile || editableSourceUrl);
  const imageEditTarget = selectedUploadEntry?.imageEdit?.target ?? getImageEditTarget(selectedCandidate);

  useEffect(() => {
    setBubbleEditorOpen(false);
  }, [slot.id]);

  const canAdjustBubble = Boolean(slot.editableInBubbleEditor && selectedBubbleSlot);

  const openImageEditor = async () => {
    if (!canOpenImageEditor) return;
    setEditSourceError(null);
    if (directEditableSourceFile) {
      setPreparedEditSourceFile(null);
      setEditDialogOpen(true);
      return;
    }
    if (!editableSourceUrl) return;
    try {
      setIsPreparingEditSource(true);
      setPreparedEditSourceFile(await imageUrlToEditableFile(editableSourceUrl, slot.fileName ?? `${slot.id}.png`));
      setEditDialogOpen(true);
    } catch (error) {
      console.error(error);
      setEditSourceError("현재 이미지를 편집용으로 불러오지 못했습니다. 직접 업로드한 뒤 다시 편집해 주세요.");
    } finally {
      setIsPreparingEditSource(false);
    }
  };

  return (
    <div className="grid gap-3">
      <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <button
          type="button"
          className="grid w-[76px] shrink-0 place-items-center gap-1 rounded-xl border border-dashed border-[#bfdbfe] bg-[#eff6ff] p-1.5 text-center text-[#1d4ed8] transition hover:bg-[#dbeafe] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563eb]"
          onClick={() => fileInputRefs.current[slot.id]?.click()}
        >
          <span className="grid aspect-square w-full place-items-center rounded-lg border border-[#bfdbfe] bg-white">
            <Plus size={20} strokeWidth={2.4} aria-hidden="true" />
          </span>
          <span className="truncate text-[10px] font-bold">업로드</span>
        </button>
        {candidates.map((candidate) => {
          const preview = candidate.previewUrl ?? (candidate.id.startsWith(slot.id) ? uploadPreviewUrls[candidate.id] : undefined);
          const removable = candidate.source === "upload" && userUploadIds.has(candidate.id);
          return (
            <div key={candidate.id} className="relative w-[76px] shrink-0">
              <button
                type="button"
                aria-pressed={candidate.selected}
                aria-disabled={candidate.inherited}
                className={`grid w-full gap-1 rounded-xl border p-1.5 text-left transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563eb] ${candidate.selected ? "border-[#60a5fa] bg-[#eff6ff]" : "border-[#e5e7eb] bg-white"}`}
                onClick={() => {
                  if (candidate.inherited) return;
                  applyCandidate(candidate);
                }}
              >
                <span className="grid aspect-square place-items-center overflow-hidden rounded-lg border border-[#e5e7eb] bg-[#f8fafc]">
                  {preview ? (
                    <span className="block w-full h-full bg-white bg-center bg-no-repeat bg-contain" style={{ backgroundImage: `url(${preview})` }} />
                  ) : (
                    <ImageOff size={16} className="text-[#94a3b8]" aria-hidden="true" />
                  )}
                </span>
                <span className="truncate text-[10px] font-semibold text-[#334155]">{candidate.title}</span>
              </button>
              {removable ? (
                <button
                  type="button"
                  aria-label={`${candidate.title} 삭제`}
                  className="absolute right-0.5 top-0.5 z-10 grid size-5 place-items-center rounded-full bg-[#ef4444] text-white shadow-sm ring-2 ring-white transition hover:bg-[#dc2626] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ef4444]"
                  onClick={() => onRemoveUpload(slot, candidate.id)}
                >
                  <X size={12} strokeWidth={2.5} aria-hidden="true" />
                </button>
              ) : null}
            </div>
          );
        })}
      </div>

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
        <button type="button" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 text-[13px] font-black text-white shadow-sm hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600" onClick={onOpenBubbleBuilder}>
          <Sliders size={17} aria-hidden="true" />나만의 말풍선 만들기
        </button>
        <button type="button" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[#d1d5db] bg-white px-4 text-[13px] font-black text-[#334155] transition enabled:hover:border-[#bfdbfe] enabled:hover:bg-[#eff6ff] enabled:hover:text-[#1d4ed8] disabled:cursor-not-allowed disabled:opacity-45" disabled={!canOpenImageEditor || isPreparingEditSource} onClick={() => void openImageEditor()}>
          {isPreparingEditSource ? <RefreshCw size={16} className="animate-spin" aria-hidden="true" /> : <Edit3 size={16} aria-hidden="true" />}
          {isPreparingEditSource ? "편집 준비 중" : "현재 이미지 편집"}
        </button>
        {pairedBubbleSlot ? <button type="button" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[#bfdbfe] bg-[#eff6ff] px-4 text-[13px] font-black text-[#1d4ed8] transition hover:bg-[#dbeafe]" onClick={() => onCopyBubbleToPair(slot)}>
          {pairedBubbleSlot.label}에 같은 말풍선 적용
        </button> : null}
        <details
          className="group rounded-xl border border-[#dbe3ed] bg-[#f8fafc]"
          open={bubbleEditorOpen}
          onToggle={(event) => {
            const next = event.currentTarget.open;
            if (next && (!hasImage || !canAdjustBubble)) {
              event.currentTarget.open = false;
              setBubbleEditorOpen(false);
              return;
            }
            setBubbleEditorOpen(next);
            if (next) onPullSheet();
          }}
        >
          <summary
            className={`flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 px-3 text-[13px] font-bold marker:hidden focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563eb] [&::-webkit-details-marker]:hidden ${hasImage && canAdjustBubble ? "text-[#1d4ed8]" : "text-[#94a3b8]"}`}
            aria-disabled={!hasImage || !canAdjustBubble}
          >
            <span>말풍선 편집하기</span>
            <span className="text-[11px] font-bold text-[#94a3b8] transition group-open:rotate-180" aria-hidden="true">⌄</span>
          </summary>
          {bubbleEditorOpen && selectedBubbleSlot ? (
            <div className="border-t border-[#dbe3ed] p-2">
          <InlineBubbleAdjuster
            file={file}
            slot={selectedBubbleSlot}
            platform={platform}
            markers={markers}
            insets={insets}
            stretch={stretch}
            onMarkersChange={onMarkersChange}
            onInsetsChange={onInsetsChange}
            onStretchChange={onStretchChange}
          />
            </div>
          ) : null}
        </details>
        {editSourceError ? <p className="rounded-xl border border-[#fecaca] bg-[#fff1f2] px-3 py-2 text-xs font-bold leading-5 text-[#be123c]" role="alert">{editSourceError}</p> : null}
        </>
      ) : null}
      <ImageEditDialog
        open={editDialogOpen}
        sourceFile={editableSourceFile}
        slotLabel={slot.label}
        initialState={selectedUploadEntry?.imageEdit?.state}
        target={imageEditTarget}
        preserveNinePatchBorder={slot.editableInBubbleEditor && platform === "android"}
        onOpenChange={(open) => {
          setEditDialogOpen(open);
          if (!open) {
            setPreparedEditSourceFile(null);
            setEditSourceError(null);
          }
        }}
        onApply={(editedFile, editState, outputSize) => {
          if (!editableSourceFile) return;
          if (slot.editableInBubbleEditor && outputSize && (selectedUploadEntry?.imageEdit?.state.flipX ?? false) !== editState.flipX) {
            onBubbleFlip(slot, outputSize.width);
          }
          onEditedUpload(slot, editedFile, editState, editableSourceFile, imageEditTarget);
        }}
      />
    </div>
  );
}

async function imageUrlToEditableFile(url: string, fallbackName: string) {
  const response = await fetch(url, { cache: "force-cache" });
  if (!response.ok) throw new Error(`Image source could not be loaded: ${response.status}`);
  const blob = await response.blob();
  const mimeType = blob.type || inferImageMimeType(fallbackName) || "image/png";
  return new File([blob], ensureImageFileExtension(fallbackName, mimeType), { type: mimeType });
}

function getImageEditTarget(candidate: ReturnType<typeof getSelectedCandidate>): ImageEditTarget | undefined {
  const width = candidate?.metadata?.width;
  const height = candidate?.metadata?.height;
  if (!Number.isFinite(width) || !Number.isFinite(height) || !width || !height) return undefined;
  return { width, height, label: "선택 후보 기준" };
}

function inferImageMimeType(fileName: string) {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".png") || lower.endsWith(".9.png")) return "image/png";
  return undefined;
}

function ensureImageFileExtension(fileName: string, mimeType: string) {
  if (/\.(png|jpe?g|webp)$/i.test(fileName)) return fileName;
  if (mimeType === "image/jpeg") return `${fileName}.jpg`;
  if (mimeType === "image/webp") return `${fileName}.webp`;
  return `${fileName}.png`;
}

function getBackgroundSourcePair(slot: ThemeAssetSlot, slots: ThemeAssetSlot[]) {
  const imageSlot =
    slot.kind === "color"
      ? slots.find((candidate) => candidate.kind !== "color" && getImageColorFallbackRole(candidate.role) === slot.role)
      : getImageColorFallbackRole(slot.role)
        ? slot
        : undefined;
  if (!imageSlot) return null;
  const colorRole = getImageColorFallbackRole(imageSlot.role);
  const colorSlot = slots.find((candidate) => candidate.kind === "color" && candidate.role === colorRole);
  return colorSlot ? { imageSlot, colorSlot } : null;
}
