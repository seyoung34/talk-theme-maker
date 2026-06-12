import { exportNinePatch, loadNinePatchDataUrl } from "@/lib/theme/android/ninepatch";
import { getResolvedAssetUrl, getResolvedColor, getSelectedUpload, type BubbleEditState, type SlotCandidateSelections, type SlotColors, type SlotUploads } from "@/lib/theme/project/state";
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

export type AndroidExportFile = {
  path: string;
  blob: Blob;
};

export async function buildAndroidThemeExportFiles(options: AndroidExportOptions): Promise<AndroidExportFile[]> {
  const { analysis, template, templateId, exportName, slots, uploads, colors, selections, bubbleEditsBySlotId } = options;
  const androidSlots = slots.filter((slot) => slot.platform === "android");
  const files: AndroidExportFile[] = [];

  for (const slot of androidSlots) {
    if (slot.kind === "color" || !slot.path) continue;
    const blob = await resolveAndroidSlotBlob(slot, uploads, selections, templateId, template, bubbleEditsBySlotId[slot.id]);
    if (!blob) continue;
    for (const path of getAndroidSlotExportPaths(slot)) {
      files.push({ path, blob });
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
        "Included paths are rooted at src/main/theme/...",
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
  const entries = await Promise.all(files.map((file) => blobFile(file.path, file.blob)));

  const fileName = `${slugify(template.name)}-android-theme-resources.zip`;
  const blob = createStoredZip(entries);
  return { blob, fileName };
}

async function resolveAndroidSlotBlob(
  slot: ThemeAssetSlot,
  uploads: SlotUploads,
  selections: SlotCandidateSelections,
  templateId: ThemeTemplateId,
  template: ThemeTemplate,
  bubbleEdit?: BubbleEditState,
) {
  const selectedUpload = getSelectedUpload(slot, uploads, selections);
  if (slot.kind === "ninepatch") {
    const sourceDataUrl = selectedUpload ? await readThemeProjectFileAsDataUrl(selectedUpload.file) : await assetUrlToDataUrl(getResolvedAssetUrl(slot, uploads, selections, templateId, template));
    if (!sourceDataUrl) return null;
    const asset = await loadNinePatchDataUrl(sourceDataUrl, slot.fileName ?? `${slot.id}.9.png`, slot.role.includes("_me_") ? "me" : "you");
    const nextAsset = bubbleEdit?.markers ? { ...asset, markers: bubbleEdit.markers } : asset;
    return await canvasToBlob(exportNinePatch(nextAsset), "image/png");
  }

  if (selectedUpload) return selectedUpload.file;
  const assetUrl = getResolvedAssetUrl(slot, uploads, selections, templateId, template);
  if (!assetUrl) return null;
  return fetchAssetBlob(assetUrl);
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
    getResolvedColor(slotByRole.main_body_color, colors, selections, templateId, template) ??
    template.defaults.mainBody;
  const mainBody = getResolvedColor(slotByRole.main_body_color, colors, selections, templateId, template) ?? template.defaults.mainBody;
  const mainParagraphPressed =
    getResolvedColor(slotByRole.main_paragraph_pressed_color, colors, selections, templateId, template) ??
    mainBody;
  const mainBackground =
    getResolvedColor(slotByRole.main_background_color, colors, selections, templateId, template) ??
    template.defaults.mainBackground;
  const mainBodyCellPressed =
    getResolvedColor(slotByRole.main_body_cell_pressed_color, colors, selections, templateId, template) ??
    withAlpha(mainBackground, "99");
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
  const mainBodySecondary =
    getResolvedColor(slotByRole.main_body_secondary_cell_color, colors, selections, templateId, template) ??
    lighten(mainBackground, 0.06);
  const accent = template.accent;
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
  const chatInputBackground = getResolvedColor(slotByRole.chat_input_background_color, colors, selections, templateId, template) ?? template.defaults.chatInputBackground;
  const chatSendButton = getResolvedColor(slotByRole.chat_send_button_color, colors, selections, templateId, template) ?? template.defaults.chatSendButton;
  const chatInputText = getResolvedColor(slotByRole.chat_input_text_color, colors, selections, templateId, template) ?? mainTitle;
  const chatSendIcon = getResolvedColor(slotByRole.chat_send_icon_color, colors, selections, templateId, template) ?? mainTitle;

  const palette: Record<string, string> = {
    theme_header_color: mainHeaderForeground,
    theme_section_title_color: mainSectionTitle,
    theme_title_color: mainTitle,
    theme_title_pressed_color: mainTitlePressed,
    theme_paragraph_color: mainBody,
    theme_paragraph_pressed_color: mainParagraphPressed,
    theme_description_color: mainDescription,
    theme_description_pressed_color: mainDescription,
    theme_feature_primary_color: accent,
    theme_feature_primary_pressed_color: accent,
    theme_feature_browse_tab_color: mainFeatureBrowseTab,
    theme_feature_browse_tab_focused_color: mainTitle,
    theme_background_color: mainBackground,
    theme_chatroom_background_color: chatBackground,
    theme_passcode_background_color: template.defaults.myBubble,
    theme_header_cell_color: mainHeader,
    theme_body_cell_color: withAlpha(mainBackground, "00"),
    theme_body_cell_pressed_color: mainBodyCellPressed,
    theme_body_cell_border_color: mainBodyCellBorder,
    theme_body_secondary_cell_color: mainBodySecondary,
    theme_maintab_cell_color: tabBackground,
    theme_tab_lightbannerbadge_background_color: accent,
    theme_tab_bannerbadge_background_color: accent,
    theme_direct_share_color: mainTitle,
    theme_direct_share_button_color: accent,
    theme_direct_share_background_color: lighten(mainBackground, 0.04),
    theme_notification_color: mainTitle,
    theme_notification_background_color: template.defaults.friendBubble,
    theme_notification_background_pressed_color: lighten(template.defaults.friendBubble, -0.04),
    theme_passcode_color: mainTitle,
    theme_passcode_keypad_color: mainTitle,
    theme_passcode_keypad_pressed_color: mainBody,
    theme_passcode_keypad_background_color: lighten(template.defaults.myBubble, 0.1),
    theme_passcode_keypad_pressed_background_color: withAlpha(mainBackground, "99"),
    theme_passcode_pattern_line_color: accent,
    theme_chatroom_bubble_me_color: chatBubbleMeColor,
    theme_chatroom_bubble_you_color: chatBubbleYouColor,
    theme_chatroom_unread_count_color: chatUnreadCountColor,
    theme_chatroom_input_bar_color: chatInputText,
    theme_chatroom_input_bar_background_color: chatInputBackground,
    theme_chatroom_input_bar_menu_icon_color: mainBody,
    theme_chatroom_input_bar_menu_button_color: withAlpha(mainBody, "14"),
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
