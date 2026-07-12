import type { SlotCandidateSelections, SlotColors, SlotUploads } from "@/lib/theme/project/state";
import type { ImageEditState, ImageEditTarget } from "@/lib/theme/imageEdit";
import type { BaseTemplateId } from "@/lib/theme/templates";
import type { Insets, Markers, StretchPoint, ThemePlatform } from "@/lib/theme/types";

export type SystemTemplateStatus = "draft" | "published" | "archived";
export type SystemTemplateVisibility = "private" | "public" | "unlisted";
export type SystemTemplatePricingType = "free" | "paid" | "credit";

export type ThemeEditOverrides = {
  colors: SlotColors;
  uploads: SlotUploads;
  candidateSelections: SlotCandidateSelections;
  bubbleEdits: {
    markers: Partial<Record<string, Markers>>;
    insets: Partial<Record<string, Insets>>;
    stretch: Partial<Record<string, StretchPoint>>;
  };
};

export type SystemTemplateRecord = {
  id: string;
  bundleId?: string;
  title: string;
  description?: string;
  baseTemplateId: BaseTemplateId;
  platform: ThemePlatform;
  status: SystemTemplateStatus;
  visibility: SystemTemplateVisibility;
  pricingType: SystemTemplatePricingType;
  priceAmount?: number;
  creditCost?: number;
  overrides: ThemeEditOverrides;
  tags: string[];
  createdAt: number;
  updatedAt: number;
};

export type SystemTemplateSaveInput = Omit<SystemTemplateRecord, "id" | "createdAt" | "updatedAt"> & Partial<Pick<SystemTemplateRecord, "id" | "createdAt">>;

export type RemoteUploadEntry = {
  id: string;
  fileName: string;
  mimeType: string;
  size: number;
  storagePath: string;
  imageEdit?: {
    originalName: string;
    originalSize: number;
    originalStoragePath?: string;
    editedAt: number;
    state: ImageEditState;
    target?: ImageEditTarget;
  };
};

export type RemoteSlotUploads = Record<string, RemoteUploadEntry[] | undefined>;

// 말풍선 이미지를 프리뷰에서 9-slice로 그리기 위한 stretch/inset 정보.
// stretch/insets는 iOS cap-inset(원본 이미지 픽셀 기준), markers는 Android 나인패치 편집값.
export type BubblePreviewShape = {
  stretch?: StretchPoint;
  insets?: Insets;
  markers?: Markers;
};

export type SystemTemplatePreviewMetadata = {
  cardPreviewPath?: string;
  generatedAt?: string;
  colors?: Partial<Record<"chatBackground" | "mainBackground" | "tabBackground" | "myBubble" | "friendBubble", string>>;
  refs?: Partial<Record<"chatBackground" | "mainBackground" | "tabBackground" | "myBubble" | "friendBubble" | "profileImage", string>>;
  bubbles?: Partial<Record<"myBubble" | "friendBubble", BubblePreviewShape>>;
};

export type SystemTemplateSummary = Pick<SystemTemplateRecord, "id" | "bundleId" | "title" | "description" | "baseTemplateId" | "platform" | "status" | "visibility" | "pricingType" | "priceAmount" | "creditCost" | "tags" | "createdAt" | "updatedAt"> & {
  uploadCount: number;
  colorCount: number;
  colors: SlotColors;
  candidateSelections: SlotCandidateSelections;
  uploadRefs: RemoteSlotUploads;
  previewMetadata: SystemTemplatePreviewMetadata;
};

export type SystemTemplatePage = {
  items: SystemTemplateSummary[];
  nextCursor?: string;
};

export type SystemTemplateMetadataRecord = Omit<SystemTemplateRecord, "overrides"> & {
  overrides: Omit<ThemeEditOverrides, "uploads"> & {
    uploads: SlotUploads;
    uploadRefs: RemoteSlotUploads;
  };
};
