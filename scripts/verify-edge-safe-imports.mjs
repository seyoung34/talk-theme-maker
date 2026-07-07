import fs from "node:fs";
import path from "node:path";
import module from "node:module";

const root = process.cwd();
const forbiddenNodeModules = new Set([
  "child_process",
  "cluster",
  "dgram",
  "dns",
  "fs",
  "http2",
  "net",
  "os",
  "readline",
  "repl",
  "tls",
  "tty",
  "v8",
  "vm",
  "worker_threads",
]);
const builtins = new Set(module.builtinModules.map((name) => name.replace(/^node:/, "")));

const entries = [
  "app/api/export/android/route.ts",
  "app/api/export/android/status/route.ts",
  "app/api/billing",
  "app/api/theme-assets",
  "app/api/admin",
  "app/api/me",
  "app/api/session",
  "middleware.ts",
  "lib/supabase/middleware.ts",
];

const visited = new Set();
const violations = [];

const deferredEntries = new Map([
  ["app/api/export/ios/route.ts", "CF-2 replaces public template asset disk reads"],
]);

for (const entry of entries.flatMap(expandEntry)) {
  walk(entry, []);
}

for (const [entry, reason] of deferredEntries) {
  const entryPath = path.join(root, entry);
  if (fs.existsSync(entryPath)) {
    console.warn(`Skipping deferred edge import check for ${entry}: ${reason}.`);
  }
}

if (violations.length) {
  throw new Error(`Edge-safe import verification failed:\n${violations.map(formatViolation).join("\n")}`);
}

console.log(`Edge-safe import verification passed (${visited.size} modules checked).`);

function walk(filePath, stack) {
  const absolutePath = resolveFile(filePath);
  if (!absolutePath || visited.has(absolutePath)) return;
  visited.add(absolutePath);

  const source = fs.readFileSync(absolutePath, "utf8");
  for (const imported of findRuntimeImports(source)) {
    const builtinName = getBuiltinName(imported);
    if (builtinName) {
      if (forbiddenNodeModules.has(builtinName)) {
        violations.push({ imported, file: absolutePath, stack });
      }
      continue;
    }

    const resolved = resolveProjectImport(imported, path.dirname(absolutePath));
    if (resolved) walk(resolved, [...stack, absolutePath]);
  }
}

function findRuntimeImports(source) {
  const imports = [];
  const patterns = [
    /\bimport\s+(?!type\b)(?:[^'"]*?\s+from\s+)?["']([^"']+)["']/g,
    /\bexport\s+(?!type\b)(?:[^'"]*?\s+from\s+)["']([^"']+)["']/g,
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
  ];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) imports.push(match[1]);
  }
  return imports;
}

function getBuiltinName(specifier) {
  const normalized = specifier.replace(/^node:/, "");
  const rootName = normalized.split("/", 1)[0];
  if (!builtins.has(normalized) && !builtins.has(rootName)) return null;
  return rootName;
}

function resolveProjectImport(specifier, fromDir) {
  if (specifier.startsWith("@/")) return resolveFile(path.join(root, specifier.slice(2)));
  if (specifier.startsWith(".")) return resolveFile(path.resolve(fromDir, specifier));
  return null;
}

function resolveFile(candidate) {
  const candidates = [
    candidate,
    `${candidate}.ts`,
    `${candidate}.tsx`,
    `${candidate}.js`,
    `${candidate}.mjs`,
    path.join(candidate, "route.ts"),
    path.join(candidate, "index.ts"),
    path.join(candidate, "index.tsx"),
  ];
  return candidates.find((item) => fs.existsSync(item) && fs.statSync(item).isFile()) ?? null;
}

function expandEntry(entry) {
  const absoluteEntry = path.join(root, entry);
  if (!fs.existsSync(absoluteEntry)) return [];
  if (fs.statSync(absoluteEntry).isFile()) return [absoluteEntry];
  return collectFiles(absoluteEntry).filter((file) => /\.(?:ts|tsx|js|mjs)$/.test(file));
}

function collectFiles(directory) {
  const results = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectFiles(absolutePath));
      continue;
    }
    if (entry.isFile()) results.push(absolutePath);
  }
  return results;
}

function formatViolation(violation) {
  const relativeFile = path.relative(root, violation.file).replaceAll("\\", "/");
  const stack = violation.stack.map((item) => path.relative(root, item).replaceAll("\\", "/")).join(" -> ");
  return `- ${relativeFile} imports ${violation.imported}${stack ? `\n  via ${stack}` : ""}`;
}
