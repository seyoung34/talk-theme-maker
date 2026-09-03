import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolveExportStatus } from "@/lib/theme/export/asyncExportStatus";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  maybeSingle: vi.fn(),
  completeExportJob: vi.fn(),
  failExportJob: vi.fn(),
  failExportJobIfPending: vi.fn(),
  getBuilderAccessToken: vi.fn(),
  readBuilderConfig: vi.fn(),
  scheduleOpsEvent: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createAdminClient: () => ({ from: mocks.from }),
}));
vi.mock("@/lib/billing/credits", () => ({
  completeExportJob: mocks.completeExportJob,
  failExportJob: mocks.failExportJob,
  failExportJobIfPending: mocks.failExportJobIfPending,
}));
vi.mock("@/lib/theme/export/buildJobClient", () => ({
  getBuilderAccessToken: mocks.getBuilderAccessToken,
  readBuilderConfig: mocks.readBuilderConfig,
}));
vi.mock("@/lib/ops/dispatcher", () => ({ scheduleOpsEvent: mocks.scheduleOpsEvent }));

describe("resolveExportStatus watchdog transition", () => {
  beforeEach(() => {
    for (const mock of Object.values(mocks)) mock.mockReset();
    const query = { select: vi.fn(), eq: vi.fn(), maybeSingle: mocks.maybeSingle };
    query.select.mockReturnValue(query);
    query.eq.mockReturnValue(query);
    mocks.from.mockReturnValue(query);
    mocks.readBuilderConfig.mockReturnValue({
      outputBucket: "output-bucket",
      builderServiceAccount: "builder@example.iam.gserviceaccount.com",
    });
    mocks.getBuilderAccessToken.mockResolvedValue("builder-token");
    vi.stubEnv("ANDROID_EXPORT_WATCHDOG_MS", "1");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  function pendingRow() {
    return {
      id: "job-1",
      user_id: "user-1",
      platform: "android",
      status: "pending",
      stage: "building",
      file_name: null,
      error: null,
      error_code: null,
      created_at: new Date(Date.now() - 10_000).toISOString(),
    };
  }

  it("shows a concurrently completed job without sending a watchdog alert", async () => {
    mocks.maybeSingle
      .mockResolvedValueOnce({ data: pendingRow(), error: null })
      .mockResolvedValueOnce({
        data: { ...pendingRow(), status: "succeeded", file_name: "theme.apk" },
        error: null,
      });
    mocks.failExportJobIfPending.mockResolvedValue({ transitioned: false, status: "succeeded", balance: 0 });
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes("/storage/v1/")) return new Response(null, { status: 404 });
      return new Response(JSON.stringify({ signedBlob: btoa("signature") }), { status: 200 });
    }));

    const result = await resolveExportStatus("user-1", "job-1", "android");

    expect(result.kind).toBe("completed");
    expect(mocks.scheduleOpsEvent).not.toHaveBeenCalled();
  });

  it("sends the watchdog alert only when this call wins the failure transition", async () => {
    mocks.maybeSingle.mockResolvedValueOnce({ data: pendingRow(), error: null });
    mocks.failExportJobIfPending.mockResolvedValue({ transitioned: true, status: "failed", balance: 0 });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 404 })));

    const result = await resolveExportStatus("user-1", "job-1", "android");

    expect(result).toMatchObject({ kind: "failed", reason: "build_watchdog_timeout" });
    expect(mocks.scheduleOpsEvent).toHaveBeenCalledOnce();
    expect(mocks.scheduleOpsEvent.mock.calls[0][0]).toMatchObject({ type: "export.watchdog_timeout" });
  });
});
