import { execFileSync } from "node:child_process";
import { createHmac } from "node:crypto";
// Local stack only. Never reads .env.local or a linked-project URL/key.
const config = JSON.parse(execFileSync(process.platform === "win32" ? "npx.cmd" : "npx", ["supabase", "status", "-o", "json"], { encoding: "utf8", shell: process.platform === "win32" }));
const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
const unsigned = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ role: "authenticated", sub: "00000000-0000-0000-0000-000000000001", exp: Math.floor(Date.now() / 1000) + 300 })}`;
const authenticated = `${unsigned}.${createHmac("sha256", config.JWT_SECRET).update(unsigned).digest("base64url")}`;
for (const [role, token, allowed] of [["anon", config.ANON_KEY, false], ["authenticated", authenticated, false], ["service_role", config.SERVICE_ROLE_KEY, true]]) {
  const response = await fetch("http://127.0.0.1:54321/rest/v1/rpc/admin_export_diagnostics", {
    method: "POST", headers: { apikey: config.ANON_KEY, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ p_start: "2026-10-01T00:00:00Z", p_end: "2026-10-02T00:00:00Z" }),
  });
  if (allowed ? !response.ok : ![401, 403, 404].includes(response.status)) throw new Error(`${role}: unexpected HTTP ${response.status}`);
  console.log(`${role}: HTTP ${response.status} (${allowed ? "allowed" : "denied"})`);
}
