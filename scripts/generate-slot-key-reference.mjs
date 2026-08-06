// 슬롯 → Android/iOS 실제 적용 키 대조표를 만든다.
//
//   node scripts/generate-slot-key-reference.mjs
//
// 매니페스트가 진실이고 문서는 그 산출물이다. 손으로 적으면 슬롯이 바뀔 때마다 어긋나므로
// 다시 생성한다. `npm run check:slot-keys` 로 최신 여부를 확인할 수 있다.

import { readFileSync, writeFileSync } from "node:fs";

// --check 는 다시 생성한 결과와 파일이 같은지만 본다. CI 나 리뷰에서 문서가 낡았는지 확인한다.
const checkOnly = process.argv.includes("--check");

const outputPath = "lib/theme/SLOT_EXPORT_KEYS.md";
const manifests = {
  android: JSON.parse(readFileSync("lib/theme/manifest/android.slots.json", "utf8")),
  ios: JSON.parse(readFileSync("lib/theme/manifest/ios.slots.json", "utf8")),
};

const sectionLabels = {
  main: "친구/메인",
  tabs: "채팅 목록·하단 탭",
  chatroom: "채팅방",
  more: "더보기",
  passcode: "잠금화면",
  common: "공통 리소스",
};
const sectionOrder = ["main", "tabs", "chatroom", "more", "passcode", "common"];

/** 그 플랫폼에서 이 슬롯이 실제로 어디에 쓰이는지. 없으면 `—`. */
function exportKey(slot, platform) {
  if (!slot) return "—";
  if (slot.kind === "color") {
    // Android 는 colors.xml 의 항목 이름, iOS 는 CSS 블록과 프로퍼티가 실제 키다.
    if (platform === "android") return slot.colorKey ? `\`${slot.colorKey}\`` : "—";
    if (!slot.cssProperty) return "—";
    return slot.cssSelector ? `\`${slot.cssSelector}\` › \`${slot.cssProperty}\`` : `\`${slot.cssProperty}\``;
  }
  const target = slot.export?.[platform]?.target ?? slot.path ?? slot.fileName;
  if (!target) return "—";
  // iOS 이미지는 파일이면서 CSS 프로퍼티로도 참조된다. 둘 다 적어야 추적이 된다.
  if (platform === "ios" && slot.cssProperty) return `\`${target}\`<br>\`${slot.cssSelector}\` › \`${slot.cssProperty}\``;
  return `\`${target}\``;
}

function kindLabel(slot) {
  if (slot.kind === "color") return "색상";
  if (slot.kind === "ninepatch") return "9-patch";
  return "이미지";
}

const byRole = new Map();
for (const [platform, slots] of Object.entries(manifests)) {
  for (const slot of slots) {
    const entry = byRole.get(slot.role) ?? { role: slot.role, section: slot.section, android: null, ios: null };
    entry[platform] = slot;
    // 섹션이 플랫폼마다 다르면 Android 를 기준으로 둔다. 편집기 좌측 목록이 그 순서다.
    if (platform === "android") entry.section = slot.section;
    byRole.set(slot.role, entry);
  }
}

const rows = [...byRole.values()];
const lines = [];
lines.push("# 슬롯별 Android/iOS 적용 키");
lines.push("");
lines.push("`lib/theme/manifest/*.slots.json` 에서 생성한다. **직접 고치지 말고**");
lines.push("`node scripts/generate-slot-key-reference.mjs` 를 다시 실행한다.");
lines.push("");
lines.push("- **Android** — 색상은 `res/values/colors.xml` 의 항목 이름, 이미지는 APK 안의 경로다.");
lines.push("- **iOS** — 색상은 CSS 블록 › 프로퍼티, 이미지는 패키지 안의 경로와 이를 참조하는 프로퍼티다.");
lines.push("- `—` 는 그 플랫폼에 해당 슬롯이 없다는 뜻이다. 한쪽에만 있는 슬롯이 적지 않다.");
lines.push("");
lines.push(`슬롯 ${rows.length}개 (Android ${manifests.android.length} · iOS ${manifests.ios.length})`);
lines.push("");

let androidOnly = 0;
let iosOnly = 0;
for (const section of sectionOrder) {
  const sectionRows = rows.filter((row) => row.section === section);
  if (!sectionRows.length) continue;
  lines.push(`## ${sectionLabels[section] ?? section}`);
  lines.push("");
  lines.push("| 슬롯 이름 | 종류 | role | Android | iOS |");
  lines.push("|---|---|---|---|---|");
  for (const row of sectionRows.sort((a, b) => a.role.localeCompare(b.role))) {
    const slot = row.android ?? row.ios;
    if (!row.ios) androidOnly += 1;
    if (!row.android) iosOnly += 1;
    lines.push(`| ${slot.label} | ${kindLabel(slot)} | \`${row.role}\` | ${exportKey(row.android, "android")} | ${exportKey(row.ios, "ios")} |`);
  }
  lines.push("");
}

lines.push("## 플랫폼 편차");
lines.push("");
lines.push(`- Android 에만 있는 슬롯: ${androidOnly}개`);
lines.push(`- iOS 에만 있는 슬롯: ${iosOnly}개`);
lines.push("");
lines.push("한쪽에만 있는 슬롯은 편집기에서도 그 플랫폼에서만 보인다. 내보내기 폴백으로만 채워지는");
lines.push("값이 있으므로, 프리뷰가 슬롯 없는 role 을 그릴 때는 `getPreviewColorRole()` 을 거쳐야 한다.");
lines.push("");

const next = lines.join("\n");

if (checkOnly) {
  const current = readFileSync(outputPath, "utf8");
  if (current === next) {
    console.log(`${outputPath} 최신 상태입니다.`);
  } else {
    console.error(`${outputPath} 가 매니페스트와 다릅니다. node scripts/generate-slot-key-reference.mjs 를 실행하세요.`);
    process.exit(1);
  }
} else {
  writeFileSync(outputPath, next, "utf8");
  console.log(`${outputPath} 생성 (슬롯 ${rows.length}개, Android 전용 ${androidOnly} · iOS 전용 ${iosOnly})`);
}
