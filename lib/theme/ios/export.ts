import { getResolvedAssetUrl, getResolvedColor, getSelectedUpload, type BubbleEditState, type SlotCandidateSelections, type SlotColors, type SlotUploads } from "@/lib/theme/project/state";
import type { ThemeProjectAnalysis } from "@/lib/theme/project/types";
import type { ThemeAssetSlot, ThemeTemplate, ThemeTemplateId } from "@/lib/theme/templates";
import type { Insets, StretchPoint, ThemeResourceRole } from "@/lib/theme/types";

type IosExportOptions = {
  analysis: ThemeProjectAnalysis;
  template: ThemeTemplate;
  templateId: ThemeTemplateId;
  exportName?: string;
  versionName?: string;
  themeIdentifier?: string;
  slots: ThemeAssetSlot[];
  uploads: SlotUploads;
  colors: SlotColors;
  selections: SlotCandidateSelections;
  bubbleEditsBySlotId: Partial<Record<string, BubbleEditState>>;
};

export type IosExportFile = {
  path: string;
  blob: Blob;
};

type IosImageMap = Partial<Record<ThemeResourceRole, string>>;
const iosThemeCssFileName = "KakaoTalkTheme.css";
const maxIosImageDimension = 8192;
const maxIosImagePixels = 32_000_000;
const iosScaleTargetsByRole: Partial<Record<ThemeResourceRole, number[]>> = {
  main_background: [3],
  tab_background_image: [2, 3],
  tab_icon_friends: [2, 3],
  tab_icon_friends_focused: [2, 3],
  tab_icon_chats: [2, 3],
  tab_icon_chats_focused: [2, 3],
  tab_icon_now: [2, 3],
  tab_icon_now_focused: [2, 3],
  tab_icon_shopping: [2, 3],
  tab_icon_shopping_focused: [2, 3],
  tab_icon_more: [2, 3],
  tab_icon_more_focused: [2, 3],
  chat_background: [3],
  bubble_me_1: [2, 3],
  bubble_me_2: [2, 3],
  bubble_you_1: [2, 3],
  bubble_you_2: [2, 3],
  profile_image_1: [3],
  find_add_friend: [2, 3],
};

export async function buildIosThemeExportFiles(options: IosExportOptions): Promise<IosExportFile[]> {
  const { analysis, template, templateId, exportName, versionName, slots, uploads, selections } = options;
  const iosSlots = slots.filter((slot) => slot.platform === "ios");
  const files: IosExportFile[] = [];
  const imageMap: IosImageMap = {};
  const sourceScaleBySlotId: Record<string, number> = {};

  for (const slot of iosSlots) {
    if (slot.kind === "color" || !slot.path) continue;
    const blob = await resolveIosSlotBlob(slot, uploads, selections, templateId, template);
    if (!blob) continue;
    const sourceScale = getIosSourceScale(slot, uploads, selections, templateId);
    sourceScaleBySlotId[slot.id] = sourceScale;
    files.push(...(await createIosImageExportFiles(slot, blob, sourceScale)));
    imageMap[slot.role] = slot.fileName ?? slot.path.split("/").at(-1) ?? "";
  }

  files.push(
    textBlobFile(
      iosThemeCssFileName,
      buildIosThemeCss({
        template,
        templateId,
        exportName: exportName ?? template.name,
        versionName: versionName ?? "1.0.0",
        themeIdentifier: options.themeIdentifier,
        slots: iosSlots,
        colors: options.colors,
        selections,
        imageMap,
        bubbleEditsBySlotId: options.bubbleEditsBySlotId,
        sourceScaleBySlotId,
      }),
    ),
  );

  return files;
}

async function resolveIosSlotBlob(slot: ThemeAssetSlot, uploads: SlotUploads, selections: SlotCandidateSelections, templateId: ThemeTemplateId, template: ThemeTemplate) {
  const selectedUpload = getSelectedUpload(slot, uploads, selections);
  if (selectedUpload) return normalizeIosImageBlob(slot, selectedUpload.file, selectedUpload.file.name);
  const assetUrl = getResolvedAssetUrl(slot, uploads, selections, templateId, template);
  if (!assetUrl) return null;
  const blob = await fetchAssetBlob(assetUrl);
  return normalizeIosImageBlob(slot, blob, assetUrl);
}

