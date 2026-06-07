import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const targets = ["app", "components", "lib", "docs"];
const extensions = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".json", ".md", ".css", ".html", ".svg"]);
const issues = [];

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
    }),
  );
}

await Promise.all(targets.map((target) => walk(path.join(root, target))));

if (issues.length > 0) {
  console.error("Text encoding check failed:");
  for (const issue of issues) {
    console.error(`- ${issue}`);
  }
  process.exit(1);
}

console.log("Text encoding check passed.");
