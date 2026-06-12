import type { ThemeAssetSlot, ThemeSlotCandidate, ThemeStartPayload, ThemeTemplate, ThemeTemplateId } from "@/lib/theme/templates";
import type { BubbleSlot, Insets, Markers, StretchPoint, ThemeResourceRole, ThemeSection, ThemeSlotGroup } from "@/lib/theme/types";

export const disabledImageCandidateId = "__none__";

export type SlotUploadEntry = {
  id: string;
  file: File;
};

export type SlotUploads = Record<string, SlotUploadEntry[] | undefined>;
export type SlotColors = Record<string, string | undefined>;
export type SlotCandidateSelections = Record<string, string | undefined>;

export type BubbleEditState = {
  markers?: Markers;
  insets?: Insets;
  stretch?: StretchPoint;
};

export type ThemeProjectState = {
  version: 1;
  templateId: ThemeTemplateId;
  platform: "android" | "ios";
  selectedSection: ThemeSection;
  selectedGroup?: ThemeSlotGroup;
  selectedSlotId?: string;
  candidateSelections: SlotCandidateSelections;
  colorOverrides: SlotColors;
  bubbleEdits: Partial<Record<BubbleSlot, BubbleEditState>>;
  uploads: SlotUploads;
};

export const themeProjectStorageKey = "kakaotalk-theme-maker:project-state:v1";

export function getSlotUploadEntries(slot: ThemeAssetSlot | undefined, uploads: SlotUploads) {
  if (!slot) return [];
  return uploads[slot.id] ?? [];
}

export function bubbleSlotFromRole(role: ThemeResourceRole): BubbleSlot | null {
  if (role === "bubble_me_1" || role === "bubble_me_2") return "me";
  if (role === "bubble_you_1" || role === "bubble_you_2") return "you";
  return null;
}

export function getImageColorFallbackRole(role: ThemeResourceRole): ThemeResourceRole | undefined {
  if (role === "main_background") return "main_background_color";
  if (role === "chat_background") return "chat_background_color";
  if (role === "tab_background_image") return "tab_background";
  if (role === "bubble_me_1" || role === "bubble_me_2") return "chat_bubble_me_color";
  if (role === "bubble_you_1" || role === "bubble_you_2") return "chat_bubble_you_color";
  return undefined;
}

export function getColorImageFallbackRole(role: ThemeResourceRole): ThemeResourceRole | undefined {
  if (role === "main_background_color") return "main_background";
  if (role === "chat_background_color") return "chat_background";
  if (role === "tab_background") return "tab_background_image";
  if (role === "chat_bubble_me_color") return "bubble_me_1";
  if (role === "chat_bubble_you_color") return "bubble_you_1";
  return undefined;
}

export function canDisableImageSlot(slot: ThemeAssetSlot | undefined) {
  return Boolean(slot && slot.kind !== "color" && getImageColorFallbackRole(slot.role));
}

export function isImageSlotDisabled(slot: ThemeAssetSlot | undefined, selections: SlotCandidateSelections) {
  return Boolean(slot && canDisableImageSlot(slot) && selections[slot.id] === disabledImageCandidateId);
}

export function getDefaultColor(slot: ThemeAssetSlot, templateId: ThemeTemplateId, template: ThemeTemplate) {
  if (slot.defaultColor?.[templateId]) return slot.defaultColor[templateId];

  switch (slot.role) {
    case "chat_background_color":
      return template.defaults.chatBackground;
    case "chat_bubble_me_color":
      return template.defaults.mainTitle;
    case "chat_bubble_you_color":
      return template.defaults.mainTitle;
    case "chat_unread_count_color":
      return template.accent;
    case "main_header_color":
      return template.defaults.mainHeader;
    case "main_background_color":
      return template.defaults.mainBackground;
    case "main_header_foreground_color":
      return template.defaults.mainTitle;
    case "main_title_color":
      return template.defaults.mainTitle;
    case "main_title_pressed_color":
      return template.defaults.mainTitle;
    case "main_description_color":
      return template.defaults.mainBody;
    case "main_body_color":
      return template.defaults.mainBody;
    case "main_paragraph_pressed_color":
      return template.defaults.mainBody;
    case "main_body_cell_pressed_color":
      return "#99F4FAFB";
    case "main_body_cell_border_color":
      return "#33111111";
    case "main_section_title_color":
      return template.defaults.mainTitle;
    case "main_feature_browse_tab_color":
      return template.defaults.tabBackground;
    case "main_body_secondary_cell_color":
      return "#FFFFFF";
    case "tab_background":
      return template.defaults.tabBackground;
    case "chat_input_background_color":
      return template.defaults.chatInputBackground;
    case "chat_send_button_color":
      return template.defaults.chatSendButton;
    case "chat_input_text_color":
      return template.defaults.mainTitle;
    case "chat_send_icon_color":
      return template.defaults.mainTitle;
    default:
      return "#ffffff";
  }
}

