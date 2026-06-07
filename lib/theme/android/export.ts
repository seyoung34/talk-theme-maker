import { exportNinePatch, loadNinePatchDataUrl } from "@/lib/theme/android/ninepatch";
import { getResolvedAssetUrl, getResolvedColor, getSelectedUpload, type BubbleEditState, type SlotCandidateSelections, type SlotColors, type SlotUploads } from "@/lib/theme/project/state";
import { blobFile, createStoredZip, textFile } from "@/lib/theme/project/zip";
import type { ThemeProjectAnalysis } from "@/lib/theme/project/types";
import type { ThemeAssetSlot, ThemeTemplate, ThemeTemplateId } from "@/lib/theme/templates";
import type { ThemePlatform } from "@/lib/theme/types";

type AndroidExportOptions = {
  analysis: ThemeProjectAnalysis;
  template: ThemeTemplate;
  templateId: ThemeTemplateId;
  slots: ThemeAssetSlot[];
  uploads: SlotUploads;
  colors: SlotColors;
  selections: SlotCandidateSelections;
  bubbleEditsBySlotId: Partial<Record<string, BubbleEditState>>;
};

export async function exportAndroidThemePackage(options: AndroidExportOptions) {
  const { analysis, template, templateId, slots, uploads, colors, selections, bubbleEditsBySlotId } = options;
  const androidSlots = slots.filter((slot) => slot.platform === "android");
  const entries = [];

  for (const slot of androidSlots) {
    if (slot.kind === "color" || !slot.path) continue;
    const blob = await resolveAndroidSlotBlob(slot, uploads, selections, templateId, template, bubbleEditsBySlotId[slot.id]);
    if (!blob) continue;
    entries.push(await blobFile(slot.path, blob));
  }

  entries.push(
    textFile("src/main/theme/values/colors.xml", buildAndroidColorsXml(template, androidSlots, colors, selections, templateId)),
    textFile("src/main/theme/values/strings.xml", buildAndroidStringsXml(template.name)),
    textFile("src/main/theme/values-ko/strings.xml", buildAndroidStringsXml(template.name)),
    textFile("src/main/theme/values-ja/strings.xml", buildAndroidStringsXml(template.name)),
    textFile("theme-export-report.json", JSON.stringify({ exportedAt: new Date().toISOString(), templateId, platform: "android", diagnostics: analysis.diagnostics }, null, 2)),
    textFile(
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
    const sourceDataUrl = selectedUpload ? await readBlobAsDataUrl(selectedUpload.file) : await assetUrlToDataUrl(getResolvedAssetUrl(slot, uploads, selections, templateId, template));
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
  const mainTitle = getResolvedColor(slotByRole.main_title_color, colors, selections, templateId, template) ?? template.defaults.mainTitle;
  const mainBody = getResolvedColor(slotByRole.main_body_color, colors, selections, templateId, template) ?? template.defaults.mainBody;
  const mainBackground = template.defaults.mainBackground;
  const chatBackground = getResolvedColor(slotByRole.chat_background_color, colors, selections, templateId, template) ?? template.defaults.chatBackground;
  const tabBackground = getResolvedColor(slotByRole.tab_background, colors, selections, templateId, template) ?? template.defaults.tabBackground;
  const chatInputBackground = getResolvedColor(slotByRole.chat_input_background_color, colors, selections, templateId, template) ?? template.defaults.chatInputBackground;
  const chatSendButton = getResolvedColor(slotByRole.chat_send_button_color, colors, selections, templateId, template) ?? template.defaults.chatSendButton;
  const accent = template.accent;

  const palette: Record<string, string> = {
    theme_header_color: mainHeader,
    theme_section_title_color: mainTitle,
    theme_title_color: mainTitle,
    theme_title_pressed_color: mainTitle,
    theme_paragraph_color: mainBody,
    theme_paragraph_pressed_color: mainBody,
    theme_description_color: mainBody,
    theme_description_pressed_color: mainBody,
    theme_feature_primary_color: accent,
    theme_feature_primary_pressed_color: accent,
    theme_feature_browse_tab_color: tabBackground,
    theme_feature_browse_tab_focused_color: mainTitle,
    theme_background_color: mainBackground,
    theme_chatroom_background_color: chatBackground,
    theme_passcode_background_color: template.defaults.myBubble,
    theme_header_cell_color: mainHeader,
    theme_body_cell_color: withAlpha(mainBackground, "00"),
    theme_body_cell_pressed_color: withAlpha(mainBackground, "99"),
    theme_body_cell_border_color: withAlpha(mainTitle, "33"),
    theme_body_secondary_cell_color: lighten(mainBackground, 0.06),
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
    theme_chatroom_bubble_me_color: mainTitle,
    theme_chatroom_bubble_you_color: mainTitle,
    theme_chatroom_unread_count_color: accent,
    theme_chatroom_input_bar_color: mainTitle,
    theme_chatroom_input_bar_background_color: chatInputBackground,
    theme_chatroom_input_bar_menu_icon_color: mainBody,
    theme_chatroom_input_bar_menu_button_color: withAlpha(mainBody, "14"),
    theme_chatroom_input_bar_send_icon_color: mainTitle,
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
