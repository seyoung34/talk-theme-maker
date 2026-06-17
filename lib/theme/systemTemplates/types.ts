import type { SlotCandidateSelections, SlotColors, SlotUploads } from "@/lib/theme/project/state";
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

export type SystemTemplateSummary = Pick<SystemTemplateRecord, "id" | "bundleId" | "title" | "description" | "baseTemplateId" | "platform" | "status" | "visibility" | "pricingType" | "priceAmount" | "creditCost" | "tags" | "createdAt" | "updatedAt"> & {
  uploadCount: number;
  colorCount: number;
};
