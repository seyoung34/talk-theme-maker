// Materialize only the approved SSG entry for plain `wrangler dev` and Builds.
// OpenNext preview/deploy also populates these assets; no remote resources used.
import { readFile, mkdir, copyFile } from 'node:fs/promises';
import path from 'node:path';

const buildId = (await readFile('.next/BUILD_ID', 'utf8')).trim();
if (!/^[\w-]+$/.test(buildId)) throw new Error('Invalid Next build ID');
const source = path.join('.open-next/cache', buildId, 'privacy.cache');
const entry = JSON.parse(await readFile(source, 'utf8'));
const manifest = JSON.parse(await readFile('.next/prerender-manifest.json', 'utf8'));
if (manifest.routes['/privacy']?.initialRevalidateSeconds !== false ||
    entry.type !== 'app' || typeof entry.html !== 'string' || typeof entry.rsc !== 'string') {
  throw new Error('Privacy must remain a build-time HTML/RSC app page');
}
const target = path.join('.open-next/assets/cdn-cgi/_next_cache', buildId);
await mkdir(target, { recursive: true });
await copyFile(source, path.join(target, 'privacy.cache'));
console.log('Prepared /privacy static incremental cache');
