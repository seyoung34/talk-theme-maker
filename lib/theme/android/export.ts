import { exportNinePatch, loadNinePatchDataUrl } from "@/lib/theme/android/ninepatch";
import { bubbleGeometryToAndroidMarkers } from "@/lib/theme/bubbleGeometry";
import { getImageAssetFallbackRole, getInheritedSourceSlot, getResolvedAssetUrl, getResolvedColor, getSelectedUpload, type BubbleEditState, type SlotCandidateSelections, type SlotColors, type SlotUploads } from "@/lib/theme/project/state";
import { blobFile, createStoredZip } from "@/lib/theme/project/zip";
import type { ThemeProjectAnalysis, ThemeProjectFile } from "@/lib/theme/project/types";
import type { ThemeAssetSlot, ThemeTemplate, ThemeTemplateId } from "@/lib/theme/templates";

type AndroidExportOptions = {
  analysis: ThemeProjectAnalysis;
  template: ThemeTemplate;
  templateId: ThemeTemplateId;
  exportName?: string;
  slots: ThemeAssetSlot[];
  uploads: SlotUploads;
  colors: SlotColors;
  selections: SlotCandidateSelections;
  bubbleEditsBySlotId: Partial<Record<string, BubbleEditState>>;
};

export type AndroidExportBlobFile = {
  path: string;
  blob: Blob;
};

export type AndroidExportServerAssetFile = {
  path: string;
  serverAsset: string;
};

export type AndroidExportFile = AndroidExportBlobFile | AndroidExportServerAssetFile;

type AndroidExportSource = { blob: Blob } | { serverAsset: string };

export async function buildAndroidThemeExportFiles(options: AndroidExportOptions): Promise<AndroidExportFile[]> {
  const { analysis, template, templateId, exportName, slots, uploads, colors, selections, bubbleEditsBySlotId } = options;
  const androidSlots = slots.filter((slot) => slot.platform === "android");
  const files: AndroidExportFile[] = [];

  for (const slot of androidSlots) {
    if (slot.kind === "color" || !slot.path) continue;
    const source = await resolveAndroidSlotSource(slot, uploads, selections, templateId, template, bubbleEditsBySlotId[slot.id], androidSlots);
    if (!source) continue;
    for (const path of getAndroidSlotExportPaths(slot)) {
      files.push("serverAsset" in source ? { path, serverAsset: source.serverAsset } : { path, blob: source.blob });
    }
  }

  files.push(
    textBlobFile("src/main/theme/values/colors.xml", buildAndroidColorsXml(template, androidSlots, colors, selections, templateId)),
    textBlobFile("src/main/theme/values/strings.xml", buildAndroidStringsXml(exportName ?? template.name)),
    textBlobFile("src/main/theme/values-ko/strings.xml", buildAndroidStringsXml(exportName ?? template.name)),
    textBlobFile("src/main/theme/values-ja/strings.xml", buildAndroidStringsXml(exportName ?? template.name)),
    textBlobFile("theme-export-report.json", JSON.stringify({ exportedAt: new Date().toISOString(), templateId, platform: "android", diagnostics: analysis.diagnostics }, null, 2)),
    textBlobFile(
      "README-export.txt",
      [
        "This zip contains Android theme resource files exported from KakaoTalk Theme Maker.",
        "",
        "Merge these files into an Android KakaoTalk theme sample project.",
        "Included paths are rooted at src/main/theme/... and src/main/res/mipmap-... for launcher icons.",
        "Generated colors.xml contains the current editable color tokens from the editor.",
      ].join("\n"),
    ),
  );

  return files;
}

function getAndroidSlotExportPaths(slot: ThemeAssetSlot) {
  return Array.from(new Set([slot.path, ...(slot.export?.android?.scaleTargets ?? [])].filter((path): path is string => Boolean(path))));
}

export async function exportAndroidThemePackage(options: AndroidExportOptions) {
  const { template } = options;
  const files = await buildAndroidThemeExportFiles(options);
  const entries = await Promise.all(files.map(async (file) => blobFile(file.path, "serverAsset" in file ? await fetchAssetBlob(file.serverAsset) : file.blob)));

  const fileName = `${slugify(template.name)}-android-theme-resources.zip`;
  const blob = createStoredZip(entries);
  return { blob, fileName };
}

