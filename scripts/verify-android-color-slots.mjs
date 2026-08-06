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

// These derive from the main background palette, so they must stay on screens that share it.
const mainPaletteRecipes = new Set([
  "background-average", "header-top", "surface-background", "tab-bottom",
  "foreground-header", "foreground-background", "foreground-muted", "foreground-pressed", "muted-pressed",
  "cell-transparent", "cell-pressed", "cell-border",
  "accent", "accent-pressed", "accent-surface", "accent-surface-pressed",
]);
// The chatroom carries its own background image, so it seeds from that instead. Keeping it out of
// the set above is what stops the main palette from leaking onto a screen it never sampled.
const chatPaletteRecipes = new Set(["chat-background-average"]);
const bubblePaletteRecipes = new Set(["bubble-me-text", "bubble-you-text"]);
const allowedAutoRecipes = new Set([...mainPaletteRecipes, ...chatPaletteRecipes, ...bubblePaletteRecipes]);
const autoSlots = colorSlots.filter((slot) => slot.autoColorRecipe);
if (autoSlots.some((slot) => !allowedAutoRecipes.has(slot.autoColorRecipe))) throw new Error("Android manifest contains an unknown auto color recipe.");
const mainPaletteSlots = autoSlots.filter((slot) => mainPaletteRecipes.has(slot.autoColorRecipe));
if (mainPaletteSlots.some((slot) => !["main", "tabs", "more"].includes(slot.section))) throw new Error("Main palette recipes must remain in the main, tabs, or more sections.");
const chatPaletteSlots = autoSlots.filter((slot) => chatPaletteRecipes.has(slot.autoColorRecipe));
if (chatPaletteSlots.some((slot) => slot.section !== "chatroom")) throw new Error("Chat palette recipes must remain in the chatroom section.");
const bubblePaletteSlots = autoSlots.filter((slot) => bubblePaletteRecipes.has(slot.autoColorRecipe));
if (bubblePaletteSlots.some((slot) => slot.section !== "chatroom" || slot.group !== "bubbles")) throw new Error("Bubble palette recipes must remain in the chatroom bubbles group.");
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