export function getSlotCandidates(slot: ThemeAssetSlot | undefined, templateId: ThemeTemplateId, template: ThemeTemplate): ThemeSlotCandidate[] {
  if (!slot) return [];

  const configured = slot.candidates?.[templateId];
  if (configured?.length) return configured;

  if (slot.kind === "color") {
    return [
      {
        id: `${slot.id}:base`,
        label: "기본값",
        note: slot.note,
        sourceType: "template-color",
        colorValue: getDefaultColor(slot, templateId, template),
        isDefault: true,
      },
    ];
  }

  const assetUrl = slot.defaultAssetUrls?.[templateId];
  if (!assetUrl) {
    return canDisableImageSlot(slot)
      ? [
          {
            id: disabledImageCandidateId,
            label: "이미지 사용 안 함",
            note: "대응 색상 슬롯 값을 사용합니다.",
            sourceType: "template-asset",
          },
        ]
      : [];
  }

  return [
    ...(canDisableImageSlot(slot)
      ? [
          {
            id: disabledImageCandidateId,
            label: "이미지 사용 안 함",
            note: "대응 색상 슬롯 값을 사용합니다.",
            sourceType: "template-asset" as const,
          },
        ]
      : []),
    {
      id: `${slot.id}:base`,
      label: "기본값",
      note: slot.note,
      sourceType: "template-asset",
      assetUrl,
      previewUrl: assetUrl,
      isDefault: true,
    },
  ];
}

export function getInitialSlotCandidateSelections(slots: ThemeAssetSlot[], templateId: ThemeTemplateId, template: ThemeTemplate): SlotCandidateSelections {
  return Object.fromEntries(
    slots.map((slot) => {
      const defaultCandidate = getDefaultSelectedCandidate(slot, templateId, template);
      return [slot.id, defaultCandidate?.id];
    }),
  );
}

export function getDefaultSelectedCandidate(slot: ThemeAssetSlot | undefined, templateId: ThemeTemplateId, template: ThemeTemplate) {
  const candidates = getSlotCandidates(slot, templateId, template);
  return candidates.find((candidate) => candidate.isDefault) ?? candidates[0];
}

export function getSelectedCandidate(
  slot: ThemeAssetSlot | undefined,
  selections: SlotCandidateSelections,
  templateId: ThemeTemplateId,
  template: ThemeTemplate,
) {
  if (!slot) return undefined;
  const candidates = getSlotCandidates(slot, templateId, template);
  const selectedId = selections[slot.id];
  return candidates.find((candidate) => candidate.id === selectedId) ?? getDefaultSelectedCandidate(slot, templateId, template);
}

export function getSelectedUpload(slot: ThemeAssetSlot | undefined, uploads: SlotUploads, selections: SlotCandidateSelections) {
  if (!slot) return undefined;
  if (isImageSlotDisabled(slot, selections)) return undefined;
  const uploadEntries = uploads[slot.id] ?? [];
  const selectedId = selections[slot.id];
  return uploadEntries.find((entry) => entry.id === selectedId);
}

export function getResolvedAssetUrl(
  slot: ThemeAssetSlot | undefined,
  uploads: SlotUploads,
  selections: SlotCandidateSelections,
  templateId: ThemeTemplateId,
  template: ThemeTemplate,
) {
  if (!slot || slot.kind === "color") return undefined;
  if (isImageSlotDisabled(slot, selections)) return undefined;
  if (getSelectedUpload(slot, uploads, selections)) return undefined;
  return getSelectedCandidate(slot, selections, templateId, template)?.assetUrl;
}

