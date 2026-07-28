"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, ChevronDown, ImageOff, Info } from "lucide-react";
import type { ThemeAssetSlot, ThemeTemplate, ThemeTemplateId } from "@/lib/theme/templates";
import type { ThemeSlotGroup } from "@/lib/theme/types";
import { buildSlotCandidates, groupLabels, slotStatusLabel, type SlotCandidateSelections, type SlotColors, type SlotUploads } from "@/components/project/projectModel";
import { normalizeThemeColor, themeColorToCss } from "@/lib/theme/color";
import type { SlotContrastWarning } from "@/components/project/slotContrast";
import type { AdminAssetCandidate } from "@/lib/theme/adminAssets";

export function MobileGroupSlotList({
  groups,
  activeGroup,
  onSelectGroup,
  slots,
  selectedSlotId,
  uploads,
  colors,
  selections,
  templateId,
  template,
  adminAssets = [],
  contrastWarnings = {},
  hideSlotPicker = false,
  onSelectSlot,
}: {
  groups: ThemeSlotGroup[];
  activeGroup: ThemeSlotGroup;
  onSelectGroup: (group: ThemeSlotGroup) => void;
  slots: ThemeAssetSlot[];
  selectedSlotId?: string;
  uploads: SlotUploads;
  colors: SlotColors;
  selections: SlotCandidateSelections;
  templateId: ThemeTemplateId;
  template: ThemeTemplate;
  adminAssets?: AdminAssetCandidate[];
  contrastWarnings?: Record<string, SlotContrastWarning>;
  hideSlotPicker?: boolean;
  onSelectSlot: (slot: ThemeAssetSlot) => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const basicSlots = slots.filter((slot) => slot.optionLevel !== "advanced");
  const advancedSlots = slots.filter((slot) => slot.optionLevel === "advanced");
  const selectedSlot = slots.find((slot) => slot.id === selectedSlotId);
  const selectedStatus = selectedSlot ? slotStatusLabel(selectedSlot, uploads, colors, selections, templateId, template, slots) : undefined;
  const selectedWarning = selectedSlot ? contrastWarnings[selectedSlot.id] : undefined;

  return (
    <div className="grid gap-2">
      <div className="flex min-w-0 gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {groups.map((group) => (
          <button
            key={group}
            type="button"
            className={`min-h-9 shrink-0 whitespace-nowrap rounded-full border px-3 text-[12.5px] font-bold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563eb] ${group === activeGroup ? "border-[#2563eb] bg-[#2563eb] text-white" : "border-[#e5e7eb] bg-white text-[#64748b]"}`}
            onClick={() => {
              onSelectGroup(group);
              setPickerOpen(false);
              setAdvancedOpen(false);
            }}
          >
            {groupLabels[group]}
          </button>
        ))}
      </div>

      {!hideSlotPicker ? (
        <div className="grid gap-1.5">
          <button
            type="button"
            className="flex min-h-11 w-full items-center gap-2.5 rounded-xl border border-[#e5e7eb] bg-white px-3 text-left transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563eb]"
            aria-expanded={pickerOpen}
            onClick={() => setPickerOpen((current) => !current)}
          >
            {selectedSlot ? (
              <SlotPreviewChip slot={selectedSlot} status={selectedStatus ?? ""} />
            ) : (
              <span className="min-w-0 flex-1 text-[13px] font-semibold text-[#94a3b8]">슬롯을 선택하세요</span>
            )}
            {selectedWarning ? (
              <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[9.5px] font-bold text-amber-800">
                <AlertTriangle size={10} aria-hidden="true" />
                대비
              </span>
            ) : null}
            <ChevronDown size={16} className={`shrink-0 text-[#94a3b8] transition-transform ${pickerOpen ? "rotate-180" : ""}`} aria-hidden="true" />
          </button>

          {pickerOpen ? (
            <div className="grid gap-1 rounded-xl border border-[#e5e7eb] bg-[#f8fafc] p-1.5">
              {basicSlots.map((slot) => (
                <MobileSlotOption
                  key={slot.id}
                  slot={slot}
                  selected={selectedSlotId === slot.id}
                  status={slotStatusLabel(slot, uploads, colors, selections, templateId, template, slots)}
                  appliedTitle={getAppliedCandidateTitle(slot, uploads, colors, selections, templateId, template, slots, adminAssets)}
                  warning={contrastWarnings[slot.id]}
                  onSelect={() => {
                    onSelectSlot(slot);
                    setPickerOpen(false);
                  }}
                />
              ))}
              {advancedSlots.length > 0 ? (
                <div className="grid gap-1 mt-1">
                  <button
                    type="button"
                    className="flex min-h-9 items-center justify-between rounded-lg px-2 text-left text-[11.5px] font-bold text-[#64748b] transition hover:bg-white/70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563eb]"
                    aria-expanded={advancedOpen}
                    onClick={() => setAdvancedOpen((current) => !current)}
                  >
                    <span>고급 옵션</span>
                    <ChevronDown size={14} className={`shrink-0 text-[#94a3b8] transition-transform ${advancedOpen ? "rotate-180" : ""}`} aria-hidden="true" />
                  </button>
                  {advancedOpen ? advancedSlots.map((slot) => (
                    <MobileSlotOption
                      key={slot.id}
                      slot={slot}
                      selected={selectedSlotId === slot.id}
                      status={slotStatusLabel(slot, uploads, colors, selections, templateId, template, slots)}
                      appliedTitle={getAppliedCandidateTitle(slot, uploads, colors, selections, templateId, template, slots, adminAssets)}
                      warning={contrastWarnings[slot.id]}
                      onSelect={() => {
                        onSelectSlot(slot);
                        setPickerOpen(false);
                      }}
                    />
                  )) : null}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function SlotPreviewChip({ slot, status }: { slot: ThemeAssetSlot; status: string }) {
  const colorPreview = slot.kind === "color" ? getStatusColorPreview(status) : null;
  return (
    <span className="flex items-center flex-1 min-w-0 gap-2">
      <span className="grid size-6 shrink-0 place-items-center overflow-hidden rounded-md border border-black/10 bg-[#f8fafc]" aria-hidden="true">
        {colorPreview ? <span className="block h-full w-full" style={{ backgroundColor: colorPreview }} /> : <ImageOff size={11} className="text-[#94a3b8]" />}
      </span>
      <span className="flex-1 min-w-0">
        <span className="block truncate text-[13px] font-bold text-[#111827]">{slot.label}</span>
      </span>
    </span>
  );
}

function MobileSlotOption({ slot, selected, status, appliedTitle, warning, onSelect }: { slot: ThemeAssetSlot; selected: boolean; status: string; appliedTitle?: string; warning?: SlotContrastWarning; onSelect: () => void }) {
  const [tooltipOpen, setTooltipOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const isColor = slot.kind === "color";
  const colorPreview = isColor ? getStatusColorPreview(status) : null;

  useEffect(() => {
    if (!tooltipOpen) return;
    const timer = window.setTimeout(() => setTooltipOpen(false), 3200);
    const handlePointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setTooltipOpen(false);
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [tooltipOpen]);

  return (
    <div ref={containerRef} className="relative flex items-center">
      <button
        type="button"
        className={`flex min-h-10 w-full items-center gap-2 rounded-lg px-2 text-left transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563eb] ${selected ? "bg-white text-[#1d4ed8] shadow-sm" : "text-[#334155] hover:bg-white/70"}`}
        onClick={onSelect}
      >
        <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold">{slot.label}</span>
        {warning ? <AlertTriangle size={12} className="shrink-0 text-amber-600" aria-hidden="true" /> : null}
        {isColor ? (
          <span
            className="size-4 shrink-0 rounded-md border border-black/10 bg-[#f8fafc]"
            style={colorPreview ? { backgroundColor: colorPreview } : undefined}
            aria-hidden="true"
          />
        ) : (
          <span className="shrink-0 truncate text-[10.5px] font-medium text-[#94a3b8]">{appliedTitle ?? status}</span>
        )}
        {slot.note ? <span className="w-[13px] shrink-0" aria-hidden="true" /> : null}
      </button>
      {slot.note ? (
        <>
          <button
            type="button"
            className={`absolute right-2 top-1/2 -translate-y-1/2 grid size-6 shrink-0 place-items-center rounded-md transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563eb] ${tooltipOpen ? "text-[#2563eb]" : "text-[#cbd5e1] hover:text-[#64748b]"}`}
            aria-label={`${slot.label} 설명`}
            aria-expanded={tooltipOpen}
            onClick={(event) => {
              event.stopPropagation();
              setTooltipOpen((current) => !current);
            }}
          >
            <Info size={14} aria-hidden="true" />
          </button>
          {tooltipOpen ? (
            <div
              role="tooltip"
              className="absolute right-1 top-[calc(100%-1px)] z-10 max-w-[220px] rounded-xl border border-[#dbeafe] bg-white px-2.5 py-1.5 text-[11px] font-medium leading-snug text-[#475569] shadow-lg ring-1 ring-black/5"
            >
              <span className="absolute -top-1 right-3 size-2 rotate-45 border-l border-t border-[#dbeafe] bg-white" aria-hidden="true" />
              {slot.note}
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function getStatusColorPreview(status: string) {
  const color = status.match(/#[0-9a-f]{8}|#[0-9a-f]{6}/i)?.[0];
  return color && normalizeThemeColor(color) ? themeColorToCss(color) : null;
}

function getAppliedCandidateTitle(
  slot: ThemeAssetSlot,
  uploads: SlotUploads,
  colors: SlotColors,
  selections: SlotCandidateSelections,
  templateId: ThemeTemplateId,
  template: ThemeTemplate,
  slots: ThemeAssetSlot[],
  adminAssets: AdminAssetCandidate[],
) {
  if (slot.kind === "color") return undefined;
  const candidates = buildSlotCandidates(slot, uploads, colors, selections, templateId, template, slots, adminAssets);
  return candidates.find((candidate) => candidate.selected)?.title;
}
