import {
  BuildEnqueueError,
  enqueueBuild,
  type BuildInputFile,
  type ExportManifestItem,
} from "@/lib/theme/export/buildJobClient";

export type IosBuildBundle = {
  exportJobId: string;
  userId: string;
  options: {
    mode: "theme-zip" | "ktheme";
    exportName: string;
    themeIdentifier: string;
  };
  manifest: ExportManifestItem[];
  files: BuildInputFile[];
};

export class IosBuildEnqueueError extends BuildEnqueueError {
  constructor(code: string, message: string) {
    super(code, message);
    this.name = "IosBuildEnqueueError";
  }
}

export function isAsyncIosExportEnabled() {
  return process.env.IOS_EXPORT_ASYNC === "1" || process.env.IOS_EXPORT_ASYNC === "true";
}

export async function enqueueIosBuild(bundle: IosBuildBundle) {
  try {
    await enqueueBuild(bundle, { jobNameEnv: "GCP_IOS_BUILD_JOB_NAME" });
  } catch (error) {
    if (error instanceof BuildEnqueueError) throw new IosBuildEnqueueError(error.code, error.message);
    throw error;
  }
}