async function resolveAndroidSlotSource(
  slot: ThemeAssetSlot,
  uploads: SlotUploads,
  selections: SlotCandidateSelections,
  templateId: ThemeTemplateId,
  template: ThemeTemplate,
  bubbleEdit?: BubbleEditState,
  allSlots: ThemeAssetSlot[] = [],
): Promise<AndroidExportSource | null> {
  // 직접 선택 없이 기본 슬롯을 상속 중이면(예: 탭 선택 아이콘) 기본 슬롯 소스를 그대로 사용한다.
  const inheritedSource = getInheritedSourceSlot(slot, uploads, selections, templateId, template, allSlots);
  if (inheritedSource) return resolveAndroidSlotSource(inheritedSource, uploads, selections, templateId, template, bubbleEdit, allSlots);

  const selectedUpload = getSelectedUpload(slot, uploads, selections);
  if (slot.kind === "ninepatch") {
    const sourceDataUrl = selectedUpload ? await readThemeProjectFileAsDataUrl(selectedUpload.file) : await assetUrlToDataUrl(getResolvedAssetUrl(slot, uploads, selections, templateId, template));
    if (!sourceDataUrl) return null;
    const asset = await loadNinePatchDataUrl(sourceDataUrl, slot.fileName ?? `${slot.id}.9.png`, slot.role.includes("_me_") ? "me" : "you");
    const markers = bubbleEdit?.geometry
      ? bubbleGeometryToAndroidMarkers(bubbleEdit.geometry, asset.innerCanvas.width, asset.innerCanvas.height)
      : bubbleEdit?.markers;
    const nextAsset = markers ? { ...asset, markers } : asset;
    return { blob: await canvasToBlob(exportNinePatch(nextAsset), "image/png") };
  }

  if (selectedUpload) return { blob: selectedUpload.file };
  const assetUrl = getResolvedAssetUrl(slot, uploads, selections, templateId, template);
  if (assetUrl) {
    if (canUseServerAssetReference(slot, assetUrl)) return { serverAsset: assetUrl };
    const blob = await fetchAssetBlob(assetUrl);
    return { blob: await normalizeAndroidImageBlob(slot, blob, assetUrl) };
  }

  const fallbackRole = getImageAssetFallbackRole(slot.role);
  const fallbackSlot = fallbackRole ? allSlots.find((candidate) => candidate.role === fallbackRole) : undefined;
  if (!fallbackSlot) return null;
  return resolveAndroidSlotSource(fallbackSlot, uploads, selections, templateId, template, bubbleEdit, allSlots);
}

function canUseServerAssetReference(slot: ThemeAssetSlot, assetUrl: string) {
  if (!isLocalTemplateAssetUrl(assetUrl)) return false;
  const exportName = (slot.path ?? slot.fileName ?? "").toLowerCase();
  return !exportName.endsWith(".png") || assetUrl.toLowerCase().endsWith(".png");
}

function isLocalTemplateAssetUrl(assetUrl: string) {
  return assetUrl.startsWith("/template-assets/");
}

async function normalizeAndroidImageBlob(slot: ThemeAssetSlot, blob: Blob, sourceName: string) {
  const expectsPng = (slot.path ?? slot.fileName)?.toLowerCase().endsWith(".png");
  if (!expectsPng || (await hasPngSignature(blob))) return blob;

  const image = await loadBlobImage(blob, sourceName);
  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;
  if (!width || !height) throw new Error(`이미지 크기를 확인하지 못했습니다: ${sourceName}`);
  return drawImageToPng(image, width, height);
}

async function loadBlobImage(blob: Blob, sourceName: string) {
  if (typeof document === "undefined") throw new Error("Android 이미지는 브라우저에서 변환해야 합니다.");
  const url = URL.createObjectURL(blob);
  try {
    return await loadImage(url, sourceName);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function loadImage(url: string, sourceName: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`이미지 파일을 읽지 못했습니다: ${sourceName}`));
    image.src = url;
  });
}

async function drawImageToPng(image: HTMLImageElement, width: number, height: number) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("이미지를 PNG로 변환하지 못했습니다.");
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.clearRect(0, 0, width, height);
  context.drawImage(image, 0, 0, width, height);
  return canvasToBlob(canvas, "image/png");
}

