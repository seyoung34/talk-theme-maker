import type { ThemeDiagnostic, ThemeExportMapping, ThemePlatform, ThemeProjectSummary, ThemeResourceRole, ThemeScreen } from "@/lib/theme/types";

export type ThemeProjectFile = {
  path: string;
  name: string;
  size: number;
  file?: File;
  sourceUrl?: string;
};

export type ThemeProjectResource = {
  id: string;
  slotId?: string;
  platform: ThemePlatform;
  role: ThemeResourceRole;
  screen: ThemeScreen;
  filePath?: string;
  exportMapping?: ThemeExportMapping;
};

export type ThemeProjectDiagnostic = ThemeDiagnostic;

export type ThemeProjectAnalysis = {
  summary: ThemeProjectSummary;
  files: ThemeProjectFile[];
  resources: ThemeProjectResource[];
  diagnostics: ThemeProjectDiagnostic[];
  previewDefaults?: {
    chatBackground: string;
    myBubble: string;
    friendBubble: string;
    accent: string;
  };
};
