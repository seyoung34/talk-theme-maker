import { getResolvedAssetUrl, getResolvedColor, getSelectedCandidate } from "@/lib/theme/project/state";
import { getThemeAssetSignedUrls } from "@/lib/theme/remoteAssets";
import type { RemoteSlotUploads, SystemTemplateSummary } from "@/lib/theme/systemTemplates/types";
import { getThemeSlots, type ThemeAssetSlot, type ThemeTemplate, type ThemeTemplateId } from "@/lib/theme/templates";
import type { BubbleGeometry, Insets, Markers, StretchPoint, ThemePlatform, ThemeResourceRole } from "@/lib/theme/types";

export type TemplatePreviewVisual = {
  platform: ThemePlatform;
  cardPreviewImage?: string;
  chatBackgroundColor: string;
  mainBackgroundColor: string;
  tabBackgroundColor: string;
  // 말풍선 글자색(chat_bubble_me/you_color). Android/iOS export·편집기와 동일하게 글자색으로 쓴다.
  myBubbleTextColor: string;
  friendBubbleTextColor: string;
  // 말풍선 배경(fill) 색. 말풍선 이미지가 없을 때 캡슐/캔버스 배경으로 쓴다(template.defaults.myBubble/friendBubble).
  myBubbleFillColor: string;
  friendBubbleFillColor: string;
  chatBackgroundImage?: string;
  mainBackgroundImage?: string;
  tabBackgroundImage?: string;
  myBubbleImage?: string;
  friendBubbleImage?: string;
  // 말풍선 9-slice 렌더용 stretch/inset (iOS) 및 markers (Android 나인패치). 없으면 렌더러가 기본값 사용.
  myBubbleGeometry?: BubbleGeometry;
  myBubbleStretch?: StretchPoint;
  myBubbleInsets?: Insets;
  myBubbleMarkers?: Markers;
  myBubbleFlipX?: boolean;
  friendBubbleGeometry?: BubbleGeometry;
  friendBubbleStretch?: StretchPoint;
  friendBubbleInsets?: Insets;
  friendBubbleMarkers?: Markers;
  friendBubbleFlipX?: boolean;
  profileImage?: string;
  // 채팅목록탭 헤더/리스트 미리보기용
  mainHeaderColor: string;
  mainHeaderForegroundColor: string;
  bodyCellColor: string;
  // 리치 목업 텍스트 색상
  titleColor: string;
  descriptionColor: string;
  sectionTitleColor: string;
  bodyCellBorderColor: string;
  unreadColor: string;
  // 기본 프로필 화면 미리보기용
  profileImage2?: string;
  profileImage3?: string;
  profileImageFull?: string;
  // 하단 탭바 아이콘 (모달 상세에서만 채워짐)
  tabIcons?: TabIconUrls;
};

export type TabIconUrls = {
  friends?: string;
  friendsFocused?: string;
  chats?: string;
  chatsFocused?: string;
  now?: string;
  nowFocused?: string;
  shopping?: string;
  shoppingFocused?: string;
  more?: string;
  moreFocused?: string;
};

const tabIconRoleByKey: Record<keyof TabIconUrls, ThemeResourceRole> = {
  friends: "tab_icon_friends",
  friendsFocused: "tab_icon_friends_focused",
  chats: "tab_icon_chats",
  chatsFocused: "tab_icon_chats_focused",
  now: "tab_icon_now",
  nowFocused: "tab_icon_now_focused",
  shopping: "tab_icon_shopping",
  shoppingFocused: "tab_icon_shopping_focused",
  more: "tab_icon_more",
  moreFocused: "tab_icon_more_focused",
};

export const tabIconPreviewRoles: ThemeResourceRole[] = Object.values(tabIconRoleByKey);

export function buildTabIconUrls(resolve: (role: ThemeResourceRole) => string | undefined): TabIconUrls {
  const entries = (Object.keys(tabIconRoleByKey) as Array<keyof TabIconUrls>).map((key) => [key, resolve(tabIconRoleByKey[key])] as const);
  return Object.fromEntries(entries) as TabIconUrls;
}

export type SignedUrlCache = Record<string, string>;

/**
 * 모달 프리뷰를 띄우기 전에 받아 둬야 하는 이미지.
 *
 * 서명 URL이 도착해도 브라우저가 아직 받지 못했으면 화면이 한 번 더 비어 보인다. 그렇다고
 * 모든 이미지를 기다리면 모달이 눈에 띄게 늦게 뜨므로, 비었을 때 가장 크게 티가 나는
 * 배경 두 장과 말풍선 두 장만 기다린다. 탭 아이콘처럼 작은 것은 늦게 채워져도 괜찮다.
 */