async function hasPngSignature(blob: Blob) {
  if (blob.size < 8) return false;
  const bytes = new Uint8Array(await blob.slice(0, 8).arrayBuffer());
  return bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
    && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a;
}

function buildAndroidColorsXml(
  template: ThemeTemplate,
  slots: ThemeAssetSlot[],
  colors: SlotColors,
  selections: SlotCandidateSelections,
  templateId: ThemeTemplateId,
) {
  const slotByRole = Object.fromEntries(slots.map((slot) => [slot.role, slot])) as Record<string, ThemeAssetSlot | undefined>;
  const mainHeader = getResolvedColor(slotByRole.main_header_color, colors, selections, templateId, template) ?? template.defaults.mainHeader;
  const mainHeaderForeground =
    getResolvedColor(slotByRole.main_header_foreground_color, colors, selections, templateId, template) ??
    getResolvedColor(slotByRole.main_title_color, colors, selections, templateId, template) ??
    template.defaults.mainTitle;
  const mainTitle = getResolvedColor(slotByRole.main_title_color, colors, selections, templateId, template) ?? template.defaults.mainTitle;
  const mainTitlePressed =
    getResolvedColor(slotByRole.main_title_pressed_color, colors, selections, templateId, template) ??
    mainTitle;
  const mainDescription =
    getResolvedColor(slotByRole.main_description_color, colors, selections, templateId, template) ??
    template.defaults.mainBody;
  const mainDescriptionPressed = getResolvedColor(slotByRole.main_description_pressed_color, colors, selections, templateId, template) ?? mainDescription;
  const tabParagraph = getResolvedColor(slotByRole.tab_paragraph_color, colors, selections, templateId, template) ?? template.defaults.mainBody;
  const tabParagraphPressed = getResolvedColor(slotByRole.tab_paragraph_pressed_color, colors, selections, templateId, template) ?? tabParagraph;
  const mainBackground =
    getResolvedColor(slotByRole.main_background_color, colors, selections, templateId, template) ??
    template.defaults.mainBackground;
  const mainBodyCellPressed =
    getResolvedColor(slotByRole.main_body_cell_pressed_color, colors, selections, templateId, template) ??
    withAlpha(mainBackground, "99");
  const mainBodyCell = getResolvedColor(slotByRole.main_body_cell_color, colors, selections, templateId, template) ?? withAlpha(mainBackground, "00");
  const mainBodyCellBorder =
    getResolvedColor(slotByRole.main_body_cell_border_color, colors, selections, templateId, template) ??
    withAlpha(mainTitle, "33");
  const mainSectionTitle =
    getResolvedColor(slotByRole.main_section_title_color, colors, selections, templateId, template) ??
    mainTitle;
  const mainFeatureBrowseTab =
    getResolvedColor(slotByRole.main_feature_browse_tab_color, colors, selections, templateId, template) ??
    getResolvedColor(slotByRole.tab_background, colors, selections, templateId, template) ??
    template.defaults.tabBackground;
  const accent = template.accent;
  const mainFeatureBrowseTabFocused = getResolvedColor(slotByRole.main_feature_browse_tab_focused_color, colors, selections, templateId, template) ?? mainTitle;
  const featurePrimary = getResolvedColor(slotByRole.feature_primary_color, colors, selections, templateId, template) ?? accent;
  const featurePrimaryPressed = getResolvedColor(slotByRole.feature_primary_pressed_color, colors, selections, templateId, template) ?? featurePrimary;
  const mainBodySecondary =
    getResolvedColor(slotByRole.main_body_secondary_cell_color, colors, selections, templateId, template) ??
    lighten(mainBackground, 0.06);
  const chatBackground = getResolvedColor(slotByRole.chat_background_color, colors, selections, templateId, template) ?? template.defaults.chatBackground;
  const chatBubbleMeColor =
    getResolvedColor(slotByRole.chat_bubble_me_color, colors, selections, templateId, template) ??
    mainTitle;
  const chatBubbleYouColor =
    getResolvedColor(slotByRole.chat_bubble_you_color, colors, selections, templateId, template) ??
    mainTitle;
  const chatUnreadCountColor =
    getResolvedColor(slotByRole.chat_unread_count_color, colors, selections, templateId, template) ??
    accent;
  const tabBackground = getResolvedColor(slotByRole.tab_background, colors, selections, templateId, template) ?? template.defaults.tabBackground;
  const lightBannerBadge = getResolvedColor(slotByRole.tab_light_banner_badge_background_color, colors, selections, templateId, template) ?? accent;
  const bannerBadge = getResolvedColor(slotByRole.tab_banner_badge_background_color, colors, selections, templateId, template) ?? accent;
  const chatInputBackground = getResolvedColor(slotByRole.chat_input_background_color, colors, selections, templateId, template) ?? template.defaults.chatInputBackground;
  const chatSendButton = getResolvedColor(slotByRole.chat_send_button_color, colors, selections, templateId, template) ?? template.defaults.chatSendButton;
  const chatInputText = getResolvedColor(slotByRole.chat_input_text_color, colors, selections, templateId, template) ?? mainTitle;
  const chatSendIcon = getResolvedColor(slotByRole.chat_send_icon_color, colors, selections, templateId, template) ?? mainTitle;
  const chatMenuIcon = getResolvedColor(slotByRole.chat_menu_icon_color, colors, selections, templateId, template) ?? tabParagraph;
  const chatMenuButton = getResolvedColor(slotByRole.chat_menu_button_color, colors, selections, templateId, template) ?? withAlpha(tabParagraph, "14");
  const directShareText = getResolvedColor(slotByRole.direct_share_text_color, colors, selections, templateId, template) ?? mainTitle;
  const directShareButton = getResolvedColor(slotByRole.direct_share_button_color, colors, selections, templateId, template) ?? accent;
  const directShareBackground = getResolvedColor(slotByRole.direct_share_background_color, colors, selections, templateId, template) ?? lighten(mainBackground, 0.04);
  const notificationText = getResolvedColor(slotByRole.notification_text_color, colors, selections, templateId, template) ?? mainTitle;
  const notificationBackground = getResolvedColor(slotByRole.notification_background_color, colors, selections, templateId, template) ?? template.defaults.friendBubble;
  const notificationBackgroundPressed = getResolvedColor(slotByRole.notification_background_pressed_color, colors, selections, templateId, template) ?? lighten(notificationBackground, -0.04);
  const passcodeBackground = getResolvedColor(slotByRole.passcode_background_color, colors, selections, templateId, template) ?? "#FCC5C5";
  const passcodeColor = getResolvedColor(slotByRole.passcode_color, colors, selections, templateId, template) ?? "#664242";
  const passcodeKeypad = getResolvedColor(slotByRole.passcode_keypad_color, colors, selections, templateId, template) ?? "#664242";
  const passcodeKeypadPressed = getResolvedColor(slotByRole.passcode_keypad_pressed_color, colors, selections, templateId, template) ?? "#CCB8B8";
  const passcodeKeypadBackground = getResolvedColor(slotByRole.passcode_keypad_background_color, colors, selections, templateId, template) ?? "#FFF2F2";
  const passcodeKeypadPressedBackground = getResolvedColor(slotByRole.passcode_keypad_pressed_background_color, colors, selections, templateId, template) ?? "#99FFDEDE";
  const passcodePatternLine = getResolvedColor(slotByRole.passcode_pattern_line_color, colors, selections, templateId, template) ?? passcodeBackground;

  const palette: Record<string, string> = {
    theme_header_color: mainHeaderForeground,
    theme_section_title_color: mainSectionTitle,
    theme_title_color: mainTitle,
    theme_title_pressed_color: mainTitlePressed,
    theme_paragraph_color: tabParagraph,
    theme_paragraph_pressed_color: tabParagraphPressed,
    theme_description_color: mainDescription,
    theme_description_pressed_color: mainDescriptionPressed,
    theme_feature_primary_color: featurePrimary,
    theme_feature_primary_pressed_color: featurePrimaryPressed,
    theme_feature_browse_tab_color: mainFeatureBrowseTab,
    theme_feature_browse_tab_focused_color: mainFeatureBrowseTabFocused,
    theme_background_color: mainBackground,
    theme_chatroom_background_color: chatBackground,
    theme_passcode_background_color: passcodeBackground,
    theme_header_cell_color: mainHeader,
    theme_body_cell_color: mainBodyCell,
    theme_body_cell_pressed_color: mainBodyCellPressed,
    theme_body_cell_border_color: mainBodyCellBorder,
    theme_body_secondary_cell_color: mainBodySecondary,
    theme_maintab_cell_color: tabBackground,
    theme_tab_lightbannerbadge_background_color: lightBannerBadge,
    theme_tab_bannerbadge_background_color: bannerBadge,
    theme_direct_share_color: directShareText,
    theme_direct_share_button_color: directShareButton,
    theme_direct_share_background_color: directShareBackground,
    theme_notification_color: notificationText,
    theme_notification_background_color: notificationBackground,
    theme_notification_background_pressed_color: notificationBackgroundPressed,
    theme_passcode_color: passcodeColor,
    theme_passcode_keypad_color: passcodeKeypad,
    theme_passcode_keypad_pressed_color: passcodeKeypadPressed,
    theme_passcode_keypad_background_color: passcodeKeypadBackground,
    theme_passcode_keypad_pressed_background_color: passcodeKeypadPressedBackground,
    theme_passcode_pattern_line_color: passcodePatternLine,
    theme_chatroom_bubble_me_color: chatBubbleMeColor,
    theme_chatroom_bubble_you_color: chatBubbleYouColor,
    theme_chatroom_unread_count_color: chatUnreadCountColor,
    theme_chatroom_input_bar_color: chatInputText,
    theme_chatroom_input_bar_background_color: chatInputBackground,
    theme_chatroom_input_bar_menu_icon_color: chatMenuIcon,
    theme_chatroom_input_bar_menu_button_color: chatMenuButton,
    theme_chatroom_input_bar_send_icon_color: chatSendIcon,
    theme_chatroom_input_bar_send_button_color: chatSendButton,
  };

  return [
    '<?xml version="1.0" encoding="utf-8"?>',
    "<resources>",
    ...Object.entries(palette).map(([name, value]) => `    <color name="${name}">${normalizeHex(value)}</color>`),
    "</resources>",
  ].join("\n");
}