async function createIosImageExportFiles(slot: ThemeAssetSlot, blob: Blob, sourceScale: number): Promise<IosExportFile[]> {
  const scaleTargets = getIosScaleTargets(slot);
  if (!slot.path || scaleTargets.length === 0) return [{ path: slot.path ?? slot.fileName ?? "Images/image.png", blob }];

  const basePath = stripPngExtension(stripScaleSuffix(slot.path));
  const entries: IosExportFile[] = [];

  for (const targetScale of scaleTargets) {
    entries.push({
      path: targetScale === 1 ? `${basePath}.png` : `${basePath}@${targetScale}x.png`,
      blob: targetScale === sourceScale ? blob : await resizePngBlob(blob, targetScale / sourceScale),
    });
  }

  return entries;
}

function getIosSourceScale(slot: ThemeAssetSlot, uploads: SlotUploads, selections: SlotCandidateSelections, templateId: ThemeTemplateId) {
  const uploadName = getSelectedUpload(slot, uploads, selections)?.file.name;
  return detectIosSourceScale(uploadName)
    ?? detectIosSourceScale(selections[slot.id])
    ?? detectIosSourceScale(slot.defaultAssetUrls?.[templateId])
    ?? 3;
}

function getIosScaleTargets(slot: ThemeAssetSlot) {
  if (!slot.path?.toLowerCase().endsWith(".png")) return [];
  return iosScaleTargetsByRole[slot.role] ?? [];
}

