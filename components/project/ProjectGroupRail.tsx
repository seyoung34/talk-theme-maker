import { Info } from "lucide-react";
import type { ThemeAssetSlot, ThemeTemplate, ThemeTemplateId } from "@/lib/theme/templates";
import type { ThemeSlotGroup } from "@/lib/theme/types";
import { groupLabels, slotStatusLabel, type SlotCandidateSelections, type SlotColors, type SlotUploads } from "@/components/project/projectModel";

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
  return (
    <aside className="grid min-h-0 grid-rows-[auto_auto_minmax(0,1fr)] gap-3 rounded-2xl border border-[#e5e7eb] bg-[#f8fafc] p-3">
      <div className="grid gap-2">
        {groups.map((group) => (
          <button
            key={group}
            type="button"
            className={`rounded-lg border px-3 py-2.5 text-left text-sm font-semibold transition ${group === activeGroup ? "border-[#bfdbfe] bg-white text-[#0f172a] shadow-sm" : "border-transparent bg-transparent text-[#6b7280] hover:border-[#e5e7eb] hover:bg-white hover:text-[#111827]"}`}
            onClick={() => onSelectGroup(group)}
          >
            {groupLabels[group]}
          </button>
        ))}
      </div>
      <div className="h-px bg-[#e5e7eb]" />
      <div className="grid content-start gap-2 overflow-y-auto">
        {slots.map((slot) => {
          const helpText = getSlotHelpText(slot);
          return (
            <div key={slot.id} className="group relative">
              <button
                type="button"
                className={`w-full rounded-xl border px-3 py-3 pr-10 text-left transition ${selectedSlotId === slot.id ? "border-[#93c5fd] bg-[#eff6ff] shadow-sm" : "border-[#e5e7eb] bg-white hover:border-[#cbd5e1] hover:bg-[#fcfcfd]"}`}
                onClick={() => onSelectSlot(slot)}
              >
                <span className="block truncate text-[14px] font-semibold text-[#111827]">{slot.label}</span>
                <span className="mt-1 block text-[11px] font-medium text-[#6b7280]">{slotStatusLabel(slot, uploads, colors, selections, templateId, template, slots)}</span>
              </button>
              <button
                type="button"
                title={helpText}
                aria-label={`${slot.label} 안내: ${helpText}`}
                className="absolute right-2 top-2 grid size-7 place-items-center rounded-lg border border-[#dbe3ed] bg-white text-[#64748b] opacity-0 shadow-sm transition hover:border-[#93c5fd] hover:bg-[#eff6ff] hover:text-[#1d4ed8] focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-[#2563eb] group-hover:opacity-100 group-focus-within:opacity-100"
                onClick={(event) => {
                  event.stopPropagation();
                }}
              >
                <Info size={14} aria-hidden="true" />
              </button>
            </div>
          );
        })}
      </div>
    </aside>
  );
}

function getSlotHelpText(slot: ThemeAssetSlot) {
  if (slot.note?.trim()) return slot.note.trim();
  if (slot.kind === "color") return `${slot.label}에 적용할 색상을 선택하거나 직접 입력합니다.`;
  if (slot.section === "passcode") return `${slot.label}에 표시할 이미지를 선택합니다. 필요하지 않으면 이미지 사용 안 함을 선택할 수 있습니다.`;
  return `${slot.label}에 사용할 이미지를 선택하거나 직접 업로드합니다.`;
}
