"use client";

import { useEffect, useId, useState, type DragEvent, type MutableRefObject } from "react";
import { Edit3, ImageOff, Info, Link2, LoaderCircle, RefreshCw, X } from "lucide-react";
import * as Tooltip from "@radix-ui/react-tooltip";
import { MobileBubbleEditor } from "@/components/editor/MobileBubbleEditor";
import { ImageEditDialog } from "@/components/image-editor/ImageEditDialog";
import { getCandidateCardWidthClass, getCandidateLayoutKind, type CandidateLayoutKind } from "@/components/project/candidateLayout";
import { ThemeColorPicker } from "@/components/project/ThemeColorPicker";
import { useUploadPreviewUrls } from "@/components/project/hooks/useUploadPreviewUrls";
import { supportsColorAlpha } from "@/lib/theme/project/platformColor";
import { buildSlotCandidates, getResolvedColor, getSharedSlotUploadEntries, isRemovableUploadCandidate, getDerivedColorLink, disabledImageCandidateId, type DerivedColorLink, getDefaultColor, getSelectedCandidate, getSelectedUpload, type BubbleEditState, type SlotCandidate, type SlotCandidateSelections, type SlotColors, type SlotUploads } from "@/components/project/projectModel";
import type { SlotContrastWarning } from "@/components/project/slotContrast";
import type { AdminAssetCandidate } from "@/lib/theme/adminAssets";
import type { ImageColorPalette } from "@/lib/theme/colorPalette";
import { getImageEditTarget } from "@/components/project/projectImporterHelpers";
import type { ImageEditState, ImageEditTarget } from "@/lib/theme/imageEdit";
import type { ThemeProjectFile } from "@/lib/theme/project/types";
import type { ThemeAssetSlot, ThemeTemplate, ThemeTemplateId } from "@/lib/theme/templates";
import type { BubbleGeometry, BubbleSlot, Insets, Markers, StretchPoint, ThemePlatform } from "@/lib/theme/types";
import { readableThemeForeground, setThemeColorAlpha, setThemeColorRgb, themeColorAlphaPercent, themeColorRgbHex, themeColorToCss } from "@/lib/theme/color";

