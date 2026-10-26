// Extract ONLY public settings from the exact environment Next built with.
// Use Next's own @next/env loader: process.env wins, then .env files in Next's
// order with the same ${VAR} expansion. OpenNext's next-env.mjs holds only
// env-file values (empty in Workers Builds), so it is not a faithful source.
import { writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { loadEnvConfig } = require(require.resolve('@next/env', { paths: [require.resolve('next/package.json')] }));
// `next build` defaults NODE_ENV to production before loading env files.
process.env.NODE_ENV ||= 'production';
const { combinedEnv } = loadEnvConfig(process.cwd(), false, { info() {}, error: console.error });
const url = combinedEnv.NEXT_PUBLIC_SUPABASE_URL;
const key = combinedEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
if (typeof url !== 'string' || !URL.canParse(url) || new URL(url).protocol !== 'https:' || typeof key !== 'string' || !key.trim()) {
  throw new Error('Worker public Supabase configuration requires an HTTPS URL and nonempty publishable key');
}
await writeFile('.worker-public-config.mjs', `export const workerPublicConfig = ${JSON.stringify({
  NEXT_PUBLIC_SUPABASE_URL: url,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: key,
})};\n`);
