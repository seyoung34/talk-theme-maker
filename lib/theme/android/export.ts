import { mapWithConcurrency } from "@/lib/shared/concurrency";
import { getAndroidRasterPlan, isAndroidDerivedLauncherRole, renderAndroidImageBlob } from "@/lib/theme/android/assetCompiler";
import { exportNinePatch, flipCanvasHorizontally, loadNinePatchBlob } from "@/lib/theme/android/ninepatch";
import { bubbleGeometryToAndroidMarkers, flipAndroidMarkersHorizontally, flipBubbleGeometryHorizontally } from "@/lib/theme/bubbleGeometry";
import { exportSlotConcurrency } from "@/lib/theme/exportRequest";
import { storagePathToFile } from "@/lib/theme/remoteAssets";
import { isCatalogExportProducerEnabled } from "@/lib/theme/assetCatalog/exportGate";
import { shouldUseDerivedAssetSource } from "@/lib/theme/project/assetSource";
import { getImageAssetFallbackRole, getInheritedSourceSlot, getResolvedAssetUrl, getResolvedColor, getSelectedUpload, requireUploadFile, uploadEntryFileName, type BubbleEditState, type SlotCandidateSelections, type SlotColors, type SlotUploads } from "@/lib/theme/project/state";
import type { CatalogAssetSelection } from "@/lib/theme/assetCatalog/registry";
import type { CatalogTransform } from "@/lib/theme/export/catalogTransform";
import { blobFile, createStoredZip } from "@/lib/theme/project/zip";
import type { ThemeProjectAnalysis } from "@/lib/theme/project/types";
import type { ThemeAssetSlot, ThemeTemplate, ThemeTemplateId } from "@/lib/theme/templates";
import type { Markers, ThemeResourceRole } from "@/lib/theme/types";

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
  catalogExportUserId?: string;
};

export type AndroidExportBlobFile = {
  path: string;
  blob: Blob;
};

export type AndroidExportServerAssetFile = {
  path: string;
  serverAsset: string;
};

export type AndroidExportCatalogAssetFile = {
  path: string;
  catalogAsset: CatalogAssetSelection;
  resourceRole: ThemeResourceRole;
  transform?: CatalogTransform;
};

export type AndroidExportFile = AndroidExportBlobFile | AndroidExportServerAssetFile | AndroidExportCatalogAssetFile;

type AndroidExportSource = { blob: Blob } | { serverAsset: string } | { catalogAsset: CatalogAssetSelection; transform?: CatalogTransform };