export function ProjectQuickEditPanel({
  slot,
  slots,
  file,
  uploads,
  colors,
  selections,
  adminAssets,
  hasMoreAdminAssets,
  isLoadingAdminAssets,
  templateId,
  template,
  platform,
  selectedBubbleSlot,
  pairedBubbleSlot,
  geometry,
  markers,
  insets,
  stretch,
  fileInputRefs,
  onUpload,
  onRemoveUpload,
  onEditedUpload,
  onColorChange,
  onUnlinkColor,
  imageColorPalette,
  imageColorPaletteError,
  recommendedColor,
  contrastWarning,
  isAutoColor,
  canApplyAutoColor,
  canApplyAutoColorToAll,
  onApplyAutoColor,
  onApplyAutoColorToAll,
  onSelectCandidate,
  onSelectAdminAsset,
  onLoadMoreAdminAssets,
  onGeometryChange,
  onMarkersChange,
  onInsetsChange,
  onStretchChange,
  flipX,
  onFlipXChange,
  candidateOpen,
  onToggleCandidates,
  onOpenBubbleBuilder,
  onCopyBubbleToPair,
  onBubblePreviewChange,
}: {
  slot?: ThemeAssetSlot;
  slots: ThemeAssetSlot[];
  file?: ThemeProjectFile;
  uploads: SlotUploads;
  colors: SlotColors;
  selections: SlotCandidateSelections;
  adminAssets: Array<AdminAssetCandidate & { previewUrl?: string }>;
  hasMoreAdminAssets: boolean;
  isLoadingAdminAssets: boolean;
  templateId: ThemeTemplateId;
  template: ThemeTemplate;
  platform: ThemePlatform;
  selectedBubbleSlot: BubbleSlot | null;
  pairedBubbleSlot?: ThemeAssetSlot;
  geometry?: BubbleGeometry;
  markers?: Markers;
  insets?: Insets;
  stretch?: StretchPoint;
  fileInputRefs: MutableRefObject<Record<string, HTMLInputElement | null>>;
  onUpload: (slot: ThemeAssetSlot, files: FileList | readonly File[] | null) => void;
  onRemoveUpload: (slot: ThemeAssetSlot, uploadId: string) => void;
  onEditedUpload: (slot: ThemeAssetSlot, file: File, editState: ImageEditState, sourceFile: File, target?: ImageEditTarget) => void;
  onColorChange: (slot: ThemeAssetSlot, value: string) => void;
  onUnlinkColor: (slot: ThemeAssetSlot) => void;
  imageColorPalette: ImageColorPalette | null;
  imageColorPaletteError: string | null;
  recommendedColor?: string;
  contrastWarning?: SlotContrastWarning;
  isAutoColor: boolean;
  canApplyAutoColor: boolean;
  canApplyAutoColorToAll: boolean;
  onApplyAutoColor: () => void;
  onApplyAutoColorToAll: () => void;
  onSelectCandidate: (slot: ThemeAssetSlot, candidateId: string) => void;
  onSelectAdminAsset: (slot: ThemeAssetSlot, asset: AdminAssetCandidate) => void;
  onLoadMoreAdminAssets: () => void;
  onGeometryChange: (geometry: BubbleGeometry) => void;
  onMarkersChange: (markers: Markers) => void;
  onInsetsChange: (insets: Insets) => void;
  onStretchChange: (stretch: StretchPoint) => void;
  flipX?: boolean;
  onFlipXChange: (next: boolean) => void;
  candidateOpen: boolean;
  onToggleCandidates: () => void;
  onOpenBubbleBuilder: () => void;
  onCopyBubbleToPair: (slot: ThemeAssetSlot) => void;
  onBubblePreviewChange?: (edit: BubbleEditState) => void;
}) {
  const [dragActive, setDragActive] = useState(false);
  const [pasteFeedback, setPasteFeedback] = useState(false);
  const uploadPreviewUrls = useUploadPreviewUrls(uploads);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [preparedEditSourceFile, setPreparedEditSourceFile] = useState<File | null>(null);
  const [isPreparingEditSource, setIsPreparingEditSource] = useState(false);
  const [editSourceError, setEditSourceError] = useState<string | null>(null);


  useEffect(() => {
    if (!slot || slot.kind === "color") return;

    const handlePaste = (event: ClipboardEvent) => {
      const clipboardFiles = Array.from(event.clipboardData?.files ?? []);
      const itemFiles = Array.from(event.clipboardData?.items ?? []).flatMap((item) => {
        const file = item.kind === "file" ? item.getAsFile() : null;
        return file ? [file] : [];
      });
      const pastedFile = [...clipboardFiles, ...itemFiles].find((file) => ["image/png", "image/jpeg", "image/webp"].includes(file.type));
      if (!pastedFile) return;

      event.preventDefault();
      onUpload(slot, [pastedFile]);
      setPasteFeedback(true);
    };

    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [onUpload, slot]);

  useEffect(() => {
    if (!pasteFeedback) return;
    const timer = window.setTimeout(() => setPasteFeedback(false), 2200);
    return () => window.clearTimeout(timer);
  }, [pasteFeedback]);

  if (!slot) return null;

  const candidates = buildSlotCandidates(slot, uploads, colors, selections, templateId, template, slots, adminAssets, uploadPreviewUrls);
  /**
   * 이 슬롯에서 실제로 지울 수 있는 업로드 id.
   *
   * 후보 목록에는 이 슬롯이 소유하지 않은 항목도 섞인다. 말풍선 공유 풀(peer 소유)은 지울 수
   * 있지만, 파생 슬롯이 기본 슬롯의 선택을 읽어 오는 경우(탭 선택 아이콘 등)는 그 슬롯의
   * bucket에 entry가 없어 삭제가 아무 동작도 하지 않는다. 삭제 핸들러가 owner를 찾는 기준과
   * 같은 집합을 써서 "눌러도 안 되는 버튼"이 생기지 않게 한다. 모바일 패널과 같은 규칙이다.
   */
  const removableUploadIds = new Set(getSharedSlotUploadEntries(slot, uploads, slots).map(({ entry }) => entry.id));
  const selectedCandidate = getSelectedCandidate(slot, selections, templateId, template);
  const selectedUploadEntry = getSelectedUpload(slot, uploads, selections, slots);
  const imageEditTarget = selectedUploadEntry?.imageEdit?.target ?? getImageEditTarget(selectedCandidate);
  const selectedPickerCandidate = candidates.find((candidate) => candidate.selected);
  const directEditableSourceFile = selectedUploadEntry?.imageEdit?.originalFile ?? selectedUploadEntry?.file ?? file?.file ?? null;
  const editableSourceUrl = !directEditableSourceFile ? getEditableSourceUrl(file, selectedPickerCandidate, selectedCandidate) : undefined;
  const editableSourceFile = preparedEditSourceFile ?? directEditableSourceFile;
  const canOpenImageEditor = Boolean(directEditableSourceFile || editableSourceUrl);

  const openImageEditor = async () => {
    if (!slot || slot.kind === "color" || !canOpenImageEditor) return;

    setEditSourceError(null);
    if (directEditableSourceFile) {
      setPreparedEditSourceFile(null);
      setEditDialogOpen(true);
      return;
    }

    if (!editableSourceUrl) return;

    try {
      setIsPreparingEditSource(true);
      const preparedFile = await imageUrlToEditableFile(editableSourceUrl, slot.fileName ?? `${slot.id}.png`);
      setPreparedEditSourceFile(preparedFile);
      setEditDialogOpen(true);
    } catch (error) {
      console.error(error);
      setEditSourceError("현재 이미지를 편집용으로 불러오지 못했습니다. 직접 업로드한 뒤 다시 편집해 주세요.");
    } finally {
      setIsPreparingEditSource(false);
    }
  };

  const handleDrop = (event: DragEvent<HTMLButtonElement | HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setDragActive(false);
    if (slot.kind !== "color") {
      onUpload(slot, event.dataTransfer.files);
    }
  };

  return (
    <div className="grid min-h-0 content-start gap-3">
      <CandidatePicker
        slot={slot}
        candidates={candidates}
        selectedCandidate={selectedPickerCandidate}
        isOpen={candidateOpen}
        onToggle={onToggleCandidates}
        onApplyCandidate={(candidate) => {
          if (slot.kind === "color" && candidate.source === "palette" && candidate.colorValue) {
            onColorChange(slot, candidate.colorValue);
            return;
          }
          if (candidate.source === "admin" && candidate.adminAsset) {
            onSelectAdminAsset(slot, candidate.adminAsset);
            return;
          }
          onSelectCandidate(slot, candidate.id);
        }}
        hasMoreAdminAssets={hasMoreAdminAssets}
        isLoadingAdminAssets={isLoadingAdminAssets}
        onLoadMoreAdminAssets={onLoadMoreAdminAssets}
        removableUploadIds={removableUploadIds}
        onRemoveUpload={(uploadId) => onRemoveUpload(slot, uploadId)}
      />

      <section className="grid min-h-0 content-start gap-4 rounded-xl border border-[#e5e7eb] bg-white p-5 shadow-[0_12px_28px_rgba(15,23,42,0.04)]">
        {slot.kind === "color" ? (
          <ColorEditor slot={slot} platform={platform} value={getResolvedColor(slot, colors, selections, templateId, template, slots) ?? getDefaultColor(slot, templateId, template)} onChange={onColorChange} imageColorPalette={imageColorPalette} imageColorPaletteError={imageColorPaletteError} recommendedColor={recommendedColor} contrastWarning={contrastWarning} isAutoColor={isAutoColor} canApplyAutoColor={canApplyAutoColor} canApplyAutoColorToAll={canApplyAutoColorToAll} onApplyAutoColor={onApplyAutoColor} onApplyAutoColorToAll={onApplyAutoColorToAll} derivedLink={getDerivedColorLink(slot, colors, selections, templateId, template, slots)} onRestoreDerivedLink={() => onUnlinkColor(slot)} />
        ) : (
          <>
            <input
              ref={(node) => {
                fileInputRefs.current[slot.id] = node;
              }}
              className="hidden"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(event) => onUpload(slot, event.currentTarget.files)}
            />

            <div
              role="button"
              tabIndex={0}
              aria-label="이미지 추가"
              className={`grid cursor-pointer gap-4 rounded-xl border-2 border-dashed p-4 transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#60a5fa] ${dragActive || pasteFeedback ? "border-[#60a5fa] bg-[#eff6ff]" : "border-[#d7dee8] bg-[#f8fafc] hover:border-[#93c5fd] hover:bg-[#f5f9ff]"}`}
              onClick={() => fileInputRefs.current[slot.id]?.click()}
              onKeyDown={(event) => {
                if (event.target !== event.currentTarget) return;
                if (event.key !== "Enter" && event.key !== " ") return;
                event.preventDefault();
                fileInputRefs.current[slot.id]?.click();
              }}
              onDragEnter={(event) => {
                event.preventDefault();
                setDragActive(true);
              }}
              onDragOver={(event) => {
                event.preventDefault();
                setDragActive(true);
              }}
              onDragLeave={(event) => {
                event.preventDefault();
                if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
                setDragActive(false);
              }}
              onDrop={handleDrop}
            >
              <div>
                <p className="text-sm font-semibold text-[#0f172a]">내 이미지로 바꾸기</p>
                <p className="mt-1 text-[12px] font-medium text-[#6b7280]">이미지를 끌어다 놓거나 이 영역을 클릭해 선택하세요. 붙여넣기도 할 수 있어요.</p>
                <p className="mt-2 rounded-xl border border-[#dbeafe] bg-white/80 px-3 py-2 text-[11px] font-bold leading-5 text-[#475569]">
                  올린 이미지는 이 브라우저의 내 템플릿에 저장돼요.
                </p>
                <p className="sr-only" role="status" aria-live="polite">{pasteFeedback ? "클립보드 이미지를 추가했습니다." : ""}</p>
              </div>

              {/* 드롭존 전체가 파일 선택 버튼이므로, 안쪽 버튼은 클릭 전파를 막아야 선택창이 같이 열리지 않는다. */}
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  className="inline-flex items-center gap-2 rounded-lg border border-[#d1d5db] bg-white px-4 py-3 text-sm font-semibold text-[#374151] transition enabled:hover:border-[#bfdbfe] enabled:hover:bg-[#eff6ff] enabled:hover:text-[#1d4ed8] disabled:cursor-not-allowed disabled:opacity-45"
                  disabled={!slot.editableInBubbleEditor && (!canOpenImageEditor || isPreparingEditSource)}
                  onClick={(event) => {
                    event.stopPropagation();
                    if (slot.editableInBubbleEditor) onOpenBubbleBuilder();
                    else void openImageEditor();
                  }}
                  title={slot.editableInBubbleEditor ? "모양과 색을 골라 말풍선 한 세트를 만듭니다." : canOpenImageEditor ? "현재 이미지를 복사해 비파괴 편집합니다." : "이미지가 있는 슬롯에서 사용할 수 있습니다."}
                >
                  {isPreparingEditSource && !slot.editableInBubbleEditor ? <RefreshCw className="animate-spin" size={16} aria-hidden="true" /> : <Edit3 size={16} aria-hidden="true" />}
                  {slot.editableInBubbleEditor ? "나만의 말풍선 만들기" : isPreparingEditSource ? "편집 준비 중" : "이미지 편집"}
                </button>
                {slot.editableInBubbleEditor && pairedBubbleSlot ? (
                  <button
                    type="button"
                    className="inline-flex items-center gap-2 rounded-lg border border-[#bfdbfe] bg-[#eff6ff] px-4 py-3 text-sm font-semibold text-[#1d4ed8] transition hover:bg-[#dbeafe]"
                    onClick={(event) => {
                      event.stopPropagation();
                      onCopyBubbleToPair(slot);
                    }}
                  >
                    <Link2 size={16} aria-hidden="true" />{pairedBubbleSlot.label}에 같은 말풍선 적용
                  </button>
                ) : null}
              </div>
              {editSourceError ? <p className="rounded-xl border border-[#fecaca] bg-[#fff1f2] px-3 py-2 text-xs font-bold leading-5 text-[#be123c]" role="alert">{editSourceError}</p> : null}
            </div>

            {slot.editableInBubbleEditor && selectedBubbleSlot ? (
              <MobileBubbleEditor
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
                onApply={({ editedFile, sourceFile, imageState, target, geometry: nextGeometry, markers: nextMarkers, insets: nextInsets, stretch: nextStretch }) => {
                  if (editedFile) onEditedUpload(slot, editedFile, imageState, sourceFile, target);
                  onMarkersChange(nextMarkers);
                  onInsetsChange(nextInsets);
                  onStretchChange(nextStretch);
                  onGeometryChange(nextGeometry);
                }}
                onPreviewChange={onBubblePreviewChange}
              />
            ) : null}

            {!slot.editableInBubbleEditor ? <ImageEditDialog
              open={editDialogOpen}
              sourceFile={editableSourceFile}
              slotLabel={slot.label}
              initialState={selectedUploadEntry?.imageEdit?.state}
              target={imageEditTarget}
              preserveNinePatchBorder={platform === "android"}
              onOpenChange={(open) => {
                setEditDialogOpen(open);
                if (!open) {
                  setPreparedEditSourceFile(null);
                  setEditSourceError(null);
                }
              }}
              onApply={(editedFile, editState) => {
                if (!editableSourceFile) return;
                onEditedUpload(slot, editedFile, editState, editableSourceFile, imageEditTarget);
              }}
            /> : null}
          </>
        )}
      </section>
    </div>
  );
}

