import { execFileSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { expect, it, vi } from "vitest";
const { getAdmin } = vi.hoisted(() => ({ getAdmin: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createAdminClient: getAdmin }));
import { reserveCreditForExport } from "../lib/billing/credits";

// Explicit opt-in; only fixed localhost and the known local Docker container are reachable.
// Drops the new LOCAL RPC. Run `npx supabase db reset --local` after this test to restore it.
it.skipIf(process.env.RUN_LOCAL_EXPORT_FALLBACK !== "1")("reserves once through legacy RPC when the local template RPC is missing", async () => {
  const config = JSON.parse(execFileSync(process.platform === "win32" ? "npx.cmd" : "npx", ["supabase", "status", "-o", "json"], { encoding: "utf8", shell: process.platform === "win32" }));
  const sql = (input: string) => execFileSync("docker", ["exec", "-i", "supabase_db_kakaotalk-theme-maker", "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1", "-tA"], { input, encoding: "utf8" });
  const admin = createClient("http://127.0.0.1:54321", config.SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  getAdmin.mockReturnValue(admin);
  const user = "00000000-0000-0000-0000-000000000004";
  sql(`insert into auth.users (id,email) values ('${user}', 'fallback-fixture@local.invalid'); update public.credit_balances set balance = 10 where user_id = '${user}'; drop function public.reserve_export_credit_with_template(uuid,text,text,integer,bigint,bigint,integer,text,text); notify pgrst, 'reload schema';`);
  try {
    const args = { p_user_id: user, p_platform: "ios", p_export_mode: "ktheme", p_input_file_count: 0, p_input_bytes: 0, p_referenced_asset_bytes: 0, p_referenced_asset_file_count: 0, p_system_template_bundle_id: null, p_system_template_variant_id: null };
    const missing = await admin.rpc("reserve_export_credit_with_template", args);
    expect(["PGRST202", "42883"]).toContain(missing.error?.code);
    process.stdout.write(`Local supabase-js missing RPC error.code: ${missing.error?.code}\n`);
    const result = await reserveCreditForExport({ userId: user, platform: "ios", mode: "ktheme", inputFileCount: 0, inputBytes: 0, systemTemplateBundleId: "abcdef01-2345-6789-abcd-ef0123456789" });
    expect(result.balance).toBe(9);
    const stored = sql(`select count(*) || '|' || count(system_template_bundle_id) from public.export_jobs where user_id = '${user}'; select balance from public.credit_balances where user_id = '${user}'; select count(*) from public.credit_ledger where user_id = '${user}' and reason = 'export_credit_reserved';`).trim().split(/\r?\n/);
    expect(stored).toEqual(["1|0", "9", "1"]);
    process.stdout.write("Local fallback: one job, null attribution, balance 9, one reservation ledger entry.\n");
  } finally {
    sql(`delete from auth.users where id = '${user}';`);
  }
}, 30_000);
