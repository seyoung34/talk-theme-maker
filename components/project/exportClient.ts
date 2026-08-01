import { buildAndroidThemeExportFiles } from "@/lib/theme/android/export";
import { buildIosThemeExportFiles } from "@/lib/theme/ios/export";
import { toExportFailureReason, type ExportFailureReason } from "@/lib/theme/export/failureReason";
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

// 클라이언트 측 상한. 서버 워치독이 최종 방어선이다.
const exportPollTimeoutMs = 12 * 60 * 1000;

export type AsyncAndroidExportOutcome =
  | { status: "completed"; downloadUrl: string; fileName: string }
  | { status: "failed"; error: string; reason: ExportFailureReason };

// 4.7: 비동기 Android 내보내기 큐잉 후 완료/실패까지 status 엔드포인트를 폴링한다.
export async function pollAndroidExportStatus(exportJobId: string, onStage?: (stage: string) => void): Promise<AsyncAndroidExportOutcome> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < exportPollTimeoutMs) {
    const response = await fetch(`/api/export/android/status?jobId=${encodeURIComponent(exportJobId)}`, { cache: "no-store" });
    const payload = (await response.json().catch(() => null)) as
      | { status: "pending"; stage: string }
      | { status: "completed"; downloadUrl: string; fileName: string }
      | { status: "failed"; error: string; reason?: string }
      | { error?: string }
      | null;

    if (response.ok && payload && "status" in payload) {
      if (payload.status === "pending") {
        onStage?.(payload.stage);
      } else if (payload.status === "completed") {
        return { status: "completed", downloadUrl: payload.downloadUrl, fileName: payload.fileName };
      } else {
        // 빌더가 만든 코드는 임의 문자열일 수 있으므로 허용 목록을 통과한 값만 분석에 쓴다.
        return { status: "failed", error: payload.error, reason: toExportFailureReason(payload.reason, "android_build_failed") };
      }
    }

    await new Promise((resolve) => setTimeout(resolve, getExportPollIntervalMs(Date.now() - startedAt)));
  }

  return { status: "failed", error: "내보내기 상태 확인 시간이 초과되었습니다. 잠시 후 다시 시도해 주세요.", reason: "poll_timeout" };
}

// APK 빌드는 보통 수 분이 걸린다. 초반에는 촘촘히 확인해 빠른 실패를 바로 보여 주고,
// 이후에는 간격을 늘려 조회 1건마다 붙는 인증·DB 비용을 줄인다.
// 각 조회는 auth 확인과 export_jobs 조회를 동반하므로 고정 3초는 그대로 낭비가 된다.
export function getExportPollIntervalMs(elapsedMs: number) {
  if (elapsedMs < 30_000) return 3_000;
  if (elapsedMs < 120_000) return 5_000;
  return 10_000;
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

type ExportManifestSourceFile = { path: string; blob: Blob } | { path: string; serverAsset: string };

// 스케일 타깃 때문에 같은 이미지가 여러 경로로 나간다(Android 슬롯 89개 중 23개).
// Android는 동일한 blob의 field를 공유할 수 있지만, iOS manifest는 경로마다 고유한 field가 필요하다.
export function appendExportFilesToFormData(
  formData: FormData,
  exportFiles: readonly ExportManifestSourceFile[],
  options: { shareBlobFields?: boolean } = {},
) {
  const { shareBlobFields = true } = options;
  const fieldByBlob = new Map<Blob, string>();
  let uploadIndex = 0;

  return exportFiles.map((file) => {
    if ("serverAsset" in file) {
      return { path: file.path, serverAsset: file.serverAsset };
    }

    const sharedField = shareBlobFields ? fieldByBlob.get(file.blob) : undefined;
    if (sharedField) return { field: sharedField, path: file.path };

    const index = uploadIndex++;
    const field = `file-${index}`;
    if (shareBlobFields) fieldByBlob.set(file.blob, field);
    formData.append(field, new File([file.blob], file.path.split("/").at(-1) ?? `export-${index}`));
    return { field, path: file.path };
  });
}

async function createIosExportFormData({
  analysis,
  template,
  templateId,
  exportName,
  mode,
  slots,
  uploads,
  colors,
  selections,
  bubbleGeometry,
  bubbleMarkers,
  bubbleInsets,
  bubbleStretch,
  bubbleFlipX,
}: IosExportPayloadOptions) {
  const bubbleEditsBySlotId = Object.fromEntries(
    slots.map((slot) => [
      slot.id,
      {
        geometry: bubbleGeometry[slot.id],
        markers: bubbleMarkers[slot.id],
        insets: bubbleInsets[slot.id],
        stretch: bubbleStretch[slot.id],
        flipX: bubbleFlipX[slot.id],
      },
    ]),
  );

  const exportFiles = await buildIosThemeExportFiles({
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
  const manifest = appendExportFilesToFormData(formData, exportFiles, { shareBlobFields: false });

  formData.append("manifest", JSON.stringify(manifest));
  formData.append("exportName", exportName);
  formData.append("mode", mode);

  return formData;
}

async function createAndroidExportFormData({
  analysis,
  template,
  templateId,
  exportName,
  mode,
  slots,
  uploads,
  colors,
  selections,
  bubbleGeometry,
  bubbleMarkers,
  bubbleInsets,
  bubbleStretch,
  bubbleFlipX,
}: AndroidExportPayloadOptions) {
  const bubbleEditsBySlotId = Object.fromEntries(
    slots.map((slot) => [
      slot.id,
      {
        geometry: bubbleGeometry[slot.id],
        markers: bubbleMarkers[slot.id],
        insets: bubbleInsets[slot.id],
        stretch: bubbleStretch[slot.id],
        flipX: bubbleFlipX[slot.id],
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
  const manifest = appendExportFilesToFormData(formData, exportFiles);

  formData.append("manifest", JSON.stringify(manifest));
  formData.append("exportName", exportName);
  formData.append("mode", mode);

  return formData;
}
