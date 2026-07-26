import { getImageAssetFallbackRole, getInheritedSourceSlot, getResolvedAssetUrl, getResolvedColor, getSelectedUpload, type BubbleEditState, type SlotCandidateSelections, type SlotColors, type SlotUploads } from "@/lib/theme/project/state";
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

export type IosExportBlobFile = {
  path: string;
  blob: Blob;
};

export type IosExportServerAssetFile = {
  path: string;
  serverAsset: string;
};

export type IosExportFile = IosExportBlobFile | IosExportServerAssetFile;

type IosSlotSource = {
  blob?: Blob;
  assetUrl?: string;
  serverAsset?: string;
  sourceName: string;
  sourceScale: number;
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
  tab_icon_piccoma: [2, 3],
  tab_icon_piccoma_focused: [2, 3],
  tab_icon_call: [2, 3],
  tab_icon_call_focused: [2, 3],
  chat_background: [3],
  bubble_me_1: [2, 3],
  bubble_me_2: [2, 3],
  bubble_you_1: [2, 3],
  bubble_you_2: [2, 3],
  bubble_me_1_selected: [2, 3],
  bubble_me_2_selected: [2, 3],
  bubble_you_1_selected: [2, 3],
  bubble_you_2_selected: [2, 3],
  profile_image_1: [3],
  find_add_friend: [2, 3],
  passcode_background: [3],
  passcode_indicator_1: [3],
  passcode_indicator_1_checked: [3],
  passcode_indicator_2: [3],
  passcode_indicator_2_checked: [3],
  passcode_indicator_3: [3],
  passcode_indicator_3_checked: [3],
  passcode_indicator_4: [3],
  passcode_indicator_4_checked: [3],
  passcode_keypad_pressed_image: [3],
};

export async function buildIosThemeExportFiles(options: IosExportOptions): Promise<IosExportFile[]> {
  const { analysis, template, templateId, exportName, versionName, slots, uploads, selections } = options;
  const iosSlots = slots.filter((slot) => slot.platform === "ios");
  const files: IosExportFile[] = [];
  const imageMap: IosImageMap = {};
  const sourceScaleBySlotId: Record<string, number> = {};

  for (const slot of iosSlots) {
    if (slot.kind === "color" || !slot.path) continue;
    const source = await resolveIosSlotSource(slot, uploads, selections, templateId, template, iosSlots);
    if (!source) continue;
    sourceScaleBySlotId[slot.id] = source.sourceScale;
    files.push(...(await createIosImageExportFiles(slot, source)));
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
        sourceScaleBySlotId,
      }),
    ),
  );

  return files;
}

async function resolveIosSlotSource(slot: ThemeAssetSlot, uploads: SlotUploads, selections: SlotCandidateSelections, templateId: ThemeTemplateId, template: ThemeTemplate, allSlots: ThemeAssetSlot[]): Promise<IosSlotSource | null> {
  // 직접 선택 없이 기본 슬롯을 상속 중이면(예: 탭 선택 아이콘) 기본 슬롯 소스를 그대로 사용한다.
  const inheritedSource = getInheritedSourceSlot(slot, uploads, selections, templateId, template, allSlots);
  if (inheritedSource) return resolveIosSlotSource(inheritedSource, uploads, selections, templateId, template, allSlots);

  const selectedUpload = getSelectedUpload(slot, uploads, selections);
  if (selectedUpload) {
    return {
      blob: await normalizeIosImageBlob(slot, selectedUpload.file, selectedUpload.file.name),
      sourceName: selectedUpload.file.name,
      sourceScale: getIosSourceScale(slot, uploads, selections, templateId),
    };
  }

  const assetUrl = getResolvedAssetUrl(slot, uploads, selections, templateId, template);
  if (!assetUrl) {
    // 별도 지정이 없으면 상속 슬롯(예: 탭 선택 아이콘 → 기본 아이콘)의 소스를 사용한다.
    const fallbackRole = getImageAssetFallbackRole(slot.role);
    const fallbackSlot = fallbackRole ? allSlots.find((candidate) => candidate.role === fallbackRole) : undefined;
    if (!fallbackSlot) return null;
    return resolveIosSlotSource(fallbackSlot, uploads, selections, templateId, template, allSlots);
  }
  const sourceScale = getIosSourceScale(slot, uploads, selections, templateId);
  if (canUseServerAssetReference(slot, assetUrl)) {
    return {
      assetUrl,
      serverAsset: assetUrl,
      sourceName: assetUrl,
      sourceScale,
    };
  }

  const blob = await fetchAssetBlob(assetUrl);
  return {
    blob: await normalizeIosImageBlob(slot, blob, assetUrl),
    sourceName: assetUrl,
    sourceScale,
  };
}

