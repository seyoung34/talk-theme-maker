import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ reserve: vi.fn(), enqueueAndroid: vi.fn(), enqueueIos: vi.fn(), updateEnqueue: vi.fn() }));
vi.mock("@/lib/billing/credits", () => ({
  getCurrentUserOrNull: async () => ({ id: "user" }), reserveCreditForExport: mocks.reserve,
  prepareExportJobIdentity: async () => ({ applicationId: "com.kakao.talk.theme.u0123456789abcdef.e000001", themeIdentifier: "com.kakao.talk.theme.u0123456789abcdef.i000001", exportNumber: 1 }),
  markExportJobBackend: vi.fn(), updateExportJobStage: vi.fn(), updateExportJobEnqueueState: mocks.updateEnqueue,
  isBillingHoldError: () => false, isExportAlreadyInProgressError: () => false, isInsufficientCreditsError: () => false,
}));
vi.mock("@/lib/ops/dispatcher", () => ({ scheduleOpsEvent: vi.fn() }));
vi.mock("@/lib/theme/export/asyncExportStatus", () => ({ recoverStalePendingExportBeforeReservation: vi.fn() }));
vi.mock("@/lib/theme/export/asyncExportRoute", () => ({ settleFailedExportJob: vi.fn() }));
vi.mock("@/lib/theme/android/requestShared", () => ({ readAndroidBundleUpload: async () => ({ manifest: [], files: [], inputBytes: 0 }), AndroidExportRequestError: class extends Error {} }));
vi.mock("@/lib/theme/ios/requestShared", () => ({ readIosFormData: (request: Request) => request.formData(), readIosEntries: async () => ({ entries: [], inputBytes: 0 }), isIosExportMode: (value: string) => value === "ktheme" }));
vi.mock("@/lib/theme/ios/packageValidation", () => ({ validateExportName: () => "fixture", validateIosPackage: vi.fn(), IosExportRequestError: class extends Error {} }));
vi.mock("@/lib/theme/assetCatalog/workerResolve", () => ({ resolveCatalogManifestForExport: async () => ({ manifest: [], referencedAssetBytes: 0, referencedAssetFileCount: 0, uniqueReferencedAssetBytes: 0 }), CatalogExportResolutionError: class extends Error {} }));
vi.mock("@/lib/theme/android/buildJobClient", () => ({ enqueueAndroidBuild: mocks.enqueueAndroid, AndroidBuildEnqueueError: class extends Error { ambiguous = true; code = "job_run_failed"; } }));
vi.mock("@/lib/theme/ios/buildJobClient", () => ({ enqueueIosBuild: mocks.enqueueIos, IosBuildEnqueueError: class extends Error { ambiguous = true; code = "job_run_failed"; } }));
import { AndroidBuildEnqueueError } from "@/lib/theme/android/buildJobClient";
import { IosBuildEnqueueError } from "@/lib/theme/ios/buildJobClient";
import { POST as android } from "./android/route";
import { POST as ios } from "./ios/route";
const bundle = "abcdef01-2345-6789-abcd-ef0123456789";
const variant = "abcdef02-2345-6789-abcd-ef0123456789";
beforeEach(() => { vi.clearAllMocks(); mocks.reserve.mockResolvedValue({ exportJobId: "job", balance: 9 }); });
it.each([["android", android, mocks.enqueueAndroid], ["ios", ios, mocks.enqueueIos]] as const)("%s route records metadata without extending builder payload", async (platform, POST, enqueue) => {
  for (const valid of [true, false]) {
    const form = new FormData();
    form.set("manifest", "[]"); form.set("mode", platform === "android" ? "apk" : "ktheme");
    form.set("systemTemplateBundleId", valid ? bundle : "invalid"); form.set("systemTemplateVariantId", variant);
    const response = await POST(new Request(`https://local.invalid/api/export/${platform}`, { method: "POST", body: form }));
    expect(response.status).toBe(202);
    expect(mocks.reserve).toHaveBeenLastCalledWith(expect.objectContaining({ systemTemplateBundleId: valid ? bundle : null, systemTemplateVariantId: valid ? variant : null }));
    const builderRequest = enqueue.mock.calls.at(-1)?.[0];
    expect(builderRequest).toBeDefined();
    expect(JSON.stringify(builderRequest)).not.toContain(bundle);
    expect(JSON.stringify(builderRequest)).not.toContain("systemTemplate");
  }
});

it.each([["android", android, mocks.enqueueAndroid, AndroidBuildEnqueueError], ["ios", ios, mocks.enqueueIos, IosBuildEnqueueError]] as const)("%s ambiguous state write failure names database", async (platform, POST, enqueue, ErrorClass) => {
  enqueue.mockRejectedValueOnce(new ErrorClass("job_run_failed", "private-token"));
  mocks.updateEnqueue.mockImplementation(async (input) => {
    if (input.state === "trigger_ambiguous") throw new Error("private-database-error");
  });
  const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
  const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  try {
    const form = new FormData();
    form.set("manifest", "[]");
    form.set("mode", platform === "android" ? "apk" : "ktheme");
    const response = await POST(new Request(`https://local.invalid/api/export/${platform}`, { method: "POST", body: form }));
    expect(response.status).toBe(202);
    expect(log.mock.calls[0][0]).toMatchObject({ stage: "jobs_enqueue", dependency: "database", errorCode: "jobs_enqueue_failed" });
    expect(JSON.stringify(log.mock.calls)).not.toContain("private");
  } finally {
    log.mockRestore();
    warn.mockRestore();
    mocks.updateEnqueue.mockReset();
  }
});
