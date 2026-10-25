import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";

const script = path.resolve("scripts/prepare-privacy-cache.mjs");
const roots: string[] = [];
function fixture(revalidate: false | number = false, rsc: string | undefined = "flight") {
  const root = mkdtempSync(path.join(tmpdir(), "privacy-cache-test-"));
  roots.push(root);
  mkdirSync(path.join(root, ".next"));
  mkdirSync(path.join(root, ".open-next/cache/build-test"), { recursive: true });
  writeFileSync(path.join(root, ".next/BUILD_ID"), "build-test");
  writeFileSync(path.join(root, ".next/prerender-manifest.json"), JSON.stringify({ routes: {
    "/privacy": { initialRevalidateSeconds: revalidate },
  } }));
  writeFileSync(path.join(root, ".open-next/cache/build-test/privacy.cache"), JSON.stringify({ type: "app", html: "policy", rsc }));
  return root;
}
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
describe("privacy build artifact", () => {
  it("copies the approved build entry into the adapter asset path", () => {
    const cwd = fixture();
    execFileSync(process.execPath, [script], { cwd });
    expect(JSON.parse(readFileSync(path.join(cwd, ".open-next/assets/cdn-cgi/_next_cache/build-test/privacy.cache"), "utf8")))
      .toEqual({ type: "app", html: "policy", rsc: "flight" });
  });
  it("fails the build if privacy becomes ISR", () => {
    expect(() => execFileSync(process.execPath, [script], { cwd: fixture(60), stdio: "pipe" })).toThrow();
  });
  it("fails the build if the RSC artifact is missing", () => {
    const cwd = fixture();
    writeFileSync(path.join(cwd, ".open-next/cache/build-test/privacy.cache"), JSON.stringify({ type: "app", html: "policy" }));
    expect(() => execFileSync(process.execPath, [script], { cwd, stdio: "pipe" })).toThrow();
  });
});
