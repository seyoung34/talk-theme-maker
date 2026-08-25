import { canDisableImageSlot, getResolvedColor, isImageSlotDisabled, type SlotCandidateSelections, type SlotColors, type SlotUploads } from "@/lib/theme/project/state";
import { getSlotExportMapping } from "@/lib/theme/project/export";
import { resolveProjectImageSource } from "@/lib/theme/project/assetSource";
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
      if (slot.required && !getResolvedColor(slot, colors, selections, template.id, template, slots)) {
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
    const { sourceSlot, selectedUpload, upload, sourceUrl, previewUrl } = resolveProjectImageSource(slot, uploads, selections, template.id, template, slots);

    if (!imageDisabled && slot.path && slot.fileName) {
      files.push({
        path: slot.path,
        name: slot.fileName,
        size: upload?.size ?? 0,
        file: upload,
        sourceUrl,
        previewUrl,
        previewName: previewUrl ? getPreviewFileName(previewUrl, sourceSlot.fileName) : undefined,
      });
      resources.push({ id: slot.id, slotId: slot.id, platform, role: slot.role, screen: slot.screen, filePath: slot.path, exportMapping });
    }

    // catalog 참조가 있으면 export가 registry에서 바이트를 가져오므로 슬롯은 채워진 것이다.
    // `previewUrl`로 판정하면 안 된다 — 그 값은 만료되거나 서명에 실패하면 사라지는 화면용
    // 파생물이라, 정상적으로 내보내지는 슬롯에 "파일 필요" 경고가 뜬다.
    if (slot.required && !upload && !sourceUrl && !selectedUpload?.catalog && !(imageDisabled && canDisableImageSlot(slot))) {
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

function getPreviewFileName(url: string, fallbackName?: string) {
  const path = url.split(/[?#]/, 1)[0];
  const name = path.slice(path.lastIndexOf("/") + 1);
  return name || fallbackName;
}
