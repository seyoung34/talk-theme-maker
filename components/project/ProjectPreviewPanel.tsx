import { ChatroomPreview } from "@/components/preview/ChatroomPreview";
import { CommonAssetsPreview } from "@/components/preview/CommonAssetsPreview";
import { PasscodePreview } from "@/components/preview/PasscodePreview";
import { ThemeScreensPreview } from "@/components/preview/ThemeScreensPreview";
import type { BubbleEditState, SlotCandidateSelections, SlotColors } from "@/components/project/projectModel";
import type { ThemeProjectAnalysis } from "@/lib/theme/project/types";
import type { ThemeAssetSlot, ThemeTemplate, ThemeTemplateId } from "@/lib/theme/templates";
import type { ThemeResourceRole, ThemeSection, ThemeSlotGroup } from "@/lib/theme/types";

export function ProjectPreviewPanel({
  analysis,
  activeSection,
  template,
  templateId,
  slots,
  colors,
  selections,
  bubbleEdits,
  selectedSlotId,
  selectionPulseKey = 0,
  className,
  onSelectSlot,
}: {
  analysis: ThemeProjectAnalysis;
  activeSection: ThemeSection;
  template: ThemeTemplate;
  templateId: ThemeTemplateId;
  slots: ThemeAssetSlot[];
  colors: SlotColors;
  selections: SlotCandidateSelections;
  bubbleEdits: Partial<Record<ThemeResourceRole, BubbleEditState>>;
  selectedSlotId?: string;
  selectionPulseKey?: number;
  className?: string;
  onSelectSlot: (slotId: string | undefined) => void;
}) {
  const chatroomActive = activeSection === "chatroom";

  return (
    <aside className={`preview-selection-motion grid min-h-0 place-items-center  overflow-hidden  ${className ?? ""}`} data-selection-pulse={selectionPulseKey % 2}>
      <div
        className={`col-start-1 row-start-1 grid h-full w-full place-items-center ${chatroomActive ? "" : "pointer-events-none invisible"}`}
        aria-hidden={!chatroomActive}
      >
        <ChatroomPreview
          analysis={analysis}
          platform={analysis.summary.platform}
          slots={slots}
          selectedSlotId={selectedSlotId}
          colors={colors}
          selections={selections}
          template={template}
          templateId={templateId}
          bubbleEdits={bubbleEdits}
          onSelectSlot={onSelectSlot}
        />
      </div>
      {!chatroomActive ? (
        <div className="grid w-full h-full col-start-1 row-start-1 place-items-center">
          {activeSection === "common" ? (
            <CommonAssetsPreview
              analysis={analysis}
              activeGroup={getCommonActiveGroup(slots, selectedSlotId)}
              slots={slots.filter((slot) => slot.section === "common")}
              selectedSlotId={selectedSlotId}
              onSelectSlot={onSelectSlot}
            />
          ) : activeSection === "passcode" ? (
            <PasscodePreview analysis={analysis} slots={slots} selectedSlotId={selectedSlotId} colors={colors} selections={selections} template={template} templateId={templateId} onSelectSlot={onSelectSlot} />
          ) : (
            <ThemeScreensPreview analysis={analysis} section={activeSection} slots={slots} selectedSlotId={selectedSlotId} colors={colors} selections={selections} template={template} templateId={templateId} onSelectSlot={onSelectSlot} />
          )}
        </div>
      ) : null}
    </aside>
  );
}

function getCommonActiveGroup(slots: ThemeAssetSlot[], selectedSlotId?: string): Extract<ThemeSlotGroup, "icon" | "profiles" | "launcher"> {
  const selected = slots.find((slot) => slot.section === "common" && slot.id === selectedSlotId);
  if (selected?.group === "icon" || selected?.group === "launcher" || selected?.group === "profiles") return selected.group;
  return "profiles";
}
