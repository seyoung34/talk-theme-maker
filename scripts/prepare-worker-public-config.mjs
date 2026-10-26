// Extract ONLY public settings from the exact environment Next built with.
// Use Next's own @next/env loader: process.env wins, then .env files in Next's
// order with the same ${VAR} expansion. OpenNext's next-env.mjs holds only
// env-file values (empty in Workers Builds), so it is not a faithful source.
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
const require = createRequire(import.meta.url);
const { loadEnvConfig } = require(require.resolve('@next/env', { paths: [require.resolve('next/package.json')] }));
// Mirror what `next build` (bin/next) and OpenNext (setStandaloneBuildMode) set
// before Next loads env files, so ${VAR} expansion sees the same inputs.
process.env.NODE_ENV ||= 'production';
process.env.NEXT_RUNTIME = 'nodejs';
process.env.NEXT_PRIVATE_STANDALONE = 'true';
process.env.NEXT_PRIVATE_OUTPUT_TRACE_ROOT ??= process.cwd();
const { combinedEnv } = loadEnvConfig(process.cwd(), false, { info() {}, error: console.error });
const url = combinedEnv.NEXT_PUBLIC_SUPABASE_URL;
const key = combinedEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const siteUrl = combinedEnv.NEXT_PUBLIC_SITE_URL;
// HTTPS as for Supabase, except local site links used by cf:build previews.
// Unlike the Supabase credential endpoint this URL is only a link destination.
// Workers Builds (including preview branches) must never accept that exception.
const parsedSiteUrl = typeof siteUrl === 'string' && URL.canParse(siteUrl) ? new URL(siteUrl) : undefined;
const localSite = !process.env.WORKERS_CI && parsedSiteUrl?.protocol === 'http:' &&
  ['localhost', '127.0.0.1', '[::1]'].includes(parsedSiteUrl.hostname);
if (!parsedSiteUrl || (parsedSiteUrl.protocol !== 'https:' && !localSite)) {
  throw new Error('Worker public site configuration requires an HTTPS NEXT_PUBLIC_SITE_URL');
}
if (typeof url !== 'string' || !URL.canParse(url) || new URL(url).protocol !== 'https:' || typeof key !== 'string' || !key.trim()) {
  throw new Error('Worker public Supabase configuration requires an HTTPS URL and nonempty publishable key');
}
// Final guard: the browser bundle must contain these exact literals, i.e. the
// values Next actually inlined. Any loader drift fails the build here.
async function inlinedInBundle(directory, values) {
  const pending = new Set(values.map(value => JSON.stringify(value)));
  const walk = async dir => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(file);
      else if (file.endsWith('.js') || file.endsWith('.mjs')) {
        const source = await readFile(file, 'utf8');
        for (const literal of pending) if (source.includes(literal)) pending.delete(literal);
      }
      if (!pending.size) return;
    }
  };
  await walk(path.resolve(directory));
  return !pending.size;
}
if (!(await inlinedInBundle('.open-next/assets/_next/static', [url, key]))) {
  throw new Error('Worker public Supabase configuration does not match the values Next inlined in the client bundle');
}
// SITE_URL is server-only in this app; Next does not promise a client literal.
// Verify against Next's compiled server output before copying it to the fast path.
if (!(await inlinedInBundle('.open-next/server-functions', [siteUrl]))) {
  throw new Error('Worker public site configuration does not match the value Next inlined in the server bundle');
}
await writeFile('.worker-public-config.mjs', `export const workerPublicConfig = ${JSON.stringify({
  NEXT_PUBLIC_SUPABASE_URL: url,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: key,
  NEXT_PUBLIC_SITE_URL: siteUrl,
})};\n`);
