import type { SystemTemplatePricingType, SystemTemplateStatus, SystemTemplateVisibility } from "@/lib/theme/systemTemplates";

export type ProjectNotice = {
  tone: "info" | "success" | "warning" | "error";
  message: string;
};

export type ActiveUserTemplate = {
  id: string;
  name: string;
  createdAt: number;
};

export type ActiveSystemTemplate = {
  id: string;
  bundleId?: string;
  title: string;
  description?: string;
  tags: string[];
  status: SystemTemplateStatus;
  visibility: SystemTemplateVisibility;
  pricingType: SystemTemplatePricingType;
  priceAmount?: number;
  creditCost?: number;
  createdAt: number;
};

export type InitialLoadState = {
  status: "idle" | "ready" | "loading" | "error";
  message?: string;
  detail?: string;
  current?: number;
  total?: number;
};