function buildIosThemeCss({
  template,
  templateId,
  exportName,
  versionName,
  themeIdentifier,
  slots,
  colors,
  selections,
  imageMap,
  bubbleEditsBySlotId,
  sourceScaleBySlotId,
}: {
  template: ThemeTemplate;
  templateId: ThemeTemplateId;
  exportName: string;
  versionName: string;
  themeIdentifier?: string;
  slots: ThemeAssetSlot[];
  colors: SlotColors;
  selections: SlotCandidateSelections;
  imageMap: IosImageMap;
  bubbleEditsBySlotId: Partial<Record<string, BubbleEditState>>;
  sourceScaleBySlotId: Record<string, number>;
}) {
  const slotByRole = Object.fromEntries(slots.map((slot) => [slot.role, slot])) as Partial<Record<ThemeResourceRole, ThemeAssetSlot>>;
  const color = (role: ThemeResourceRole, fallback: string) => getResolvedColor(slotByRole[role], colors, selections, templateId, template) ?? fallback;

  const mainText = color("main_title_color", template.defaults.mainTitle);
  const mainDescription = color("main_description_color", template.defaults.mainBody);
  const mainParagraph = color("main_body_color", template.defaults.mainBody);
  const mainHighlighted = color("main_title_pressed_color", mainText);
  const mainParagraphHighlighted = color("main_paragraph_pressed_color", mainParagraph);
  const tabText = color("tab_text_color", mainParagraph);
  const chatButtonBackground = splitAlphaColor(color("chat_button_background_color", "#0FFFFFFF"));

  return [
    "/*",
    " Manifest",
    " */",
    "",
    "ManifestStyle",
    "{",
    cssLine("-kakaotalk-theme-name", quote(exportName)),
    cssLine("-kakaotalk-theme-version", quote(versionName)),
    cssLine("-kakaotalk-theme-url", quote("")),
    cssLine("-kakaotalk-author-name", quote("KakaoTalk Theme Maker")),
    cssLine("-kakaotalk-theme-id", quote(themeIdentifier?.trim() || `com.kakaotalk.theme.${slugify(exportName)}`)),
    "}",
    "",
    "/* TabBar Style */",
    "",
    "TabBarStyle-Main",
    "{",
    cssLine("background-color", color("tab_background", template.defaults.tabBackground)),
    cssImageLine("-ios-background-image", imageMap.tab_background_image),
    cssImageLine("-ios-friends-normal-icon-image", imageMap.tab_icon_friends),
    cssImageLine("-ios-friends-selected-icon-image", imageMap.tab_icon_friends_focused),
    cssImageLine("-ios-chats-normal-icon-image", imageMap.tab_icon_chats),
    cssImageLine("-ios-chats-selected-icon-image", imageMap.tab_icon_chats_focused),
    cssImageLine("-ios-now-normal-icon-image", imageMap.tab_icon_now),
    cssImageLine("-ios-now-selected-icon-image", imageMap.tab_icon_now_focused),
    cssImageLine("-ios-shopping-normal-icon-image", imageMap.tab_icon_shopping),
    cssImageLine("-ios-shopping-selected-icon-image", imageMap.tab_icon_shopping_focused),
    cssImageLine("-ios-more-normal-icon-image", imageMap.tab_icon_more),
    cssImageLine("-ios-more-selected-icon-image", imageMap.tab_icon_more_focused),
    "}",
    "",
    "HeaderStyle-Main",
    "{",
    cssLine("-ios-text-color", mainText),
    cssLine("-ios-tab-text-color", tabText),
    cssLine("-ios-tab-highlighted-text-color", mainText),
    "}",
    "",
    "MainViewStyle-Primary",
    "{",
    cssLine("background-color", color("main_background_color", template.defaults.mainBackground)),
    cssImageLine("-ios-background-image", imageMap.main_background),
    cssLine("-ios-text-color", mainText),
    cssLine("-ios-highlighted-text-color", mainHighlighted),
    cssLine("-ios-description-text-color", mainDescription),
    cssLine("-ios-description-highlighted-text-color", mainHighlighted),
    cssLine("-ios-paragraph-text-color", mainParagraph),
    cssLine("-ios-paragraph-highlighted-text-color", mainParagraphHighlighted),
    cssLine("-ios-normal-background-color", color("main_background_color", template.defaults.mainBackground)),
    cssLine("-ios-normal-background-alpha", "0.0"),
    cssLine("-ios-selected-background-color", color("main_body_cell_pressed_color", mainText)),
    cssLine("-ios-selected-background-alpha", color("main_selected_background_alpha", "0.05")),
    "}",
    "",
    "MainViewStyle-Secondary",
    "{",
    cssLine("background-color", color("main_background_color", template.defaults.mainBackground)),
    "}",
    "",
    "SectionTitleStyle-Main",
    "{",
    cssLine("border-color", color("main_body_cell_border_color", mainText)),
    cssLine("border-alpha", color("main_body_cell_border_alpha", "0.18")),
    cssLine("-ios-text-color", color("main_section_title_color", mainText)),
    cssLine("-ios-text-alpha", "1.0"),
    "}",
    "",
    "ButtonStyle-AddFriend",
    "{",
    cssImageLine("-ios-image", imageMap.find_add_friend),
    "}",
    "",
    "DefaultProfileStyle",
    "{",
    cssProfileImages(imageMap),
    "}",
    "",
    "BackgroundStyle-ChatRoom",
    "{",
    cssLine("background-color", color("chat_background_color", template.defaults.chatBackground)),
    cssImageLine("-ios-background-image", imageMap.chat_background),
    "}",
    "",
    "InputBarStyle-Chat",
    "{",
    cssLine("background-color", color("chat_input_background_color", template.defaults.chatInputBackground)),
    cssLine("-ios-send-normal-background-color", color("chat_send_button_color", template.defaults.chatSendButton)),
    cssLine("-ios-send-normal-foreground-color", color("chat_send_icon_color", mainText)),
    cssLine("-ios-send-highlighted-background-color", color("chat_send_highlighted_button_color", template.accent)),
    cssLine("-ios-send-highlighted-foreground-color", color("chat_send_highlighted_icon_color", mainText)),
    cssLine("-ios-button-normal-foreground-color", color("chat_button_foreground_color", mainParagraph)),
    cssLine("-ios-button-highlighted-foreground-color", color("chat_button_highlighted_foreground_color", mainText)),
    cssLine("-ios-button-text-color", color("chat_button_text_color", mainText)),
    cssLine("-ios-button-normal-background-color", chatButtonBackground.color),
    cssLine("-ios-button-normal-background-alpha", chatButtonBackground.alpha),
    "}",
    "",
    buildMessageCellCss("MessageCellStyle-Send", {
      primaryImage: imageMap.bubble_me_1,
      groupImage: imageMap.bubble_me_2,
      textColor: color("chat_bubble_me_color", mainText),
      unreadColor: color("chat_unread_count_color", template.accent),
      primaryEdit: bubbleEditsBySlotId[slotByRole.bubble_me_1?.id ?? ""],
      groupEdit: bubbleEditsBySlotId[slotByRole.bubble_me_2?.id ?? ""],
      primaryScale: sourceScaleBySlotId[slotByRole.bubble_me_1?.id ?? ""] ?? 3,
      groupScale: sourceScaleBySlotId[slotByRole.bubble_me_2?.id ?? ""] ?? 3,
      fallbackInsets: { top: 10, left: 11, bottom: 7, right: 17 },
      fallbackStretch: { x: 17, y: 17 },
    }),
    "",
    buildMessageCellCss("MessageCellStyle-Receive", {
      primaryImage: imageMap.bubble_you_1,
      groupImage: imageMap.bubble_you_2,
      textColor: color("chat_bubble_you_color", mainText),
      unreadColor: color("chat_unread_count_color", template.accent),
      primaryEdit: bubbleEditsBySlotId[slotByRole.bubble_you_1?.id ?? ""],
      groupEdit: bubbleEditsBySlotId[slotByRole.bubble_you_2?.id ?? ""],
      primaryScale: sourceScaleBySlotId[slotByRole.bubble_you_1?.id ?? ""] ?? 3,
      groupScale: sourceScaleBySlotId[slotByRole.bubble_you_2?.id ?? ""] ?? 3,
      fallbackInsets: { top: 10, left: 17, bottom: 7, right: 11 },
      fallbackStretch: { x: 22, y: 17 },
    }),
  ]
    .filter((line) => line !== null)
    .join("\n");
}

