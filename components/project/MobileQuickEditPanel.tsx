"use client";

import { useEffect, useState, type MutableRefObject } from "react";
import { ImageOff, Sliders } from "lucide-react";
import {
  buildSlotCandidates,
  getDefaultColor,
  getSelectedCandidate,
  getSlotUploadEntries,
  slotStatusLabel,
  type SlotCandidate,
  type SlotCandidateSelections,
  type SlotColors,
  type SlotUploads,
} from "@/components/project/projectModel";
import type { SlotContrastWarning } from "@/components/project/slotContrast";
import type { AdminAssetCandidate } from "@/lib/theme/adminAssets";
import type { ThemeProjectFile } from "@/lib/theme/project/types";
import type { ThemeAssetSlot, ThemeTemplate, ThemeTemplateId } from "@/lib/theme/templates";
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
  contrastWarning?: SlotContrastWarning;
  recommendedColor?: string;
  isAutoColor: boolean;
  canApplyAutoColor: boolean;
  fileInputRefs: MutableRefObject<Record<string, HTMLInputElement | null>>;
  onUpload: (slot: ThemeAssetSlot, files: FileList | readonly File[] | null) => void;
  onClear: (slot: ThemeAssetSlot) => void;
  onColorChange: (slot: ThemeAssetSlot, value: string) => void;
  onSelectCandidate: (slot: ThemeAssetSlot, candidateId: string) => void;
  onSelectAdminAsset: (slot: ThemeAssetSlot, asset: AdminAssetCandidate) => void;
  onApplyAutoColor: () => void;
  onOpenAdvanced: () => void;
};

export function MobileQuickEditPanel(props: MobileQuickEditPanelProps) {
  const { slot, slots, file, uploads, colors, selections, adminAssets, templateId, template } = props;
  const [uploadPreviewUrls, setUploadPreviewUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    const entries = Object.values(uploads).flatMap((items) => items ?? []);
    const next = Object.fromEntries(entries.map((entry) => [entry.id, URL.createObjectURL(entry.file)]));
    setUploadPreviewUrls(next);
    return () => {
      Object.values(next).forEach((url) => URL.revokeObjectURL(url));
    };
  }, [uploads]);

  if (!slot) {
    return <p className="px-1 py-6 text-center text-[13px] font-medium text-[#94a3b8]">편집할 슬롯을 선택하세요.</p>;
  }

  const status = slotStatusLabel(slot, uploads, colors, selections, templateId, template, slots);
  const candidates = buildSlotCandidates(slot, uploads, colors, selections, templateId, template, slots, adminAssets, uploadPreviewUrls);

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
          <span className="mt-0.5 block truncate text-[12px] font-medium text-[#64748b]">{status}</span>
        </div>
        {props.contrastWarning ? (
          <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">대비 확인</span>
        ) : null}
      </div>

      {slot.kind === "color" ? (
        <ColorControls {...props} slot={slot} candidates={candidates} />
      ) : (
        <ImageControls {...props} slot={slot} file={file} candidates={candidates} applyCandidate={applyCandidate} uploadPreviewUrls={uploadPreviewUrls} />
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

  return (
    <div className="grid gap-3">
      <div className="flex items-center gap-2">
        <span className="size-11 shrink-0 rounded-xl border border-black/10 shadow-sm" style={{ backgroundColor: themeColorToCss(value) }} aria-hidden="true" />
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
          {recommendedColor ? <span className="ml-1 size-4 rounded border border-black/10" style={{ backgroundColor: themeColorToCss(recommendedColor) }} aria-hidden="true" /> : null}
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
  onClear,
  onOpenAdvanced,
  file,
}: MobileQuickEditPanelProps & {
  slot: ThemeAssetSlot;
  candidates: SlotCandidate[];
  applyCandidate: (candidate: SlotCandidate) => void;
  uploadPreviewUrls: Record<string, string>;
}) {
  const adminAssetIds = new Set(adminAssets.map((asset) => asset.id));
  const userUploads = getSlotUploadEntries(slot, uploads).filter((entry) => (entry.source ?? "user") === "user" && !adminAssetIds.has(entry.id));
  const hasImage = Boolean(file?.file || file?.sourceUrl);

  return (
    <div className="grid gap-3">
      <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {candidates.map((candidate) => {
          const preview = candidate.previewUrl ?? (candidate.id.startsWith(slot.id) ? uploadPreviewUrls[candidate.id] : undefined);
          return (
            <button
              key={candidate.id}
              type="button"
              aria-pressed={candidate.selected}
              className={`grid w-[76px] shrink-0 gap-1 rounded-xl border p-1.5 text-left transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563eb] ${candidate.selected ? "border-[#60a5fa] bg-[#eff6ff]" : "border-[#e5e7eb] bg-white"}`}
              onClick={() => applyCandidate(candidate)}
            >
              <span className="grid aspect-square place-items-center overflow-hidden rounded-lg border border-[#e5e7eb] bg-[#f8fafc]">
                {preview ? (
                  <span className="block h-full w-full bg-white bg-contain bg-center bg-no-repeat" style={{ backgroundImage: `url(${preview})` }} />
                ) : (
                  <ImageOff size={16} className="text-[#94a3b8]" aria-hidden="true" />
                )}
              </span>
              <span className="truncate text-[10px] font-semibold text-[#334155]">{candidate.title}</span>
            </button>
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

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="inline-flex min-h-11 flex-1 items-center justify-center rounded-xl bg-[#0f172a] px-3 text-[13px] font-bold text-white transition hover:bg-[#1e293b] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563eb]"
          onClick={() => fileInputRefs.current[slot.id]?.click()}
        >
          이미지 선택
        </button>
        <button
          type="button"
          className="inline-flex min-h-11 items-center justify-center rounded-xl border border-[#d1d5db] bg-white px-3 text-[13px] font-bold text-[#374151] transition enabled:hover:bg-[#f8fafc] disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563eb]"
          disabled={userUploads.length === 0}
          onClick={() => onClear(slot)}
        >
          비우기
        </button>
        {slot.editableInBubbleEditor ? (
          <button
            type="button"
            className="inline-flex min-h-11 items-center justify-center rounded-xl border border-[#bfdbfe] bg-[#eff6ff] px-3 text-[13px] font-bold text-[#1d4ed8] transition enabled:hover:bg-[#dbeafe] disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563eb]"
            disabled={!hasImage}
            onClick={onOpenAdvanced}
          >
            정밀 조정
          </button>
        ) : null}
      </div>
    </div>
  );
}