async function createIosImageExportFiles(slot: ThemeAssetSlot, source: IosSlotSource): Promise<IosExportFile[]> {
  const scaleTargets = getIosScaleTargets(slot);
  if (!slot.path || scaleTargets.length === 0) {
    const path = slot.path ?? slot.fileName ?? "Images/image.png";
    if (source.serverAsset) return [{ path, serverAsset: source.serverAsset }];
    return [{ path, blob: await getIosSourceBlob(slot, source) }];
  }

  const basePath = stripPngExtension(stripScaleSuffix(slot.path));
  const entries: IosExportFile[] = [];

  for (const targetScale of scaleTargets) {
    const path = targetScale === 1 ? `${basePath}.png` : `${basePath}@${targetScale}x.png`;
    if (targetScale === source.sourceScale && source.serverAsset) {
      entries.push({ path, serverAsset: source.serverAsset });
      continue;
    }

    const blob = await getIosSourceBlob(slot, source);
    entries.push({
      path,
      blob: targetScale === source.sourceScale ? blob : await resizePngBlob(blob, targetScale / source.sourceScale),
    });
  }

  return entries;
}

async function getIosSourceBlob(slot: ThemeAssetSlot, source: IosSlotSource) {
  if (source.blob) return source.blob;
  if (!source.assetUrl) throw new Error(`iOS 이미지 원본을 찾지 못했습니다: ${source.sourceName}`);
  const blob = await fetchAssetBlob(source.assetUrl);
  source.blob = await normalizeIosImageBlob(slot, blob, source.sourceName);
  return source.blob;
}

