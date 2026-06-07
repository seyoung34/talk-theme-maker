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
        {slots.map((slot) => (
          <button
            key={slot.id}
            type="button"
            className={`rounded-xl border px-3 py-3 text-left transition ${selectedSlotId === slot.id ? "border-[#93c5fd] bg-[#eff6ff] shadow-sm" : "border-[#e5e7eb] bg-white hover:border-[#cbd5e1] hover:bg-[#fcfcfd]"}`}
            onClick={() => onSelectSlot(slot)}
          >
            <span className="block truncate text-[14px] font-semibold text-[#111827]">{slot.label}</span>
            <span className="mt-1 block text-[11px] font-medium text-[#6b7280]">{slotStatusLabel(slot, uploads, colors, selections, templateId, template)}</span>
          </button>
        ))}
      </div>
    </aside>
  );
}
