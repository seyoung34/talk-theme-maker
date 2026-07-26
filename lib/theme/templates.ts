import androidSlotsManifest from "@/lib/theme/manifest/android.slots.json";
import iosSlotsManifest from "@/lib/theme/manifest/ios.slots.json";
import type { ThemeCandidateSourceType, ThemeExportMapping, ThemePlatform, ThemeResourceRole, ThemeScreen, ThemeSection, ThemeSlotGroup, ThemeSlotKind } from "@/lib/theme/types";

export type BaseTemplateId = "basic";
export type ThemeTemplateId = BaseTemplateId;

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

export type ThemeAutoColorRecipe =
  | "background-average"
  | "header-top"
  | "surface-background"
  | "tab-bottom"
  | "foreground-header"
  | "foreground-background"
  | "foreground-muted"
  | "foreground-pressed"
  | "muted-pressed"
  | "cell-transparent"
  | "cell-pressed"
  | "cell-border"
  | "accent"
  | "accent-pressed"
  | "accent-surface"
  | "accent-surface-pressed";

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
  systemTemplateId?: string;
  systemTemplateBundleId?: string;
  sourceSystemTemplateId?: string;
  editMode?: "user" | "admin";
  /**
   * 갤러리에서 최근 작업과 새 템플릿 사이의 결정을 이미 내린 경우에만 사용한다.
   * resume은 최근 작업을 즉시 복원하고, replace는 첫 실제 편집 전까지 기존 최근 작업을 보존한다.
   */
  autosaveAction?: "resume" | "replace";
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

export type ThemeAssetConstraints = {
  aspectRatio?: { width: number; height: number };
  recommendedSize?: { width: number; height: number; scale?: number };
  minSize?: { width: number; height: number; unit?: "px" | "dp" };
  fit?: "exact" | "cover" | "contain" | "stretch-region";
  focalPoint?: "top-center" | "center" | "free";
  alpha?: "opaque" | "transparent" | "mixed";
  runtimeNotes?: string[];
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
  constraints?: ThemeAssetConstraints;
  note: string;
  optionLevel?: "basic" | "advanced";
  autoColorRecipe?: ThemeAutoColorRecipe;
  visibleInSections?: ThemeSection[];
  visibleInGroups?: ThemeSlotGroup[];
  fileName?: string;
  path?: string;
  colorKey?: string;
  cssSelector?: string | string[];
  cssProperty?: string;
  defaultColor?: Partial<Record<ThemeTemplateId, string>>;
  defaultAssetUrls?: Partial<Record<ThemeTemplateId, string>>;
  candidates?: Partial<Record<ThemeTemplateId, ThemeSlotCandidate[]>>;
  export?: Partial<Record<ThemePlatform, ThemeExportMapping>>;
};

export const templateStartStorageKey = "kakaotalk-theme-maker:template-start:v1";

const sharedSections: ThemeSectionDefinition[] = [
  { id: "main", label: "친구", groups: ["background", "header", "list"] },
  { id: "tabs", label: "채팅/하단 탭", groups: ["header", "list", "bar", "icons"] },
  { id: "more", label: "더보기", groups: ["background", "header", "elements"] },
  { id: "chatroom", label: "채팅방", groups: ["background", "bubbles", "input"] },
  { id: "passcode", label: "잠금화면", groups: ["background", "text", "keypad", "pattern"] },
  { id: "common", label: "공통 리소스", groups: ["icon", "profiles", "launcher"] },
];

export const themeTemplates: ThemeTemplate[] = [
  {
    id: "basic",
    name: "기본 템플릿",
    description: "가장 단순한 구조로 테마 화면을 먼저 점검하는 기본 템플릿입니다.",
    previewNote: "색상과 이미지를 빠르게 교체하면서 전체 흐름을 확인하는 시작 템플릿입니다.",
    accent: "#6a5f00",
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
];

export const androidThemeSlots = androidSlotsManifest as ThemeAssetSlot[];
export const iosThemeSlots = iosSlotsManifest as ThemeAssetSlot[];

export function getThemeSlots(platform: ThemePlatform) {
  return platform === "ios" ? iosThemeSlots : androidThemeSlots;
}

export function getThemeTemplate(templateId: ThemeTemplateId) {
  return themeTemplates.find((template) => template.id === templateId) ?? themeTemplates[0];
}

export function normalizeThemeTemplateId(_value: unknown): ThemeTemplateId {
  return "basic";
}
