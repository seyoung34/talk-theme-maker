import { expect, it, vi } from "vitest";
const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createAdminClient: () => ({ rpc }) }));
import { reserveCreditForExport } from "./credits";
it("sends sanitized attribution only to the reservation RPC", async () => {
  rpc.mockResolvedValue({ data: [{ export_job_id: "job", balance: 9 }], error: null });
  await expect(reserveCreditForExport({ userId: "user", platform: "ios", mode: "ktheme", inputFileCount: 1, inputBytes: 5, systemTemplateBundleId: "invalid", systemTemplateVariantId: "abcdef02-2345-6789-abcd-ef0123456789" })).resolves.toEqual({ exportJobId: "job", balance: 9 });
  expect(rpc).toHaveBeenCalledWith("reserve_export_credit_with_template", {
    p_user_id: "user", p_platform: "ios", p_export_mode: "ktheme", p_input_file_count: 1, p_input_bytes: 5,
    p_referenced_asset_bytes: 0, p_referenced_asset_file_count: 0, p_system_template_bundle_id: null, p_system_template_variant_id: null,
  });
});
