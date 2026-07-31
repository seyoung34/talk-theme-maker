import type { SlotCandidateSelections, SlotColors, SlotUploads } from "@/components/project/projectModel";
import type { createThemeProjectAnalysis } from "@/lib/theme/project/diagnostics";
import type { ThemeAssetSlot, ThemeTemplate, ThemeTemplateId } from "@/lib/theme/templates";
import type { BubbleGeometry, Insets, Markers, StretchPoint } from "@/lib/theme/types";

export type ExportMode = "project" | "apk" | "apk-zip" | "theme-zip" | "ktheme";

export type ExportDownloadResult = {
  fileName: string;
  mode: ExportMode;
  platform: "android" | "ios";
};

export type AccountState = {
  user: { id: string; email?: string } | null;
  credits: number;
  isAdmin: boolean;
  error?: string;
};

export type ExportErrorResponse = {
  error?: string;
  reason?: string;
  refunded?: boolean;
};

export type AndroidExportPayloadOptions = {
  analysis: ReturnType<typeof createThemeProjectAnalysis>;
  template: ThemeTemplate;
  templateId: ThemeTemplateId;
  exportName: string;
  mode: "project" | "apk" | "apk-zip";
  slots: ThemeAssetSlot[];
  uploads: SlotUploads;
  colors: SlotColors;
  selections: SlotCandidateSelections;
  bubbleGeometry: Partial<Record<string, BubbleGeometry>>;
  bubbleMarkers: Partial<Record<string, Markers>>;
  bubbleInsets: Partial<Record<string, Insets>>;
  bubbleStretch: Partial<Record<string, StretchPoint>>;
};

export type IosExportPayloadOptions = Omit<AndroidExportPayloadOptions, "mode"> & {
  mode: "theme-zip" | "ktheme";
};

export type ExportPayloadOptions = Omit<AndroidExportPayloadOptions, "mode"> & {
  mode: ExportMode;
};
