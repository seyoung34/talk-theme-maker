// Materialize only approved SSG entries for plain `wrangler dev` and Builds.
// OpenNext preview/deploy also populates these assets; no remote resources used.
import { readFile, mkdir, copyFile } from 'node:fs/promises';
import path from 'node:path';
import { policyCachePaths } from '../lib/cloudflare/policyCachePaths.mjs';

const buildId = (await readFile('.next/BUILD_ID', 'utf8')).trim();
if (!/^[\w-]+$/.test(buildId)) throw new Error('Invalid Next build ID');
const manifest = JSON.parse(await readFile('.next/prerender-manifest.json', 'utf8'));
const target = path.join('.open-next/assets/cdn-cgi/_next_cache', buildId);
await mkdir(target, { recursive: true });
for (const route of policyCachePaths) {
  const filename = `${route.slice(1)}.cache`;
  const source = path.join('.open-next/cache', buildId, filename);
  const entry = JSON.parse(await readFile(source, 'utf8'));
  if (manifest.routes[route]?.initialRevalidateSeconds !== false ||
      entry.type !== 'app' || typeof entry.html !== 'string' || typeof entry.rsc !== 'string') {
    throw new Error(`${route} must remain a build-time HTML/RSC app page`);
  }
  await copyFile(source, path.join(target, filename));
}
console.log(`Prepared static incremental cache: ${policyCachePaths.join(', ')}`);
