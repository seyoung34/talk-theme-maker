import {
  resolveExportDownload,
  resolveExportStatus,
  type AsyncExportDownloadResult,
  type AsyncExportStatusResult,
} from "@/lib/theme/export/asyncExportStatus";

export type AndroidExportStatusResult = AsyncExportStatusResult;
export type AndroidExportDownloadResult = AsyncExportDownloadResult;

export function resolveAndroidExportStatus(userId: string, exportJobId: string) {
  return resolveExportStatus(userId, exportJobId, "android");
}

export function resolveAndroidExportDownload(userId: string, exportJobId: string) {
  return resolveExportDownload(userId, exportJobId, "android");
}