function buildMessageCellCss(
  selector: string,
  options: {
    primaryImage?: string;
    groupImage?: string;
    textColor: string;
    unreadColor: string;
    primaryEdit?: BubbleEditState;
    groupEdit?: BubbleEditState;
    primaryScale: number;
    groupScale: number;
    fallbackInsets: Insets;
    fallbackStretch: StretchPoint;
  },
) {
  const primary = getIosCssValues(options.primaryEdit, options.fallbackInsets, options.fallbackStretch, options.primaryScale);
  const group = getIosCssValues(options.groupEdit, options.fallbackInsets, options.fallbackStretch, options.groupScale);
  return [
    selector,
    "{",
    cssBubbleImageLine("-ios-background-image", options.primaryImage, primary.stretch),
    cssBubbleImageLine("-ios-selected-background-image", options.primaryImage, primary.stretch),
    cssBubbleImageLine("-ios-group-background-image", options.groupImage, group.stretch),
    cssBubbleImageLine("-ios-group-selected-background-image", options.groupImage, group.stretch),
    cssLine("-ios-title-edgeinsets", primary.insets),
    cssLine("-ios-group-title-edgeinsets", group.insets),
    cssLine("-ios-text-color", options.textColor),
    cssLine("-ios-selected-text-color", options.textColor),
    cssLine("-ios-unread-text-color", options.unreadColor),
    "}",
  ]
    .filter((line) => line !== null)
    .join("\n");
}

function getIosCssValues(edit: BubbleEditState | undefined, fallbackInsets: Insets, fallbackStretch: StretchPoint, sourceScale: number) {
  const insets = edit?.insets ?? fallbackInsets;
  const stretch = edit?.stretch ?? fallbackStretch;
  const scale = edit ? sourceScale : 1;
  return {
    stretch: `${Math.round(stretch.x / scale)}px ${Math.round(stretch.y / scale)}px`,
    insets: `${Math.round(insets.top / scale)}px ${Math.round(insets.left / scale)}px ${Math.round(insets.bottom / scale)}px ${Math.round(insets.right / scale)}px`,
  };
}

async function fetchAssetBlob(assetUrl: string) {
  const response = await fetch(assetUrl);
  if (!response.ok) throw new Error(`Failed to fetch asset: ${assetUrl}`);
  return response.blob();
}

async function normalizeIosImageBlob(slot: ThemeAssetSlot, blob: Blob, sourceName: string) {
  const expectsPng = slot.path?.toLowerCase().endsWith(".png");
  if (!expectsPng) return blob;

  const image = await loadBlobImage(blob, sourceName);
  const { width, height } = getValidatedIosImageSize(image);
  if (await hasPngSignature(blob)) return blob;
  return drawImageToPng(image, width, height);
}

