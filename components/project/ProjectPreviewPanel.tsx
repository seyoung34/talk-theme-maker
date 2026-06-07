import { ChatroomPreview } from "@/components/preview/ChatroomPreview";
import { ThemeScreensPreview } from "@/components/preview/ThemeScreensPreview";
import type { BubbleEditState, SlotCandidateSelections, SlotColors } from "@/components/project/projectModel";
import type { ThemeProjectAnalysis } from "@/lib/theme/project/types";
import type { ThemeAssetSlot, ThemeTemplate, ThemeTemplateId } from "@/lib/theme/templates";
import type { BubbleSlot, ThemeSection } from "@/lib/theme/types";

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
  bubbleEdits: Partial<Record<BubbleSlot, BubbleEditState>>;
  selectedSlotId?: string;
  className?: string;
  onSelectSlot: (slotId: string | undefined) => void;
}) {
  return (
    <aside className={`grid min-h-0 place-items-center overflow-hidden bg-transparent ${className ?? ""}`}>
      {activeSection === "chatroom" ? (
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
      ) : (
        <ThemeScreensPreview analysis={analysis} section={activeSection} slots={slots} selectedSlotId={selectedSlotId} colors={colors} selections={selections} template={template} templateId={templateId} onSelectSlot={onSelectSlot} />
      )}
    </aside>
  );
}
