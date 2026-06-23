"use client";

import { useEffect, useState, type DragEvent, type MutableRefObject } from "react";
import { ImageOff, Link2, RefreshCw } from "lucide-react";
import InlineBubbleAdjuster from "@/components/editor/InlineBubbleAdjuster";
import { buildSlotCandidates, disabledImageCandidateId, getDefaultColor, getSelectedCandidate, getSlotUploadEntries, slotStatusLabel, type SlotCandidate, type SlotCandidateSelections, type SlotColors, type SlotUploads } from "@/components/project/projectModel";
import type { AdminAssetCandidate } from "@/lib/theme/adminAssets";
import type { ImageColorPalette } from "@/lib/theme/colorPalette";
import type { ThemeProjectFile } from "@/lib/theme/project/types";
import type { ThemeAssetSlot, ThemeTemplate, ThemeTemplateId } from "@/lib/theme/templates";
import type { BubbleSlot, Insets, Markers, StretchPoint, ThemePlatform } from "@/lib/theme/types";

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
  isAutoSurfaceColor,
  onApplyAutoSurfaceColor,
  onApplyAutoSurfaceColorToAll,
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
  isAutoSurfaceColor: boolean;
  onApplyAutoSurfaceColor: (color?: string) => void;
  onApplyAutoSurfaceColorToAll: (color?: string) => void;
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
          <DetailRow label={slot.kind === "color" ? "설정 키" : "파일명"} value={slot.kind === "color" ? slot.colorKey ?? "-" : slot.fileName ?? "-"} />
          <DetailRow label="상태" value={displayStatus} />
        </div>

        {slot.kind === "color" ? (
          <ColorEditor slot={slot} value={colors[slot.id] ?? selectedCandidate?.colorValue ?? getDefaultColor(slot, templateId, template)} onChange={onColorChange} imageColorPalette={imageColorPalette} imageColorPaletteError={imageColorPaletteError} isAutoSurfaceColor={isAutoSurfaceColor} onApplyAutoSurfaceColor={onApplyAutoSurfaceColor} onApplyAutoSurfaceColorToAll={onApplyAutoSurfaceColorToAll} />
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
    const swatch = toCssSwatch(candidate.colorValue);
    return <span className="h-8 w-8 shrink-0 rounded-md border border-[#d1d5db] bg-white" style={{ backgroundColor: swatch.backgroundColor, opacity: swatch.opacity }} />;
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
  isAutoSurfaceColor,
  onApplyAutoSurfaceColor,
  onApplyAutoSurfaceColorToAll,
}: {
  slot: ThemeAssetSlot;
  value: string;
  onChange: (slot: ThemeAssetSlot, value: string) => void;
  imageColorPalette: ImageColorPalette | null;
  imageColorPaletteError: string | null;
  isAutoSurfaceColor: boolean;
  onApplyAutoSurfaceColor: (color?: string) => void;
  onApplyAutoSurfaceColorToAll: (color?: string) => void;
}) {
  const canUseColorPicker = /^#[0-9a-f]{6}$/i.test(value);
  const contrastBackground = imageColorPalette?.representative;
  const showContrastWarning = Boolean(contrastBackground && isTextColorSlot(slot) && contrastRatio(value, contrastBackground) < 3);

  return (
    <div className="grid gap-4 rounded-xl border border-[#e5e7eb] bg-[#f8fafc] p-4">
      {slot.autoColorGroup === "main-surface" ? (
        <div className="grid gap-3 rounded-xl border border-[#bfdbfe] bg-[#eff6ff] p-3">
          <div className="flex items-start gap-2">
            <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-white text-[#2563eb]"><Link2 size={16} aria-hidden="true" /></span>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold text-[#1e3a8a]">배경 이미지 자동 맞춤</p>
              <p className="mt-1 text-[11px] font-medium leading-5 text-[#475569]">{isAutoSurfaceColor ? "이미지가 바뀌면 이 색상도 자동으로 갱신됩니다." : "현재 색상은 수동 설정입니다. 언제든 자동 연결을 복원할 수 있습니다."}</p>
            </div>
          </div>
          {imageColorPalette ? (
            <div className="grid grid-cols-3 gap-2">
              {([['대표색', imageColorPalette.representative], ['평균색', imageColorPalette.average], ['상단색', imageColorPalette.top]] as const).map(([label, color]) => (
                <button key={label} type="button" className="grid gap-1.5 rounded-lg border border-white/80 bg-white p-2 text-left shadow-sm transition hover:border-[#93c5fd] focus-visible:outline-2 focus-visible:outline-[#2563eb]" onClick={() => onApplyAutoSurfaceColor(color)}>
                  <span className="h-7 rounded-md border border-black/10" style={{ backgroundColor: color }} />
                  <span className="text-[10px] font-bold text-[#334155]">{label}</span>
                  <span className="truncate text-[9px] font-semibold text-[#64748b]">{color}</span>
                </button>
              ))}
            </div>
          ) : <p className="text-[11px] font-semibold text-[#64748b]">{imageColorPaletteError ?? "배경 이미지 색상을 분석하는 중입니다."}</p>}
          <div className="flex flex-wrap gap-2">
            <button type="button" className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-[#2563eb] px-3 text-xs font-bold text-white disabled:opacity-45" disabled={!imageColorPalette} onClick={() => onApplyAutoSurfaceColor()}><RefreshCw size={13} aria-hidden="true" />이 슬롯 다시 연결</button>
            <button type="button" className="min-h-9 rounded-lg border border-[#bfdbfe] bg-white px-3 text-xs font-bold text-[#1d4ed8] disabled:opacity-45" disabled={!imageColorPalette} onClick={() => onApplyAutoSurfaceColorToAll()}>배경 3종 모두 맞춤</button>
          </div>
        </div>
      ) : null}
      <div className="flex items-center gap-4">
        {canUseColorPicker ? (
          <input type="color" value={value} className="h-12 w-16 cursor-pointer rounded-lg border border-[#d1d5db] bg-white p-1" onChange={(event) => onChange(slot, event.currentTarget.value)} />
        ) : null}
        <input
          type="text"
          value={value}
          className="h-12 flex-1 rounded-xl border border-[#d1d5db] bg-white px-4 text-sm font-semibold text-[#111827]"
          onChange={(event) => onChange(slot, event.currentTarget.value)}
        />
      </div>
      <ColorContextPreview slot={slot} value={value} />
      {showContrastWarning && contrastBackground ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
          <p className="text-[11px] font-semibold text-amber-900">배경과의 대비가 낮아 텍스트가 흐리게 보일 수 있습니다.</p>
          <button type="button" className="rounded-lg bg-white px-2.5 py-1.5 text-[11px] font-bold text-amber-900 shadow-sm" onClick={() => onChange(slot, readableTextColor(contrastBackground))}>대비 맞춤</button>
        </div>
      ) : null}
    </div>
  );
}

function ColorContextPreview({ slot, value }: { slot: ThemeAssetSlot; value: string }) {
  if (slot.role.startsWith("notification_")) return <div className="rounded-xl p-3 text-xs font-semibold shadow-sm" style={{ backgroundColor: slot.role.includes("background") ? value : "#FFFFFF", color: slot.role === "notification_text_color" ? value : "#111827" }}><BellPreviewIcon /> 새로운 알림을 확인해 주세요.</div>;
  if (slot.role.startsWith("direct_share_")) return <div className="flex items-center justify-between rounded-xl border border-black/5 p-3 text-xs font-semibold" style={{ backgroundColor: slot.role === "direct_share_background_color" ? value : "#F8FAFC", color: slot.role === "direct_share_text_color" ? value : "#111827" }}><span>바로 공유</span><span className="rounded-full px-3 py-1 text-white" style={{ backgroundColor: slot.role === "direct_share_button_color" ? value : "#2563EB" }}>공유</span></div>;
  if (slot.role.includes("badge")) return <div className="flex items-center gap-3 rounded-xl bg-white p-3 text-xs font-semibold"><span>새 소식</span><span className="rounded-full px-2 py-0.5 text-[10px] font-bold text-white" style={{ backgroundColor: value }}>3</span></div>;
  if (slot.role.includes("pressed") || slot.role.includes("focused")) return <div className="grid grid-cols-2 gap-2 text-[11px] font-semibold"><span className="rounded-lg border border-[#e5e7eb] bg-white p-3 text-[#64748b]">기본 상태</span><span className="rounded-lg border border-[#dbeafe] p-3" style={{ backgroundColor: value, color: readableTextColor(value) }}>선택·눌림</span></div>;
  if (slot.role === "chat_menu_icon_color" || slot.role === "chat_menu_button_color") return <div className="flex items-center gap-3 rounded-xl bg-white p-3 text-xs font-semibold"><span className="grid size-9 place-items-center rounded-full" style={{ backgroundColor: slot.role === "chat_menu_button_color" ? value : "#F1F5F9", color: slot.role === "chat_menu_icon_color" ? value : "#334155" }}>＋</span>입력 메뉴</div>;
  return null;
}

function BellPreviewIcon() {
  return <span aria-hidden="true">●</span>;
}

function isTextColorSlot(slot: ThemeAssetSlot) {
  return ["main_header_foreground_color", "main_title_color", "main_description_color", "tab_paragraph_color", "chat_bubble_me_color", "chat_bubble_you_color", "chat_input_text_color", "direct_share_text_color", "notification_text_color"].includes(slot.role);
}

function readableTextColor(background: string) {
  return contrastRatio("#111111", background) >= contrastRatio("#FFFFFF", background) ? "#111111" : "#FFFFFF";
}

function contrastRatio(foreground: string, background: string) {
  const luminance = (color: string) => {
    const normalized = color.replace("#", "").slice(-6);
    if (!/^[0-9a-f]{6}$/i.test(normalized)) return 0;
    const channels = [0, 2, 4].map((index) => Number.parseInt(normalized.slice(index, index + 2), 16) / 255).map((channel) => channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
    return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  };
  const first = luminance(foreground);
  const second = luminance(background);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[#e5e7eb] bg-[#f8fafc] px-4 py-3">
      <span className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-[#94a3b8]">{label}</span>
      <strong className="mt-1 block break-all text-sm font-semibold text-[#111827]">{value}</strong>
    </div>
  );
}

function toCssSwatch(value: string) {
  const normalized = value.trim();
  if (/^#[0-9a-f]{6}$/i.test(normalized)) {
    return { backgroundColor: normalized, opacity: 1 };
  }
  if (/^#[0-9a-f]{8}$/i.test(normalized)) {
    const alpha = Number.parseInt(normalized.slice(1, 3), 16) / 255;
    return { backgroundColor: `#${normalized.slice(3)}`, opacity: Math.max(0.2, alpha) };
  }
  return { backgroundColor: "#f1f5f9", opacity: 1 };
}

function groupSourceLabel(source: SlotCandidate["source"]) {
  if (source === "admin") return "관리 후보";
  if (source === "template") return "템플릿";
  if (source === "palette") return "팔레트";
  if (source === "default") return "기본";
  if (source === "upload") return "업로드";
  return "후보";
}
