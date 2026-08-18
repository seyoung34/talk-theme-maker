import type { AndroidBundleUploadFile, AndroidExportManifestItem } from "@/lib/theme/android/requestShared";
import {
  BuildEnqueueError,
  enqueueBuild,
  getBuilderAccessToken,
  readBuilderConfig,
  type BuilderConfig,
} from "@/lib/theme/export/buildJobClient";

export type AndroidBuildBundle = {
  exportJobId: string;
  userId: string;
  themeId: string;
  options: { mode: string; exportName: string; versionName?: string; applicationId?: string };
  manifest: AndroidExportManifestItem[];
  files: AndroidBundleUploadFile[];
};

export { getBuilderAccessToken, readBuilderConfig };
export type { BuilderConfig };

export class AndroidBuildEnqueueError extends BuildEnqueueError {
  constructor(code: string, message: string) {
    super(code, message);
    this.name = "AndroidBuildEnqueueError";
  }
}

export function isAsyncAndroidExportEnabled() {
  return process.env.ANDROID_EXPORT_ASYNC === "1" || process.env.ANDROID_EXPORT_ASYNC === "true";
}

export async function enqueueAndroidBuild(bundle: AndroidBuildBundle) {
  try {
    await enqueueBuild(bundle);
  } catch (error) {
    if (error instanceof BuildEnqueueError) throw new AndroidBuildEnqueueError(error.code, error.message);
    throw error;
  }
}
