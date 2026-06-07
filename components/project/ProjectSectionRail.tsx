import { ChevronLeft, ChevronRight, Dock, House, MessageSquare } from "lucide-react";
import { getCompletion, isSlotReady, sectionLabels, sectionOrder, type SlotCandidateSelections, type SlotColors, type SlotUploads } from "@/components/project/projectModel";
import type { ThemeAssetSlot, ThemeTemplate, ThemeTemplateId } from "@/lib/theme/templates";
import type { ThemeSection } from "@/lib/theme/types";

export function ProjectSectionRail({
  activeSection,
  slots,
  uploads,
  colors,
  selections,
  templateId,
  template,
  isOpen,
  onToggle,
  onSelectSection,
}: {
  activeSection: ThemeSection;
  slots: ThemeAssetSlot[];
  uploads: SlotUploads;
  colors: SlotColors;
  selections: SlotCandidateSelections;
  templateId: ThemeTemplateId;
  template: ThemeTemplate;
  isOpen: boolean;
  onToggle: () => void;
  onSelectSection: (section: ThemeSection) => void;
}) {
  const completion = getCompletion(slots, uploads, colors, selections, templateId, template);

  return (
    <aside className={`relative grid min-h-0 shrink-0 content-start gap-3  rounded-[24px] border border-[#d9dee7] bg-white/88 p-3 mr-4 shadow-[0_18px_40px_rgba(15,23,42,0.06)] backdrop-blur-sm transition-all ${isOpen ? "w-[188px]" : "w-[76px]"}`}>
      <button
        type="button"
        className="absolute right-[-1px] top-1/2 z-20 grid h-16 w-7 -translate-y-1/2 translate-x-full place-items-center rounded-r-[12px] border border-l-0 border-[#d9dee7] bg-white/88 text-[#111827] shadow-[6px_10px_20px_rgba(15,23,42,0.08)] backdrop-blur-sm transition hover:bg-white"
        onClick={onToggle}
        aria-label={isOpen ? "사이드바 접기" : "사이드바 펼치기"}
      >
        {isOpen ? <ChevronLeft className="w-4 h-4" strokeWidth={2.2} /> : <ChevronRight className="w-4 h-4" strokeWidth={2.2} />}
      </button>

      <div className="hidden">
        <strong className="block mt-2 text-3xl font-black">
          {completion.ready}/{completion.total}
        </strong>
      </div>

      <nav className="grid gap-2 pr-1" aria-label="섹션 선택">
        {sectionOrder.map((section) => {
          const sectionSlots = slots.filter((slot) => slot.section === section);
          const ready = sectionSlots.filter((slot) => isSlotReady(slot, uploads, colors, selections, templateId, template)).length;

          return (
            <button
              key={section}
              type="button"
              className={`rounded-[16px] border px-4 py-4 text-left transition ${activeSection === section ? "border-[#93c5fd] bg-[#eff6ff] text-[#0f172a] shadow-[inset_0_0_0_1px_rgba(37,99,235,0.18)]" : "border-[#e5e7eb] bg-[#fcfcfd] text-[#374151] hover:border-[#cbd5e1] hover:bg-white"}`}
              onClick={() => onSelectSection(section)}
            >
              {isOpen ? (
                <>
                  <span className="block text-[15px] font-bold tracking-[-0.01em]">{sectionLabels[section]}</span>
                  <span className="hidden mt-1 text-xs font-bold text-[#4d5660]">
                    {ready}/{sectionSlots.length} 준비
                  </span>
                </>
              ) : (
                <span className="grid min-h-12 place-items-center text-[#475569]">
                  {section === "main" ? <House className="w-4 h-4" strokeWidth={2.1} /> : section === "tabs" ? <Dock className="w-4 h-4" strokeWidth={2.1} /> : <MessageSquare className="w-4 h-4" strokeWidth={2.1} />}
                </span>
              )}
            </button>
          );
        })}
      </nav>
    </aside>
  );
}