const corePreviewImageKeys = ["mainBackgroundImage", "chatBackgroundImage", "myBubbleImage", "friendBubbleImage"] as const;

export function getCorePreviewImageUrls(visual: TemplatePreviewVisual): string[] {
  const urls = corePreviewImageKeys.map((key) => visual[key]).filter((url): url is string => Boolean(url));
  return Array.from(new Set(urls));
}

export async function createSystemTemplatePreviewUrls(templates: SystemTemplateSummary[], cache: SignedUrlCache = {}, options: { includeDetails?: boolean } = {}) {
  const next = { ...cache };
  const paths = new Set<string>();

  for (const template of templates) {
    if (template.previewMetadata.cardPreviewPath) {
      if (!next[template.previewMetadata.cardPreviewPath]) paths.add(template.previewMetadata.cardPreviewPath);
      if (!options.includeDetails) continue;
    }
    const slots = getThemeSlots(template.platform);
    const roles = options.includeDetails ? [...previewRoles, ...tabIconPreviewRoles] : previewRoles;
    for (const role of roles) {
      const slot = findSlotByRole(slots, role);
      const path = getMetadataRef(template, role) ?? resolvePreviewUploadPath(slot, template.uploadRefs, template.candidateSelections);
      if (path && !next[path]) paths.add(path);
    }
  }

  try {
    Object.assign(next, await getThemeAssetSignedUrls(Array.from(paths)));
  } catch (error) {
    console.warn("System template preview URLs could not be created.", error);
  }

  return next;
}

export function createSystemTemplatePreviewVisual({
  template,
  platform,
  summary,
  signedUrls,
}: {
  template: ThemeTemplate;
  platform: ThemePlatform;
  summary: SystemTemplateSummary;
  signedUrls: SignedUrlCache;
}): TemplatePreviewVisual {
  const slots = getThemeSlots(platform);
  const templateId = template.id;

  return {
    platform,
    cardPreviewImage: summary.previewMetadata.cardPreviewPath ? signedUrls[summary.previewMetadata.cardPreviewPath] : undefined,
    chatBackgroundColor: summary.previewMetadata.colors?.chatBackground ?? resolveColor(slots, "chat_background_color", summary, templateId, template, template.defaults.chatBackground),
    mainBackgroundColor: summary.previewMetadata.colors?.mainBackground ?? resolveColor(slots, "main_background_color", summary, templateId, template, template.defaults.mainBackground),
    tabBackgroundColor: summary.previewMetadata.colors?.tabBackground ?? resolveColor(slots, "tab_background", summary, templateId, template, template.defaults.tabBackground),
    myBubbleTextColor: summary.previewMetadata.colors?.myBubble ?? resolveColor(slots, "chat_bubble_me_color", summary, templateId, template, template.defaults.mainTitle),
    friendBubbleTextColor: summary.previewMetadata.colors?.friendBubble ?? resolveColor(slots, "chat_bubble_you_color", summary, templateId, template, template.defaults.mainTitle),
    myBubbleFillColor: template.defaults.myBubble,
    friendBubbleFillColor: template.defaults.friendBubble,
    chatBackgroundImage: resolveImage(slots, "chat_background", summary, templateId, template, signedUrls),
    mainBackgroundImage: resolveImage(slots, "main_background", summary, templateId, template, signedUrls),
    tabBackgroundImage: resolveImage(slots, "tab_background_image", summary, templateId, template, signedUrls),
    myBubbleImage: resolveImage(slots, "bubble_me_1", summary, templateId, template, signedUrls),
    friendBubbleImage: resolveImage(slots, "bubble_you_1", summary, templateId, template, signedUrls),
    myBubbleGeometry: summary.previewMetadata.bubbles?.myBubble?.geometry,
    myBubbleStretch: summary.previewMetadata.bubbles?.myBubble?.stretch,
    myBubbleInsets: summary.previewMetadata.bubbles?.myBubble?.insets,
    myBubbleMarkers: summary.previewMetadata.bubbles?.myBubble?.markers,
    myBubbleFlipX: summary.previewMetadata.bubbles?.myBubble?.flipX,
    friendBubbleGeometry: summary.previewMetadata.bubbles?.friendBubble?.geometry,
    friendBubbleStretch: summary.previewMetadata.bubbles?.friendBubble?.stretch,
    friendBubbleInsets: summary.previewMetadata.bubbles?.friendBubble?.insets,
    friendBubbleMarkers: summary.previewMetadata.bubbles?.friendBubble?.markers,
    friendBubbleFlipX: summary.previewMetadata.bubbles?.friendBubble?.flipX,
    profileImage: resolveImage(slots, "profile_image_1", summary, templateId, template, signedUrls),
    mainHeaderColor: resolveColor(slots, "main_header_color", summary, templateId, template, template.defaults.mainHeader),
    mainHeaderForegroundColor: resolveColor(slots, "main_header_foreground_color", summary, templateId, template, template.defaults.mainTitle),
    bodyCellColor: resolveColor(slots, "main_body_cell_color", summary, templateId, template, template.defaults.mainBackground),
    titleColor: resolveColor(slots, "main_title_color", summary, templateId, template, template.defaults.mainTitle),
    descriptionColor: resolveColor(slots, "main_description_color", summary, templateId, template, template.defaults.mainBody),
    sectionTitleColor: resolveColor(slots, "main_section_title_color", summary, templateId, template, template.defaults.mainTitle),
    bodyCellBorderColor: resolveColor(slots, "main_body_cell_border_color", summary, templateId, template, template.defaults.mainBody),
    unreadColor: resolveColor(slots, "chat_unread_count_color", summary, templateId, template, template.accent),
    profileImage2: resolveImage(slots, "profile_image_2", summary, templateId, template, signedUrls),
    profileImage3: resolveImage(slots, "profile_image_3", summary, templateId, template, signedUrls),
    profileImageFull: resolveImage(slots, "profile_image_full_1", summary, templateId, template, signedUrls),
    tabIcons: buildTabIconUrls((role) => resolveImage(slots, role, summary, templateId, template, signedUrls)),
  };
}

