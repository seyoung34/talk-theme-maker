import type { Insets, Markers, StretchPoint, ThemePlatform, ThemeResourceRole } from "@/lib/theme/types";

export type BubbleBuilderSide = "me" | "you";
export type BubbleBuilderVariant = "first" | "group";
export type BubbleShapePreset = "square" | "rounded" | "capsule" | "circle";

export type BubbleDecorationTransform = {
  offsetX: number;
  offsetY: number;
  scale: number;
  flipX: boolean;
};

export type BubbleSideDesignSpec = {
  side: BubbleBuilderSide;
  preset: BubbleShapePreset;
  radius: number;
  fill: string;
  borderColor: string;
  borderWidth: number;
  shadow: "none" | "soft";
  textColor: string;
  syncTextColorOnApply: boolean;
  decoration?: BubbleDecorationTransform;
};

export type BubbleFamilyDesignSpec = {
  version: 1;
  familyId: string;
  presetVersion: "bubble-builder-v1";
  side: BubbleBuilderSide;
  design: BubbleSideDesignSpec;
  decorationSourceName?: string;
  createdAt: number;
  updatedAt: number;
};

export type BubbleRect = { x: number; y: number; width: number; height: number };

export type BubbleVariantGeometry = {
  canvas: { width: number; height: number };
  body: BubbleRect;
  content: BubbleRect;
  stretch: StretchPoint;
  radius: number;
};

export type BubbleBuilderWarningCode = "content-too-small" | "decoration-overlap";

export type BubbleBuilderWarning = {
  code: BubbleBuilderWarningCode;
  message: string;
};

export type GeneratedBubbleAsset = {
  platform: ThemePlatform;
  role: ThemeResourceRole;
  variant: BubbleBuilderVariant;
  file: File;
  markers?: Markers;
  insets?: Insets;
  stretch?: StretchPoint;
};

export type GeneratedBubbleFamily = {
  spec: BubbleFamilyDesignSpec;
  assets: GeneratedBubbleAsset[];
  warnings: BubbleBuilderWarning[];
};
