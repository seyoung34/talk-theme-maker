"use client";

import { getResolvedColor, type SlotCandidateSelections, type SlotColors } from "@/components/project/projectModel";
import type { ImageColorPalette } from "@/lib/theme/colorPalette";
import { themeColorContrast } from "@/lib/theme/color";
import type { ThemeAssetSlot, ThemeTemplate, ThemeTemplateId } from "@/lib/theme/templates";
import type { ThemePlatform, ThemeResourceRole } from "@/lib/theme/types";

export type SlotContrastWarning = {
  ratio: number;
  minimumRatio: number;
  background: string;
  backgroundLabel: string;
  message: string;
};

type ContrastContext = {
  platform: ThemePlatform;
  slots: ThemeAssetSlot[];
  colors: SlotColors;
  selections: SlotCandidateSelections;
  templateId: ThemeTemplateId;
  template: ThemeTemplate;
  imageColorPalette: ImageColorPalette | null;
};

export function buildSlotContrastWarnings(context: ContrastContext) {
  return Object.fromEntries(
    context.slots.flatMap((slot) => {
      const warning = getSlotContrastWarning(slot, context);
      return warning ? [[slot.id, warning]] : [];
    }),
  ) as Record<string, SlotContrastWarning>;
}

export function getSlotContrastWarning(slot: ThemeAssetSlot, context: ContrastContext): SlotContrastWarning | null {
  if (slot.kind !== "color") return null;
  const minimumRatio = getMinimumContrastRatio(slot.role);
  if (!minimumRatio) return null;

  const foreground = getResolvedColor(slot, context.colors, context.selections, context.templateId, context.template, context.slots);
  if (!foreground || !foreground.startsWith("#")) return null;

  const backgroundInfo = getContrastBackground(slot.role, context);
  if (!backgroundInfo) return null;

  const ratio = themeColorContrast(foreground, backgroundInfo.color);
  if (ratio >= minimumRatio) return null;

  return {
    ratio,
    minimumRatio,
    background: backgroundInfo.color,
    backgroundLabel: backgroundInfo.label,
    message: `${backgroundInfo.label}과의 대비가 낮습니다.`,
  };
}

function getMinimumContrastRatio(role: ThemeResourceRole) {
  if (
    [
      "main_header_foreground_color",
      "main_title_color",
      "main_title_pressed_color",
      "main_section_title_color",
      "chat_bubble_me_color",
      "chat_bubble_you_color",
      "chat_input_text_color",
      "passcode_color",
    ].includes(role)
  ) return 4.5;

  if (
    [
      "main_description_color",
      "main_description_pressed_color",
      "tab_paragraph_color",
      "tab_paragraph_pressed_color",
      "main_feature_browse_tab_color",
      "main_feature_browse_tab_focused_color",
      "feature_primary_color",
      "tab_text_color",
      "direct_share_text_color",
      "notification_text_color",
      "chat_button_text_color",
      "chat_button_foreground_color",
      "chat_button_highlighted_foreground_color",
      "chat_send_icon_color",
      "chat_send_highlighted_icon_color",
      "chat_menu_icon_color",
      "passcode_keypad_color",
      "passcode_keypad_pressed_color",
      "passcode_pattern_line_color",
    ].includes(role)
  ) return 3;

  if (
    [
      "tab_light_banner_badge_background_color",
      "tab_banner_badge_background_color",
      "direct_share_button_color",
      "chat_send_button_color",
      "chat_send_highlighted_button_color",
    ].includes(role)
  ) return 3;

  return 0;
}

function getContrastBackground(role: ThemeResourceRole, context: ContrastContext) {
  if (["tab_light_banner_badge_background_color", "tab_banner_badge_background_color", "direct_share_button_color", "chat_send_button_color", "chat_send_highlighted_button_color"].includes(role)) {
    return { color: "#FFFFFF", label: "흰색 텍스트" };
  }

  if (role === "main_header_foreground_color") {
    if (context.platform === "ios") {
      return { color: context.imageColorPalette?.top ?? getColor("main_background_color", context.template.defaults.mainBackground, context), label: "iOS 상단 배경" };
    }
    return { color: getColor("main_header_color", context.template.defaults.mainHeader, context), label: "헤더 배경" };
  }

  if (role === "tab_text_color") return { color: getColor("tab_background", context.template.defaults.tabBackground, context), label: "탭바 배경" };
  if (role.startsWith("passcode_keypad_")) return { color: getColor("passcode_keypad_background_color", context.template.defaults.mainBackground, context), label: "키패드 배경" };
  if (role === "passcode_color" || role === "passcode_pattern_line_color") return { color: getColor("passcode_background_color", context.template.defaults.mainBackground, context), label: "잠금화면 배경" };
  if (role.startsWith("chat_") && role.includes("button")) return { color: getColor("chat_input_background_color", context.template.defaults.chatInputBackground, context), label: "입력창 배경" };
  if (role === "chat_input_text_color" || role === "chat_menu_icon_color") return { color: getColor("chat_input_background_color", context.template.defaults.chatInputBackground, context), label: "입력창 배경" };
  if (role === "chat_bubble_me_color") return { color: context.template.defaults.myBubble, label: "내 말풍선" };
  if (role === "chat_bubble_you_color") return { color: context.template.defaults.friendBubble, label: "상대 말풍선" };
  if (role === "direct_share_text_color") return { color: getColor("direct_share_background_color", context.template.defaults.friendBubble, context), label: "바로 공유 배경" };
  if (role === "notification_text_color") return { color: getColor("notification_background_color", context.template.defaults.friendBubble, context), label: "알림 배경" };
  if (role === "feature_primary_color") return { color: getColor("main_body_secondary_cell_color", context.template.defaults.mainBackground, context), label: "더보기 배경" };

  return { color: getColor("main_background_color", context.template.defaults.mainBackground, context), label: "메인 배경" };
}

function getColor(role: ThemeResourceRole, fallback: string, context: ContrastContext) {
  const slot = context.slots.find((candidate) => candidate.role === role);
  return getResolvedColor(slot, context.colors, context.selections, context.templateId, context.template, context.slots) ?? fallback;
}
