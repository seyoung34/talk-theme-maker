// Extract ONLY public settings from the exact environment OpenNext built with.
import { writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
const { production } = await import(pathToFileURL(path.resolve('.open-next/cloudflare/next-env.mjs')).href);
const url = production.NEXT_PUBLIC_SUPABASE_URL;
const key = production.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
if (typeof url !== 'string' || new URL(url).protocol !== 'https:' || typeof key !== 'string' || !key.trim()) {
  throw new Error('Worker public Supabase configuration requires an HTTPS URL and nonempty publishable key');
}
await writeFile('.worker-public-config.mjs', `export const workerPublicConfig = ${JSON.stringify({
  NEXT_PUBLIC_SUPABASE_URL: url,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: key,
})};\n`);
