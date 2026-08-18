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
  constructor(code: string, message: string, detail?: string) {
    super(code, message, detail);
    this.name = "IosBuildEnqueueError";
  }
}

export async function enqueueIosBuild(bundle: IosBuildBundle) {
  try {
    await enqueueBuild(bundle, { platform: "ios" });
  } catch (error) {
    if (error instanceof BuildEnqueueError) throw new IosBuildEnqueueError(error.code, error.message, error.detail);
    throw error;
  }
}
