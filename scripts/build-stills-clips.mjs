// 실기기 스크린샷으로 만드는 가이드 클립을 굽는다.
//
// 촬영 파이프라인(`scripts/capture/run.mjs`)과 별개로 둔다. 저쪽은 서버를 띄우고 브라우저를
// 몰아 찍지만 여기는 이미 있는 이미지만 합성하므로, 한데 묶으면 스크린샷 클립 한 장 고치자고
// 매번 빌드와 서버가 딸려 온다.
//
// 사용:
//   node scripts/build-stills-clips.mjs                  전부 굽는다
//   node scripts/build-stills-clips.mjs --only=android-install-apply
//   node scripts/build-stills-clips.mjs --preview        합성한 장면만 PNG로 남긴다(좌표 맞출 때)
import { access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildStillsClip, previewStills } from "./capture/stills.mjs";
import { androidInstallApply } from "./capture/scenes/androidStills.mjs";
import { iosApplyTheme, iosDownloadFile, iosMakeFile } from "./capture/scenes/iosStills.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(repoRoot, "public", "guide", "editor");

/** 가이드가 참조하는 순서대로 둔다. `--only`가 없으면 이 순서로 전부 굽는다. */
const groups = [iosMakeFile, iosDownloadFile, iosApplyTheme, androidInstallApply];

function parseArgs(argv) {
  const only = argv.find((arg) => arg.startsWith("--only="))?.slice("--only=".length);
  return { only, preview: argv.includes("--preview") };
}

/**
 * 원본이 있는지 먼저 본다.
 *
 * 스크린샷은 저장소 밖 외장 드라이브에 있어서, 경로가 바뀌거나 드라이브가 빠지면 ffmpeg가
 * 파일마다 따로 실패한다. 어느 장이 없는지 한 번에 알려주는 편이 낫다.
 */
async function assertShots(group) {
  const missing = [];
  for (const shot of group.shots) {
    try {
      await access(shot.file);
    } catch {
      missing.push(shot.file);
    }
  }
  if (missing.length) {
    throw new Error(`'${group.id}'의 스크린샷을 찾을 수 없습니다:\n  ${missing.join("\n  ")}`);
  }
}

async function main() {
  const { only, preview } = parseArgs(process.argv.slice(2));
  const targets = only ? groups.filter((group) => group.id === only) : groups;
  if (!targets.length) {
    throw new Error(`'${only}'는 없는 묶음입니다. 가능한 값: ${groups.map((group) => group.id).join(", ")}`);
  }

  for (const group of targets) {
    await assertShots(group);
    if (preview) {
      const made = await previewStills({ id: group.id, shots: group.shots, outDir });
      console.log(`${group.id}: 미리보기 ${made.length}장 → ${path.dirname(made[0])}`);
      continue;
    }
    const planned = group.shots.reduce((sum, shot) => sum + (shot.seconds ?? 2), 0);
    const { path: file, measured } = await buildStillsClip({ id: group.id, shots: group.shots, outDir });
    console.log(
      `${group.id}: ${group.shots.length}장 → ${path.relative(repoRoot, file)} ` +
        `(계획 ${planned.toFixed(1)}초 / 실측 ${measured.durationSec.toFixed(2)}초, ${measured.width}x${measured.height})`,
    );
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
