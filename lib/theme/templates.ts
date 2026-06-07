import androidSlotsManifest from "@/lib/theme/manifest/android.slots.json";
import iosSlotsManifest from "@/lib/theme/manifest/ios.slots.json";
import type { ThemeCandidateSourceType, ThemeExportMapping, ThemePlatform, ThemeResourceRole, ThemeScreen, ThemeSection, ThemeSlotGroup, ThemeSlotKind } from "@/lib/theme/types";

export type ThemeTemplateId = "basic" | "spongebob";

export type ThemeTemplateDefaults = {
  platform: ThemePlatform;
  chatBackground: string;
  myBubble: string;
  friendBubble: string;
  mainBackground: string;
  mainHeader: string;
  mainTitle: string;
  mainBody: string;
  tabBackground: string;
  chatInputBackground: string;
  chatSendButton: string;
};

export type ThemeSectionDefinition = {
  id: ThemeSection;
  label: string;
  groups: ThemeSlotGroup[];
};

export type ThemeTemplate = {
  id: ThemeTemplateId;
  name: string;
  description: string;
  accent: string;
  previewNote: string;
  thumbnail?: string;
  supportedPlatforms: ThemePlatform[];
  sections: ThemeSectionDefinition[];
  defaults: ThemeTemplateDefaults;
};

export type ThemeStartPayload = {
  templateId: ThemeTemplateId;
  platform: ThemePlatform;
  userTemplateId?: string;
};

export type ThemeSlotCandidate = {
  id: string;
  label: string;
  note?: string;
  sourceType: ThemeCandidateSourceType;
  assetUrl?: string;
  colorValue?: string;
  previewUrl?: string;
  metadata?: {
    width?: number;
    height?: number;
    scale?: "@2x" | "@3x";
  };
  isDefault?: boolean;
};

export type ThemeAssetSlot = {
  id: string;
  platform: ThemePlatform;
  role: ThemeResourceRole;
  section: ThemeSection;
  group: ThemeSlotGroup;
  screen: ThemeScreen;
  kind: ThemeSlotKind;
  label: string;
  required: boolean;
  editableInBubbleEditor?: boolean;
  note: string;
  fileName?: string;
  path?: string;
  colorKey?: string;
  defaultColor?: Partial<Record<ThemeTemplateId, string>>;
  defaultAssetUrls?: Partial<Record<ThemeTemplateId, string>>;
  candidates?: Partial<Record<ThemeTemplateId, ThemeSlotCandidate[]>>;
  export?: Partial<Record<ThemePlatform, ThemeExportMapping>>;
};

export const templateStartStorageKey = "kakaotalk-theme-maker:template-start:v1";

const sharedSections: ThemeSectionDefinition[] = [
  { id: "main", label: "메인화면", groups: ["background", "header", "list"] },
  { id: "tabs", label: "하단 탭", groups: ["bar", "icons"] },
  { id: "chatroom", label: "채팅방", groups: ["background", "bubbles", "input"] },
];

export const themeTemplates: ThemeTemplate[] = [
  {
    id: "basic",
    name: "기본 템플릿",
    description: "가장 단순한 구조로 테마의 큰 톤을 먼저 잡는 기본 템플릿입니다.",
    previewNote: "색과 이미지를 빠르게 교체해 전체 흐름을 확인하는 시작 템플릿입니다.",
    accent: "#006b7a",
    supportedPlatforms: ["android", "ios"],
    sections: sharedSections,
    defaults: {
      platform: "android",
      chatBackground: "#b8f2f7",
      myBubble: "#ffe27a",
      friendBubble: "#ffffff",
      mainBackground: "#f4fafb",
      mainHeader: "#ffffff",
      mainTitle: "#111111",
      mainBody: "#4d5660",
      tabBackground: "#ffffff",
      chatInputBackground: "#ffffff",
      chatSendButton: "#c9ff3d",
    },
  },
  {
    id: "spongebob",
    name: "스폰지밥 템플릿",
    description: "기존 Android/iOS 스폰지밥 에셋으로 바로 시작하는 템플릿입니다.",
    previewNote: "배경과 말풍선, 아이콘에 기본 스폰지밥 에셋이 연결됩니다.",
    accent: "#f6c800",
    supportedPlatforms: ["android", "ios"],
    sections: sharedSections,
    defaults: {
      platform: "android",
      chatBackground: "#aeeef7",
      myBubble: "#fff04f",
      friendBubble: "#ffffff",
      mainBackground: "#b7eef7",
      mainHeader: "#ffffff",
      mainTitle: "#111111",
      mainBody: "#37515a",
      tabBackground: "#ffffff",
      chatInputBackground: "#ffffff",
      chatSendButton: "#f6c800",
    },
  },
];

export const androidThemeSlots = androidSlotsManifest as ThemeAssetSlot[];
export const iosThemeSlots = iosSlotsManifest as ThemeAssetSlot[];

export function getThemeSlots(platform: ThemePlatform) {
  return platform === "ios" ? iosThemeSlots : androidThemeSlots;
}

export function getThemeTemplate(templateId: ThemeTemplateId) {
  return themeTemplates.find((template) => template.id === templateId) ?? themeTemplates[0];
}
