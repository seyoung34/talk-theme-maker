#!/usr/bin/env node

import { cp, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve, relative, sep } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// Scheduled Tasks start in a system directory, so the script location—not the caller's cwd—is the default.
const projectRoot = resolve(process.env.TALKTHEME_DOCS_PROJECT_DIR ?? fileURLToPath(new URL("../", import.meta.url)));
const sourceDocsDirectory = resolve(projectRoot, "docs");
const backupRepositoryDirectory = resolve(process.env.TALKTHEME_DOCS_BACKUP_DIR ?? resolve(projectRoot, "..", "talktheme-private-docs"));
const backupDocsDirectory = resolve(backupRepositoryDirectory, "docs");
const markerPath = resolve(backupRepositoryDirectory, ".talktheme-docs-backup.json");
const backupReadmePath = resolve(backupRepositoryDirectory, "README.md");
const stageDirectory = resolve(backupRepositoryDirectory, `.talktheme-docs-stage-${process.pid}`);
const flags = new Set(process.argv.slice(2));
const shouldCommit = flags.has("--commit");
const shouldPush = flags.has("--push");
const isDryRun = flags.has("--dry-run");

if ([...flags].some((flag) => !["--commit", "--push", "--dry-run"].includes(flag))) {
  fail("Usage: node scripts/backup-private-docs.mjs [--commit] [--push] [--dry-run]");
}
if (shouldPush && !shouldCommit) fail("--push requires --commit so uncommitted documentation is never pushed.");

await verifyBackupTarget();

if (isDryRun) {
  console.log(`Dry run: ${sourceDocsDirectory} would replace ${backupDocsDirectory}.`);
  process.exit(0);
}

await cp(sourceDocsDirectory, stageDirectory, { recursive: true, force: false, errorOnExist: true });
try {
  await rm(backupDocsDirectory, { recursive: true, force: true });
  await rename(stageDirectory, backupDocsDirectory);
} finally {
  await rm(stageDirectory, { recursive: true, force: true });
}

await ensureBackupMetadata();
run("git", ["-C", backupRepositoryDirectory, "add", "--all", "docs", "README.md", ".talktheme-docs-backup.json"]);

const hasChanges = run("git", ["-C", backupRepositoryDirectory, "diff", "--cached", "--quiet"], { allowFailure: true }).status !== 0;
if (!hasChanges) {
  console.log("Documentation backup is already current.");
  process.exit(0);
}

if (!shouldCommit) {
  console.log("Documentation copied and staged. Re-run with --commit --push to publish the private backup.");
  process.exit(0);
}

const timestamp = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
run("git", ["-C", backupRepositoryDirectory, "commit", "-m", `docs: backup ${timestamp}`]);

if (shouldPush) {
  run("git", ["-C", backupRepositoryDirectory, "push", "origin", "HEAD"]);
  console.log("Documentation backup committed and pushed to the private repository.");
} else {
  console.log("Documentation backup committed locally. Re-run with --push to publish it.");
}

async function verifyBackupTarget() {
  if (!existsSync(sourceDocsDirectory)) fail(`Source documentation directory does not exist: ${sourceDocsDirectory}`);
  if (!existsSync(resolve(backupRepositoryDirectory, ".git"))) fail(`Backup target is not a Git repository: ${backupRepositoryDirectory}`);
  if (isInside(backupRepositoryDirectory, projectRoot) || isInside(projectRoot, backupRepositoryDirectory)) {
    fail("Backup repository must be a sibling of the project, not the project itself or a nested directory.");
  }

  const remote = run("git", ["-C", backupRepositoryDirectory, "remote", "get-url", "origin"]).stdout.trim();
  const repository = parseGitHubRepository(remote);
  if (!repository) fail(`Backup origin must be a GitHub repository URL, received: ${remote}`);

  const visibility = run("gh", ["repo", "view", repository, "--json", "isPrivate", "--jq", ".isPrivate"]).stdout.trim();
  if (visibility !== "true") fail(`Backup repository must be private: ${repository}`);

  if (existsSync(markerPath)) {
    const marker = JSON.parse(await readFile(markerPath, "utf8"));
    if (marker?.schemaVersion !== 1 || marker?.sourceDirectory !== sourceDocsDirectory) {
      fail(`Backup marker does not match this project: ${markerPath}`);
    }
  }
}

async function ensureBackupMetadata() {
  if (!existsSync(markerPath)) {
    await writeFile(markerPath, `${JSON.stringify({ schemaVersion: 1, sourceDirectory: sourceDocsDirectory }, null, 2)}\n`, "utf8");
  }
  if (!existsSync(backupReadmePath)) {
    await writeFile(backupReadmePath, "# TalkTheme private documentation backup\n\nThis repository is a one-way backup of the local `docs/` directory from `kakaotalk-theme-maker`.\n\nDo not edit `docs/` here: the scheduled backup replaces it from the local source.\n", "utf8");
  }
}

function isInside(candidate, parent) {
  const relativePath = relative(parent, candidate);
  return relativePath === "" || (!relativePath.startsWith(`..${sep}`) && relativePath !== "..");
}

function parseGitHubRepository(remote) {
  const httpsMatch = /^https:\/\/github\.com\/([^/]+\/[^/]+?)(?:\.git)?\/?$/i.exec(remote);
  if (httpsMatch) return httpsMatch[1];
  const sshMatch = /^git@github\.com:([^/]+\/[^/]+?)(?:\.git)?$/i.exec(remote);
  return sshMatch?.[1] ?? null;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  if (result.error) fail(`Could not run ${command}: ${result.error.message}`);
  if (result.status !== 0 && !options.allowFailure) {
    fail(`${command} failed: ${(result.stderr || result.stdout).trim()}`);
  }
  return { status: result.status ?? 1, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
}

function fail(message) {
  console.error(`Documentation backup aborted: ${message}`);
  process.exit(1);
}
