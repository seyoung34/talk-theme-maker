"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, Info, SlidersHorizontal } from "lucide-react";
import * as Tooltip from "@radix-ui/react-tooltip";
import type { ThemeAssetSlot, ThemeTemplate, ThemeTemplateId } from "@/lib/theme/templates";
import type { ThemeSlotGroup } from "@/lib/theme/types";
import { disabledImageCandidateId, groupLabels, slotStatusLabel, type SlotCandidateSelections, type SlotColors, type SlotUploads } from "@/components/project/projectModel";
import { normalizeThemeColor, themeColorToCss } from "@/lib/theme/color";
import { autoMainPaletteCandidateId } from "@/lib/theme/autoColor";

export function ProjectGroupRail({
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
    <Tooltip.Provider delayDuration={260} skipDelayDuration={100}>
    <aside className="grid max-h-[460px] min-h-0 min-w-0 grid-rows-[auto_auto_minmax(0,1fr)] gap-3 overflow-hidden rounded-2xl border border-[#e5e7eb] bg-[#f8fafc] p-3 md:max-h-none">
        <div className="grid min-w-0 gap-2">
          {groups.map((group) => (
            <button
              key={group}
              type="button"
              className={`min-w-0 rounded-lg border px-3 py-2.5 text-left text-sm font-semibold transition ${group === activeGroup ? "border-[#bfdbfe] bg-white text-[#0f172a] shadow-sm" : "border-transparent bg-transparent text-[#6b7280] hover:border-[#e5e7eb] hover:bg-white hover:text-[#111827]"}`}
              onClick={() => onSelectGroup(group)}
            >
              {groupLabels[group]}
            </button>
          ))}
        </div>
        <div className="h-px bg-[#e5e7eb]" />
        <div className="grid min-w-0 content-start gap-2 overflow-x-hidden overflow-y-auto [scrollbar-width:thin]">
        {basicSlots.map((slot) => (
          <SlotRailItem
            key={slot.id}
            slot={slot}
            selected={selectedSlotId === slot.id}
            status={slotStatusLabel(slot, uploads, colors, selections, templateId, template, slots)}
            onSelect={() => onSelectSlot(slot)}
          />
        ))}
        {advancedSlots.length > 0 ? (
          <div className="mt-1 grid gap-2 border-t border-[#dbe3ed] pt-2">
            <button
              type="button"
              className="flex min-h-10 items-center gap-2 rounded-lg px-2 text-left text-xs font-bold text-[#475569] transition hover:bg-white focus-visible:outline-2 focus-visible:outline-[#2563eb]"
              aria-expanded={advancedOpen}
              onClick={() => setAdvancedOpen((current) => !current)}
            >
              <SlidersHorizontal size={15} aria-hidden="true" />
              <span className="min-w-0 flex-1">고급 옵션</span>
              <span className="rounded-full bg-[#e2e8f0] px-1.5 py-0.5 text-[10px] text-[#334155]">{modifiedAdvancedCount}/{advancedSlots.length}</span>
              <ChevronDown size={14} className={`transition-transform ${advancedOpen ? "rotate-180" : ""}`} aria-hidden="true" />
            </button>
            {advancedOpen ? advancedSlots.map((slot) => <SlotRailItem key={slot.id} slot={slot} selected={selectedSlotId === slot.id} status={slotStatusLabel(slot, uploads, colors, selections, templateId, template, slots)} onSelect={() => onSelectSlot(slot)} />) : null}
          </div>
        ) : null}
      </div>
      </aside>
    </Tooltip.Provider>
  );
}

function SlotRailItem({ slot, selected, status, onSelect }: { slot: ThemeAssetSlot; selected: boolean; status: string; onSelect: () => void }) {
  const helpText = getSlotHelpText(slot);
  const colorPreview = slot.kind === "color" ? getStatusColorPreview(status) : null;
  return (
    <div className="group relative">
      <button type="button" className={`w-full rounded-xl border px-3 py-3 pr-10 text-left transition ${selected ? "border-[#93c5fd] bg-[#eff6ff] shadow-sm" : "border-[#e5e7eb] bg-white hover:border-[#cbd5e1] hover:bg-[#fcfcfd]"}`} onClick={onSelect}>
        <span className="block truncate text-[14px] font-semibold text-[#111827]">{slot.label}</span>
        <span className="mt-1 flex min-w-0 items-center gap-1.5 text-[11px] font-medium text-[#6b7280]">
          {colorPreview ? (
            <span
              className="relative size-4 shrink-0 overflow-hidden rounded-[5px] border border-black/10 bg-[linear-gradient(45deg,#e2e8f0_25%,transparent_25%),linear-gradient(-45deg,#e2e8f0_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#e2e8f0_75%),linear-gradient(-45deg,transparent_75%,#e2e8f0_75%)] bg-[length:6px_6px] bg-[position:0_0,0_3px,3px_-3px,-3px_0px] shadow-[0_1px_2px_rgba(15,23,42,0.08)]"
              aria-hidden="true"
            >
              <span className="absolute inset-0" style={{ backgroundColor: colorPreview }} />
            </span>
          ) : null}
          <span className="min-w-0 truncate">{status}</span>
        </span>
      </button>
      <Tooltip.Root>
        <Tooltip.Trigger asChild><span tabIndex={0} aria-label={`${slot.label} 안내`} className="absolute right-2 top-2 grid size-8 cursor-help place-items-center text-[#64748b] transition-colors hover:text-[#2563eb] focus-visible:rounded-lg focus-visible:text-[#2563eb] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#2563eb]"><Info size={18} strokeWidth={2} aria-hidden="true" /></span></Tooltip.Trigger>
        <Tooltip.Portal><Tooltip.Content side="right" align="start" sideOffset={10} collisionPadding={12} className="radix-tooltip-content z-[70] w-[min(248px,calc(100vw-24px))] rounded-xl border border-[#dbe3ed] bg-white p-3.5 text-left shadow-[0_16px_38px_rgba(15,23,42,0.16)] outline-none"><div className="flex items-start gap-2.5"><span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg bg-[#eff6ff] text-[#2563eb]"><Info size={15} strokeWidth={2.2} aria-hidden="true" /></span><div className="min-w-0"><p className="text-xs font-bold text-[#0f172a]">{slot.label}</p><p className="mt-1 text-[12px] font-medium leading-[1.55] text-[#64748b]">{helpText}</p></div></div><Tooltip.Arrow className="fill-white" width={12} height={6} /></Tooltip.Content></Tooltip.Portal>
      </Tooltip.Root>
    </div>
  );
}

function getStatusColorPreview(status: string) {
  const color = status.match(/#[0-9a-f]{8}|#[0-9a-f]{6}/i)?.[0];
  return color && normalizeThemeColor(color) ? themeColorToCss(color) : null;
}

function getSlotHelpText(slot: ThemeAssetSlot) {
  if (slot.note?.trim()) return slot.note.trim();
  if (slot.kind === "color") return `${slot.label}에 적용할 색상을 선택하거나 직접 입력합니다.`;
  if (slot.section === "passcode") return `${slot.label}에 표시할 이미지를 선택합니다. 필요하지 않으면 이미지 사용 안 함을 선택할 수 있습니다.`;
  return `${slot.label}에 사용할 이미지를 선택하거나 직접 업로드합니다.`;
}
