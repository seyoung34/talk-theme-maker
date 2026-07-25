import { canDisableImageSlot, getInheritedSourceSlot, getResolvedAssetUrl, getResolvedColor, isImageSlotDisabled, type SlotCandidateSelections, type SlotColors, type SlotUploads } from "@/lib/theme/project/state";
import { getSlotExportMapping } from "@/lib/theme/project/export";
import type { ThemeProjectAnalysis, ThemeProjectFile, ThemeProjectResource } from "@/lib/theme/project/types";
import type { ThemeAssetSlot, ThemeTemplate } from "@/lib/theme/templates";
import type { ThemeDiagnostic } from "@/lib/theme/types";

export function createThemeProjectAnalysis(
  template: ThemeTemplate,
  platform: ThemeProjectAnalysis["summary"]["platform"],
  slots: ThemeAssetSlot[],
  uploads: SlotUploads,
  colors: SlotColors,
  selections: SlotCandidateSelections,
): ThemeProjectAnalysis {
  const files: ThemeProjectFile[] = [];
  const resources: ThemeProjectResource[] = [];
  const diagnostics: ThemeDiagnostic[] = [];

  for (const slot of slots) {
    const exportMapping = getSlotExportMapping(slot);

    if (slot.kind === "color") {
      resources.push({ id: slot.id, slotId: slot.id, platform, role: slot.role, screen: slot.screen, exportMapping });
      if (slot.required && !getResolvedColor(slot, colors, selections, template.id, template)) {
        diagnostics.push({
          level: "warning",
          code: "missing-color",
          slotId: slot.id,
          message: `${slot.label} 값이 필요합니다.`,
          fixHint: "색상 값을 지정하거나 기본 candidate를 선택하세요.",
        });
      }
      continue;
    }

    const imageDisabled = isImageSlotDisabled(slot, selections);
    let upload = imageDisabled ? undefined : (uploads[slot.id] ?? []).find((entry) => entry.id === selections[slot.id])?.file;
    let sourceUrl = getResolvedAssetUrl(slot, uploads, selections, template.id, template);

    // 직접 선택 없이 기본 슬롯을 상속 중이면(예: 탭 선택 아이콘) 기본 슬롯의 소스를 그대로 사용한다.
    const inheritedSource = imageDisabled ? undefined : getInheritedSourceSlot(slot, uploads, selections, template.id, template, slots);
    if (inheritedSource) {
      upload = (uploads[inheritedSource.id] ?? []).find((entry) => entry.id === selections[inheritedSource.id])?.file;
      sourceUrl = getResolvedAssetUrl(inheritedSource, uploads, selections, template.id, template);
    }

    if (!imageDisabled && slot.path && slot.fileName) {
      files.push({ path: slot.path, name: slot.fileName, size: upload?.size ?? 0, file: upload, sourceUrl });
      resources.push({ id: slot.id, slotId: slot.id, platform, role: slot.role, screen: slot.screen, filePath: slot.path, exportMapping });
    }

    if (slot.required && !upload && !sourceUrl && !(imageDisabled && canDisableImageSlot(slot))) {
      diagnostics.push({
        level: "warning",
        code: "missing-asset",
        slotId: slot.id,
        message: `${slot.label} 이미지가 필요합니다.`,
        filePath: slot.path,
        fixHint: "기본 candidate를 유지하거나 이미지를 업로드하세요.",
      });
    }
  }

  const screens = Array.from(new Set(resources.map((resource) => resource.screen)));

  return {
    summary: {
      platform,
      rootName: template.name,
      screens: screens.length > 0 ? screens : ["friends", "tabs", "chatroom"],
      resourceCount: resources.length,
      diagnosticsCount: diagnostics.length,
    },
    files,
    resources,
    diagnostics,
    previewDefaults: {
      chatBackground: template.defaults.chatBackground,
      myBubble: template.defaults.myBubble,
      friendBubble: template.defaults.friendBubble,
      accent: template.accent,
    },
  };
}