async function loadBlobImage(blob: Blob, sourceName: string) {
  if (typeof document === "undefined") throw new Error("iOS 이미지는 브라우저에서 변환해야 합니다.");
  const url = URL.createObjectURL(blob);
  try {
    return await loadImage(url, sourceName);
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function resizePngBlob(blob: Blob, scale: number) {
  if (typeof document === "undefined" || Math.abs(scale - 1) < 0.001) return blob;
  const image = await loadBlobImage(blob, "iOS PNG");
  const source = getValidatedIosImageSize(image);
  const width = Math.max(1, Math.round(source.width * scale));
  const height = Math.max(1, Math.round(source.height * scale));
  validateIosImageSize(width, height);
  return drawImageToPng(image, width, height);
}

function loadImage(url: string, sourceName: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`iOS 이미지 파일을 읽지 못했습니다: ${sourceName}`));
    image.src = url;
  });
}

function getValidatedIosImageSize(image: HTMLImageElement) {
  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;
  validateIosImageSize(width, height);
  return { width, height };
}

function validateIosImageSize(width: number, height: number) {
  if (!width || !height || width > maxIosImageDimension || height > maxIosImageDimension || width * height > maxIosImagePixels) {
    throw new Error(`iOS 이미지는 ${maxIosImageDimension}px 이하, ${Math.floor(maxIosImagePixels / 1_000_000)}메가픽셀 이하로 사용해 주세요.`);
  }
}

async function drawImageToPng(image: HTMLImageElement, width: number, height: number) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("iOS 이미지 변환을 시작하지 못했습니다.");
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.clearRect(0, 0, width, height);
  context.drawImage(image, 0, 0, width, height);
  const png = await canvasToPngBlob(canvas);
  if (!png) throw new Error("iOS 이미지를 PNG로 변환하지 못했습니다.");
  return png;
}

async function hasPngSignature(blob: Blob) {
  if (blob.size < 8) return false;
  const bytes = new Uint8Array(await blob.slice(0, 8).arrayBuffer());
  return bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
    && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a;
}

function canvasToPngBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob | null>((resolve) => {
    canvas.toBlob((blob) => resolve(blob), "image/png");
  });
}

function detectIosSourceScale(value: string | undefined) {
  if (!value) return null;
  const match = value.match(/@([23])x(?=\.[a-z0-9]+$|$)/i);
  return match ? Number(match[1]) : null;
}

function stripScaleSuffix(path: string) {
  return path.replace(/@(?:2x|3x)(?=\.png$)/i, "");
}

function stripPngExtension(path: string) {
  return path.replace(/\.png$/i, "");
}

function cssLine(property: string, value: string | undefined) {
  if (!value) return null;
  return `    ${property}: ${value};`;
}

function cssImageLine(property: string, fileName: string | undefined) {
  if (!fileName) return null;
  return cssLine(property, quote(fileName));
}

function cssBubbleImageLine(property: string, fileName: string | undefined, stretch: string) {
  if (!fileName) return null;
  return cssLine(property, `${quote(fileName)} ${stretch}`);
}

function cssProfileImages(imageMap: IosImageMap) {
  const names = [imageMap.profile_image_1, imageMap.profile_image_2, imageMap.profile_image_3].filter((name): name is string => Boolean(name));
  if (names.length === 0) return null;
  return cssLine("-ios-profile-images", names.map(quote).join(" "));
}

function splitAlphaColor(value: string) {
  const match = value.trim().match(/^#([0-9a-f]{2})([0-9a-f]{6})$/i);
  if (!match) return { color: value, alpha: "1.0" };
  const alpha = Math.round((Number.parseInt(match[1], 16) / 255) * 100) / 100;
  return { color: `#${match[2].toUpperCase()}`, alpha: alpha.toFixed(2).replace(/0$/, "").replace(/\.0$/, ".0") };
}

function quote(value: string) {
  return `'${value.replaceAll("\\", "\\\\").replaceAll("'", "\\'")}'`;
}

function slugify(value: string) {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ".")
      .replace(/^\.+|\.+$/g, "") || "kakaotalk.theme"
  );
}

function textBlobFile(path: string, text: string): IosExportFile {
  return {
    path,
    blob: new Blob([text], { type: "text/css;charset=utf-8" }),
  };
}
