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
  | "chat-background-bottom"
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
  | "accent-surface-pressed"
  // 채팅방 배경은 메인 배경과 다른 이미지를 쓴다. 그 이미지의 평균색으로 맞춘다.
  | "chat-background-average"
  // 잠금화면 배경은 자체 이미지가 있으면 그 평균색을, 없으면 메인 배경(이미지 or 수동 색)을 그대로 따라간다.
  | "passcode-background-average"
  // 말풍선 이미지 표면의 밝기를 분석해 안쪽 메시지 글자색을 맞춘다.
  | "bubble-me-text"
  | "bubble-you-text";

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
  /**
   * 일반 편집기에서 직접 입력할 source인지, 관리자 호환 영역에서만 볼 role인지.
   * canonical role 자체는 유지하면서 authoring policy가 사용자/관리자 노출을 결정한다.
   */
  editorVisibility?: "source" | "advanced" | "hidden";
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
  /**
   * Candidate 카드와 편집기/갤러리 프리뷰에만 사용하는 기본 이미지입니다.
   * 실제 선택·내보내기 원본은 defaultAssetUrls를 계속 사용합니다.
   */
  defaultPreviewAssetUrls?: Partial<Record<ThemeTemplateId, string>>;
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
  // 편집기가 실제로 쓰는 그룹 순서는 projectModel.ts의 groupOrder다. 여기 나열은 섹션이
  // 어떤 그룹을 담는지에 대한 설명이므로 순서를 그쪽과 어긋나지 않게 유지한다.
  { id: "common", label: "공통 리소스", groups: ["profiles", "icon", "launcher"] },
];

export const themeTemplates: ThemeTemplate[] = [
  {
    id: "basic",
    name: "기본 템플릿",
    description: "가장 단순한 구조로 테마 화면을 먼저 점검하는 기본 템플릿입니다.",
    previewNote: "색상과 이미지를 빠르게 교체하면서 전체 흐름을 확인하는 시작 템플릿입니다.",
    /**
     * 기본 템플릿은 무채색만 쓴다.
     *
     * 시작 템플릿의 역할은 "내 이미지를 얹기 전 화면 구조를 확인하는 것"이라, 채도가 있는 기본색은
     * 사용자가 올린 이미지와 충돌하고 어떤 색을 직접 고른 것인지 헷갈리게 만든다. 아래 값은 모두
     * R=G=B에 가까운 중성 회색 계열이며, 매니페스트의 `defaultColor.basic`도 같은 계열을 쓴다.
     *
     * 계단: #FFFFFF → #F5F6F7 → #ECEDEF → #E4E6E9 → #8A8F96 → #5C6066 → #3A3E44 → #111111
     */
    accent: "#3a3e44",
    supportedPlatforms: ["android", "ios"],
    sections: sharedSections,
    defaults: {
      platform: "android",
      chatBackground: "#ecedef",
      myBubble: "#e4e6e9",
      friendBubble: "#ffffff",
      mainBackground: "#f5f6f7",
      mainHeader: "#ffffff",
      mainTitle: "#111111",
      mainBody: "#5c6066",
      tabBackground: "#ffffff",
      chatInputBackground: "#ffffff",
      chatSendButton: "#3a3e44",
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
