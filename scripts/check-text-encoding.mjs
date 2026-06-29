import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const targets = ["app", "components", "lib", "docs"];
const targetFiles = ["AGENTS.md", "README.md"];
const extensions = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".json", ".md", ".css", ".html", ".svg"]);
const issues = [];

const fromCodePoints = (...codes) => String.fromCodePoint(...codes);
const mojibakeFragments = [
  fromCodePoints(0x3f, 0xc312, 0xc758),
  fromCodePoints(0x3f, 0xb69c, 0xb2ee),
  fromCodePoints(0x3f, 0xc28d),
  fromCodePoints(0x3f, 0xb300, 0xb0ab),
  fromCodePoints(0x8adb, 0xace8),
  fromCodePoints(0x907a, 0xb358),
  fromCodePoints(0x934e, 0xb69c),
  fromCodePoints(0x6028, 0xafe9),
  fromCodePoints(0x6f61, 0xc4d2),
  fromCodePoints(0x5a9b, 0x80),
  fromCodePoints(0xf9de, 0x0080),
  fromCodePoints(0xf9cd, 0xb369),
  fromCodePoints(0xf9cf, 0xabbc),
  fromCodePoints(0xf9e1, 0x20),
  fromCodePoints(0x5bc3, 0xacf1),
  fromCodePoints(0x9858, 0x80),
  fromCodePoints(0x7570, 0xbd83),
  fromCodePoints(0x8084, 0xbdbe),
];

async function walk(directory) {
  let entries = [];
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    return;
  }

  await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        await walk(entryPath);
        return;
      }

      if (!extensions.has(path.extname(entry.name))) return;

      const content = await readFile(entryPath, "utf8");
      if (content.charCodeAt(0) === 0xfeff) {
        issues.push(`${path.relative(root, entryPath)}: UTF-8 BOM detected`);
      }
      if (content.includes("\uFFFD")) {
        issues.push(`${path.relative(root, entryPath)}: replacement character detected`);
      }
      for (const fragment of mojibakeFragments) {
        const index = content.indexOf(fragment);
        if (index === -1) continue;
        issues.push(`${path.relative(root, entryPath)}:${lineNumberAt(content, index)}: possible mojibake fragment detected`);
      }
    }),
  );
}

function lineNumberAt(content, index) {
  let line = 1;
  for (let cursor = 0; cursor < index; cursor += 1) {
    if (content.charCodeAt(cursor) === 10) line += 1;
  }
  return line;
}

await Promise.all([
  ...targets.map((target) => walk(path.join(root, target))),
  ...targetFiles.map(async (file) => {
    const entryPath = path.join(root, file);
    const content = await readFile(entryPath, "utf8");
    if (content.charCodeAt(0) === 0xfeff) {
      issues.push(`${file}: UTF-8 BOM detected`);
    }
    if (content.includes("\uFFFD")) {
      issues.push(`${file}: replacement character detected`);
    }
    for (const fragment of mojibakeFragments) {
      const index = content.indexOf(fragment);
      if (index === -1) continue;
      issues.push(`${file}:${lineNumberAt(content, index)}: possible mojibake fragment detected`);
    }
  }),
]);

if (issues.length > 0) {
  console.error("Text encoding check failed:");
  for (const issue of issues) {
    console.error(`- ${issue}`);
  }
  process.exit(1);
}

console.log("Text encoding check passed.");
