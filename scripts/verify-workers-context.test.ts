import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const scriptPath = path.resolve(process.cwd(), "scripts/verify-workers-context.mjs");

type CommandResult = {
  code: number;
  stderr: string;
};

async function runGuard(mode: string, overrides: Record<string, string | undefined>): Promise<CommandResult> {
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (key.startsWith("WORKERS_CI") || key === "NEXT_PUBLIC_SITE_URL") {
      delete env[key];
      continue;
    }
    if (key.startsWith("NEXT_PUBLIC_") && /(URL|ORIGIN|HOST)$/i.test(key)) {
      delete env[key];
    }
  }

  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) delete env[key];
    else env[key] = value;
  }

  try {
    await execFileAsync(process.execPath, [scriptPath, mode], {
      env,
      windowsHide: true,
    });
    return { code: 0, stderr: "" };
  } catch (error) {
    const result = error as NodeJS.ErrnoException & { stderr?: string };
    return {
      code: typeof result.code === "number" ? result.code : 1,
      stderr: result.stderr ?? "",
    };
  }
}

describe("verify-workers-context", () => {
  it("accepts the production Workers Builds context", async () => {
    const result = await runGuard("workers", {
      WORKERS_CI: "1",
      WORKERS_CI_BRANCH: "main",
      NEXT_PUBLIC_SITE_URL: "https://talktheme.shop",
    });

    expect(result.code).toBe(0);
  });

  it("rejects a local Workers Builds command without its marker", async () => {
    const result = await runGuard("workers", {
      WORKERS_CI_BRANCH: "main",
      NEXT_PUBLIC_SITE_URL: "https://talktheme.shop",
    });

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("WORKERS_CI=1");
    expect(result.stderr).toContain("cf:build:workers");
  });

  it("allows a non-main Workers Builds preview context", async () => {
    const result = await runGuard("workers", {
      WORKERS_CI: "1",
      WORKERS_CI_BRANCH: "feature/example",
    });

    expect(result.code).toBe(0);
  });

  it("rejects a strict production build from a non-main branch", async () => {
    const result = await runGuard("build", {
      WORKERS_CI: "1",
      WORKERS_CI_BRANCH: "feature/example",
      NEXT_PUBLIC_SITE_URL: "https://talktheme.shop",
    });

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("WORKERS_CI_BRANCH");
  });

  it("rejects a local public URL even in a Workers Builds preview context", async () => {
    const result = await runGuard("workers", {
      WORKERS_CI: "1",
      WORKERS_CI_BRANCH: "feature/example",
      NEXT_PUBLIC_SITE_URL: "http://localhost:3000",
    });

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("NEXT_PUBLIC_SITE_URL");
  });

  it("keeps deploy validation independent of build-only site variables", async () => {
    const result = await runGuard("deploy", {
      WORKERS_CI: "1",
      WORKERS_CI_BRANCH: "main",
    });

    expect(result.code).toBe(0);
  });
});
