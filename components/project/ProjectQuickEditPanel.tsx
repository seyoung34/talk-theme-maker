"use client";

import { useEffect, useId, useState, type DragEvent, type MutableRefObject } from "react";
import { ImageOff, Info, Link2, RefreshCw } from "lucide-react";
import * as Tooltip from "@radix-ui/react-tooltip";
import InlineBubbleAdjuster from "@/components/editor/InlineBubbleAdjuster";
import { buildSlotCandidates, disabledImageCandidateId, getDefaultColor, getSelectedCandidate, getSlotUploadEntries, slotStatusLabel, type SlotCandidate, type SlotCandidateSelections, type SlotColors, type SlotUploads } from "@/components/project/projectModel";
import type { AdminAssetCandidate } from "@/lib/theme/adminAssets";
import type { ImageColorPalette } from "@/lib/theme/colorPalette";
import type { ThemeProjectFile } from "@/lib/theme/project/types";
import type { ThemeAssetSlot, ThemeTemplate, ThemeTemplateId } from "@/lib/theme/templates";
import type { BubbleSlot, Insets, Markers, StretchPoint, ThemePlatform } from "@/lib/theme/types";
import { normalizeThemeColor, readableThemeForeground, setThemeColorAlpha, setThemeColorRgb, themeColorAlphaPercent, themeColorContrast, themeColorRgbHex, themeColorToCss } from "@/lib/theme/color";

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
  markers,
  insets,
  stretch,
  fileInputRefs,
  onUpload,
  onClear,
  onColorChange,
  imageColorPalette,
  imageColorPaletteError,
  recommendedColor,
  isAutoColor,
  canApplyAutoColor,
  canApplyAutoColorToAll,
  onApplyAutoColor,
  onApplyAutoColorToAll,
  onSelectCandidate,
  onSelectAdminAsset,
  onLoadMoreAdminAssets,
  onOpenAdvanced,
  onMarkersChange,
  onInsetsChange,
  onStretchChange,
  canAdjustInline,
  candidateOpen,
  onToggleCandidates,
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
  markers?: Markers;
  insets?: Insets;
  stretch?: StretchPoint;
  fileInputRefs: MutableRefObject<Record<string, HTMLInputElement | null>>;
  onUpload: (slot: ThemeAssetSlot, files: FileList | readonly File[] | null) => void;
  onClear: (slot: ThemeAssetSlot) => void;
  onColorChange: (slot: ThemeAssetSlot, value: string) => void;
  imageColorPalette: ImageColorPalette | null;
  imageColorPaletteError: string | null;
  recommendedColor?: string;
  isAutoColor: boolean;
  canApplyAutoColor: boolean;
  canApplyAutoColorToAll: boolean;
  onApplyAutoColor: () => void;
  onApplyAutoColorToAll: () => void;
  onSelectCandidate: (slot: ThemeAssetSlot, candidateId: string) => void;
  onSelectAdminAsset: (slot: ThemeAssetSlot, asset: AdminAssetCandidate) => void;
  onLoadMoreAdminAssets: () => void;
  onOpenAdvanced: () => void;
  onMarkersChange: (markers: Markers) => void;
  onInsetsChange: (insets: Insets) => void;
  onStretchChange: (stretch: StretchPoint) => void;
  canAdjustInline: boolean;
  candidateOpen: boolean;
  onToggleCandidates: () => void;
}) {
  const [dragActive, setDragActive] = useState(false);
  const [pasteFeedback, setPasteFeedback] = useState(false);
  const [uploadPreviewUrls, setUploadPreviewUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    const entries = Object.values(uploads).flatMap((items) => items ?? []);
    const next = Object.fromEntries(entries.map((entry) => [entry.id, URL.createObjectURL(entry.file)]));
    setUploadPreviewUrls(next);
    return () => {
      Object.values(next).forEach((url) => URL.revokeObjectURL(url));
    };
  }, [uploads]);

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

  const hasImage = Boolean(file?.file || file?.sourceUrl);
  const status = slotStatusLabel(slot, uploads, colors, selections, templateId, template, slots);
  const candidates = buildSlotCandidates(slot, uploads, colors, selections, templateId, template, slots, adminAssets, uploadPreviewUrls);
  const selectedCandidate = getSelectedCandidate(slot, selections, templateId, template);
  const selectedPickerCandidate = candidates.find((candidate) => candidate.selected);
  const adminAssetIds = new Set(adminAssets.map((asset) => asset.id));
  const uploadEntries = getSlotUploadEntries(slot, uploads).filter((entry) => (entry.source ?? "user") === "user" && !adminAssetIds.has(entry.id));
  const displayStatus =
    selectedPickerCandidate?.source === "admin"
      ? `추천 에셋 · ${selectedPickerCandidate.title}`
      : selectedPickerCandidate?.source === "template"
        ? `템플릿 에셋 · ${selectedPickerCandidate.status}`
        : status;

  const handleDrop = (event: DragEvent<HTMLButtonElement | HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setDragActive(false);
    if (slot.kind !== "color") {
      onUpload(slot, event.dataTransfer.files);
    }
  };

  return (
    <div className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-3">
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
      />

      <section className="grid min-h-0 content-start gap-4 overflow-auto rounded-xl border border-[#e5e7eb] bg-white p-5 shadow-[0_12px_28px_rgba(15,23,42,0.04)]">
        <div className="grid gap-3 lg:grid-cols-2">
          {slot.kind !== "color" ? <DetailRow label="파일명" value={slot.fileName ?? "-"} /> : null}
          {slot.cssSelector && slot.cssProperty ? <DetailRow label="CSS 위치" value={formatCssReference(slot.cssSelector, slot.cssProperty)} technical /> : null}
          {slot.platform === "android" && slot.kind === "color" ? <DetailRow label="설정 키" value={slot.colorKey ?? "-"} technical /> : null}
          <DetailRow label="상태" value={displayStatus} />
        </div>

        {slot.kind === "color" ? (
          <ColorEditor slot={slot} value={colors[slot.id] ?? selectedCandidate?.colorValue ?? getDefaultColor(slot, templateId, template)} onChange={onColorChange} imageColorPalette={imageColorPalette} imageColorPaletteError={imageColorPaletteError} recommendedColor={recommendedColor} isAutoColor={isAutoColor} canApplyAutoColor={canApplyAutoColor} canApplyAutoColorToAll={canApplyAutoColorToAll} onApplyAutoColor={onApplyAutoColor} onApplyAutoColorToAll={onApplyAutoColorToAll} />
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
              className={`grid gap-4 rounded-xl border-2 border-dashed p-4 transition ${dragActive || pasteFeedback ? "border-[#60a5fa] bg-[#eff6ff]" : "border-[#d7dee8] bg-[#f8fafc]"}`}
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
                <p className="text-sm font-semibold text-[#0f172a]">직접 업로드</p>
                <p className="mt-1 text-[12px] font-medium text-[#6b7280]">파일을 끌어다 놓거나 선택하세요. 클립보드 이미지는 Ctrl+V 또는 ⌘V로 붙여넣을 수 있습니다.</p>
                <p className="sr-only" role="status" aria-live="polite">{pasteFeedback ? "클립보드 이미지를 추가했습니다." : ""}</p>
              </div>

              <div className="flex flex-wrap gap-3">
                <button type="button" className="rounded-lg bg-[#0f172a] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#1e293b]" onClick={() => fileInputRefs.current[slot.id]?.click()}>
                  이미지 선택
                </button>
                <button
                  type="button"
                  className="rounded-lg border border-[#d1d5db] bg-white px-4 py-3 text-sm font-semibold text-[#374151] transition enabled:hover:bg-[#f8fafc] disabled:cursor-not-allowed disabled:opacity-45"
                  disabled={uploadEntries.length === 0}
                  onClick={() => onClear(slot)}
                >
                  직접 업로드 비우기
                </button>
                {slot.editableInBubbleEditor ? (
                  <button
                    type="button"
                    className="rounded-lg border border-[#bfdbfe] bg-[#eff6ff] px-4 py-3 text-sm font-semibold text-[#1d4ed8] transition enabled:hover:bg-[#dbeafe] disabled:cursor-not-allowed disabled:opacity-45"
                    disabled={!hasImage}
                    onClick={onOpenAdvanced}
                  >
                    정밀 조정
                  </button>
                ) : null}
              </div>
            </div>

            {canAdjustInline && selectedBubbleSlot ? (
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
            ) : null}
          </>
        )}
      </section>
    </div>
  );
}

