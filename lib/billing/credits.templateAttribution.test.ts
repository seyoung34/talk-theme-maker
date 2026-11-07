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

const source = "abcdef01-2345-6789-abcd-ef0123456789";
const direct = "abcdef03-2345-6789-abcd-ef0123456789";
const sourceRpcArgs = {
  p_user_id: "user", p_platform: "ios", p_export_mode: "ktheme", p_input_file_count: 1, p_input_bytes: 5,
  p_referenced_asset_bytes: 12, p_referenced_asset_file_count: 2, p_system_template_bundle_id: null, p_system_template_variant_id: null,
};
it("records the derived source through the new RPC only when one is given", async () => {
  rpc.mockResolvedValue({ data: [{ export_job_id: "job", balance: 9 }], error: null });
  await expect(reserveCreditForExport({ ...input, sourceSystemTemplateBundleId: source.toUpperCase() })).resolves.toEqual({ exportJobId: "job", balance: 9 });
  expect(rpc).toHaveBeenCalledTimes(1);
  expect(rpc).toHaveBeenCalledWith("reserve_export_credit_with_template_source", { ...sourceRpcArgs, p_source_system_template_bundle_id: source });
  rpc.mockClear();
  await reserveCreditForExport({ ...input, sourceSystemTemplateBundleId: "pastel-glass" });
  expect(rpc).toHaveBeenCalledWith("reserve_export_credit_with_template", sourceRpcArgs);
});
it("drops the derived source when a direct system template is also present", async () => {
  rpc.mockResolvedValue({ data: [{ export_job_id: "job", balance: 9 }], error: null });
  await reserveCreditForExport({ ...input, systemTemplateBundleId: direct, sourceSystemTemplateBundleId: source });
  expect(rpc).toHaveBeenCalledTimes(1);
  expect(rpc).toHaveBeenCalledWith("reserve_export_credit_with_template", expect.objectContaining({ p_system_template_bundle_id: direct }));
  expect(JSON.stringify(rpc.mock.calls)).not.toContain("p_source_system_template_bundle_id");
});
it.each(["PGRST202", "42883"])("falls back to the direct-use RPC once when the source RPC is missing (%s)", async (code) => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  rpc.mockResolvedValueOnce({ data: null, error: { code } }).mockResolvedValueOnce({ data: [{ export_job_id: "fallback-job", balance: 7 }], error: null });
  await expect(reserveCreditForExport({ ...input, sourceSystemTemplateBundleId: source })).resolves.toEqual({ exportJobId: "fallback-job", balance: 7 });
  expect(rpc).toHaveBeenCalledTimes(2);
  expect(rpc).toHaveBeenNthCalledWith(2, "reserve_export_credit_with_template", sourceRpcArgs);
  expect(warn).toHaveBeenCalledTimes(1);
});
it.each([{ code: "P0001", message: "insufficient_credits" }, { code: "P0001", message: "billing_hold" }, { code: "42501" }, { code: "", message: "Failed to fetch" }])("does not retry business or network errors from the source RPC: %j", async (error) => {
  rpc.mockResolvedValue({ data: null, error });
  await expect(reserveCreditForExport({ ...input, sourceSystemTemplateBundleId: source })).rejects.toBe(error);
  expect(rpc).toHaveBeenCalledTimes(1);
});
it("falls through to the legacy RPC only after both newer RPCs are missing and never charges twice on other errors", async () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  rpc.mockResolvedValueOnce({ data: null, error: { code: "PGRST202" } })
    .mockResolvedValueOnce({ data: null, error: { code: "PGRST202" } })
    .mockResolvedValueOnce({ data: [{ export_job_id: "legacy-job", balance: 6 }], error: null });
  await expect(reserveCreditForExport({ ...input, sourceSystemTemplateBundleId: source })).resolves.toEqual({ exportJobId: "legacy-job", balance: 6 });
  expect(rpc).toHaveBeenCalledTimes(3);
  expect(rpc).toHaveBeenNthCalledWith(3, "reserve_export_credit", expect.not.objectContaining({ p_source_system_template_bundle_id: expect.anything() }));
  expect(warn).toHaveBeenCalledTimes(2);
});
