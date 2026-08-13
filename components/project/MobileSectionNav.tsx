"use client";

import { AppWindow, Dock, House, LockKeyhole, MessageSquare, CircleEllipsis } from "lucide-react";
import { isSlotVisibleInSection, sectionLabels, sectionOrder } from "@/components/project/projectModel";
import type { ThemeAssetSlot } from "@/lib/theme/templates";
import type { ThemeSection } from "@/lib/theme/types";

// 좁은 화면용 짧은 label. 접근성 이름은 `sectionLabels`를 그대로 쓰므로, 음성 제어가
// 보이는 글자로도 버튼을 지목할 수 있게 각 값은 반드시 `sectionLabels`의 부분 문자열이어야 한다
// (WCAG 2.5.3 Label in Name).
export const mobileSectionLabels: Record<ThemeSection, string> = {
  main: "친구",
  tabs: "채팅",
  chatroom: "채팅방",
  more: "더보기",
  passcode: "잠금",
  common: "공통",
};

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
    <nav
      className="flex w-full min-w-0 touch-pan-x snap-x snap-mandatory gap-0.5 overflow-x-auto scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      aria-label="화면 선택"
    >
      {visibleSections.map((section) => {
        const active = activeSection === section;
        return (
          <button
            key={section}
            type="button"
            className={`grid min-h-[52px] min-w-[47px] flex-1 shrink-0 snap-start place-items-center gap-0.5 rounded-xl px-0.5 py-1.5 transition focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563eb] ${active ? "bg-[#eff6ff] text-[#1d4ed8]" : "text-[#64748b] hover:bg-[#f8fafc] hover:text-[#111827]"}`}
            onClick={() => onSelectSection(section)}
            aria-label={sectionLabels[section]}
            aria-current={active ? "page" : undefined}
            title={sectionLabels[section]}
          >
            <span className="grid size-5 place-items-center" aria-hidden="true">{getSectionIcon(section)}</span>
            <span aria-hidden="true" className="max-w-full truncate text-[10.5px] font-bold tracking-[-0.01em]">{mobileSectionLabels[section]}</span>
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
