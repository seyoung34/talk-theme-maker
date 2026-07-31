import { normalizeThemeTemplateId, type ThemeAssetSlot, type ThemeSlotCandidate, type ThemeStartPayload, type ThemeTemplate, type ThemeTemplateId } from "@/lib/theme/templates";
import type { BubbleGeometry, BubbleSlot, Insets, Markers, StretchPoint, ThemeResourceRole, ThemeSection, ThemeSlotGroup } from "@/lib/theme/types";
import { autoMainPaletteCandidateId } from "@/lib/theme/autoColor";
import type { ImageEditMetadata } from "@/lib/theme/imageEdit";

export const disabledImageCandidateId = "__none__";
export { autoMainPaletteCandidateId } from "@/lib/theme/autoColor";

export type SlotUploadSource = "user" | "template" | "admin";

export type SlotUploadEntry = {
  id: string;
  file: File;
  source?: SlotUploadSource;
  imageEdit?: ImageEditMetadata;
};

export type SlotUploads = Record<string, SlotUploadEntry[] | undefined>;
export type SlotColors = Record<string, string | undefined>;
export type SlotCandidateSelections = Record<string, string | undefined>;

export type BubbleEditState = {
  geometry?: BubbleGeometry;
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

export function getBubblePairRole(role: ThemeResourceRole): ThemeResourceRole | undefined {
  if (role === "bubble_me_1") return "bubble_me_2";
  if (role === "bubble_me_2") return "bubble_me_1";
  if (role === "bubble_you_1") return "bubble_you_2";
  if (role === "bubble_you_2") return "bubble_you_1";
  return undefined;
}

export function getImageColorFallbackRole(role: ThemeResourceRole): ThemeResourceRole | undefined {
  if (role === "main_background") return "main_background_color";
  if (role === "chat_background") return "chat_background_color";
  if (role === "passcode_background") return "passcode_background_color";
  if (role === "tab_background_image") return "tab_background";
  return undefined;
}

export function getImageAssetFallbackRole(role: ThemeResourceRole): ThemeResourceRole | undefined {
  if (role === "profile_image_full_1") return "profile_image_1";
  if (role === "profile_image_full_2") return "profile_image_2";
  if (role === "profile_image_full_3") return "profile_image_3";
  // 탭 선택(focused) 아이콘은 별도 지정이 없으면 기본 아이콘을 상속한다.
  if (role.startsWith("tab_icon_") && role.endsWith("_focused")) {
    return role.slice(0, -"_focused".length) as ThemeResourceRole;
  }
  return undefined;
}

export function canDisableImageSlot(slot: ThemeAssetSlot | undefined) {
  return Boolean(slot && slot.kind !== "color" && (getImageColorFallbackRole(slot.role) || slot.section === "passcode"));
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
    case "main_description_pressed_color":
      return template.defaults.mainBody;
    case "main_body_color":
      return template.defaults.mainBody;
    case "main_paragraph_pressed_color":
      return template.defaults.mainBody;
    case "tab_paragraph_color":
      return template.defaults.mainBody;
    case "tab_paragraph_pressed_color":
      return template.defaults.mainBody;
    case "main_body_cell_color":
      return withAlpha(template.defaults.mainBackground, "00");
    case "main_body_cell_pressed_color":
      return "#99F4FAFB";
    case "main_body_cell_border_color":
      return "#33111111";
    case "main_body_cell_border_alpha":
      return "0.18";
    case "main_selected_background_alpha":
      return "0.05";
    case "main_section_title_color":
      return template.defaults.mainTitle;
    case "main_feature_browse_tab_color":
      return template.defaults.tabBackground;
    case "main_feature_browse_tab_focused_color":
      return template.defaults.mainTitle;
    case "feature_primary_color":
    case "feature_primary_pressed_color":
      return template.accent;
    case "main_body_secondary_cell_color":
      return "#FFFFFF";
    case "tab_background":
      return template.defaults.tabBackground;
    case "tab_text_color":
      return template.defaults.mainBody;
    case "tab_light_banner_badge_background_color":
    case "tab_banner_badge_background_color":
      return template.accent;
    case "chat_input_background_color":
      return template.defaults.chatInputBackground;
    case "chat_button_text_color":
      return template.defaults.mainTitle;
    case "chat_button_foreground_color":
      return template.defaults.mainBody;
    case "chat_button_highlighted_foreground_color":
      return template.defaults.mainTitle;
    case "chat_button_background_color":
      return "#0FFFFFFF";
    case "chat_send_button_color":
      return template.defaults.chatSendButton;
    case "chat_send_highlighted_button_color":
      return template.accent;
    case "chat_input_text_color":
      return template.defaults.mainTitle;
    case "chat_send_icon_color":
      return template.defaults.mainTitle;
    case "chat_send_highlighted_icon_color":
      return template.defaults.mainTitle;
    case "chat_menu_icon_color":
      return template.defaults.mainBody;
    case "chat_menu_button_color":
      return withAlpha(template.defaults.mainBody, "14");
    case "direct_share_text_color":
    case "notification_text_color":
      return template.defaults.mainTitle;
    case "direct_share_button_color":
      return template.accent;
    case "direct_share_background_color":
      return lighten(template.defaults.mainBackground, 0.04);
    case "notification_background_color":
      return template.defaults.friendBubble;
    case "notification_background_pressed_color":
      return lighten(template.defaults.friendBubble, -0.04);
    case "passcode_background_color":
      return "#FCC5C5";
    case "passcode_color":
      return "#664242";
    case "passcode_keypad_color":
      return "#664242";
    case "passcode_keypad_pressed_color":
      return "#CCB8B8";
    case "passcode_keypad_background_color":
      return "#FFF2F2";
    case "passcode_keypad_pressed_background_color":
      return "#99FFDEDE";
    case "passcode_pattern_line_color":
      return "#FCC5C5";
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
  const previewUrl = slot.defaultPreviewAssetUrls?.[templateId] ?? assetUrl;
  const disabledCandidate = {
    id: disabledImageCandidateId,
    label: "이미지 사용 안 함",
    note: slot.role === "main_background"
      ? "배경색으로 시작합니다. 이미지를 추가하면 화면 색상을 이미지에 맞춰 자동 조정합니다."
      : getImageColorFallbackRole(slot.role) ? "대응 색상 슬롯 값을 사용합니다." : "해당 이미지를 내보내지 않습니다.",
    sourceType: "template-asset" as const,
  };
  if (!assetUrl) {
    return canDisableImageSlot(slot) ? [disabledCandidate] : [];
  }

  return [
    ...(canDisableImageSlot(slot) ? [disabledCandidate] : []),
    {
      id: `${slot.id}:base`,
      label: "기본값",
      note: slot.note,
      sourceType: "template-asset",
      assetUrl,
      previewUrl,
      isDefault: slot.section !== "passcode",
    },
  ];
}

export function getInitialSlotCandidateSelections(slots: ThemeAssetSlot[], templateId: ThemeTemplateId, template: ThemeTemplate): SlotCandidateSelections {
  return Object.fromEntries(
    slots.map((slot) => {
      const defaultCandidate = getDefaultSelectedCandidate(slot, templateId, template);
      return [slot.id, slot.autoColorRecipe ? autoMainPaletteCandidateId : defaultCandidate?.id];
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

// 파생 슬롯(예: 탭 선택 아이콘)이 직접 선택 없이 기본 슬롯을 상속 중이면 그 기본 슬롯을 돌려준다.
// - 별도 업로드를 골랐거나 기본 candidate 외의 것을 직접 선택했으면 상속하지 않는다(독립).
export function getInheritedSourceSlot(
  slot: ThemeAssetSlot | undefined,
  uploads: SlotUploads,
  selections: SlotCandidateSelections,
  templateId: ThemeTemplateId,
  template: ThemeTemplate,
  allSlots: ThemeAssetSlot[],
): ThemeAssetSlot | undefined {
  if (!slot) return undefined;
  const fallbackRole = getImageAssetFallbackRole(slot.role);
  if (!fallbackRole) return undefined;
  if (getSelectedUpload(slot, uploads, selections)) return undefined;
  const selectedId = selections[slot.id];
  const defaultCandidate = getDefaultSelectedCandidate(slot, templateId, template);
  if (selectedId && defaultCandidate && selectedId !== defaultCandidate.id) return undefined;
  return allSlots.find((candidate) => candidate.role === fallbackRole && candidate.platform === slot.platform);
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
    if (selections[slot.id] === autoMainPaletteCandidateId) {
      const color = colors[slot.id] ?? getDefaultColor(slot, templateId, template);
      return color ? `자동 · ${color.toUpperCase()}` : "자동 맞춤 대기 중";
    }
    const color = getResolvedColor(slot, colors, selections, templateId, template);
    return color ? color.toUpperCase() : "값 필요";
  }
  if (isImageSlotDisabled(slot, selections)) return getImageColorFallbackRole(slot.role) ? "색상 사용 중" : "이미지 사용 안 함";
  // 파생 슬롯(탭 선택 아이콘 등)이 연동 중이면 기본 슬롯의 선택 상태를 그대로 표시한다.
  const sourceSlot = getInheritedSourceSlot(slot, uploads, selections, templateId, template, allSlots) ?? slot;
  const selectedUpload = getSelectedUpload(sourceSlot, uploads, selections);
  if (selectedUpload) return selectedUpload.file.name;
  const selected = getSelectedCandidate(sourceSlot, selections, templateId, template);
  if (selected?.label) return selected.label;
  if (slot.required) return "필수 파일 필요";
  return "선택 파일";
}

function withAlpha(color: string, alpha: string) {
  const value = color.replace("#", "");
  const rgb = value.length === 8 ? value.slice(2) : value.length === 3 ? value.split("").map((character) => `${character}${character}`).join("") : value;
  return `#${alpha}${rgb.slice(-6)}`;
}

function lighten(color: string, amount: number) {
  const value = color.replace("#", "");
  const rgb = value.length === 8 ? value.slice(2) : value;
  const channels = [0, 2, 4].map((index) => Number.parseInt(rgb.slice(index, index + 2), 16));
  const adjusted = channels.map((channel) => Math.max(0, Math.min(255, Math.round(channel + (amount >= 0 ? 255 - channel : channel) * Math.abs(amount)))));
  return `#${adjusted.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
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
    const parsed = JSON.parse(raw) as Partial<ThemeStartPayload> & { templateId?: unknown };
    if (typeof parsed.templateId === "string" && (parsed.platform === "android" || parsed.platform === "ios")) {
      return {
        templateId: normalizeThemeTemplateId(parsed.templateId),
        platform: parsed.platform,
        userTemplateId: typeof parsed.userTemplateId === "string" ? parsed.userTemplateId : undefined,
        systemTemplateId: typeof parsed.systemTemplateId === "string" ? parsed.systemTemplateId : undefined,
        systemTemplateBundleId: typeof parsed.systemTemplateBundleId === "string" ? parsed.systemTemplateBundleId : undefined,
        sourceSystemTemplateId: typeof parsed.sourceSystemTemplateId === "string" ? parsed.sourceSystemTemplateId : undefined,
        editMode: parsed.editMode === "admin" || parsed.editMode === "user" ? parsed.editMode : undefined,
        autosaveAction: parsed.autosaveAction === "resume" || parsed.autosaveAction === "replace" ? parsed.autosaveAction : undefined,
      };
    }
    return null;
  } catch {
    return null;
  }
}
