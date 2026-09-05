import type { AndroidBundleUploadFile } from "@/lib/theme/android/requestShared";
import {
  BuildEnqueueError,
  enqueueBuild,
  type BuilderRunResult,
  type EnqueueBuildProgress,
} from "@/lib/theme/export/buildJobClient";
import type { ExportManifestItem } from "@/lib/theme/export/buildJobClient";

export type AndroidBuildBundle = {
  exportJobId: string;
  userId: string;
  themeId: string;
  options: { mode: string; exportName: string; versionName?: string; applicationId?: string };
  manifest: ExportManifestItem[];
  files: AndroidBundleUploadFile[];
};

export class AndroidBuildEnqueueError extends BuildEnqueueError {
  constructor(code: string, message: string, detail?: string, options: { ambiguous?: boolean } = {}) {
    super(code, message, detail, options);
    this.name = "AndroidBuildEnqueueError";
  }
}

export async function enqueueAndroidBuild(
  bundle: AndroidBuildBundle,
  options: { attempt?: number; progress?: EnqueueBuildProgress } = {},
): Promise<BuilderRunResult> {
  try {
    return await enqueueBuild(bundle, { platform: "android", ...options });
  } catch (error) {
    if (error instanceof BuildEnqueueError) {
      throw new AndroidBuildEnqueueError(error.code, error.message, error.detail, { ambiguous: error.ambiguous });
    }
    throw error;
  }
}
