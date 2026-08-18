import {
  resolveExportDownload,
  resolveExportStatus,
  type AsyncExportDownloadResult,
  type AsyncExportStatusResult,
} from "@/lib/theme/export/asyncExportStatus";

export type IosExportStatusResult = AsyncExportStatusResult;
export type IosExportDownloadResult = AsyncExportDownloadResult;

export function resolveIosExportStatus(userId: string, exportJobId: string) {
  return resolveExportStatus(userId, exportJobId, "ios");
}

export function resolveIosExportDownload(userId: string, exportJobId: string) {
  return resolveExportDownload(userId, exportJobId, "ios");
}
