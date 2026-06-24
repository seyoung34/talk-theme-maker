import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const samplePath = path.join(root, "android-sample-theme", "apeach-26.1.0-source", "src", "main", "theme", "values", "colors.xml");
const manifestPath = path.join(root, "lib", "theme", "manifest", "android.slots.json");
const exportPath = path.join(root, "lib", "theme", "android", "export.ts");

const sample = fs.readFileSync(samplePath, "utf8");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const exporter = fs.readFileSync(exportPath, "utf8");

const sampleKeys = [...sample.matchAll(/<color name="([^"]+)">/g)].map((match) => match[1]);
const colorSlots = manifest.filter((slot) => slot.kind === "color");
const manifestKeys = colorSlots.map((slot) => slot.colorKey);
const exportKeys = [...exporter.matchAll(/^\s+(theme_[a-z0-9_]+):/gm)].map((match) => match[1]);

assertUnique("sample", sampleKeys);
assertUnique("manifest", manifestKeys);
assertSetEqual("sample ↔ manifest", sampleKeys, manifestKeys);
assertSetEqual("sample ↔ export", sampleKeys, exportKeys);

assertSlot("theme_paragraph_color", "tab_paragraph_color", "tabs");
assertSlot("theme_paragraph_pressed_color", "tab_paragraph_pressed_color", "tabs");
assertSlot("theme_body_secondary_cell_color", "main_body_secondary_cell_color", "more");

const allowedAutoRecipes = new Set([
  "background-average", "header-top", "surface-background", "tab-bottom",
  "foreground-header", "foreground-background", "foreground-muted", "foreground-pressed", "muted-pressed",
  "cell-transparent", "cell-pressed", "cell-border",
  "accent", "accent-pressed", "accent-surface", "accent-surface-pressed",
]);
const autoSlots = colorSlots.filter((slot) => slot.autoColorRecipe);
if (autoSlots.some((slot) => !allowedAutoRecipes.has(slot.autoColorRecipe))) throw new Error("Android manifest contains an unknown auto color recipe.");
if (autoSlots.some((slot) => !["main", "tabs", "more"].includes(slot.section))) throw new Error("Auto color recipes must remain in the main, tabs, or more sections.");
for (const role of ["main_background_color", "main_header_color", "main_body_secondary_cell_color", "tab_background"]) {
  if (!autoSlots.some((slot) => slot.role === role)) throw new Error(`${role} requires an auto color recipe.`);
}

console.log(`Android color slot verification passed (${sampleKeys.length} keys).`);

function assertSlot(colorKey, role, section) {
  const slot = colorSlots.find((item) => item.colorKey === colorKey);
  if (!slot || slot.role !== role || slot.section !== section) {
    throw new Error(`${colorKey} must map to ${role} in ${section}.`);
  }
}

function assertUnique(label, values) {
  const duplicates = values.filter((value, index) => values.indexOf(value) !== index);
  if (duplicates.length) throw new Error(`${label} contains duplicate keys: ${[...new Set(duplicates)].join(", ")}`);
}

function assertSetEqual(label, left, right) {
  const leftOnly = left.filter((value) => !right.includes(value));
  const rightOnly = right.filter((value) => !left.includes(value));
  if (leftOnly.length || rightOnly.length) throw new Error(`${label} mismatch. missing=[${leftOnly.join(", ")}] extra=[${rightOnly.join(", ")}]`);
}