function canUseServerAssetReference(slot: ThemeAssetSlot, assetUrl: string) {
  if (!assetUrl.startsWith("/template-assets/")) return false;
  const exportName = (slot.path ?? slot.fileName ?? "").toLowerCase();
  return !exportName.endsWith(".png") || assetUrl.toLowerCase().endsWith(".png");
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
  const headerText = color("main_header_foreground_color", mainText);
  const mainDescription = color("main_description_color", template.defaults.mainBody);
  const mainParagraph = color("tab_paragraph_color", template.defaults.mainBody);
  const mainHighlighted = color("main_title_pressed_color", mainText);
  const mainParagraphHighlighted = color("tab_paragraph_pressed_color", mainParagraph);
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
    cssLine("-kakaotalk-theme-id", quote("com.kakao.talk.theme.pending")),
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
    cssImageLine("-ios-piccoma-normal-icon-image", imageMap.tab_icon_piccoma),
    cssImageLine("-ios-piccoma-selected-icon-image", imageMap.tab_icon_piccoma_focused),
    cssImageLine("-ios-call-normal-icon-image", imageMap.tab_icon_call),
    cssImageLine("-ios-call-selected-icon-image", imageMap.tab_icon_call_focused),
    cssImageLine("-ios-more-normal-icon-image", imageMap.tab_icon_more),
    cssImageLine("-ios-more-selected-icon-image", imageMap.tab_icon_more_focused),
    "}",
    "",
    "HeaderStyle-Main",
    "{",
    cssLine("-ios-text-color", headerText),
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
    cssLine("background-color", color("main_body_secondary_cell_color", template.defaults.mainBackground)),
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
    "FeatureStyle-Primary",
    "{",
    cssLine("-ios-text-color", color("feature_primary_color", mainDescription)),
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
    "BackgroundStyle-MessageNotificationBar",
    "{",
    cssLine("background-color", color("notification_background_color", template.defaults.mainBackground)),
    "}",
    "",
    "LabelStyle-MessageNotificationBarName",
    "{",
    cssLine("-ios-text-color", color("notification_name_color", mainText)),
    "}",
    "",
    "LabelStyle-MessageNotificationBarMessage",
    "{",
    cssLine("-ios-text-color", color("notification_text_color", mainDescription)),
    "}",
    "",
    "BackgroundStyle-DirectShareBar",
    "{",
    cssLine("background-color", color("direct_share_background_color", template.defaults.mainBackground)),
    "}",
    "",
    "LabelStyle-DirectShareBarName",
    "{",
    cssLine("-ios-text-color", color("direct_share_name_color", mainText)),
    "}",
    "",
    "LabelStyle-DirectShareBarMessage",
    "{",
    cssLine("-ios-text-color", color("direct_share_text_color", mainDescription)),
    "}",
    "",
    "BottomBannerStyle",
    "{",
    cssLine("background-color", color("bottom_banner_background_color", template.defaults.tabBackground)),
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
      selectedPrimaryImage: imageMap.bubble_me_1_selected,
      selectedGroupImage: imageMap.bubble_me_2_selected,
      textColor: color("chat_bubble_me_color", mainText),
      selectedTextColor: color("chat_bubble_me_selected_color", color("chat_bubble_me_color", mainText)),
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
      selectedPrimaryImage: imageMap.bubble_you_1_selected,
      selectedGroupImage: imageMap.bubble_you_2_selected,
      textColor: color("chat_bubble_you_color", mainText),
      selectedTextColor: color("chat_bubble_you_selected_color", color("chat_bubble_you_color", mainText)),
      unreadColor: color("chat_unread_count_color", template.accent),
      primaryEdit: bubbleEditsBySlotId[slotByRole.bubble_you_1?.id ?? ""],
      groupEdit: bubbleEditsBySlotId[slotByRole.bubble_you_2?.id ?? ""],
      primaryScale: sourceScaleBySlotId[slotByRole.bubble_you_1?.id ?? ""] ?? 3,
      groupScale: sourceScaleBySlotId[slotByRole.bubble_you_2?.id ?? ""] ?? 3,
      fallbackInsets: { top: 10, left: 17, bottom: 7, right: 11 },
      fallbackStretch: { x: 22, y: 17 },
    }),
    "",
    "BackgroundStyle-Passcode",
    "{",
    cssLine("background-color", color("passcode_background_color", "#FFDEDE")),
    cssImageLine("-ios-background-image", imageMap.passcode_background),
    "}",
    "",
    "LabelStyle-PasscodeTitle",
    "{",
    cssLine("-ios-text-color", color("passcode_color", "#664242")),
    "}",
    "",
    "PasscodeStyle",
    "{",
    cssImageLine("-ios-bullet-first-image", imageMap.passcode_indicator_1),
    cssImageLine("-ios-bullet-second-image", imageMap.passcode_indicator_2),
    cssImageLine("-ios-bullet-third-image", imageMap.passcode_indicator_3),
    cssImageLine("-ios-bullet-fourth-image", imageMap.passcode_indicator_4),
    cssImageLine("-ios-bullet-selected-first-image", imageMap.passcode_indicator_1_checked),
    cssImageLine("-ios-bullet-selected-second-image", imageMap.passcode_indicator_2_checked),
    cssImageLine("-ios-bullet-selected-third-image", imageMap.passcode_indicator_3_checked),
    cssImageLine("-ios-bullet-selected-fourth-image", imageMap.passcode_indicator_4_checked),
    cssLine("-ios-keypad-background-color", color("passcode_keypad_background_color", "#FFF2F2")),
    cssLine("-ios-keypad-text-normal-color", color("passcode_keypad_color", "#664242")),
    cssImageLine("-ios-keypad-number-highlighted-image", imageMap.passcode_keypad_pressed_image),
    "}",
  ]
    .filter((line) => line !== null)
    .join("\n");
}

function buildMessageCellCss(
  selector: string,
  options: {
    primaryImage?: string;
    groupImage?: string;
    selectedPrimaryImage?: string;
    selectedGroupImage?: string;
    textColor: string;
    selectedTextColor: string;
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
    cssBubbleImageLine("-ios-selected-background-image", options.selectedPrimaryImage ?? options.primaryImage, primary.stretch),
    cssBubbleImageLine("-ios-group-background-image", options.groupImage, group.stretch),
    cssBubbleImageLine("-ios-group-selected-background-image", options.selectedGroupImage ?? options.groupImage, group.stretch),
    cssLine("-ios-title-edgeinsets", primary.insets),
    cssLine("-ios-group-title-edgeinsets", group.insets),
    cssLine("-ios-text-color", options.textColor),
    cssLine("-ios-selected-text-color", options.selectedTextColor),
    cssLine("-ios-unread-text-color", options.unreadColor),
    "}",
  ]
    .filter((line) => line !== null)
    .join("\n");
}

function getIosCssValues(edit: BubbleEditState | undefined, fallbackInsets: Insets, fallbackStretch: StretchPoint, sourceScale: number) {
  const insets = edit?.geometry?.contentInsets ?? edit?.insets ?? fallbackInsets;
  const stretch = edit?.geometry?.stretch ?? edit?.stretch ?? fallbackStretch;
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

function textBlobFile(path: string, text: string): IosExportFile {
  return {
    path,
    blob: new Blob([text], { type: "text/css;charset=utf-8" }),
  };
}
