"use client";

import { AppWindow, Dock, House, LockKeyhole, MessageSquare, CircleEllipsis } from "lucide-react";
import { isSlotVisibleInSection, sectionLabels, sectionOrder } from "@/components/project/projectModel";
import type { ThemeAssetSlot } from "@/lib/theme/templates";
import type { ThemeSection } from "@/lib/theme/types";

export function MobileSectionNav({
  activeSection,
  slots,
  onSelectSection,
}: {
  activeSection: ThemeSection;
  slots: ThemeAssetSlot[];
  onSelectSection: (section: ThemeSection) => void;
}) {
  const visibleSections = sectionOrder.filter((section) => slots.some((slot) => isSlotVisibleInSection(slot, section)));

  return (
    <nav className="grid grid-flow-col auto-cols-fr gap-0.5" aria-label="화면 선택">
      {visibleSections.map((section) => {
        const active = activeSection === section;
        return (
          <button
            key={section}
            type="button"
            className={`grid min-h-[52px] place-items-center gap-0.5 rounded-xl px-1 py-1.5 transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563eb] ${active ? "bg-[#eff6ff] text-[#1d4ed8]" : "text-[#64748b] hover:bg-[#f8fafc] hover:text-[#111827]"}`}
            onClick={() => onSelectSection(section)}
            aria-current={active ? "page" : undefined}
          >
            <span className="grid size-5 place-items-center" aria-hidden="true">{getSectionIcon(section)}</span>
            <span className="max-w-full truncate text-[10.5px] font-bold tracking-[-0.01em]">{sectionLabels[section]}</span>
          </button>
        );
      })}
    </nav>
  );
}

function getSectionIcon(section: ThemeSection) {
  if (section === "main") return <House className="h-[18px] w-[18px]" strokeWidth={2.1} />;
  if (section === "tabs") return <Dock className="h-[18px] w-[18px]" strokeWidth={2.1} />;
  if (section === "more") return <CircleEllipsis className="h-[18px] w-[18px]" strokeWidth={2.1} />;
  if (section === "chatroom") return <MessageSquare className="h-[18px] w-[18px]" strokeWidth={2.1} />;
  if (section === "passcode") return <LockKeyhole className="h-[18px] w-[18px]" strokeWidth={2.1} />;
  return <AppWindow className="h-[18px] w-[18px]" strokeWidth={2.1} />;
}