function buildAndroidStringsXml(name: string) {
  return [
    '<?xml version="1.0" encoding="utf-8"?>',
    "<resources>",
    `    <string name="theme_title">${escapeXml(name)}</string>`,
    `    <string name="app_name">${escapeXml(name)}</string>`,
    "</resources>",
  ].join("\n");
}

async function fetchAssetBlob(assetUrl: string) {
  const response = await fetch(assetUrl);
  if (!response.ok) throw new Error(`Failed to fetch asset: ${assetUrl}`);
  return response.blob();
}

async function assetUrlToDataUrl(assetUrl?: string) {
  if (!assetUrl) return null;
  const blob = await fetchAssetBlob(assetUrl);
  return readBlobAsDataUrl(blob);
}

function readBlobAsDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("Canvas export failed."));
        return;
      }
      resolve(blob);
    }, type);
  });
}

function normalizeHex(value: string) {
  const hex = value.trim();
  if (!hex.startsWith("#")) return hex;
  if (hex.length === 4) return `#${hex.slice(1).split("").map((char) => char + char).join("")}`;
  return hex.toUpperCase();
}

function withAlpha(color: string, alphaHex: string) {
  const normalized = normalizeHex(color).replace("#", "");
  if (normalized.length !== 6) return color;
  return `#${alphaHex}${normalized}`.toUpperCase();
}

function lighten(color: string, amount: number) {
  const normalized = normalizeHex(color).replace("#", "");
  if (normalized.length !== 6) return color;
  const [r, g, b] = [0, 2, 4].map((offset) => Number.parseInt(normalized.slice(offset, offset + 2), 16));
  const adjust = (channel: number) => Math.max(0, Math.min(255, Math.round(channel + 255 * amount)));
  return `#${[adjust(r), adjust(g), adjust(b)].map((channel) => channel.toString(16).padStart(2, "0")).join("")}`.toUpperCase();
}

function escapeXml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]+/g, "-")
    .replace(/^-+|-+$/g, "") || "kakaotalk-theme";
}

function textBlobFile(path: string, text: string): AndroidExportFile {
  return {
    path,
    blob: new Blob([text], { type: "text/plain;charset=utf-8" }),
  };
}

function readThemeProjectFileAsDataUrl(file: ThemeProjectFile["file"]) {
  if (!file) return Promise.resolve("");
  return readBlobAsDataUrl(file);
}
