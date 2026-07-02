"use client";

import { useState } from "react";
import { AlertTriangle, ChevronDown, ImageOff } from "lucide-react";
import type { ThemeAssetSlot, ThemeTemplate, ThemeTemplateId } from "@/lib/theme/templates";
import type { ThemeSlotGroup } from "@/lib/theme/types";
import { groupLabels, slotStatusLabel, type SlotCandidateSelections, type SlotColors, type SlotUploads } from "@/components/project/projectModel";
import { normalizeThemeColor, themeColorToCss } from "@/lib/theme/color";
import type { SlotContrastWarning } from "@/components/project/slotContrast";

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
  contrastWarnings = {},
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
  contrastWarnings?: Record<string, SlotContrastWarning>;
  onSelectSlot: (slot: ThemeAssetSlot) => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
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
            }}
          >
            {groupLabels[group]}
          </button>
        ))}
      </div>

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
                warning={contrastWarnings[slot.id]}
                onSelect={() => {
                  onSelectSlot(slot);
                  setPickerOpen(false);
                }}
              />
            ))}
            {advancedSlots.length > 0 ? (
              <>
                <span className="mt-1 px-2 text-[10.5px] font-bold uppercase tracking-[0.06em] text-[#94a3b8]">고급 옵션</span>
                {advancedSlots.map((slot) => (
                  <MobileSlotOption
                    key={slot.id}
                    slot={slot}
                    selected={selectedSlotId === slot.id}
                    status={slotStatusLabel(slot, uploads, colors, selections, templateId, template, slots)}
                    warning={contrastWarnings[slot.id]}
                    onSelect={() => {
                      onSelectSlot(slot);
                      setPickerOpen(false);
                    }}
                  />
                ))}
              </>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function SlotPreviewChip({ slot, status }: { slot: ThemeAssetSlot; status: string }) {
  const colorPreview = slot.kind === "color" ? getStatusColorPreview(status) : null;
  return (
    <span className="flex min-w-0 flex-1 items-center gap-2">
      <span className="grid size-6 shrink-0 place-items-center overflow-hidden rounded-md border border-black/10 bg-[#f8fafc]" aria-hidden="true">
        {colorPreview ? <span className="block h-full w-full" style={{ backgroundColor: colorPreview }} /> : <ImageOff size={11} className="text-[#94a3b8]" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-bold text-[#111827]">{slot.label}</span>
        <span className="block truncate text-[10.5px] font-medium text-[#6b7280]">{status}</span>
      </span>
    </span>
  );
}

function MobileSlotOption({ slot, selected, status, warning, onSelect }: { slot: ThemeAssetSlot; selected: boolean; status: string; warning?: SlotContrastWarning; onSelect: () => void }) {
  return (
    <button
      type="button"
      className={`flex min-h-10 w-full items-center gap-2 rounded-lg px-2 text-left transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563eb] ${selected ? "bg-white text-[#1d4ed8] shadow-sm" : "text-[#334155] hover:bg-white/70"}`}
      onClick={onSelect}
    >
      <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold">{slot.label}</span>
      {warning ? <AlertTriangle size={12} className="shrink-0 text-amber-600" aria-hidden="true" /> : null}
      <span className="shrink-0 truncate text-[10.5px] font-medium text-[#94a3b8]">{status}</span>
    </button>
  );
}

function getStatusColorPreview(status: string) {
  const color = status.match(/#[0-9a-f]{8}|#[0-9a-f]{6}/i)?.[0];
  return color && normalizeThemeColor(color) ? themeColorToCss(color) : null;
}
