import { buildAndroidThemeExportFiles } from "@/lib/theme/android/export";
import { buildIosThemeExportFiles } from "@/lib/theme/ios/export";
import type { AndroidExportPayloadOptions, ExportMode, ExportPayloadOptions, IosExportPayloadOptions } from "@/components/project/exportModel";

export async function createExportFormData(options: ExportPayloadOptions) {
  if (isIosExportMode(options.mode)) {
    return createIosExportFormData({ ...options, mode: options.mode });
  }
  return createAndroidExportFormData({ ...options, mode: isAndroidExportMode(options.mode) ? options.mode : "apk" });
}

export function isAndroidExportMode(mode: ExportMode): mode is "project" | "apk" | "apk-zip" {
  return mode === "project" || mode === "apk" || mode === "apk-zip";
}

export function isIosExportMode(mode: ExportMode): mode is "theme-zip" | "ktheme" {
  return mode === "theme-zip" || mode === "ktheme";
}

export function getExportProgressSteps(mode: ExportMode) {
  if (mode === "ktheme") {
    return ["CSS 생성", "이미지 정리", ".ktheme 패키징", "다운로드 준비"];
  }
  if (mode === "theme-zip") {
    return ["CSS 생성", "이미지 정리", "ZIP 패키징", "다운로드 준비"];
  }
  if (mode === "project") {
    return ["리소스 준비", "프로젝트 생성", "메타데이터 반영", "압축 정리", "다운로드 준비"];
  }
  if (mode === "apk-zip") {
    return ["리소스 준비", "프로젝트 생성", "APK 빌드", "ZIP 압축", "다운로드 준비"];
  }
  return ["리소스 준비", "프로젝트 생성", "APK 빌드", "결과물 정리", "다운로드 준비"];
}

export function getExportNotice(mode: ExportMode) {
  if (mode === "ktheme") return "iOS .ktheme 파일을 생성하는 중입니다.";
  if (mode === "theme-zip") return "iOS 테마 ZIP 파일을 생성하는 중입니다.";
  if (mode === "project") return "Android 프로젝트 ZIP을 생성하는 중입니다.";
  if (mode === "apk-zip") return "Android APK ZIP을 생성하는 중입니다.";
  return "Android APK를 빌드하는 중입니다.";
}

export type AsyncAndroidExportOutcome =
  | { status: "completed"; downloadUrl: string; fileName: string }
  | { status: "failed"; error: string };

// 4.7: 비동기 Android 내보내기 큐잉 후 완료/실패까지 status 엔드포인트를 폴링한다.
export async function pollAndroidExportStatus(exportJobId: string, onStage?: (stage: string) => void): Promise<AsyncAndroidExportOutcome> {
  const pollIntervalMs = 3000;
  const maxPolls = 240; // 3초 * 240 = 12분 클라이언트 측 상한(서버 워치독이 최종 방어)

  for (let attempt = 0; attempt < maxPolls; attempt += 1) {
    const response = await fetch(`/api/export/android/status?jobId=${encodeURIComponent(exportJobId)}`, { cache: "no-store" });
    const payload = (await response.json().catch(() => null)) as
      | { status: "pending"; stage: string }
      | { status: "completed"; downloadUrl: string; fileName: string }
      | { status: "failed"; error: string }
      | { error?: string }
      | null;

    if (response.ok && payload && "status" in payload) {
      if (payload.status === "pending") {
        onStage?.(payload.stage);
      } else if (payload.status === "completed") {
        return { status: "completed", downloadUrl: payload.downloadUrl, fileName: payload.fileName };
      } else {
        return { status: "failed", error: payload.error };
      }
    }

    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }

  return { status: "failed", error: "내보내기 상태 확인 시간이 초과되었습니다. 잠시 후 다시 시도해 주세요." };
}

export function getDownloadFileName(contentDisposition: string | null) {
  if (!contentDisposition) return null;
  const encodedMatch = /filename\*=UTF-8''([^;]+)/i.exec(contentDisposition);
  if (encodedMatch?.[1]) {
    try {
      return decodeURIComponent(encodedMatch[1]);
    } catch {
      // Fall back to the ASCII filename below.
    }
  }
  const match = /filename="([^"]+)"/i.exec(contentDisposition);
  return match?.[1] ?? null;
}

export function triggerDownload(blob: Blob, fileName: string) {
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(href);
}

async function createIosExportFormData({
  analysis,
  template,
  templateId,
  exportName,
  versionName,
  mode,
  slots,
  uploads,
  colors,
  selections,
  bubbleGeometry,
  bubbleMarkers,
  bubbleInsets,
  bubbleStretch,
}: IosExportPayloadOptions) {
  const bubbleEditsBySlotId = Object.fromEntries(
    slots.map((slot) => [
      slot.id,
      {
        geometry: bubbleGeometry[slot.id],
        markers: bubbleMarkers[slot.id],
        insets: bubbleInsets[slot.id],
        stretch: bubbleStretch[slot.id],
      },
    ]),
  );

  const exportFiles = await buildIosThemeExportFiles({
    analysis,
    template,
    templateId,
    exportName,
    versionName,
    slots,
    uploads,
    colors,
    selections,
    bubbleEditsBySlotId,
  });

  const formData = new FormData();
  let fileIndex = 0;
  const manifest = exportFiles.map((file) => {
    if ("serverAsset" in file) {
      return { path: file.path, serverAsset: file.serverAsset };
    }
    const index = fileIndex;
    fileIndex += 1;
    const field = `file-${index}`;
    formData.append(field, new File([file.blob], file.path.split("/").at(-1) ?? `export-${index}`));
    return { field, path: file.path };
  });

  formData.append("manifest", JSON.stringify(manifest));
  formData.append("exportName", exportName);
  formData.append("versionName", versionName);
  formData.append("mode", mode);

  return formData;
}

async function createAndroidExportFormData({
  analysis,
  template,
  templateId,
  exportName,
  versionName,
  mode,
  slots,
  uploads,
  colors,
  selections,
  bubbleGeometry,
  bubbleMarkers,
  bubbleInsets,
  bubbleStretch,
}: AndroidExportPayloadOptions) {
  const bubbleEditsBySlotId = Object.fromEntries(
    slots.map((slot) => [
      slot.id,
      {
        geometry: bubbleGeometry[slot.id],
        markers: bubbleMarkers[slot.id],
        insets: bubbleInsets[slot.id],
        stretch: bubbleStretch[slot.id],
      },
    ]),
  );

  const exportFiles = await buildAndroidThemeExportFiles({
    analysis,
    template,
    templateId,
    exportName,
    slots,
    uploads,
    colors,
    selections,
    bubbleEditsBySlotId,
  });

  const formData = new FormData();
  let fileIndex = 0;
  const manifest = exportFiles.map((file) => {
    if ("serverAsset" in file) {
      return { path: file.path, serverAsset: file.serverAsset };
    }
    const index = fileIndex;
    fileIndex += 1;
    const field = `file-${index}`;
    formData.append(field, new File([file.blob], file.path.split("/").at(-1) ?? `export-${index}`));
    return { field, path: file.path };
  });

  formData.append("manifest", JSON.stringify(manifest));
  formData.append("exportName", exportName);
  formData.append("versionName", versionName);
  formData.append("mode", mode);

  return formData;
}