function CandidatePicker({
  slot,
  candidates,
  selectedCandidate,
  isOpen,
  onToggle,
  onApplyCandidate,
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
  hasMoreAdminAssets: boolean;
  isLoadingAdminAssets: boolean;
  onLoadMoreAdminAssets: () => void;
}) {
  type CandidateGroup = { key: SlotCandidate["source"]; label: string; items: SlotCandidate[] };
  const groups: CandidateGroup[] = [
    { key: "palette" as const, label: "팔레트", items: candidates.filter((candidate) => candidate.source === "palette") },
    { key: "default" as const, label: "기본값", items: candidates.filter((candidate) => candidate.source === "default") },
    { key: "template" as const, label: "템플릿 에셋", items: candidates.filter((candidate) => candidate.source === "template") },
    { key: "upload" as const, label: "내 업로드", items: candidates.filter((candidate) => candidate.source === "upload") },
    { key: "creator" as const, label: "제작자 후보", items: candidates.filter((candidate) => candidate.source === "creator") },
  ].filter((group) => group.items.length > 0);
  const adminItems = candidates.filter((candidate) => candidate.source === "admin");
  if (adminItems.length > 0 && !groups.some((group) => group.key === "admin")) {
    groups.splice(Math.max(0, groups.length - 1), 0, { key: "admin", label: "추천 에셋", items: adminItems });
  }

  const preferredTab = slot.kind === "color" ? groups[0]?.key : (selectedCandidate?.source ?? groups[0]?.key);
  const [activeTab, setActiveTab] = useState<CandidateGroup["key"] | undefined>(preferredTab);

  useEffect(() => {
    if (!groups.some((group) => group.key === activeTab)) {
      setActiveTab(preferredTab);
    }
  }, [activeTab, groups, preferredTab]);

  useEffect(() => {
    setActiveTab(slot.kind === "color" ? groups[0]?.key : (selectedCandidate?.source ?? groups[0]?.key));
  }, [slot.id]);

  const activeGroup = groups.find((group) => group.key === activeTab) ?? groups[0];

  return (
    <section className="overflow-hidden rounded-xl border border-[#e5e7eb] bg-white px-4 py-4 shadow-[0_10px_24px_rgba(15,23,42,0.04)]">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div>
          <h2 className="mt-0.5 inline text-base font-semibold text-[#0f172a]">{slot.label}</h2>
          <div className="flex flex-wrap items-center inline gap-2 ml-6">
            {groups.map((group) => (
              <button
                key={group.key}
                type="button"
                className={`inline-flex h-9 items-center gap-2 rounded-full border px-3.5 mr-2 text-[12px] font-semibold transition ${activeGroup.key === group.key ? "border-[#2563eb] bg-[#eff6ff] text-[#1d4ed8]" : "border-[#e5e7eb] bg-[#f8fafc] text-[#475569] hover:bg-white"
                  }`}
                onClick={() => setActiveTab(group.key)}
              >
                <span>{group.label}</span>
                <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${activeGroup.key === group.key ? "bg-white text-[#1d4ed8]" : "bg-white text-[#64748b]"}`}>{group.items.length}</span>
              </button>
            ))}
          </div>
        </div>

        <button
          type="button"
          className="grid h-9 w-9 place-items-center rounded-lg border border-[#e5e7eb] bg-[#f8fafc] text-sm font-bold text-[#475569]"
          onClick={onToggle}
          aria-label={isOpen ? "후보 접기" : "후보 펼치기"}
        >
          {isOpen ? "−" : "+"}
        </button>
      </div>

      {isOpen && activeGroup ? (
        <div className="grid gap-3">
          <div className="flex flex-nowrap gap-2 overflow-x-auto pb-1 [scrollbar-width:thin]">
            {activeGroup.items.map((candidate) => (
              <button
                key={candidate.id}
                type="button"
                className={`flex h-[104px] w-40 shrink-0 flex-col justify-between rounded-xl border px-3 py-3 text-left transition ${candidate.selected
                  ? "border-[#2563eb] bg-[#eff6ff] shadow-[inset_0_0_0_1px_rgba(37,99,235,0.18)]"
                  : candidate.active
                    ? "border-[#cbd5e1] bg-white"
                    : "border-[#e5e7eb] bg-white hover:border-[#cbd5e1]"
                  }`}
                onClick={() => {
                  onApplyCandidate(candidate);
                }}
              >
                <div className="flex items-start gap-2">
                  <CandidateSwatch candidate={candidate} />
                  <div className="min-w-0">
                    <span className="block truncate text-[12px] font-semibold text-[#111827]">{candidate.title}</span>
                    <span className="mt-1 block text-[10px] font-medium text-[#64748b]">{groupSourceLabel(candidate.source)}</span>
                  </div>
                </div>
                <div className="grid gap-1">
                  {candidate.selected ? <span className="text-[10px] font-semibold text-[#2563eb]">사용 중</span> : null}
                  <span className="line-clamp-2 text-[11px] font-medium leading-[1.3] text-[#6b7280]">{candidate.status}</span>
                </div>
              </button>
            ))}
            {activeGroup.key === "admin" && hasMoreAdminAssets ? (
              <button type="button" className="flex h-[104px] w-32 shrink-0 items-center justify-center rounded-xl border border-dashed border-[#cbd5e1] bg-[#f8fafc] px-3 text-center text-xs font-semibold text-[#475569] disabled:opacity-50" onClick={onLoadMoreAdminAssets} disabled={isLoadingAdminAssets}>
                {isLoadingAdminAssets ? "불러오는 중" : "더 보기"}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function CandidateSwatch({ candidate }: { candidate: SlotCandidate }) {
  if (candidate.id === disabledImageCandidateId) {
    return <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md border border-dashed border-[#cbd5e1] bg-[#f8fafc] text-[#64748b]"><ImageOff size={15} aria-hidden="true" /></span>;
  }
  if (candidate.colorValue) {
    return <ColorSwatch value={candidate.colorValue} className="h-8 w-8 shrink-0 rounded-md" />;
  }
  if (candidate.previewUrl) {
    return <span className="h-8 w-8 shrink-0 rounded-md border border-[#d1d5db] bg-white bg-contain bg-center bg-no-repeat" style={{ backgroundImage: `url(${candidate.previewUrl})` }} />;
  }
  return <span className="h-8 w-8 shrink-0 rounded-md border border-[#d1d5db] bg-[#e5e7eb]" />;
}

function ColorEditor({
  slot,
  value,
  onChange,
  imageColorPalette,
  imageColorPaletteError,
  recommendedColor,
  isAutoColor,
  canApplyAutoColor,
  canApplyAutoColorToAll,
  onApplyAutoColor,
  onApplyAutoColorToAll,
}: {
  slot: ThemeAssetSlot;
  value: string;
  onChange: (slot: ThemeAssetSlot, value: string) => void;
  imageColorPalette: ImageColorPalette | null;
  imageColorPaletteError: string | null;
  recommendedColor?: string;
  isAutoColor: boolean;
  canApplyAutoColor: boolean;
  canApplyAutoColorToAll: boolean;
  onApplyAutoColor: () => void;
  onApplyAutoColorToAll: () => void;
}) {
  const [draft, setDraft] = useState(value);
  const colorId = useId();
  const alphaId = useId();
  const normalizedDraft = normalizeThemeColor(draft);
  const effectiveColor = normalizedDraft ?? normalizeThemeColor(value) ?? "#000000";
  const contrastBackground = imageColorPalette?.average;
  const showContrastWarning = Boolean(contrastBackground && isTextColorSlot(slot) && themeColorContrast(effectiveColor, contrastBackground) < 3);

  useEffect(() => setDraft(value), [slot.id, value]);

  const commit = (nextValue: string) => {
    const normalized = normalizeThemeColor(nextValue);
    setDraft(nextValue);
    if (normalized) onChange(slot, normalized);
  };

  return (
    <Tooltip.Provider delayDuration={260} skipDelayDuration={100}>
      <div className="grid gap-4 rounded-xl border border-[#e5e7eb] bg-[#f8fafc] p-4">
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
                <button type="button" className="inline-flex min-h-9 items-center gap-1.5 rounded-l-lg bg-[#2563eb] px-3 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-45" disabled={!canApplyAutoColor} onClick={onApplyAutoColor}><RefreshCw size={13} aria-hidden="true" />추천 색 다시 적용</button>
                <InfoTooltip label="추천 색 다시 적용 안내" content="현재 슬롯만 자동 맞춤 상태로 다시 연결합니다. 이후 배경 이미지나 기준 배경색이 바뀌면 이 슬롯의 추천 색도 함께 갱신되며, 다른 수동 설정값은 변경하지 않습니다." triggerClassName="min-h-9 rounded-r-lg border-l border-white/30 bg-[#2563eb] px-2 text-white hover:bg-[#1d4ed8] focus-visible:bg-[#1d4ed8]" />
              </div>
              <div className="inline-flex overflow-hidden rounded-lg shadow-sm">
                <button type="button" className="min-h-9 rounded-l-lg border border-r-0 border-[#bfdbfe] bg-white px-3 text-xs font-bold text-[#1d4ed8] disabled:cursor-not-allowed disabled:opacity-45" disabled={!canApplyAutoColorToAll} onClick={onApplyAutoColorToAll}>메인 색상 모두 자동 맞춤</button>
                <InfoTooltip label="메인 색상 모두 자동 맞춤 안내" content="친구·채팅 목록·더보기·하단 탭의 자동 맞춤 대상 색상을 현재 팔레트로 다시 계산합니다. 직접 수정한 색상도 추천값으로 바뀝니다. 배경 이미지가 없으면 현재 배경색을 기준으로 계산합니다." triggerClassName="min-h-9 rounded-r-lg border border-[#bfdbfe] bg-white px-2 text-[#1d4ed8] hover:bg-[#eff6ff] focus-visible:bg-[#eff6ff]" />
              </div>
            </div>
          </div>
        ) : null}
        <div className="grid gap-3 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-end">
          <label className="grid gap-1.5 text-[11px] font-bold text-[#475569]" htmlFor={colorId}>색상
            <span className="relative block size-12 overflow-hidden rounded-xl outline-none ring-offset-2 transition hover:ring-2 hover:ring-[#bfdbfe] focus-within:ring-2 focus-within:ring-[#2563eb]">
              <ColorSwatch value={effectiveColor} className="size-full rounded-xl" />
              <input id={colorId} aria-label={`${slot.label} RGB 색상 선택`} type="color" value={themeColorRgbHex(effectiveColor)} className="absolute inset-0 size-full cursor-pointer opacity-0" onChange={(event) => commit(setThemeColorRgb(effectiveColor, event.currentTarget.value))} />
            </span>
          </label>
          <input
            type="text"
            aria-label={`${slot.label} 색상 코드`}
            value={draft}
            aria-invalid={!normalizedDraft}
            aria-describedby={!normalizedDraft ? `${colorId}-error` : undefined}
            className={`h-12 min-w-0 rounded-xl border bg-white px-4 font-mono text-sm font-semibold text-[#111827] outline-none focus:ring-2 ${normalizedDraft ? "border-[#d1d5db] focus:border-[#60a5fa] focus:ring-[#bfdbfe]" : "border-[#ef4444] focus:ring-[#fecaca]"}`}
            onChange={(event) => commit(event.currentTarget.value)}
            onBlur={() => normalizedDraft && setDraft(normalizedDraft)}
          />
        </div>
        {!normalizedDraft ? <p id={`${colorId}-error`} className="text-[11px] font-semibold text-[#b91c1c]" role="alert">#RRGGBB 또는 Android #AARRGGBB 형식으로 입력해 주세요.</p> : null}
        <div className="grid gap-2 rounded-xl border border-[#e2e8f0] bg-white px-3 py-3 sm:grid-cols-[minmax(0,1fr)_96px] sm:items-end">
          <label htmlFor={alphaId} className="grid gap-2 text-[11px] font-bold text-[#475569]"><span className="flex items-center justify-between"><span>투명도</span><span>{themeColorAlphaPercent(effectiveColor)}%</span></span><input id={alphaId} type="range" min="0" max="100" value={themeColorAlphaPercent(effectiveColor)} className="w-full accent-[#2563eb]" onChange={(event) => commit(setThemeColorAlpha(effectiveColor, Number(event.currentTarget.value)))} /></label>
          <div className="relative"><input aria-label={`${slot.label} 투명도 퍼센트`} type="number" min="0" max="100" value={themeColorAlphaPercent(effectiveColor)} className="h-10 w-full rounded-lg border border-[#d1d5db] bg-white pl-3 pr-8 text-right text-sm font-bold" onChange={(event) => commit(setThemeColorAlpha(effectiveColor, Number(event.currentTarget.value)))} /><span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs font-bold text-[#64748b]">%</span></div>
        </div>
        <ColorContextPreview slot={slot} value={effectiveColor} />
        {showContrastWarning && contrastBackground ? (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
            <p className="text-[11px] font-semibold text-amber-900">배경과의 대비가 낮아 텍스트가 흐리게 보일 수 있습니다.</p>
            <button type="button" className="rounded-lg bg-white px-2.5 py-1.5 text-[11px] font-bold text-amber-900 shadow-sm" onClick={() => onChange(slot, readableThemeForeground(contrastBackground))}>대비 맞춤</button>
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
      return "배경 이미지가 있으면 투명 픽셀을 제외한 전체 평균색을 사용합니다. 이미지가 없으면 사용자가 입력한 배경색을 유지합니다.";
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

function DetailRow({ label, value, technical = false }: { label: string; value: string; technical?: boolean }) {
  return (
    <div className="rounded-lg border border-[#e5e7eb] bg-[#f8fafc] px-4 py-3">
      <span className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-[#94a3b8]">{label}</span>
      <strong className={`mt-1 block break-all text-sm text-[#111827] ${technical ? "font-mono font-medium" : "font-semibold"}`}>{value}</strong>
    </div>
  );
}

function formatCssReference(selector: string | string[], property: string) {
  return `${Array.isArray(selector) ? selector.join(" / ") : selector} · ${property}`;
}

function groupSourceLabel(source: SlotCandidate["source"]) {
  if (source === "admin") return "관리 후보";
  if (source === "template") return "템플릿";
  if (source === "palette") return "팔레트";
  if (source === "default") return "기본";
  if (source === "upload") return "업로드";
  return "후보";
}
