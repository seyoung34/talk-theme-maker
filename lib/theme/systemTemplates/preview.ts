import { getResolvedAssetUrl, getResolvedColor, getSelectedCandidate, getSelectedSharedSlotEntry } from "@/lib/theme/project/state";
import { getPreviewColorRole, resolvePlatformPreviewColor } from "@/lib/theme/project/platformColor";
import { getPublicThemeAssetUrl, getThemeAssetSignedUrls } from "@/lib/theme/remoteAssets";
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
  // bubble_me_2/bubble_you_2(연속 메시지 변형). 텍스트색·채움색은 _1과 같은 role(chat_bubble_me/you_color,
  // template.defaults.myBubble/friendBubble)을 그대로 쓰므로 별도 텍스트/채움색 필드는 없다.
  myBubbleImage2?: string;
  friendBubbleImage2?: string;
  myBubbleGeometry2?: BubbleGeometry;
  myBubbleStretch2?: StretchPoint;
  myBubbleInsets2?: Insets;
  myBubbleMarkers2?: Markers;
  myBubbleFlipX2?: boolean;
  friendBubbleGeometry2?: BubbleGeometry;
  friendBubbleStretch2?: StretchPoint;
  friendBubbleInsets2?: Insets;
  friendBubbleMarkers2?: Markers;
  friendBubbleFlipX2?: boolean;
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
    // 카드 썸네일은 공개 버킷에 있어 서명이 필요 없다. 목록만 그릴 때는 더 볼 것이 없다.
    if (template.previewMetadata.cardPreviewPath && !options.includeDetails) continue;

    const slots = getThemeSlots(template.platform);
    const roles = options.includeDetails ? [...previewRoles, ...tabIconPreviewRoles] : previewRoles;
    for (const role of roles) {
      const slot = findSlotByRole(slots, role);
      const path = getMetadataRef(template, role) ?? resolvePreviewUploadPath(slot, template.uploadRefs, template.candidateSelections);
      // 이미 캐시에 있어도 건너뛰지 않는다. `next`는 만료를 모르는 평범한 객체라, 여기서
      // 걸러 버리면 10분이 지난 URL이 영원히 갱신되지 않는다. 만료 판단은
      // `getThemeAssetSignedUrls`가 자기 캐시(9분 TTL + 30초 버퍼)로 한다. 아직 유효하면
      // 메모리 캐시에서 바로 돌려주므로 네트워크 왕복이 생기지 않는다.
      if (path) paths.add(path);
    }
  }

  try {
    Object.assign(next, await getThemeAssetSignedUrls(Array.from(paths)));
  } catch (error) {
    console.warn("System template preview URLs could not be created.", error);
  }

  return next;
}

/**
 * 미리보기를 그리는 데 실제로 필요한 값만.
 *
 * `SystemTemplateSummary`가 그대로 들어맞지만, 저장 직후 화면을 굽는 쪽은 완성된 summary를
 * 갖고 있지 않다. 필요한 필드만 요구해 굽는 쪽과 보여 주는 쪽이 **같은 함수**를 쓰게 한다.
 */
export type SystemTemplatePreviewSource = Pick<
  SystemTemplateSummary,
  "platform" | "colors" | "candidateSelections" | "uploadRefs" | "previewMetadata" | "updatedAt"
>;

