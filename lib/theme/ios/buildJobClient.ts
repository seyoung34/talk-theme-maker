import {
  BuildEnqueueError,
  enqueueBuild,
  type BuildInputFile,
  type BuilderRunResult,
  type EnqueueBuildProgress,
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
  constructor(code: string, message: string, detail?: string, options: { ambiguous?: boolean } = {}) {
    super(code, message, detail, options);
    this.name = "IosBuildEnqueueError";
  }
}

export async function enqueueIosBuild(
  bundle: IosBuildBundle,
  options: { attempt?: number; progress?: EnqueueBuildProgress } = {},
): Promise<BuilderRunResult> {
  try {
    return await enqueueBuild(bundle, { platform: "ios", ...options });
  } catch (error) {
    if (error instanceof BuildEnqueueError) throw new IosBuildEnqueueError(error.code, error.message, error.detail, { ambiguous: error.ambiguous });
    throw error;
  }
}
