import { getResolvedAssetUrl, getResolvedColor } from "@/lib/theme/project/state";
import { getThemeAssetSignedUrls } from "@/lib/theme/remoteAssets";
import type { RemoteSlotUploads, SystemTemplateSummary } from "@/lib/theme/systemTemplates/types";
import { getThemeSlots, type ThemeAssetSlot, type ThemeTemplate, type ThemeTemplateId } from "@/lib/theme/templates";
import type { ThemePlatform, ThemeResourceRole } from "@/lib/theme/types";

export type TemplatePreviewVisual = {
  cardPreviewImage?: string;
  chatBackgroundColor: string;
  mainBackgroundColor: string;
  tabBackgroundColor: string;
  myBubbleColor: string;
  friendBubbleColor: string;
  chatBackgroundImage?: string;
  mainBackgroundImage?: string;
  tabBackgroundImage?: string;
  myBubbleImage?: string;
  friendBubbleImage?: string;
  profileImage?: string;
};

export type SignedUrlCache = Record<string, string>;

export async function createSystemTemplatePreviewUrls(templates: SystemTemplateSummary[], cache: SignedUrlCache = {}, options: { includeDetails?: boolean } = {}) {
  const next = { ...cache };
  const paths = new Set<string>();

  for (const template of templates) {
    if (template.previewMetadata.cardPreviewPath) {
      if (!next[template.previewMetadata.cardPreviewPath]) paths.add(template.previewMetadata.cardPreviewPath);
      if (!options.includeDetails) continue;
    }
    const slots = getThemeSlots(template.platform);
    for (const role of previewRoles) {
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
  seedAssets,
}: {
  template: ThemeTemplate;
  platform: ThemePlatform;
  summary: SystemTemplateSummary;
  signedUrls: SignedUrlCache;
  seedAssets?: Partial<Record<"chatBackground" | "mainBackground" | "myBubble" | "friendBubble" | "profileImage", string>>;
}): TemplatePreviewVisual {
  const slots = getThemeSlots(platform);
  const templateId = template.id;

  return {
    cardPreviewImage: summary.previewMetadata.cardPreviewPath ? signedUrls[summary.previewMetadata.cardPreviewPath] : undefined,
    chatBackgroundColor: summary.previewMetadata.colors?.chatBackground ?? resolveColor(slots, "chat_background_color", summary, templateId, template, template.defaults.chatBackground),
    mainBackgroundColor: summary.previewMetadata.colors?.mainBackground ?? resolveColor(slots, "main_background_color", summary, templateId, template, template.defaults.mainBackground),
    tabBackgroundColor: summary.previewMetadata.colors?.tabBackground ?? resolveColor(slots, "tab_background", summary, templateId, template, template.defaults.tabBackground),
    myBubbleColor: summary.previewMetadata.colors?.myBubble ?? resolveColor(slots, "chat_bubble_me_color", summary, templateId, template, template.defaults.myBubble),
    friendBubbleColor: summary.previewMetadata.colors?.friendBubble ?? resolveColor(slots, "chat_bubble_you_color", summary, templateId, template, template.defaults.friendBubble),
    chatBackgroundImage: resolveImage(slots, "chat_background", summary, templateId, template, signedUrls) ?? seedAssets?.chatBackground,
    mainBackgroundImage: resolveImage(slots, "main_background", summary, templateId, template, signedUrls) ?? seedAssets?.mainBackground,
    tabBackgroundImage: resolveImage(slots, "tab_background_image", summary, templateId, template, signedUrls),
    myBubbleImage: resolveImage(slots, "bubble_me_1", summary, templateId, template, signedUrls) ?? seedAssets?.myBubble,
    friendBubbleImage: resolveImage(slots, "bubble_you_1", summary, templateId, template, signedUrls) ?? seedAssets?.friendBubble,
    profileImage: resolveImage(slots, "profile_image_1", summary, templateId, template, signedUrls) ?? seedAssets?.profileImage,
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
  return getResolvedAssetUrl(slot, {}, summary.candidateSelections, templateId, template);
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

const previewRoles: ThemeResourceRole[] = ["chat_background", "main_background", "tab_background_image", "bubble_me_1", "bubble_you_1", "profile_image_1"];

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