export function createSystemTemplatePreviewVisual({
  template,
  platform,
  summary,
  signedUrls,
}: {
  template: ThemeTemplate;
  platform: ThemePlatform;
  summary: SystemTemplatePreviewSource;
  signedUrls: SignedUrlCache;
}): TemplatePreviewVisual {
  const slots = getThemeSlots(platform);
  const templateId = template.id;

  return {
    platform,
    cardPreviewImage: getPublicThemeAssetUrl(summary.previewMetadata.cardPreviewPath, summary.updatedAt),
    chatBackgroundColor: resolveColor(slots, "chat_background_color", summary, templateId, template, template.defaults.chatBackground, summary.previewMetadata.colors?.chatBackground),
    mainBackgroundColor: resolveColor(slots, "main_background_color", summary, templateId, template, template.defaults.mainBackground, summary.previewMetadata.colors?.mainBackground),
    tabBackgroundColor: resolveColor(slots, "tab_background", summary, templateId, template, template.defaults.tabBackground, summary.previewMetadata.colors?.tabBackground),
    myBubbleTextColor: resolveColor(slots, "chat_bubble_me_color", summary, templateId, template, template.defaults.mainTitle, summary.previewMetadata.colors?.myBubble),
    friendBubbleTextColor: resolveColor(slots, "chat_bubble_you_color", summary, templateId, template, template.defaults.mainTitle, summary.previewMetadata.colors?.friendBubble),
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
    myBubbleImage2: resolveImage(slots, "bubble_me_2", summary, templateId, template, signedUrls),
    friendBubbleImage2: resolveImage(slots, "bubble_you_2", summary, templateId, template, signedUrls),
    myBubbleGeometry2: summary.previewMetadata.bubbles?.myBubble2?.geometry,
    myBubbleStretch2: summary.previewMetadata.bubbles?.myBubble2?.stretch,
    myBubbleInsets2: summary.previewMetadata.bubbles?.myBubble2?.insets,
    myBubbleMarkers2: summary.previewMetadata.bubbles?.myBubble2?.markers,
    myBubbleFlipX2: summary.previewMetadata.bubbles?.myBubble2?.flipX,
    friendBubbleGeometry2: summary.previewMetadata.bubbles?.friendBubble2?.geometry,
    friendBubbleStretch2: summary.previewMetadata.bubbles?.friendBubble2?.stretch,
    friendBubbleInsets2: summary.previewMetadata.bubbles?.friendBubble2?.insets,
    friendBubbleMarkers2: summary.previewMetadata.bubbles?.friendBubble2?.markers,
    friendBubbleFlipX2: summary.previewMetadata.bubbles?.friendBubble2?.flipX,
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

function resolveColor(
  slots: ThemeAssetSlot[],
  role: ThemeResourceRole,
  summary: SystemTemplatePreviewSource,
  templateId: ThemeTemplateId,
  template: ThemeTemplate,
  fallback: string,
  persistedPreviewColor?: string,
) {
  const previewRole = getPreviewColorRole(role, summary.platform);
  const resolve = (readRole: ThemeResourceRole) => {
    if (persistedPreviewColor !== undefined && readRole === previewRole) return persistedPreviewColor;
    const slot = findSlotByRole(slots, readRole);
    return getResolvedColor(slot, summary.colors, summary.candidateSelections, templateId, template, slots);
  };
  return resolvePlatformPreviewColor(resolve, role, fallback, summary.platform);
}

function resolveImage(slots: ThemeAssetSlot[], role: ThemeResourceRole, summary: SystemTemplatePreviewSource, templateId: ThemeTemplateId, template: ThemeTemplate, signedUrls: SignedUrlCache) {
  const slot = findSlotByRole(slots, role);
  const uploadPath = getMetadataRef(summary, role) ?? resolvePreviewUploadPath(slot, summary.uploadRefs, summary.candidateSelections);
  if (uploadPath) return signedUrls[uploadPath];
  return getSelectedCandidate(slot, summary.candidateSelections, templateId, template)?.previewUrl ?? getResolvedAssetUrl(slot, {}, summary.candidateSelections, templateId, template, slots);
}

function resolvePreviewUploadPath(slot: ThemeAssetSlot | undefined, uploadRefs: RemoteSlotUploads, selections: SystemTemplatePreviewSource["candidateSelections"]) {
  if (!slot) return undefined;
  const entries = uploadRefs[slot.id] ?? [];
  const selectedUpload = getSelectedSharedSlotEntry(slot, uploadRefs, selections, getThemeSlots(slot.platform));
  return selectedUpload?.entry.storagePath ?? entries[0]?.storagePath;
}

function findSlotByRole(slots: ThemeAssetSlot[], role: ThemeResourceRole) {
  return slots.find((slot) => slot.role === role);
}

export const previewRoles: ThemeResourceRole[] = ["chat_background", "main_background", "tab_background_image", "bubble_me_1", "bubble_you_1", "bubble_me_2", "bubble_you_2", "profile_image_1", "profile_image_2", "profile_image_3", "profile_image_full_1"];

type PreviewRefKey = keyof NonNullable<SystemTemplatePreviewSource["previewMetadata"]["refs"]>;

function getMetadataRef(summary: SystemTemplatePreviewSource, role: ThemeResourceRole) {
  const key = previewRefKeyByRole[role];
  return key ? summary.previewMetadata.refs?.[key] : undefined;
}

const previewRefKeyByRole: Partial<Record<ThemeResourceRole, PreviewRefKey>> = {
  chat_background: "chatBackground",
  main_background: "mainBackground",
  tab_background_image: "tabBackground",
  bubble_me_1: "myBubble",
  bubble_you_1: "friendBubble",
  bubble_me_2: "myBubble2",
  bubble_you_2: "friendBubble2",
  profile_image_1: "profileImage",
};
