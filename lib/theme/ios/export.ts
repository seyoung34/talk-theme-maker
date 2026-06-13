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
const iosBubbleImageRoles = new Set<ThemeResourceRole>(["bubble_me_1", "bubble_me_2", "bubble_you_1", "bubble_you_2"]);

export async function buildIosThemeExportFiles(options: IosExportOptions): Promise<IosExportFile[]> {
  const { analysis, template, templateId, exportName, versionName, slots, uploads, selections } = options;
  const iosSlots = slots.filter((slot) => slot.platform === "ios");
  const files: IosExportFile[] = [];
  const imageMap: IosImageMap = {};

  for (const slot of iosSlots) {
    if (slot.kind === "color" || !slot.path) continue;
    const blob = await resolveIosSlotBlob(slot, uploads, selections, templateId, template);
    if (!blob) continue;
    files.push(...(await createIosImageExportFiles(slot, blob, selections)));
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
        slots: iosSlots,
        colors: options.colors,
        selections,
        imageMap,
        bubbleEditsBySlotId: options.bubbleEditsBySlotId,
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

async function createIosImageExportFiles(slot: ThemeAssetSlot, blob: Blob, selections: SlotCandidateSelections): Promise<IosExportFile[]> {
  if (!slot.path || !isIosBubbleImageSlot(slot)) return [{ path: slot.path ?? slot.fileName ?? "Images/image.png", blob }];

  const basePath = stripPngExtension(stripScaleSuffix(slot.path));
  const sourceScale = detectIosSourceScale(selections[slot.id]) ?? detectIosSourceScale(slot.defaultAssetUrls?.basic) ?? 3;
  const image3x = sourceScale === 3 ? blob : await resizePngBlob(blob, 3 / sourceScale);
  const image2x = sourceScale === 2 ? blob : await resizePngBlob(blob, 2 / sourceScale);

  return [
    { path: `${basePath}@2x.png`, blob: image2x },
    { path: `${basePath}@3x.png`, blob: image3x },
  ];
}

function isIosBubbleImageSlot(slot: ThemeAssetSlot) {
  return iosBubbleImageRoles.has(slot.role) && Boolean(slot.path?.toLowerCase().endsWith(".png"));
}

function buildIosThemeCss({
  template,
  templateId,
  exportName,
  versionName,
  slots,
  colors,
  selections,
  imageMap,
  bubbleEditsBySlotId,
}: {
  template: ThemeTemplate;
  templateId: ThemeTemplateId;
  exportName: string;
  versionName: string;
  slots: ThemeAssetSlot[];
  colors: SlotColors;
  selections: SlotCandidateSelections;
  imageMap: IosImageMap;
  bubbleEditsBySlotId: Partial<Record<string, BubbleEditState>>;
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
    cssLine("-kakaotalk-theme-id", quote(`com.kakaotalk.theme.${slugify(exportName)}`)),
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
    fallbackInsets: Insets;
    fallbackStretch: StretchPoint;
  },
) {
  const primary = getIosCssValues(options.primaryEdit, options.fallbackInsets, options.fallbackStretch);
  const group = getIosCssValues(options.groupEdit, options.fallbackInsets, options.fallbackStretch);
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

function getIosCssValues(edit: BubbleEditState | undefined, fallbackInsets: Insets, fallbackStretch: StretchPoint) {
  const insets = edit?.insets ?? fallbackInsets;
  const stretch = edit?.stretch ?? fallbackStretch;
  const scale = edit ? 3 : 1;
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
  const isSvg = blob.type.includes("svg") || sourceName.toLowerCase().endsWith(".svg");
  if (!expectsPng || !isSvg) return blob;
  return rasterizeSvgBlob(blob);
}

async function rasterizeSvgBlob(blob: Blob) {
  if (typeof document === "undefined") return blob;

  const url = URL.createObjectURL(blob);
  try {
    const image = await loadImage(url);
    const width = image.naturalWidth || image.width || 512;
    const height = image.naturalHeight || image.height || 512;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) return blob;
    context.clearRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);
    return (await canvasToPngBlob(canvas)) ?? blob;
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function resizePngBlob(blob: Blob, scale: number) {
  if (typeof document === "undefined" || Math.abs(scale - 1) < 0.001) return blob;

  const url = URL.createObjectURL(blob);
  try {
    const image = await loadImage(url);
    const sourceWidth = image.naturalWidth || image.width;
    const sourceHeight = image.naturalHeight || image.height;
    if (!sourceWidth || !sourceHeight) return blob;

    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(sourceWidth * scale));
    canvas.height = Math.max(1, Math.round(sourceHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) return blob;
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return (await canvasToPngBlob(canvas)) ?? blob;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function loadImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Failed to rasterize SVG asset for iOS export."));
    image.src = url;
  });
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
