import { beforeEach, expect, it, vi } from "vitest";
const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createAdminClient: () => ({ rpc }) }));
import { reserveCreditForExport } from "./credits";
beforeEach(() => { rpc.mockReset(); vi.restoreAllMocks(); });
it("sends sanitized attribution only to the reservation RPC", async () => {
  rpc.mockResolvedValue({ data: [{ export_job_id: "job", balance: 9 }], error: null });
  await expect(reserveCreditForExport({ userId: "user", platform: "ios", mode: "ktheme", inputFileCount: 1, inputBytes: 5, systemTemplateBundleId: "invalid", systemTemplateVariantId: "abcdef02-2345-6789-abcd-ef0123456789" })).resolves.toEqual({ exportJobId: "job", balance: 9 });
  expect(rpc).toHaveBeenCalledWith("reserve_export_credit_with_template", {
    p_user_id: "user", p_platform: "ios", p_export_mode: "ktheme", p_input_file_count: 1, p_input_bytes: 5,
    p_referenced_asset_bytes: 0, p_referenced_asset_file_count: 0, p_system_template_bundle_id: null, p_system_template_variant_id: null,
  });
  expect(rpc).toHaveBeenCalledTimes(1);
});
const input = { userId: "user", platform: "ios", mode: "ktheme", inputFileCount: 1, inputBytes: 5, referencedAssetBytes: 12, referencedAssetFileCount: 2 } as const;
it.each(["PGRST202", "42883"])("falls back once for missing function %s", async (code) => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  rpc.mockResolvedValueOnce({ data: null, error: { code } }).mockResolvedValueOnce({ data: [{ export_job_id: "legacy-job", balance: 8 }], error: null });
  await expect(reserveCreditForExport(input)).resolves.toEqual({ exportJobId: "legacy-job", balance: 8 });
  expect(rpc).toHaveBeenCalledTimes(2);
  expect(rpc).toHaveBeenNthCalledWith(2, "reserve_export_credit", {
    p_user_id: "user", p_platform: "ios", p_export_mode: "ktheme", p_input_file_count: 1, p_input_bytes: 5, p_referenced_asset_bytes: 12, p_referenced_asset_file_count: 2,
  });
  expect(warn).toHaveBeenCalledTimes(1);
  expect(warn.mock.calls[0]).toEqual(["Template reservation RPC unavailable; using legacy reservation without attribution."]);
});
it.each([{ code: "P0001", message: "insufficient_credits" }, { code: "P0001", message: "billing_hold" }, { code: "42501" }, { code: "", message: "Failed to fetch" }])("does not retry other errors: %j", async (error) => {
  rpc.mockResolvedValue({ data: null, error });
  await expect(reserveCreditForExport(input)).rejects.toBe(error);
  expect(rpc).toHaveBeenCalledTimes(1);
});
it("does not retry a thrown network error or a failing legacy reservation", async () => {
  const error = new Error("network");
  rpc.mockRejectedValueOnce(error);
  await expect(reserveCreditForExport(input)).rejects.toBe(error);
  expect(rpc).toHaveBeenCalledTimes(1);
  rpc.mockReset().mockResolvedValueOnce({ data: null, error: { code: "PGRST202" } }).mockResolvedValueOnce({ data: null, error });
  await expect(reserveCreditForExport(input)).rejects.toBe(error);
  expect(rpc).toHaveBeenCalledTimes(2);
});