export async function buildAndroidThemeExportFiles(options: AndroidExportOptions): Promise<AndroidExportFile[]> {
  const { analysis, template, templateId, exportName, slots, uploads, colors, selections, bubbleEditsBySlotId, catalogExportUserId } = options;
  const androidSlots = slots.filter((slot) => slot.platform === "android");
  const files: AndroidExportFile[] = [];

  // 슬롯 해석은 서로 독립이고 대부분 fetch/디코딩 대기 시간이다. 순차로 돌리면
  // 45개 남짓한 이미지 슬롯의 지연이 그대로 누적되므로 동시 실행 수만 제한해 병렬 처리한다.
  const imageSlots = androidSlots.filter((slot) => slot.kind !== "color" && Boolean(slot.path));
  const sources = await mapWithConcurrency(imageSlots, exportSlotConcurrency, (slot) =>
    shouldCreateTransparentLauncherForeground(slot, uploads, selections, templateId, template, androidSlots)
      ? Promise.resolve<AndroidExportSource>({ blob: new Blob() })
      : resolveAndroidSlotSource(slot, uploads, selections, templateId, template, bubbleEditsBySlotId[slot.id], androidSlots, catalogExportUserId),
  );

  for (const [index, slot] of imageSlots.entries()) {
    const source = sources[index];
    if (!source) continue;
    for (const path of getAndroidSlotExportPaths(slot)) {
      const rendered = await materializeAndroidSource(
        slot,
        path,
        source,
        shouldCreateTransparentLauncherForeground(slot, uploads, selections, templateId, template, androidSlots),
      );
      if ("serverAsset" in rendered) files.push({ path, serverAsset: rendered.serverAsset });
      else if ("catalogAsset" in rendered) files.push({ path, catalogAsset: rendered.catalogAsset, resourceRole: slot.role, ...(rendered.transform ? { transform: rendered.transform } : {}) });
      else files.push({ path, blob: rendered.blob });
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

/**
 * 한 슬롯이 만들어 내는 zip 내부 경로들.
 *
 * `scaleTargets`가 `path`와 겹치는 슬롯이 있어 중복을 제거한다. 같은 경로를 두 번 넣으면
 * zip에 같은 이름의 엔트리가 두 개 생긴다.
 */
export function getAndroidSlotExportPaths(slot: ThemeAssetSlot) {
  return Array.from(new Set([slot.path, ...(slot.export?.android?.scaleTargets ?? [])].filter((path): path is string => Boolean(path))));
}

/**
 * 나인패치 출력에 쓸 marker.
 *
 * 우선순위가 계약이다.
 *
 * 1. 저장된 canonical geometry — geometry와 markers가 함께 있을 때 markers를 쓰면 편집기에서
 *    방금 옮긴 값이 아니라 이전 좌표가 나간다.
 * 2. 저장된 legacy marker
 * 3. source asset의 marker (반전할 때만. 그대로면 asset을 손대지 않는다)
 *
 * `flipX`면 좌표도 함께 뒤집는다. artwork만 뒤집고 marker를 두면 늘어나는 구간과 글자 영역이
 * 반대편에 남는다. geometry는 canonical 좌표이므로 marker로 바꾸기 **전에** 한 번만 뒤집는다.
 *
 * 반환값이 `undefined`면 호출부가 asset의 marker를 그대로 쓴다.
 */
export function resolveAndroidNinePatchMarkers(
  bubbleEdit: BubbleEditState | undefined,
  sourceMarkers: Markers,
  innerWidth: number,
  innerHeight: number,
): Markers | undefined {
  const flipX = Boolean(bubbleEdit?.flipX);

  if (bubbleEdit?.geometry) {
    const geometry = flipX ? flipBubbleGeometryHorizontally(bubbleEdit.geometry, innerWidth) : bubbleEdit.geometry;
    return bubbleGeometryToAndroidMarkers(geometry, innerWidth, innerHeight);
  }

  if (!flipX) return bubbleEdit?.markers;
  return flipAndroidMarkersHorizontally(bubbleEdit?.markers ?? sourceMarkers, innerWidth);
}

export async function exportAndroidThemePackage(options: AndroidExportOptions) {
  const { template } = options;
  const files = await buildAndroidThemeExportFiles(options);
  const entries = await Promise.all(files.map(async (file) => {
    if ("catalogAsset" in file) throw new Error("catalogAsset은 비동기 export manifest에서만 처리할 수 있습니다.");
    return blobFile(file.path, "serverAsset" in file ? await fetchAssetBlob(file.serverAsset) : file.blob);
  }));

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
  catalogExportUserId?: string,
): Promise<AndroidExportSource | null> {
  // 직접 선택 없이 기본 슬롯을 상속 중이면(예: 탭 선택 아이콘) 기본 슬롯 소스를 그대로 사용한다.
  const inheritedSource = getInheritedSourceSlot(slot, uploads, selections, templateId, template, allSlots);
  if (inheritedSource) return resolveAndroidSlotSource(inheritedSource, uploads, selections, templateId, template, bubbleEdit, allSlots, catalogExportUserId);

  // 일반 편집기의 launcher source는 `launcher_background` 하나다. 다만 기본 템플릿은
  // 기존 foreground/legacy icon에 artwork가 들어 있을 수 있으므로, 사용자가 background를
  // 실제로 바꾼 경우에만 숨겨진 호환 role을 파생한다. 기본값에서는 role별 기본 에셋을 보존한다.
  if (shouldDeriveAndroidLauncherRole(slot, uploads, selections, templateId, template, allSlots)) {
    const sourceSlot = allSlots.find((candidate) => candidate.role === "launcher_background" && candidate.platform === "android");
    if (sourceSlot) return resolveAndroidSlotSource(sourceSlot, uploads, selections, templateId, template, bubbleEdit, allSlots, catalogExportUserId);
  }

  const selectedUpload = getSelectedUpload(slot, uploads, selections, allSlots);
  if (slot.kind === "ninepatch") {
    if (selectedUpload?.catalog && !selectedUpload.imageEdit && isCatalogExportProducerEnabled("android", {
      userId: catalogExportUserId,
      assetIds: [selectedUpload.catalog.selection.assetId],
    })) {
      return {
        catalogAsset: selectedUpload.catalog.selection,
        transform: createAndroidNinePatchCatalogTransform(bubbleEdit),
      };
    }
    // source 이름과 target `.9.png` 이름을 분리한다. 일반 PNG 업로드를 target 이름으로
    // 파싱하면 artwork의 바깥 1px을 marker border로 오인해 잘라 버린다.
    const assetUrl = getResolvedAssetUrl(slot, uploads, selections, templateId, template, allSlots);
    // 업로드를 골라 뒀는데 바이트가 없으면 기본값으로 떨어뜨리지 않는다 — 사용자가 고른 것과
    // 다른 말풍선이 조용히 들어간다.
    const sourceBlob = selectedUpload
      ? await resolveSelectedUploadFile(selectedUpload, "Android 나인패치 내보내기")
      : await assetUrlToBlob(assetUrl);
    if (!sourceBlob) return null;
    const sourceName = (selectedUpload ? uploadEntryFileName(selectedUpload) : undefined) ?? assetUrl ?? slot.fileName ?? `${slot.id}.9.png`;
    const asset = await loadNinePatchBlob(sourceBlob, sourceName, slot.role.includes("_me_") ? "me" : "you");
    const markers = resolveAndroidNinePatchMarkers(bubbleEdit, asset.markers, asset.innerCanvas.width, asset.innerCanvas.height);
    // 픽셀은 여기서 한 번만 뒤집는다. marker는 이미 뒤집힌 좌표로 계산돼 있다.
    const innerCanvas = bubbleEdit?.flipX ? flipCanvasHorizontally(asset.innerCanvas) : asset.innerCanvas;
    const nextAsset = { ...asset, innerCanvas, ...(markers ? { markers } : {}) };
    return { blob: await canvasToBlob(exportNinePatch(nextAsset), "image/png") };
  }

  if (selectedUpload?.catalog && !selectedUpload.imageEdit) {
    if (isCatalogExportProducerEnabled("android", {
      userId: catalogExportUserId,
      assetIds: [selectedUpload.catalog.selection.assetId],
    })) return { catalogAsset: selectedUpload.catalog.selection };
    if (selectedUpload.file) return { blob: selectedUpload.file };
    if (selectedUpload.catalog.legacyStoragePath) {
      return { blob: await storagePathToFile(selectedUpload.catalog.legacyStoragePath, selectedUpload.catalog.fileName, selectedUpload.catalog.mimeType) };
    }
  }
  if (selectedUpload) return { blob: requireUploadFile(selectedUpload, "Android 내보내기") };
  const assetUrl = getResolvedAssetUrl(slot, uploads, selections, templateId, template, allSlots);
  if (assetUrl) {
    if (canUseServerAssetReference(slot, assetUrl)) return { serverAsset: assetUrl };
    const blob = await fetchAssetBlob(assetUrl);
    return { blob: await normalizeAndroidImageBlob(slot, blob, assetUrl) };
  }

  const fallbackRole = getImageAssetFallbackRole(slot.role);
  const fallbackSlot = fallbackRole ? allSlots.find((candidate) => candidate.role === fallbackRole) : undefined;
  if (!fallbackSlot) return null;
  return resolveAndroidSlotSource(fallbackSlot, uploads, selections, templateId, template, bubbleEdit, allSlots, catalogExportUserId);
}

function shouldCreateTransparentLauncherForeground(
  slot: ThemeAssetSlot,
  uploads: SlotUploads,
  selections: SlotCandidateSelections,
  templateId: ThemeTemplateId,
  template: ThemeTemplate,
  allSlots: ThemeAssetSlot[],
) {
  return slot.role === "launcher_foreground" && shouldDeriveAndroidLauncherRole(slot, uploads, selections, templateId, template, allSlots);
}

export function shouldDeriveAndroidLauncherRole(
  slot: ThemeAssetSlot,
  uploads: SlotUploads,
  selections: SlotCandidateSelections,
  templateId: ThemeTemplateId,
  template: ThemeTemplate,
  allSlots: ThemeAssetSlot[],
) {
  return isAndroidDerivedLauncherRole(slot.role) && shouldUseDerivedAssetSource(slot, uploads, selections, templateId, template, allSlots);
}

async function materializeAndroidSource(
  slot: ThemeAssetSlot,
  targetPath: string,
  source: AndroidExportSource,
  transparentForeground: boolean,
): Promise<AndroidExportSource> {
  const plan = getAndroidRasterPlan(slot, targetPath, transparentForeground);
  if (!plan) return source;
  // catalog source도 원본 크기를 그대로 복사하면 density별 계약을 위반한다. 브라우저에서
  // legacyStoragePath로 우회하지 않고, 비동기 builder가 같은 cover 규칙을 적용하도록
  // 명시적인 Android raster transform을 함께 보낸다.
  if ("catalogAsset" in source) {
    if (plan.mode !== "cover") return source;
    return { ...source, transform: createAndroidImageCatalogTransform({ width: plan.width, height: plan.height, mode: "cover" }) };
  }
  if (plan.mode === "transparent") return { blob: await renderAndroidImageBlob(undefined, plan) };
  const blob = "blob" in source ? source.blob : await fetchAssetBlob(source.serverAsset);
  return { blob: await renderAndroidImageBlob(blob, plan) };
}

export function createAndroidImageCatalogTransform(plan: { width: number; height: number; mode: "cover" }): CatalogTransform {
  return {
    kind: "android-image",
    outputFormat: "png",
    fit: "cover",
    targetDimensions: { width: plan.width, height: plan.height },
  };
}

function createAndroidNinePatchCatalogTransform(bubbleEdit: BubbleEditState | undefined): CatalogTransform {
  const ninePatch = bubbleEdit?.geometry
    ? { geometry: bubbleEdit.geometry }
    : bubbleEdit?.markers
      ? { markers: bubbleEdit.markers }
      : undefined;
  return {
    kind: "android-nine-patch",
    outputFormat: "png",
    ...(bubbleEdit?.flipX ? { flipX: true } : {}),
    ...(ninePatch ? { ninePatch } : {}),
  };
}

/**
 * 서버 에셋 URL을 그대로 zip 엔트리로 넘길 수 있는지.
 *
 * 로컬 템플릿 에셋이면서 출력 확장자와 원본 확장자가 어긋나지 않을 때만 fetch+디코딩을 건너뛴다.
 * PNG로 나가야 하는 슬롯에 PNG가 아닌 원본을 그대로 넘기면 확장자만 PNG인 파일이 나간다.
 */
export function canUseServerAssetReference(slot: ThemeAssetSlot, assetUrl: string) {
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

async function resolveSelectedUploadFile(entry: NonNullable<ReturnType<typeof getSelectedUpload>>, context: string) {
  if (entry.file) return entry.file;
  if (entry.imageEdit) return requireUploadFile(entry, context);
  if (entry.catalog?.legacyStoragePath) {
    return storagePathToFile(entry.catalog.legacyStoragePath, entry.catalog.fileName, entry.catalog.mimeType);
  }
  return requireUploadFile(entry, context);
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
  // iOS 쪽 `color()`와 같은 역할. 조회가 40번 넘게 반복되므로 인자를 한 곳에서만 넘긴다.
  const resolve = (role: string) => getResolvedColor(slotByRole[role], colors, selections, templateId, template, slots);
  const mainHeader = resolve("main_header_color") ?? template.defaults.mainHeader;
  const mainHeaderForeground =
    resolve("main_header_foreground_color") ??
    resolve("main_title_color") ??
    template.defaults.mainTitle;
  const mainTitle = resolve("main_title_color") ?? template.defaults.mainTitle;
  const mainTitlePressed =
    resolve("main_title_pressed_color") ??
    mainTitle;
  const mainDescription =
    resolve("main_description_color") ??
    template.defaults.mainBody;
  const mainDescriptionPressed = resolve("main_description_pressed_color") ?? mainDescription;
  const tabParagraph = resolve("tab_paragraph_color") ?? template.defaults.mainBody;
  const tabParagraphPressed = resolve("tab_paragraph_pressed_color") ?? tabParagraph;
  const mainBackground =
    resolve("main_background_color") ??
    template.defaults.mainBackground;
  const mainBodyCellPressed =
    resolve("main_body_cell_pressed_color") ??
    withAlpha(mainBackground, "99");
  const mainBodyCell = resolve("main_body_cell_color") ?? withAlpha(mainBackground, "00");
  const mainBodyCellBorder =
    resolve("main_body_cell_border_color") ??
    withAlpha(mainTitle, "33");
  const mainSectionTitle =
    resolve("main_section_title_color") ??
    mainTitle;
  const mainFeatureBrowseTab =
    resolve("main_feature_browse_tab_color") ??
    resolve("tab_background") ??
    template.defaults.tabBackground;
  const accent = template.accent;
  const mainFeatureBrowseTabFocused = resolve("main_feature_browse_tab_focused_color") ?? mainTitle;
  const featurePrimary = resolve("feature_primary_color") ?? accent;
  const featurePrimaryPressed = resolve("feature_primary_pressed_color") ?? featurePrimary;
  const mainBodySecondary =
    resolve("main_body_secondary_cell_color") ??
    lighten(mainBackground, 0.06);
  const chatBackground = resolve("chat_background_color") ?? template.defaults.chatBackground;
  const chatBubbleMeColor =
    resolve("chat_bubble_me_color") ??
    mainTitle;
  const chatBubbleYouColor =
    resolve("chat_bubble_you_color") ??
    mainTitle;
  const chatUnreadCountColor =
    resolve("chat_unread_count_color") ??
    accent;
  const tabBackground = resolve("tab_background") ?? template.defaults.tabBackground;
  const lightBannerBadge = resolve("tab_light_banner_badge_background_color") ?? accent;
  const bannerBadge = resolve("tab_banner_badge_background_color") ?? accent;
  const chatInputBackground = resolve("chat_input_background_color") ?? template.defaults.chatInputBackground;
  const chatSendButton = resolve("chat_send_button_color") ?? template.defaults.chatSendButton;
  const chatInputText = resolve("chat_input_text_color") ?? mainTitle;
  const chatSendIcon = resolve("chat_send_icon_color") ?? mainTitle;
  const chatMenuIcon = resolve("chat_menu_icon_color") ?? tabParagraph;
  const chatMenuButton = resolve("chat_menu_button_color") ?? withAlpha(tabParagraph, "14");
  const directShareText = resolve("direct_share_text_color") ?? mainTitle;
  const directShareButton = resolve("direct_share_button_color") ?? accent;
  const directShareBackground = resolve("direct_share_background_color") ?? lighten(mainBackground, 0.04);
  const notificationText = resolve("notification_text_color") ?? mainTitle;
  const notificationBackground = resolve("notification_background_color") ?? template.defaults.friendBubble;
  const notificationBackgroundPressed = resolve("notification_background_pressed_color") ?? lighten(notificationBackground, -0.04);
  const passcodeBackground = resolve("passcode_background_color") ?? "#FCC5C5";
  const passcodeColor = resolve("passcode_color") ?? "#664242";
  const passcodeKeypad = resolve("passcode_keypad_color") ?? "#664242";
  const passcodeKeypadPressed = resolve("passcode_keypad_pressed_color") ?? "#CCB8B8";
  const passcodeKeypadBackground = resolve("passcode_keypad_background_color") ?? "#FFF2F2";
  const passcodeKeypadPressedBackground = resolve("passcode_keypad_pressed_background_color") ?? "#99FFDEDE";
  const passcodePatternLine = resolve("passcode_pattern_line_color") ?? passcodeBackground;

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

async function assetUrlToBlob(assetUrl?: string) {
  if (!assetUrl) return null;
  return fetchAssetBlob(assetUrl);
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
