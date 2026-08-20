import type { CatalogAssetSelection } from "@/lib/theme/assetCatalog/registry";
import type { SlotCandidateSelections, SlotColors, SlotUploads } from "@/lib/theme/project/state";
import type { ImageEditState, ImageEditTarget } from "@/lib/theme/imageEdit";
import type { BaseTemplateId } from "@/lib/theme/templates";
import type { BubbleGeometry, Insets, Markers, StretchPoint, ThemePlatform } from "@/lib/theme/types";
import type { BubbleDesigns } from "@/lib/theme/bubbleBuilder";
import type { PreviewScreenId } from "@/lib/theme/systemTemplates/previewScreenData";

export type SystemTemplateStatus = "draft" | "published" | "archived";
export type SystemTemplateVisibility = "private" | "public";
export type SystemTemplatePricingType = "free" | "paid" | "credit";

// 유저용 기본 템플릿을 지정하는 태그. 이 태그가 붙은 시스템 템플릿을 갤러리 최상단/기본으로 취급한다.
export const DEFAULT_SYSTEM_TEMPLATE_TAG = "default";

export function isDefaultSystemTemplate(tags: readonly string[] | null | undefined): boolean {
  return Boolean(tags?.includes(DEFAULT_SYSTEM_TEMPLATE_TAG));
}

export function normalizeSystemTemplateVisibility(value: unknown): SystemTemplateVisibility {
  return value === "public" ? "public" : "private";
}

export type ThemeEditOverrides = {
  colors: SlotColors;
  uploads: SlotUploads;
  candidateSelections: SlotCandidateSelections;
  bubbleEdits: {
    geometry: Partial<Record<string, BubbleGeometry>>;
    markers: Partial<Record<string, Markers>>;
    insets: Partial<Record<string, Insets>>;
    stretch: Partial<Record<string, StretchPoint>>;
    // 나중에 추가된 필드다. 이전에 저장된 row에는 없으므로 optional로 읽고 `{}`로 승격한다.
    flipX?: Partial<Record<string, boolean>>;
    designs: BubbleDesigns;
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

export type SystemTemplateSaveInput = Omit<SystemTemplateRecord, "id" | "createdAt" | "updatedAt"> & Partial<Pick<SystemTemplateRecord, "id" | "createdAt">> & {
  // 25자 도입 전에 저장된 이름을 다른 값으로 바꾸지 않고 덮어쓸 때만 허용한다.
  legacyTitle?: string;
};

/**
 * storagePath 없이 보관하는 catalog ref의 검증된 메타데이터.
 *
 * signed URL은 만료되므로 시스템 템플릿 JSON에는 저장하지 않는다. 대신 legacyStoragePath가
 * 있으면 편집기 미리보기·변환 fallback에서만 다시 서명한다.
 */
export type RemoteCatalogAssetMetadata = {
  fileName: string;
  mimeType: string;
  size: number;
  sourceScale: 1 | 2 | 3;
  width: number;
  height: number;
  pngSignatureVerified: boolean;
  legacyStoragePath?: string;
};

export type RemoteUploadEntry = {
  id: string;
  fileName: string;
  mimeType: string;
  size: number;
  /** 기존 Supabase 원본 경로. catalog-only entry에는 없다. */
  storagePath?: string;
  /**
   * catalog(GCS) 원본 좌표 (계획 §9.1).
   *
   * 있으면 이 항목의 바이트를 브라우저로 내려받지 않고 export manifest에서 참조로 보낼 수 있다.
   * catalog-only entry에서는 `storagePath`가 비어 있고, 메타데이터의 legacy 경로는 필요한
   * 순간에만 지연 수화한다.
   */
  catalog?: CatalogAssetSelection;
  catalogMetadata?: RemoteCatalogAssetMetadata;
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
  geometry?: BubbleGeometry;
  stretch?: StretchPoint;
  insets?: Insets;
  markers?: Markers;
  /** 슬롯별 좌우반전. 갤러리 프리뷰도 편집 화면과 같은 방향으로 그려야 한다. */
  flipX?: boolean;
};

export type SystemTemplatePreviewMetadata = {
  cardPreviewPath?: string;
  generatedAt?: string;
  colors?: Partial<Record<"chatBackground" | "mainBackground" | "tabBackground" | "myBubble" | "friendBubble", string>>;
  // myBubble2/friendBubble2는 bubble_me_2/bubble_you_2(연속 메시지 변형)다. myBubble/friendBubble(_1)과
  // 같은 색상 role(chat_bubble_me/you_color)을 쓰므로 colors에는 _2 항목이 없다.
  refs?: Partial<Record<"chatBackground" | "mainBackground" | "tabBackground" | "myBubble" | "friendBubble" | "myBubble2" | "friendBubble2" | "profileImage", string>>;
  bubbles?: Partial<Record<"myBubble" | "friendBubble" | "myBubble2" | "friendBubble2", BubblePreviewShape>>;
  /**
   * 모달 4화면을 미리 구운 이미지의 공개 버킷 경로.
   *
   * 없으면 모달이 원본 에셋을 받아 DOM으로 그리는 기존 경로로 떨어진다. 굽기 전 템플릿과
   * 굽기에 실패한 경우를 위해 그 폴백은 유지한다.
   */
  screenPreviews?: Partial<Record<PreviewScreenId, string>>;
  /**
   * R2로 옮긴 파생물의 객체 키.
   *
   * 템플릿 preview는 폰 화면을 canvas로 합성한 것이라 GCS catalog 원본이 없다. 그래서
   * `theme_asset_objects`(원본이 있는 에셋의 registry)에 넣지 못하고 여기 둔다 — 계획 §8.1이
   * `preview_metadata`를 대안으로 지정한 이유다.
   *
   * 기존 `cardPreviewPath`·`screenPreviews`(theme-public 경로)는 그대로 남긴다. R2 키가 없거나
   * `NEXT_PUBLIC_R2_PREVIEW_ORIGIN`이 꺼져 있으면 그쪽으로 떨어진다.
   */
  r2?: {
    card?: R2PreviewRef;
    screens?: Partial<Record<PreviewScreenId, R2PreviewRef>>;
  };
};

export type R2PreviewRef = {
  readonly objectKey: string;
  readonly sha256: string;
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