function getEditableSourceUrl(file: ThemeProjectFile | undefined, selectedPickerCandidate: SlotCandidate | undefined, selectedCandidate: ReturnType<typeof getSelectedCandidate>) {
  return file?.sourceUrl ?? selectedCandidate?.assetUrl ?? selectedPickerCandidate?.previewUrl ?? selectedCandidate?.previewUrl;
}

async function imageUrlToEditableFile(url: string, fallbackName: string) {
  const response = await fetch(url, { cache: "force-cache" });
  if (!response.ok) throw new Error(`Image source could not be loaded: ${response.status}`);

  const blob = await response.blob();
  const mimeType = blob.type || inferImageMimeType(fallbackName) || "image/png";
  return new File([blob], ensureImageFileExtension(fallbackName, mimeType), { type: mimeType });
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

function CandidatePicker({
  slot,
  candidates,
  selectedCandidate,
  isOpen,
  onToggle,
  onApplyCandidate,
  removableUploadIds,
  onRemoveUpload,
  hasMoreAdminAssets,
  isLoadingAdminAssets,
  onLoadMoreAdminAssets,
}: {
  slot: ThemeAssetSlot;
  candidates: SlotCandidate[];
  selectedCandidate?: SlotCandidate;
  isOpen: boolean;
  onToggle: () => void;
  onApplyCandidate: (candidate: SlotCandidate) => void;
  removableUploadIds: Set<string>;
  onRemoveUpload: (uploadId: string) => void;
  hasMoreAdminAssets: boolean;
  isLoadingAdminAssets: boolean;
  onLoadMoreAdminAssets: () => void;
}) {
  type CandidateGroup = { key: SlotCandidate["source"]; label: string; items: SlotCandidate[]; persistent?: boolean };
  const defaultCandidates = candidates.filter((candidate) => candidate.source === "default");
  const preferredSource = selectedCandidate?.source === "default"
    ? slot.kind === "color" ? "palette" : "admin"
    : selectedCandidate?.source;
  const groups: CandidateGroup[] = [
    {
      key: "admin" as const,
      label: "추천 에셋",
      items: [
        ...(slot.kind === "color" ? [] : defaultCandidates),
        ...candidates.filter((candidate) => candidate.source === "admin"),
      ],
      persistent: slot.kind !== "color",
    },
    {
      key: "palette" as const,
      label: "팔레트",
      items: [
        ...(slot.kind === "color" ? defaultCandidates : []),
        ...candidates.filter((candidate) => candidate.source === "palette"),
      ],
      persistent: slot.kind === "color",
    },
    { key: "template" as const, label: "템플릿 에셋", items: candidates.filter((candidate) => candidate.source === "template") },
    { key: "upload" as const, label: "내 업로드", items: candidates.filter((candidate) => candidate.source === "upload") },
    { key: "creator" as const, label: "제작자 후보", items: candidates.filter((candidate) => candidate.source === "creator") },
  ].filter((group) => group.persistent || group.items.length > 0);

  const preferredTab = preferredSource ?? groups[0]?.key;
  const [activeTab, setActiveTab] = useState<CandidateGroup["key"] | undefined>(preferredTab);

  useEffect(() => {
    if (!groups.some((group) => group.key === activeTab)) {
      setActiveTab(preferredTab);
    }
  }, [activeTab, groups, preferredTab]);

  useEffect(() => {
    setActiveTab(preferredTab);
  }, [slot.id]);

  const activeGroup = groups.find((group) => group.key === activeTab) ?? groups[0];
  const layoutKind = getCandidateLayoutKind(slot);
  const compactCapacity = layoutKind === "wallpaper" ? 6 : layoutKind === "color" ? 8 : 4;
  const canToggle = isOpen || activeGroup.items.length > compactCapacity || (activeGroup.key === "admin" && hasMoreAdminAssets);
  const collectionClassName = isOpen
    ? "flex flex-wrap gap-3"
    : "flex gap-3 overflow-x-auto pb-2 [scrollbar-color:#cbd5e1_transparent] [scrollbar-width:thin] [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[#cbd5e1]";

  return (
    <section className="overflow-hidden rounded-xl border border-[#e5e7eb] bg-white px-4 py-4 shadow-[0_10px_24px_rgba(15,23,42,0.04)]">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          <h2 className="mr-2 text-base font-semibold text-[#0f172a]">{slot.label}</h2>
          {groups.map((group) => (
            <button
              key={group.key}
              type="button"
              className={`inline-flex h-9 items-center rounded-full border px-3.5 text-[12px] font-semibold transition ${activeGroup.key === group.key ? "border-[#2563eb] bg-[#eff6ff] text-[#1d4ed8]" : "border-[#e5e7eb] bg-[#f8fafc] text-[#475569] hover:bg-white"
                }`}
              onClick={() => setActiveTab(group.key)}
            >
              <span>{group.label}</span>
              {group.key === "admin" && isLoadingAdminAssets ? (
                <LoaderCircle className="ml-1.5 size-3.5 motion-safe:animate-spin" aria-hidden="true" />
              ) : null}
            </button>
          ))}
        </div>

        {canToggle ? (
          <button
            type="button"
            className="min-h-9 shrink-0 rounded-lg px-2 text-[12px] font-semibold text-[#2563eb] transition hover:bg-[#eff6ff] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563eb]"
            onClick={onToggle}
            aria-expanded={isOpen}
          >
            {isOpen ? "간단히 보기" : "전체 보기"}
          </button>
        ) : null}
      </div>

      {activeGroup ? (
        <div className="mt-4 grid gap-3">
          <div
            className={collectionClassName}
            aria-busy={activeGroup.key === "admin" && isLoadingAdminAssets}
          >
            {activeGroup.items.length > 0 ? activeGroup.items.map((candidate) => (
              <CandidateCard
                key={candidate.id}
                candidate={candidate}
                layoutKind={layoutKind}
                onApply={onApplyCandidate}
                onRemove={isRemovableUploadCandidate(candidate) && removableUploadIds.has(candidate.id) ? onRemoveUpload : undefined}
              />
            )) : activeGroup.key === "admin" && !isLoadingAdminAssets ? (
              <AdminAssetPlaceholderCard layoutKind={layoutKind} />
            ) : null}
            {activeGroup.key === "admin" && isLoadingAdminAssets
              ? Array.from({ length: isOpen ? 8 : 5 }, (_, index) => (
                <CandidateSkeletonCard key={`admin-asset-skeleton-${index}`} layoutKind={layoutKind} />
              ))
              : null}
            {activeGroup.key === "admin" && hasMoreAdminAssets ? (
              <button
                type="button"
                className={`flex min-h-24 items-center justify-center rounded-2xl border border-dashed border-[#cbd5e1] bg-[#f8fafc] px-3 text-center text-xs font-semibold text-[#475569] transition hover:border-[#93c5fd] hover:bg-[#eff6ff] disabled:opacity-50 ${getCandidateCardWidthClass(layoutKind)}`}
                onClick={onLoadMoreAdminAssets}
                disabled={isLoadingAdminAssets}
              >
                {isLoadingAdminAssets ? (
                  <span className="inline-flex items-center gap-1.5">
                    <LoaderCircle className="size-3.5 motion-safe:animate-spin" aria-hidden="true" />
                    불러오는 중
                  </span>
                ) : "더 보기"}
              </button>
            ) : null}
          </div>
          {activeGroup.key === "admin" && isLoadingAdminAssets ? (
            <p className="sr-only" role="status">추천 에셋을 불러오는 중입니다.</p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function CandidateCard({
  candidate,
  layoutKind,
  onApply,
  onRemove,
}: {
  candidate: SlotCandidate;
  layoutKind: CandidateLayoutKind;
  onApply: (candidate: SlotCandidate) => void;
  onRemove?: (uploadId: string) => void;
}) {
  return (
    <div className={`relative min-w-0 ${getCandidateCardWidthClass(layoutKind)}`}>
      <button
        type="button"
        aria-pressed={candidate.selected}
        aria-disabled={candidate.inherited}
        className={`grid w-full gap-2 rounded-2xl border text-left transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563eb] ${layoutKind === "color" ? "p-1.5" : "p-2"} ${candidate.selected
          ? "border-[#2563eb] bg-[#eff6ff] shadow-[inset_0_0_0_1px_rgba(37,99,235,0.18)]"
          : candidate.active
            ? "border-[#cbd5e1] bg-white"
            : "border-[#e5e7eb] bg-white hover:border-[#93c5fd] hover:bg-[#f8fbff]"
          } ${candidate.inherited ? "cursor-default" : ""}`}
        onClick={() => {
          if (candidate.inherited) return;
          onApply(candidate);
        }}
      >
        <CandidatePreview candidate={candidate} layoutKind={layoutKind} />
        <span
          className={`truncate text-center font-semibold text-[#111827] ${layoutKind === "color" ? "font-mono text-[9px] tracking-tight" : "px-1 text-[12px]"}`}
          title={candidate.title}
        >
          {candidate.title}
        </span>
      </button>
      {onRemove ? (
        <button
          type="button"
          aria-label={`${candidate.title} 삭제`}
          className="absolute right-1 top-1 grid size-6 place-items-center rounded-full bg-[#475569] text-white shadow-sm ring-2 ring-white transition hover:bg-[#1e293b] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563eb]"
          onClick={() => onRemove(candidate.id)}
        >
          <X size={14} strokeWidth={2.5} aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}

function CandidateSkeletonCard({ layoutKind }: { layoutKind: CandidateLayoutKind }) {
  const aspectClassName = layoutKind === "wallpaper" ? "aspect-[1/2]" : "aspect-square";

  return (
    <div
      className={`grid gap-2 rounded-2xl border border-[#e5e7eb] bg-white p-2 ${getCandidateCardWidthClass(layoutKind)}`}
      aria-hidden="true"
    >
      <span className={`w-full rounded-xl bg-gradient-to-r from-[#f1f5f9] via-white to-[#f1f5f9] bg-[length:200%_100%] motion-safe:animate-pulse ${aspectClassName}`} />
      <span className="mx-auto h-3 w-3/4 rounded-full bg-[#e2e8f0] motion-safe:animate-pulse" />
    </div>
  );
}

function AdminAssetPlaceholderCard({ layoutKind }: { layoutKind: CandidateLayoutKind }) {
  return (
    <div className={`flex min-h-28 flex-col justify-center rounded-2xl border border-dashed border-[#cbd5e1] bg-[#f8fafc] px-3 py-3 text-center ${getCandidateCardWidthClass(layoutKind)}`}>
      <span className="mx-auto mb-3 block size-10 rounded-xl border border-[#dbe3ed] bg-white" aria-hidden="true" />
      <span className="text-[12px] font-semibold text-[#111827]">추천 에셋</span>
      <span className="mt-1 line-clamp-2 text-[11px] font-medium leading-[1.3] text-[#6b7280]">
        이 슬롯에 표시할 추천 에셋이 없습니다.
      </span>
    </div>
  );
}

function CandidatePreview({ candidate, layoutKind }: { candidate: SlotCandidate; layoutKind: CandidateLayoutKind }) {
  const aspectClassName = layoutKind === "wallpaper" ? "aspect-[1/2]" : "aspect-square";

  if (candidate.id === disabledImageCandidateId) {
    return <span className={`grid w-full place-items-center overflow-hidden rounded-xl bg-[#f1f5f9] text-[#64748b] ${aspectClassName}`}><ImageOff size={24} aria-hidden="true" /></span>;
  }
  if (candidate.colorValue) {
    return <ColorSwatch value={candidate.colorValue} className={`w-full rounded-xl ${aspectClassName}`} />;
  }
  if (candidate.previewUrl) {
    return <span className={`w-full overflow-hidden rounded-xl bg-[#f8fafc] bg-center bg-no-repeat ${layoutKind === "wallpaper" ? "bg-cover" : "bg-contain"} ${aspectClassName}`} style={{ backgroundImage: `url(${candidate.previewUrl})` }} />;
  }
  return <span className={`w-full overflow-hidden rounded-xl bg-[#e5e7eb] ${aspectClassName}`} />;
}

/**
 * hex 입력창은 RGB만 받는다. 알파는 별도 투명도 슬라이더로만 조작한다.
 *
 * 예전엔 이 칸이 알파까지 합친 8자리 hex를 그대로 보여주고 그대로 파싱했는데, 내부 저장
 * 포맷(`AARRGGBB`, Android 관례)과 iOS 결과물의 실제 순서(`RRGGBBAA`, CSS Color Level 4)가
 * 달라서 사용자가 그대로 복사해 온 8자리 코드가 플랫폼에 따라 다르게 해석되는 문제가 있었다.
 * 8자리 조합 표기 자체를 없애 두 순서 중 어느 쪽으로도 오해석될 여지를 없앤다.
 */
function normalizeRgbHex(value: string) {
  const trimmed = value.trim().replace(/^#/, "");
  if (!/^[0-9a-f]{6}$/i.test(trimmed)) return null;
  return `#${trimmed.toUpperCase()}`;
}

function ColorEditor({
  slot,
  platform,
  value,
  onChange,
  imageColorPalette,
  imageColorPaletteError,
  recommendedColor,
  contrastWarning,
  isAutoColor,
  canApplyAutoColor,
  canApplyAutoColorToAll,
  onApplyAutoColor,
  onApplyAutoColorToAll,
  derivedLink,
  onRestoreDerivedLink,
}: {
  slot: ThemeAssetSlot;
  platform: ThemePlatform;
  value: string;
  onChange: (slot: ThemeAssetSlot, value: string) => void;
  imageColorPalette: ImageColorPalette | null;
  imageColorPaletteError: string | null;
  recommendedColor?: string;
  contrastWarning?: SlotContrastWarning;
  isAutoColor: boolean;
  canApplyAutoColor: boolean;
  canApplyAutoColorToAll: boolean;
  onApplyAutoColor: () => void;
  onApplyAutoColorToAll: () => void;
  derivedLink?: DerivedColorLink;
  onRestoreDerivedLink: () => void;
}) {
  // hex 입력창은 RGB 초안만 들고 있다. 알파는 항상 `value`(부모 상태)에서 읽고, 슬라이더가
  // 직접 커밋한다 — 두 컨트롤이 같은 문자열을 두고 경합하지 않는다.
  const [draft, setDraft] = useState(() => themeColorRgbHex(value));
  const colorId = useId();
  const alphaId = useId();
  // iOS CSS는 색상 코드에 알파를 담지 못한다. 표현할 자리가 없는 슬롯에 슬라이더를 보여 주면
  // 사용자가 조작한 투명도가 내보내기에서 조용히 사라진다.
  const alphaSupported = supportsColorAlpha(slot.role, platform);
  const normalizedDraftRgb = normalizeRgbHex(draft);
  // 타이핑 중에도 스와치·피커·미리보기가 즉시 반영되도록, 초안 RGB에 현재 알파를 합성한다.
  const effectiveColor = normalizedDraftRgb ? setThemeColorRgb(value, normalizedDraftRgb) : value;

  useEffect(() => setDraft(themeColorRgbHex(value)), [slot.id, value]);

  const commitRgb = (nextRgbText: string) => {
    setDraft(nextRgbText);
    const normalized = normalizeRgbHex(nextRgbText);
    if (normalized) onChange(slot, setThemeColorRgb(value, normalized));
  };

  // 색상 피커(HexColorPicker)는 내부에서 이미 `setThemeColorRgb(value, nextRgb)`로 알파를
  // 보존한 값을 돌려준다. 그 값을 그대로 커밋하고, 입력창 초안만 RGB로 다시 맞춘다.
  const commitFromPicker = (nextValue: string) => {
    setDraft(themeColorRgbHex(nextValue));
    onChange(slot, nextValue);
  };

  const commitAlpha = (percent: number) => onChange(slot, setThemeColorAlpha(value, percent));

  return (
    <Tooltip.Provider delayDuration={260} skipDelayDuration={100}>
      <div className="grid gap-4 rounded-xl border border-[#e5e7eb] bg-[#f8fafc] p-4">
        {/*
          기준 슬롯 연동. 배경에서 파생되는 슬롯의 "역할별 자동 맞춤"과 개념이 같으므로
          카드도 같은 것을 쓴다. 다른 점은 두 가지뿐이다 — 기준이 배경이 아니라 다른 슬롯이고,
          되돌리기는 값을 새로 쓰는 게 아니라 직접 지정을 지우는 동작이다.
          `autoColorRecipe`와 파생 규칙을 동시에 갖는 슬롯은 없다.
        */}
        {derivedLink ? (
          <div className="grid gap-3 rounded-xl border border-[#bfdbfe] bg-[#eff6ff] p-3">
            <div className="flex items-start gap-2">
              <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-white text-[#2563eb]"><Link2 size={16} aria-hidden="true" /></span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <p className="text-xs font-bold text-[#1e3a8a]">역할별 자동 맞춤</p>
                  <InfoTooltip label={`${slot.label} 자동 맞춤 기준`} content={`${derivedLink.description} ${derivedLink.baseLabel}을 바꾸면 이 색도 함께 갱신됩니다.`} />
                </div>
                <p className="mt-1 text-[11px] font-medium leading-5 text-[#475569]">{derivedLink.linked ? `${derivedLink.description} 변경 사항을 계속 자동 반영합니다.` : `현재는 직접 설정한 색상을 사용합니다. ${derivedLink.baseLabel} 기준으로 다시 맞출 수 있습니다.`}</p>
              </div>
            </div>
            {derivedLink.color ? <div className="flex items-center gap-3 rounded-lg border border-white/80 bg-white p-2.5 shadow-sm"><ColorSwatch value={derivedLink.color} className="size-9 rounded-lg" /><div className="min-w-0"><p className="text-[10px] font-bold text-[#64748b]">현재 추천 색상</p><p className="mt-0.5 font-mono text-xs font-bold text-[#0f172a]">{derivedLink.color.toUpperCase()}</p></div></div> : null}
            <div className="flex flex-wrap justify-center gap-4">
              <div className="inline-flex overflow-hidden rounded-lg shadow-sm">
                <button type="button" className="inline-flex min-h-9 items-center gap-1.5 rounded-l-lg bg-[#2563eb] px-3 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-45" disabled={derivedLink.linked} onClick={onRestoreDerivedLink}><RefreshCw size={13} aria-hidden="true" />현재 슬롯 색상 적용</button>
                <InfoTooltip label="기준 색 연동 안내" content={`직접 지정을 해제하고 ${derivedLink.baseLabel} 기준 자동 계산으로 되돌립니다. 이후 기준 색이 바뀌면 이 슬롯도 함께 갱신되며, 다른 슬롯은 변경하지 않습니다.`} triggerClassName="min-h-9 rounded-r-lg border-l border-white/30 bg-[#2563eb] px-2 text-white hover:bg-[#1d4ed8] focus-visible:bg-[#1d4ed8]" />
              </div>
            </div>
          </div>
        ) : null}
        {slot.autoColorRecipe ? (
          <div className="grid gap-3 rounded-xl border border-[#bfdbfe] bg-[#eff6ff] p-3">
            <div className="flex items-start gap-2">
              <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-white text-[#2563eb]"><Link2 size={16} aria-hidden="true" /></span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <p className="text-xs font-bold text-[#1e3a8a]">역할별 자동 맞춤</p>
                  <InfoTooltip label={`${slot.label} 자동 맞춤 기준`} content={getAutoColorExplanation(slot)} />
                </div>
                <p className="mt-1 text-[11px] font-medium leading-5 text-[#475569]">{isAutoColor ? `${getAutoColorReason(slot)} 변경 사항을 계속 자동 반영합니다.` : `현재는 직접 설정한 색상을 사용합니다. ${getAutoColorReason(slot)} 다시 맞출 수 있습니다.`}</p>
              </div>
            </div>
            {recommendedColor ? <div className="flex items-center gap-3 rounded-lg border border-white/80 bg-white p-2.5 shadow-sm"><ColorSwatch value={recommendedColor} className="size-9 rounded-lg" /><div className="min-w-0"><p className="text-[10px] font-bold text-[#64748b]">현재 추천 색상</p><p className="mt-0.5 font-mono text-xs font-bold text-[#0f172a]">{recommendedColor}</p></div></div> : <p className="text-[11px] font-semibold leading-5 text-[#64748b]">{imageColorPaletteError ?? (slot.role === "main_background_color" ? "배경 이미지를 사용하지 않을 때는 원하는 배경색을 직접 입력하세요." : "추천 색상을 계산할 기준 색상이 필요합니다.")}</p>}
            <div className="flex flex-wrap gap-2 justify-center gap-4">
              <div className="inline-flex overflow-hidden rounded-lg shadow-sm">
                <button type="button" className="inline-flex min-h-9 items-center gap-1.5 rounded-l-lg bg-[#2563eb] px-3 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-45" disabled={!canApplyAutoColor} onClick={onApplyAutoColor}><RefreshCw size={13} aria-hidden="true" />현재 슬롯 색상 적용</button>
                <InfoTooltip label="추천 색 다시 적용 안내" content="현재 슬롯만 자동 맞춤 상태로 다시 연결합니다. 이후 배경 이미지나 기준 배경색이 바뀌면 이 슬롯의 추천 색도 함께 갱신되며, 다른 수동 설정값은 변경하지 않습니다." triggerClassName="min-h-9 rounded-r-lg border-l border-white/30 bg-[#2563eb] px-2 text-white hover:bg-[#1d4ed8] focus-visible:bg-[#1d4ed8]" />
              </div>
              <div className="inline-flex overflow-hidden rounded-lg shadow-sm">
                <button type="button" className="min-h-9 rounded-l-lg border border-r-0 border-[#bfdbfe] bg-white px-3 text-xs font-bold text-[#1d4ed8] disabled:cursor-not-allowed disabled:opacity-45" disabled={!canApplyAutoColorToAll} onClick={onApplyAutoColorToAll}>모든 슬롯 자동 맞춤</button>
                <InfoTooltip label="메인 색상 모두 자동 맞춤 안내" content="친구·채팅 목록·더보기·하단 탭에 더해 채팅방 배경까지, 자동 맞춤 대상 색상을 모두 다시 계산합니다. 채팅방 배경은 채팅방 이미지를, 나머지는 메인 배경 이미지를 기준으로 씁니다. 직접 수정한 색상도 추천값으로 바뀝니다. 배경 이미지가 없으면 현재 배경색을 기준으로 계산합니다." triggerClassName="min-h-9 rounded-r-lg border border-[#bfdbfe] bg-white px-2 text-[#1d4ed8] hover:bg-[#eff6ff] focus-visible:bg-[#eff6ff]" />
              </div>
            </div>
          </div>
        ) : null}
        <div className="grid gap-3 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-end">
          <label className="grid gap-1.5 text-[11px] font-bold text-[#475569]" htmlFor={colorId}>색상
            <ThemeColorPicker value={effectiveColor} label={slot.label} onChange={commitFromPicker}>
              <button
                id={colorId}
                type="button"
                aria-label={`${slot.label} 색상 선택 열기`}
                className="group relative block size-12 overflow-hidden rounded-xl outline-none ring-offset-2 transition hover:ring-2 hover:ring-[#bfdbfe] focus-visible:ring-2 focus-visible:ring-[#2563eb] active:scale-95"
              >
                <ColorSwatch value={effectiveColor} className="size-full rounded-xl" />
                <span className="absolute inset-x-0 bottom-0 bg-black/45 py-0.5 text-center text-[9px] font-black tracking-wide text-white opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100">선택</span>
              </button>
            </ThemeColorPicker>
          </label>
          <input
            type="text"
            aria-label={`${slot.label} 색상 코드`}
            value={draft}
            aria-invalid={!normalizedDraftRgb}
            aria-describedby={!normalizedDraftRgb ? `${colorId}-error` : undefined}
            className={`h-12 min-w-0 rounded-xl border bg-white px-4 font-mono text-sm font-semibold text-[#111827] outline-none focus:ring-2 ${normalizedDraftRgb ? "border-[#d1d5db] focus:border-[#60a5fa] focus:ring-[#bfdbfe]" : "border-[#ef4444] focus:ring-[#fecaca]"}`}
            onChange={(event) => commitRgb(event.currentTarget.value)}
            onBlur={() => normalizedDraftRgb && setDraft(normalizedDraftRgb)}
          />
        </div>
        {!normalizedDraftRgb ? <p id={`${colorId}-error`} className="text-[11px] font-semibold text-[#b91c1c]" role="alert">#RRGGBB 형식으로 입력해 주세요.</p> : null}
        {alphaSupported ? <div className="grid gap-2 rounded-xl border border-[#e2e8f0] bg-white px-3 py-3 sm:grid-cols-[minmax(0,1fr)_96px] sm:items-end">
          <label htmlFor={alphaId} className="grid gap-2 text-[11px] font-bold text-[#475569]"><span className="flex items-center justify-between"><span>투명도</span><span>{themeColorAlphaPercent(value)}%</span></span><input id={alphaId} type="range" min="0" max="100" value={themeColorAlphaPercent(value)} className="w-full accent-[#2563eb]" onChange={(event) => commitAlpha(Number(event.currentTarget.value))} /></label>
          <div className="relative"><input aria-label={`${slot.label} 투명도 퍼센트`} type="number" min="0" max="100" value={themeColorAlphaPercent(value)} className="h-10 w-full rounded-lg border border-[#d1d5db] bg-white pl-3 pr-8 text-right text-sm font-bold" onChange={(event) => commitAlpha(Number(event.currentTarget.value))} /><span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs font-bold text-[#64748b]">%</span></div>
        </div> : null}
        <ColorContextPreview slot={slot} value={effectiveColor} />
        {contrastWarning ? (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
            <p className="text-[11px] font-semibold text-amber-900">{contrastWarning.message} 현재 {contrastWarning.ratio.toFixed(1)}:1 / 권장 {contrastWarning.minimumRatio}:1 이상</p>
            <button type="button" className="rounded-lg bg-white px-2.5 py-1.5 text-[11px] font-bold text-amber-900 shadow-sm" onClick={() => onChange(slot, readableThemeForeground(contrastWarning.background, contrastWarning.minimumRatio))}>대비 맞춤</button>
          </div>
        ) : null}
      </div>
    </Tooltip.Provider>
  );
}

function ColorContextPreview({ slot, value }: { slot: ThemeAssetSlot; value: string }) {
  const cssColor = themeColorToCss(value);
  if (slot.role.startsWith("notification_")) return <div className="rounded-xl p-3 text-xs font-semibold shadow-sm" style={{ backgroundColor: slot.role.includes("background") ? cssColor : "#FFFFFF", color: slot.role === "notification_text_color" ? cssColor : "#111827" }}><BellPreviewIcon /> 새로운 알림을 확인해 주세요.</div>;
  if (slot.role.startsWith("direct_share_")) return <div className="flex items-center justify-between rounded-xl border border-black/5 p-3 text-xs font-semibold" style={{ backgroundColor: slot.role === "direct_share_background_color" ? cssColor : "#F8FAFC", color: slot.role === "direct_share_text_color" ? cssColor : "#111827" }}><span>바로 공유</span><span className="rounded-full px-3 py-1 text-white" style={{ backgroundColor: slot.role === "direct_share_button_color" ? cssColor : "#2563EB" }}>공유</span></div>;
  if (slot.role.includes("badge")) return <div className="flex items-center gap-3 rounded-xl bg-white p-3 text-xs font-semibold"><span>새 소식</span><span className="rounded-full px-2 py-0.5 text-[10px] font-bold text-white" style={{ backgroundColor: cssColor }}>3</span></div>;
  if (slot.role.includes("pressed") || slot.role.includes("focused")) return <div className="grid grid-cols-2 gap-2 text-[11px] font-semibold"><span className="rounded-lg border border-[#e5e7eb] bg-white p-3 text-[#64748b]">기본 상태</span><span className="rounded-lg border border-[#dbeafe] p-3" style={{ backgroundColor: cssColor, color: readableThemeForeground(value) }}>선택·눌림</span></div>;
  if (slot.role === "chat_menu_icon_color" || slot.role === "chat_menu_button_color") return <div className="flex items-center gap-3 rounded-xl bg-white p-3 text-xs font-semibold"><span className="grid size-9 place-items-center rounded-full" style={{ backgroundColor: slot.role === "chat_menu_button_color" ? cssColor : "#F1F5F9", color: slot.role === "chat_menu_icon_color" ? cssColor : "#334155" }}>＋</span>입력 메뉴</div>;
  return null;
}

function ColorSwatch({ value, className }: { value: string; className: string }) {
  return <span className={`relative block overflow-hidden border border-black/10 bg-[linear-gradient(45deg,#e2e8f0_25%,transparent_25%),linear-gradient(-45deg,#e2e8f0_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#e2e8f0_75%),linear-gradient(-45deg,transparent_75%,#e2e8f0_75%)] bg-[length:8px_8px] bg-[position:0_0,0_4px,4px_-4px,-4px_0px] shadow-sm ${className}`} aria-hidden="true"><span className="absolute inset-0" style={{ backgroundColor: themeColorToCss(value) }} /></span>;
}

function InfoTooltip({ label, content, triggerClassName }: { label: string; content: string; triggerClassName?: string }) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>
        <button type="button" aria-label={label} className={`grid shrink-0 place-items-center transition focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#2563eb] ${triggerClassName ?? "size-7 rounded-lg text-[#64748b] hover:bg-white hover:text-[#2563eb] focus-visible:bg-white focus-visible:text-[#2563eb]"}`}>
          <Info size={17} strokeWidth={2.1} aria-hidden="true" />
        </button>
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content side="top" align="center" sideOffset={8} collisionPadding={12} className="radix-tooltip-content z-[80] w-[min(280px,calc(100vw-24px))] rounded-xl border border-[#dbe3ed] bg-white p-3.5 text-left shadow-[0_16px_38px_rgba(15,23,42,0.16)] outline-none">
          <div className="flex items-start gap-2.5">
            <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg bg-[#eff6ff] text-[#2563eb]"><Info size={15} strokeWidth={2.2} aria-hidden="true" /></span>
            <p className="min-w-0 text-[12px] font-medium leading-[1.6] text-[#475569]">{content}</p>
          </div>
          <Tooltip.Arrow className="fill-white" width={12} height={6} />
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

function getAutoColorReason(slot: ThemeAssetSlot) {
  if (slot.autoColorRecipe === "background-average") return "배경 이미지 평균색 기준으로";
  if (slot.autoColorRecipe === "chat-background-average") return "채팅방 배경 이미지 평균색 기준으로";
  if (slot.autoColorRecipe === "surface-background") return "메인 배경색 기준으로";
  if (slot.autoColorRecipe === "header-top") return "배경 이미지 상단색 또는 기본 배경색 기준으로";
  if (slot.autoColorRecipe === "tab-bottom") return "배경 이미지 하단색 또는 기본 배경색 기준으로";
  if (slot.autoColorRecipe?.startsWith("foreground")) return "적용 배경과 읽기 쉬운 대비로";
  if (slot.autoColorRecipe?.startsWith("cell")) return "기본 배경과 전경색 기준으로";
  if (slot.autoColorRecipe?.startsWith("accent")) return "배경 이미지 강조색 기준으로";
  return "현재 메인 팔레트 기준으로";
}

function getAutoColorExplanation(slot: ThemeAssetSlot) {
  switch (slot.autoColorRecipe) {
    case "background-average":
      return "배경 이미지가 있으면 투명 픽셀을 제외한 전체 평균색을 사용합니다. 이미지가 없으면 사용자가 입력한 배경색을 유지합니다."
    case "chat-background-average":
      return "채팅방 배경 이미지가 있으면 투명 픽셀을 제외한 전체 평균색을 사용합니다. 메인 배경과 다른 이미지를 쓰므로 기준도 채팅방 이미지입니다. 이미지가 없으면 현재 채팅방 배경색을 유지합니다.";
    case "header-top":
      return "배경 이미지가 있으면 상단 15% 영역의 대표색을 사용하고, 이미지가 없으면 현재 기본 배경색을 사용합니다.";
    case "tab-bottom":
      return "배경 이미지가 있으면 하단 15% 영역의 대표색을 사용하고, 이미지가 없으면 현재 기본 배경색을 사용합니다.";
    case "surface-background":
      return "현재 기본 배경색을 더보기·보조 콘텐츠 영역의 배경색으로 연결합니다.";
    case "foreground-header":
      return "헤더 배경에서 일반 텍스트가 읽기 쉽도록 4.5:1 이상의 명암 대비를 목표로 전경색을 정합니다.";
    case "foreground-background":
      return "기본 배경에서 일반 텍스트가 읽기 쉽도록 4.5:1 이상의 명암 대비를 목표로 전경색을 정합니다.";
    case "foreground-muted":
      return "기본 배경에서 3:1 이상의 명암 대비를 유지하면서, 주요 텍스트보다 시각적 위계가 낮은 색을 정합니다.";
    case "foreground-pressed":
    case "muted-pressed":
      return "대응하는 일반 상태 색상의 명도만 조정해 눌림 상태가 구분되도록 정합니다.";
    case "cell-transparent":
      return "기본 배경과 같은 RGB를 사용하되 알파를 0%로 설정해 완전히 투명한 셀 배경을 만듭니다.";
    case "cell-pressed":
      return "읽기 쉬운 전경색을 18% 투명도로 기본 배경 위에 겹쳐 눌림 상태를 만듭니다.";
    case "cell-border":
      return "읽기 쉬운 전경색을 15% 투명도로 사용해 배경과 자연스럽게 구분되는 경계색을 만듭니다.";
    case "accent":
      return "배경 이미지의 강조색을 추출하고 가독성이 부족하면 대비를 보정합니다. 추출할 수 없으면 템플릿 강조색을 사용합니다.";
    case "accent-pressed":
      return "자동 추출한 강조색의 명도를 조정해 눌림 상태가 구분되도록 정합니다.";
    case "accent-surface":
      return "기본 배경색에 강조색을 13% 섞어 은은한 강조 영역 배경을 만듭니다.";
    case "accent-surface-pressed":
      return "기본 배경색에 강조색을 22% 섞어 눌림 상태가 더 분명한 강조 영역 배경을 만듭니다.";
    default:
      return "현재 메인 팔레트와 이 슬롯의 화면 역할을 기준으로 추천 색을 계산합니다.";
  }
}

function BellPreviewIcon() {
  return <span aria-hidden="true">●</span>;
}

function isTextColorSlot(slot: ThemeAssetSlot) {
  return ["main_header_foreground_color", "main_title_color", "main_description_color", "tab_paragraph_color", "chat_bubble_me_color", "chat_bubble_you_color", "chat_input_text_color", "direct_share_text_color", "notification_text_color"].includes(slot.role);
}
