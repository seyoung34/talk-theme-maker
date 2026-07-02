import { AppWindow, Dock, House, LockKeyhole, MessageSquare, CircleEllipsis } from "lucide-react";
import { isSlotVisibleInSection, sectionLabels, sectionOrder } from "@/components/project/projectModel";
import type { ThemeAssetSlot } from "@/lib/theme/templates";
import type { ThemeSection } from "@/lib/theme/types";

export function ProjectSectionRail({
  activeSection,
  slots,
  onSelectSection,
  variant = "full",
}: {
  activeSection: ThemeSection;
  slots: ThemeAssetSlot[];
  onSelectSection: (section: ThemeSection) => void;
  variant?: "full" | "chips";
}) {
  const visibleSections = sectionOrder.filter((section) => slots.some((slot) => isSlotVisibleInSection(slot, section)));

  const sizingClass = variant === "chips" ? "min-h-10 shrink-0 gap-2 px-3 py-2 whitespace-nowrap" : "min-h-12 min-w-[116px] gap-2.5 px-3 py-2.5 lg:min-w-0";
  const sectionButtons = visibleSections.map((section) => (
    <button
      key={section}
      type="button"
      className={`flex items-center rounded-xl border text-left transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563eb] ${sizingClass} ${activeSection === section ? "border-[#93c5fd] bg-[#eff6ff] text-[#1d4ed8] shadow-[inset_0_0_0_1px_rgba(37,99,235,0.18)]" : "border-[#e5e7eb] bg-[#fcfcfd] text-[#475569] hover:border-[#cbd5e1] hover:bg-white hover:text-[#111827]"}`}
      onClick={() => onSelectSection(section)}
      aria-current={activeSection === section ? "page" : undefined}
    >
      <span className="grid size-7 shrink-0 place-items-center " aria-hidden="true">{getSectionIcon(section)}</span>
      <span className="block text-[13px] font-bold tracking-[-0.01em]">{sectionLabels[section]}</span>
    </button>
  ));

  if (variant === "chips") {
    return (
      <nav className="flex gap-2 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label="화면 선택">
        {sectionButtons}
      </nav>
    );
  }

  return (
    <aside className="grid h-full min-h-0 w-full shrink-0 content-start gap-3 rounded-2xl border border-[#d9dee7] bg-white/92 p-3 shadow-[0_12px_28px_rgba(15,23,42,0.05)] backdrop-blur-sm  lg:w-[170px]">
      <div className="rounded-xl border border-[#e5e7eb] bg-[#f8fafc] px-3 py-3">
        <span className="block text-[10px] font-bold uppercase tracking-[0.12em] text-[#2563eb]">화면 탐색</span>
        <strong className="mt-1 block text-[13px] font-bold leading-snug text-[#0f172a]">편집할 화면을 선택하세요</strong>
        <span className="mt-1 block text-[11px] font-medium leading-relaxed text-[#64748b]">미리보기와 설정이 열립니다.</span>
      </div>

      <nav className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:thin] lg:grid lg:overflow-visible lg:pb-0" aria-label="화면 선택">
        {sectionButtons}
      </nav>
    </aside>
  );
}

function getSectionIcon(section: ThemeSection) {
  if (section === "main") return <House className="h-4 w-4" strokeWidth={2.1} />;
  if (section === "tabs") return <Dock className="h-4 w-4" strokeWidth={2.1} />;
  if (section === "more") return <CircleEllipsis className="h-4 w-4" strokeWidth={2.1} />;
  if (section === "chatroom") return <MessageSquare className="h-4 w-4" strokeWidth={2.1} />;
  if (section === "passcode") return <LockKeyhole className="h-4 w-4" strokeWidth={2.1} />;
  return <AppWindow className="h-4 w-4" strokeWidth={2.1} />;
}
