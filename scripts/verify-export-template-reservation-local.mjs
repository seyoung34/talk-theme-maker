import { execFileSync } from "node:child_process";
import { createHmac } from "node:crypto";
// Local stack only, no .env.local, linked-project URL, or production credentials.
const config = JSON.parse(execFileSync(process.platform === "win32" ? "npx.cmd" : "npx", ["supabase", "status", "-o", "json"], { encoding: "utf8", shell: process.platform === "win32" }));
const sql = (input) => execFileSync("docker", ["exec", "-i", "supabase_db_kakaotalk-theme-maker", "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1", "-tA"], { input, encoding: "utf8" });
const user = "00000000-0000-0000-0000-000000000003";
const bundle = "abcdef01-2345-6789-abcd-ef0123456789";
const variant = "abcdef02-2345-6789-abcd-ef0123456789";
const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
const unsigned = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ role: "authenticated", sub: user, exp: Math.floor(Date.now() / 1000) + 300 })}`;
const authenticated = `${unsigned}.${createHmac("sha256", config.JWT_SECRET).update(unsigned).digest("base64url")}`;
sql(`insert into auth.users (id,email) values ('${user}', 'reservation-rest-fixture@local.invalid'); update public.credit_balances set balance = 10 where user_id = '${user}';`);
try {
  for (const [role, token, allowed] of [["anon", config.ANON_KEY, false], ["authenticated", authenticated, false], ["service_role", config.SERVICE_ROLE_KEY, true]]) {
    const response = await fetch("http://127.0.0.1:54321/rest/v1/rpc/reserve_export_credit_with_template", {
      method: "POST", headers: { apikey: config.ANON_KEY, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ p_user_id: user, p_platform: "android", p_export_mode: "apk", p_input_file_count: 0, p_input_bytes: 0, p_system_template_bundle_id: bundle, p_system_template_variant_id: variant }),
    });
    if (allowed ? !response.ok : ![401, 403, 404].includes(response.status)) throw new Error(`${role}: unexpected HTTP ${response.status}`);
    if (allowed) {
      const result = await response.json();
      if (result[0]?.balance !== 9) throw new Error("reservation balance mismatch");
      const stored = sql(`select system_template_bundle_id::text || '|' || system_template_variant_id::text from public.export_jobs where user_id = '${user}';`).trim();
      if (stored !== `${bundle}|${variant}`) throw new Error("stored attribution mismatch");
    }
    console.log(`${role}: HTTP ${response.status} (${allowed ? "allowed, attribution stored, one credit reserved" : "denied"})`);
  }
} finally {
  sql(`delete from auth.users where id = '${user}';`);
}