function resolveColor(slots: ThemeAssetSlot[], role: ThemeResourceRole, summary: SystemTemplateSummary, templateId: ThemeTemplateId, template: ThemeTemplate, fallback: string) {
  const slot = findSlotByRole(slots, role);
  return getResolvedColor(slot, summary.colors, summary.candidateSelections, templateId, template) ?? fallback;
}

function resolveImage(slots: ThemeAssetSlot[], role: ThemeResourceRole, summary: SystemTemplateSummary, templateId: ThemeTemplateId, template: ThemeTemplate, signedUrls: SignedUrlCache) {
  const slot = findSlotByRole(slots, role);
  const uploadPath = getMetadataRef(summary, role) ?? resolvePreviewUploadPath(slot, summary.uploadRefs, summary.candidateSelections);
  if (uploadPath) return signedUrls[uploadPath];
  return getSelectedCandidate(slot, summary.candidateSelections, templateId, template)?.previewUrl ?? getResolvedAssetUrl(slot, {}, summary.candidateSelections, templateId, template);
}

function resolvePreviewUploadPath(slot: ThemeAssetSlot | undefined, uploadRefs: RemoteSlotUploads, selections: SystemTemplateSummary["candidateSelections"]) {
  if (!slot) return undefined;
  const selectedId = selections[slot.id];
  const entries = uploadRefs[slot.id] ?? [];
  const selectedUpload = selectedId ? entries.find((entry) => entry.id === selectedId) : undefined;
  return selectedUpload?.storagePath ?? entries[0]?.storagePath;
}

function findSlotByRole(slots: ThemeAssetSlot[], role: ThemeResourceRole) {
  return slots.find((slot) => slot.role === role);
}

const previewRoles: ThemeResourceRole[] = ["chat_background", "main_background", "tab_background_image", "bubble_me_1", "bubble_you_1", "profile_image_1", "profile_image_2", "profile_image_3", "profile_image_full_1"];

type PreviewRefKey = keyof NonNullable<SystemTemplateSummary["previewMetadata"]["refs"]>;

function getMetadataRef(summary: SystemTemplateSummary, role: ThemeResourceRole) {
  const key = previewRefKeyByRole[role];
  return key ? summary.previewMetadata.refs?.[key] : undefined;
}

const previewRefKeyByRole: Partial<Record<ThemeResourceRole, PreviewRefKey>> = {
  chat_background: "chatBackground",
  main_background: "mainBackground",
  tab_background_image: "tabBackground",
  bubble_me_1: "myBubble",
  bubble_you_1: "friendBubble",
  profile_image_1: "profileImage",
};
