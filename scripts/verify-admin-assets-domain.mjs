import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import ts from "typescript";

const compilerOptions = {
  module: ts.ModuleKind.CommonJS,
  target: ts.ScriptTarget.ES2022,
};
const moduleCache = new Map();

async function loadTsModule(path, fileName) {
  const cached = moduleCache.get(fileName);
  if (cached) return cached.exports;
  const source = await readFile(path, "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions, fileName });
  const module = { exports: {} };
  moduleCache.set(fileName, module);
  const sandbox = {
    Blob,
    File: globalThis.File,
    URLSearchParams,
    crypto,
    fetch,
    module,
    exports: module.exports,
    require: (id) => {
      if (id === "@/lib/theme/adminAssetDomain") {
        const loaded = moduleCache.get("adminAssetDomain.ts");
        if (loaded) return loaded.exports;
        throw new Error("adminAssetDomain.ts must be loaded before adminAssets.ts");
      }
      if (id === "@/lib/theme/bubbleGeometry") {
        const loaded = moduleCache.get("bubbleGeometry.ts");
        if (loaded) return loaded.exports;
        throw new Error("bubbleGeometry.ts must be loaded before adminAssetDomain.ts");
      }
    if (id === "@/lib/supabase/client") return { createClient: () => ({}) };
    if (id === "@/lib/shared/api/http") return { readJsonResponse: async (response) => response.json() };
    if (id === "@/lib/theme/remoteAssets") {
      return {
        getThemeAssetSignedUrls: async () => ({}),
        sanitizeStoragePathPart: (value) => value,
        storagePathToFile: async () => {
          throw new Error("storagePathToFile should not be used by this verification");
        },
        storagePathToPreviewUrl: async (path) => `signed:${path}`,
        themeAssetsBucketName: "theme-assets",
      };
    }
    throw new Error(`Unexpected import: ${id}`);
    },
  };

  vm.runInNewContext(compiled.outputText, sandbox, { filename: fileName.replace(".ts", ".cjs") });
  return module.exports;
}

await loadTsModule(new URL("../lib/theme/bubbleGeometry.ts", import.meta.url), "bubbleGeometry.ts");
await loadTsModule(new URL("../lib/theme/adminAssetDomain.ts", import.meta.url), "adminAssetDomain.ts");
const exports = await loadTsModule(new URL("../lib/theme/adminAssets.ts", import.meta.url), "adminAssets.ts");

const {
  assertValidAdminAssetCandidateInput,
  canonicalAdminAssetToCandidate,
  mapCanonicalAdminAssetRow,
} = exports;

assert.equal(typeof mapCanonicalAdminAssetRow, "function", "Given canonical DB rows, When loading adminAssets.ts, Then canonical row mapper is exported");
assert.equal(typeof canonicalAdminAssetToCandidate, "function", "Given canonical assets, When loading adminAssets.ts, Then compatibility adapter is exported");
assert.equal(typeof assertValidAdminAssetCandidateInput, "function", "Given user input, When loading adminAssets.ts, Then boundary validator is exported");

const row = {
  id: "asset-1",
  asset_kind: "bubble",
  analysis: { width: 20, height: 10, aspectRatio: 2, transparentPixelRatio: 0.2, shapes: ["ninepatch"] },
  title: "  Bubble asset  ",
  note: null,
  tags: ["chat"],
  file_name: "bubble.9.png",
  mime_type: "image/png",
  storage_path: "admin-assets/asset-1/bubble.9.png",
  enabled: true,
  created_at: "2026-06-30T00:00:00.000Z",
  updated_at: "2026-06-30T00:01:00.000Z",
  admin_asset_targets: [
    { id: "target-1", asset_id: "asset-1", platform: "android", slot_role: "bubble_me_1", target_kind: "exact_role", priority: 10, enabled: true },
    { id: "target-2", asset_id: "asset-1", platform: "ios", slot_role: "bubble_me_1", target_kind: "exact_role", priority: 9, enabled: true },
  ],
  admin_asset_bubble_specs: {
    asset_id: "asset-1",
    android_markers: {
      top: { start: 1, end: 2 },
      left: { start: 1, end: 2 },
      right: { start: 18, end: 19 },
      bottom: { start: 8, end: 9 },
    },
    ios_insets: { top: 4, right: 5, bottom: 6, left: 7 },
    ios_stretch: { x: 8, y: 9 },
    geometry: {
      android: { stretch: { x: 8, y: 9 }, contentInsets: { top: 2, right: 3, bottom: 4, left: 5 } },
      ios: { stretch: { x: 8, y: 9 }, contentInsets: { top: 4, right: 5, bottom: 6, left: 7 } },
    },
  },
};

const canonical = mapCanonicalAdminAssetRow(row);
assert.equal(canonical.title, "Bubble asset", "Given a canonical DB row, When mapping it, Then title is normalized");
assert.equal(canonical.targets.length, 2, "Given a canonical DB row, When mapping it, Then target rows are preserved");
assert.deepEqual(structuredClone(canonical.bubbleSpec?.iosStretch), { x: 8, y: 9 }, "Given a bubble spec row, When mapping it, Then iOS stretch is parsed");
assert.deepEqual(structuredClone(canonical.bubbleSpec?.geometry?.ios), {
  stretch: { x: 8, y: 9 },
  contentInsets: { top: 4, right: 5, bottom: 6, left: 7 },
}, "Given a bubble spec row, When mapping it, Then common iOS geometry is parsed");

const candidate = canonicalAdminAssetToCandidate(canonical, "signed:preview");
assert.equal(candidate.id, "asset-1", "Given a canonical asset, When adapting it, Then id is preserved");
assert.equal(candidate.slotRole, "bubble_me_1", "Given exact targets, When adapting it, Then representative slot role is preserved");
assert.equal(candidate.platform, "android", "Given targets, When adapting it, Then representative platform is preserved");
assert.deepEqual(structuredClone(candidate.bubbleAdjustment), {
  markers: row.admin_asset_bubble_specs.android_markers,
  insets: row.admin_asset_bubble_specs.ios_insets,
  stretch: row.admin_asset_bubble_specs.ios_stretch,
}, "Given a canonical bubble spec, When adapting it, Then bubbleAdjustment keeps legacy shape");

assert.throws(
  () =>
    mapCanonicalAdminAssetRow({
      ...row,
      admin_asset_bubble_specs: {
        ...row.admin_asset_bubble_specs,
        ios_stretch: { x: 8 },
      },
    }),
  /INVALID_BUBBLE_SPEC/,
  "Given a malformed bubble spec, When mapping it, Then it is rejected before consumers see it",
);

assert.throws(
  () =>
    assertValidAdminAssetCandidateInput({
      slotRole: "bubble_me_1",
      platform: "android",
      assetKind: "bubble",
      title: " ",
      tags: [],
      fileName: "bubble.9.png",
      mimeType: "image/png",
      blob: new Blob(["x"], { type: "image/png" }),
      bubbleSpec: row.admin_asset_bubble_specs,
    }),
  /INVALID_ASSET_TITLE/,
  "Given missing title input, When validating before save, Then DB write is blocked",
);

console.log("admin asset domain assertions passed");
