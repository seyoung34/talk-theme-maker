import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST as cancelAndroidExport } from "@/app/api/export/android/cancel/route";
import { POST as cancelIosExport } from "@/app/api/export/ios/cancel/route";

const mocks = vi.hoisted(() => ({
  cancelExportJob: vi.fn(),
  getCurrentUserOrNull: vi.fn(),
}));

vi.mock("@/lib/billing/credits", () => ({
  cancelExportJob: mocks.cancelExportJob,
  getCurrentUserOrNull: mocks.getCurrentUserOrNull,
}));

const exportJobId = "8c7202d6-8c50-44e4-936d-c12bfba9f1d8";

function cancellationRequest() {
  return new Request("https://talktheme.test/api/export/cancel", {
    method: "POST",
    body: JSON.stringify({ exportJobId }),
  });
}

beforeEach(() => {
  mocks.cancelExportJob.mockReset().mockResolvedValue({ transitioned: true, status: "failed", balance: 3 });
  mocks.getCurrentUserOrNull.mockReset().mockResolvedValue({ id: "user-1" });
});

describe.each([
  ["Android", cancelAndroidExport],
  ["iOS", cancelIosExport],
])("%s export cancellation route", (_platform, POST) => {
  it("returns the client cancellation flag after refunding a pending export", async () => {
    const response = await POST(cancellationRequest());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      status: "cancelled",
      cancelled: true,
      refunded: true,
      balance: 3,
    });
  });
});
