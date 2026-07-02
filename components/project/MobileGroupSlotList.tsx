"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ChevronDown, ImageOff, SlidersHorizontal } from "lucide-react";
import type { ThemeAssetSlot, ThemeTemplate, ThemeTemplateId } from "@/lib/theme/templates";
import type { ThemeSlotGroup } from "@/lib/theme/types";
import { disabledImageCandidateId, groupLabels, slotStatusLabel, type SlotCandidateSelections, type SlotColors, type SlotUploads } from "@/components/project/projectModel";
import { normalizeThemeColor, themeColorToCss } from "@/lib/theme/color";
import { autoMainPaletteCandidateId } from "@/lib/theme/autoColor";
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
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const basicSlots = useMemo(() => slots.filter((slot) => slot.optionLevel !== "advanced"), [slots]);
  const advancedSlots = useMemo(() => slots.filter((slot) => slot.optionLevel === "advanced"), [slots]);
  const modifiedAdvancedCount = advancedSlots.filter((slot) => {
    if (selections[slot.id] === autoMainPaletteCandidateId) return false;
    if (colors[slot.id]) return true;
    const selectedId = selections[slot.id];
    if (!selectedId || selectedId === disabledImageCandidateId || selectedId === `${slot.id}:base`) return false;
    return Boolean(uploads[slot.id]?.length) || !selectedId.startsWith(`${slot.id}:`);
  }).length;

  useEffect(() => {
    if (advancedSlots.some((slot) => slot.id === selectedSlotId)) setAdvancedOpen(true);
  }, [advancedSlots, selectedSlotId]);

  return (
    <div className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-2">
      <div className="flex min-w-0 gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {groups.map((group) => (
          <button
            key={group}
            type="button"
            className={`min-h-9 shrink-0 whitespace-nowrap rounded-full border px-3 text-[12.5px] font-bold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563eb] ${group === activeGroup ? "border-[#2563eb] bg-[#2563eb] text-white" : "border-[#e5e7eb] bg-white text-[#64748b]"}`}
            onClick={() => onSelectGroup(group)}
          >
            {groupLabels[group]}
          </button>
        ))}
      </div>

      <div className="grid min-h-0 content-start gap-1.5 overflow-y-auto pr-0.5 [scrollbar-color:#cbd5e1_transparent] [scrollbar-width:thin]">
        {basicSlots.map((slot) => (
          <MobileSlotRow
            key={slot.id}
            slot={slot}
            selected={selectedSlotId === slot.id}
            status={slotStatusLabel(slot, uploads, colors, selections, templateId, template, slots)}
            warning={contrastWarnings[slot.id]}
            onSelect={() => onSelectSlot(slot)}
          />
        ))}
        {advancedSlots.length > 0 ? (
          <div className="mt-1 grid gap-1.5 border-t border-[#e5e7eb] pt-2">
            <button
              type="button"
              className="flex min-h-9 items-center gap-2 rounded-lg px-1 text-left text-[12.5px] font-bold text-[#475569] focus-visible:outline-2 focus-visible:outline-[#2563eb]"
              aria-expanded={advancedOpen}
              onClick={() => setAdvancedOpen((current) => !current)}
            >
              <SlidersHorizontal size={14} aria-hidden="true" />
              <span className="min-w-0 flex-1">고급 옵션</span>
              <span className="rounded-full bg-[#e2e8f0] px-1.5 py-0.5 text-[10px] text-[#334155]">{modifiedAdvancedCount}/{advancedSlots.length}</span>
              <ChevronDown size={13} className={`transition-transform ${advancedOpen ? "rotate-180" : ""}`} aria-hidden="true" />
            </button>
            {advancedOpen
              ? advancedSlots.map((slot) => (
                  <MobileSlotRow
                    key={slot.id}
                    slot={slot}
                    selected={selectedSlotId === slot.id}
                    status={slotStatusLabel(slot, uploads, colors, selections, templateId, template, slots)}
                    warning={contrastWarnings[slot.id]}
                    onSelect={() => onSelectSlot(slot)}
                  />
                ))
              : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function MobileSlotRow({ slot, selected, status, warning, onSelect }: { slot: ThemeAssetSlot; selected: boolean; status: string; warning?: SlotContrastWarning; onSelect: () => void }) {
  const colorPreview = slot.kind === "color" ? getStatusColorPreview(status) : null;

  return (
    <button
      type="button"
      className={`flex min-h-[52px] w-full items-center gap-2.5 rounded-xl border px-3 py-2 text-left transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563eb] ${selected ? "border-[#93c5fd] bg-[#eff6ff]" : warning ? "border-amber-200 bg-amber-50/70" : "border-[#e5e7eb] bg-white"}`}
      onClick={onSelect}
    >
      <span className="grid size-8 shrink-0 place-items-center overflow-hidden rounded-lg border border-black/10 bg-[#f8fafc]" aria-hidden="true">
        {colorPreview ? <span className="block h-full w-full" style={{ backgroundColor: colorPreview }} /> : <ImageOff size={14} className="text-[#94a3b8]" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="min-w-0 flex-1 truncate text-[13.5px] font-bold text-[#111827]">{slot.label}</span>
          {warning ? (
            <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[9.5px] font-bold text-amber-800">
              <AlertTriangle size={10} aria-hidden="true" />
              대비
            </span>
          ) : null}
        </span>
        <span className="block truncate text-[11px] font-medium text-[#6b7280]">{status}</span>
      </span>
    </button>
  );
}

function getStatusColorPreview(status: string) {
  const color = status.match(/#[0-9a-f]{8}|#[0-9a-f]{6}/i)?.[0];
  return color && normalizeThemeColor(color) ? themeColorToCss(color) : null;
}
