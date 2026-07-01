import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const sampleRoot = path.join(root, "android-sample-theme", "apeach-26.1.0-source");
const manifestPath = path.join(root, "lib", "theme", "manifest", "android.slots.json");
const apkPath = path.join(root, "lib", "theme", "android", "apk.ts");

const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const apkSource = fs.readFileSync(apkPath, "utf8");

// Every raster asset the sample project bundles under src/main/theme/drawable-* and
// src/main/res/mipmap-* must be either (a) targeted by a slot's export path/scaleTargets,
// so an override always replaces it, or (b) explicitly stripped in
// removeBundledOptionalDrawables() in apk.ts so it never ships. This keeps the apeach
// sample's branded artwork from leaking into exported themes when a user leaves a slot
// on its default ("사용 안 함" or untouched) state.
const trackedDirPrefixes = ["src/main/theme/drawable", "src/main/res/mipmap"];
const excludedPrefixes = ["src/main/res/mipmap-anydpi-v26"];

const coveredPaths = new Set();
for (const slot of manifest) {
  if (slot.path) coveredPaths.add(slot.path);
  for (const target of slot.export?.android?.scaleTargets ?? []) coveredPaths.add(target);
}

const removalListMatch = apkSource.match(/async function removeBundledOptionalDrawables[\s\S]*?const bundledPaths = \[([\s\S]*?)\];/);
if (!removalListMatch) throw new Error("Could not find removeBundledOptionalDrawables' bundledPaths list in apk.ts.");
const removedPaths = [...removalListMatch[1].matchAll(/"([^"]+)"/g)].map((match) => match[1]);
for (const removedPath of removedPaths) coveredPaths.add(removedPath);

const bundledFiles = listFiles(sampleRoot).filter(
  (relativePath) =>
    /\.(png|jpe?g)$/i.test(relativePath) &&
    trackedDirPrefixes.some((prefix) => relativePath.startsWith(prefix)) &&
    !excludedPrefixes.some((prefix) => relativePath.startsWith(prefix)),
);

const uncovered = bundledFiles.filter((relativePath) => !coveredPaths.has(relativePath));
if (uncovered.length) {
  throw new Error(
    [
      `${uncovered.length}개의 샘플 프로젝트 이미지가 슬롯/제거 목록 어느 쪽에도 커버되지 않습니다.`,
      "사용자가 해당 슬롯을 건드리지 않으면 apeach 원본이 그대로 내보내집니다:",
      ...uncovered.map((relativePath) => ` - ${relativePath}`),
      "android.slots.json에 슬롯/scaleTargets를 추가하거나, apk.ts의 removeBundledOptionalDrawables에 경로를 추가하세요.",
    ].join("\n"),
  );
}

// Cheap extra net: catch any leftover literal "apeach"/어피치 branding text in the
// non-theme app-shell resources our slots never touch (strings, layouts, styles).
const brandedTextPattern = /apeach|어피치/i;
const shellFiles = listFiles(sampleRoot).filter(
  (relativePath) => /\.xml$/i.test(relativePath) && (relativePath.startsWith("src/main/res/values") || relativePath.startsWith("src/main/res/layout")),
);
for (const relativePath of shellFiles) {
  const content = fs.readFileSync(path.join(sampleRoot, relativePath), "utf8");
  if (brandedTextPattern.test(content)) {
    throw new Error(`${relativePath}에 apeach/어피치 브랜딩 텍스트가 남아 있습니다. 내보내기에서 덮어쓰는지 확인하세요.`);
  }
}

console.log(`Android bundled asset verification passed (${bundledFiles.length} tracked assets, ${removedPaths.length} explicitly removed).`);

function listFiles(dir, base = dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "build" || entry.name === ".gradle") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      listFiles(full, base, out);
    } else {
      out.push(path.relative(base, full).split(path.sep).join("/"));
    }
  }
  return out;
}
