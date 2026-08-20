import type { AndroidBundleUploadFile } from "@/lib/theme/android/requestShared";
import {
  BuildEnqueueError,
  enqueueBuild,
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
  constructor(code: string, message: string, detail?: string) {
    super(code, message, detail);
    this.name = "AndroidBuildEnqueueError";
  }
}

export async function enqueueAndroidBuild(bundle: AndroidBuildBundle) {
  try {
    await enqueueBuild(bundle, { platform: "android" });
  } catch (error) {
    if (error instanceof BuildEnqueueError) throw new AndroidBuildEnqueueError(error.code, error.message, error.detail);
    throw error;
  }
}
