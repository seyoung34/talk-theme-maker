import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const manifest = JSON.parse(await readFile(new URL("lib/theme/manifest/ios.slots.json", root), "utf8"));
const sampleCss = await readFile(new URL("samples/ios/apeach-25.8.0/KakaoTalkTheme.css", root), "utf8");
const selectors = parseCssSelectors(sampleCss);
const issues = [];

for (const slot of manifest) {
  if (!slot.note?.trim()) issues.push(`${slot.id}: 사용자 안내 문구가 없습니다.`);
  if (/\b(?:pressed|Style|View)\b|-ios-|\.png\b|(?:background|border)-color/i.test(slot.note ?? "")) {
    issues.push(`${slot.id}: note에 기술 표현이 포함되어 있습니다.`);
  }
  if (slot.colorKey !== undefined) issues.push(`${slot.id}: iOS 슬롯은 colorKey 대신 cssSelector/cssProperty를 사용해야 합니다.`);

  const isPackageOnly = slot.id === "ios-common-theme-icon";
  if (isPackageOnly) {
    if (slot.cssSelector || slot.cssProperty) issues.push(`${slot.id}: CSS 비연결 리소스에 CSS 메타데이터가 있습니다.`);
  } else if (!slot.cssSelector || !slot.cssProperty) {
    issues.push(`${slot.id}: CSS selector/property가 없습니다.`);
  } else {
    for (const selector of toArray(slot.cssSelector)) {
      if (!selectors.get(selector)?.has(slot.cssProperty)) issues.push(`${slot.id}: 샘플 CSS에 ${selector} · ${slot.cssProperty} 선언이 없습니다.`);
    }
  }

  for (const field of ["defaultColor", "defaultAssetUrls", "candidates"]) {
    const configured = slot[field];
    if (configured && Object.keys(configured).some((key) => key !== "basic")) issues.push(`${slot.id}: ${field}에 basic 이외의 기본 템플릿 값이 있습니다.`);
  }
}

if (issues.length) {
  console.error("iOS slot metadata check failed:");
  for (const issue of issues) console.error(`- ${issue}`);
  process.exit(1);
}

console.log(`iOS slot metadata check passed (${manifest.length} slots).`);

function parseCssSelectors(source) {
  const result = new Map();
  const withoutComments = source.replace(/\/\*[\s\S]*?\*\//g, "");
  for (const match of withoutComments.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selector = match[1].trim();
    const properties = new Set(Array.from(match[2].matchAll(/^\s*([\w-]+)\s*:/gm), (property) => property[1]));
    result.set(selector, properties);
  }
  return result;
}

function toArray(value) {
  return Array.isArray(value) ? value : [value];
}