export function isColorSlotDisabledByImage(
  slot: ThemeAssetSlot | undefined,
  allSlots: ThemeAssetSlot[],
  uploads: SlotUploads,
  selections: SlotCandidateSelections,
  templateId: ThemeTemplateId,
  template: ThemeTemplate,
) {
  if (!slot || slot.kind !== "color") return false;
  const imageRole = getColorImageFallbackRole(slot.role);
  if (!imageRole) return false;
  const imageSlot = allSlots.find((candidate) => candidate.platform === slot.platform && candidate.role === imageRole);
  if (!imageSlot || isImageSlotDisabled(imageSlot, selections)) return false;
  return Boolean(getSelectedUpload(imageSlot, uploads, selections) || getResolvedAssetUrl(imageSlot, uploads, selections, templateId, template));
}

export function getResolvedColor(
  slot: ThemeAssetSlot | undefined,
  colors: SlotColors,
  selections: SlotCandidateSelections,
  templateId: ThemeTemplateId,
  template: ThemeTemplate,
) {
  if (!slot || slot.kind !== "color") return undefined;
  return colors[slot.id] ?? getSelectedCandidate(slot, selections, templateId, template)?.colorValue ?? getDefaultColor(slot, templateId, template);
}

export function isSlotReady(slot: ThemeAssetSlot, uploads: SlotUploads, colors: SlotColors, selections: SlotCandidateSelections, templateId: ThemeTemplateId, template: ThemeTemplate) {
  if (slot.kind === "color") return Boolean(getResolvedColor(slot, colors, selections, templateId, template));
  if (isImageSlotDisabled(slot, selections) && canDisableImageSlot(slot)) return true;
  return Boolean(getSelectedUpload(slot, uploads, selections) || getResolvedAssetUrl(slot, uploads, selections, templateId, template));
}

export function getCompletion(
  slots: ThemeAssetSlot[],
  uploads: SlotUploads,
  colors: SlotColors,
  selections: SlotCandidateSelections,
  templateId: ThemeTemplateId,
  template: ThemeTemplate,
) {
  return {
    total: slots.length,
    ready: slots.filter((slot) => isSlotReady(slot, uploads, colors, selections, templateId, template)).length,
  };
}

export function slotStatusLabel(slot: ThemeAssetSlot, uploads: SlotUploads, colors: SlotColors, selections: SlotCandidateSelections, templateId: ThemeTemplateId, template: ThemeTemplate, allSlots: ThemeAssetSlot[] = []) {
  if (slot.kind === "color") {
    if (isColorSlotDisabledByImage(slot, allSlots, uploads, selections, templateId, template)) return "색상 사용 안함";
    const color = getResolvedColor(slot, colors, selections, templateId, template);
    return color ? color.toUpperCase() : "값 필요";
  }
  if (isImageSlotDisabled(slot, selections)) return "색상 사용 중";
  const selectedUpload = getSelectedUpload(slot, uploads, selections);
  if (selectedUpload) return selectedUpload.file.name;
  const selected = getSelectedCandidate(slot, selections, templateId, template);
  if (selected?.label) return selected.label;
  if (slot.required) return "필수 파일 필요";
  return "선택 파일";
}

export function createInitialThemeProjectState(
  templateId: ThemeTemplateId,
  platform: "android" | "ios",
  slots: ThemeAssetSlot[],
  template: ThemeTemplate,
): ThemeProjectState {
  return {
    version: 1,
    templateId,
    platform,
    selectedSection: "chatroom",
    selectedGroup: "bubbles",
    selectedSlotId: undefined,
    candidateSelections: getInitialSlotCandidateSelections(slots, templateId, template),
    colorOverrides: {},
    bubbleEdits: {},
    uploads: {},
  };
}

export function readTemplateStartPayload(storageKey: string): ThemeStartPayload | null {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ThemeStartPayload>;
    if ((parsed.templateId === "basic" || parsed.templateId === "spongebob") && (parsed.platform === "android" || parsed.platform === "ios")) {
      return {
        templateId: parsed.templateId,
        platform: parsed.platform,
        userTemplateId: typeof parsed.userTemplateId === "string" ? parsed.userTemplateId : undefined,
      };
    }
    return null;
  } catch {
    return null;
  }
}
