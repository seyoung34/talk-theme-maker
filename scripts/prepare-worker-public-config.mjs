// Extract ONLY public settings from the exact environment Next built with.
// Next inlines NEXT_PUBLIC_* from process.env first and falls back to .env files;
// OpenNext's next-env.mjs holds only the .env file values (empty in Workers Builds).
import { writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
const { production } = await import(pathToFileURL(path.resolve('.open-next/cloudflare/next-env.mjs')).href);
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? production.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? production.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
if (typeof url !== 'string' || new URL(url).protocol !== 'https:' || typeof key !== 'string' || !key.trim()) {
  throw new Error('Worker public Supabase configuration requires an HTTPS URL and nonempty publishable key');
}
await writeFile('.worker-public-config.mjs', `export const workerPublicConfig = ${JSON.stringify({
  NEXT_PUBLIC_SUPABASE_URL: url,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: key,
})};\n`);
