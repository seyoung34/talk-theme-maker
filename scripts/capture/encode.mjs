// ffmpeg 래퍼. 위치 탐색 · 실측 · 배포 형식 변환.
//
// **PATH를 가정하지 않는다.** winget이 설치한 ffmpeg는
// `%LOCALAPPDATA%\Microsoft\WinGet\Packages\...`에 들어가고, 설치한 그 셸에서는 PATH에 잡히지
// 않는다(새 셸을 열어야 보인다). 실제로 설치 직후 여기서 막혔다.
import { execFile, execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/** Playwright 번들 ffmpeg는 축소 빌드다 — libx264도 webp도 palettegen도 없다(§2.5). */
const bundledHint = "Playwright 번들 ffmpeg는 mp4·webp·색보정을 만들지 못합니다";

async function findWingetFfmpeg(binaryName) {
  const root = process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, "Microsoft", "WinGet", "Packages");
  if (!root || !existsSync(root)) return null;
  const packages = await readdir(root).catch(() => []);
  const gyan = packages.find((name) => name.startsWith("Gyan.FFmpeg"));
  if (!gyan) return null;
  const builds = await readdir(path.join(root, gyan)).catch(() => []);
  for (const build of builds) {
    const candidate = path.join(root, gyan, build, "bin", binaryName);
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

function onPath(binaryName) {
  try {
    execFileSync(binaryName, ["-version"], { stdio: "ignore" });
    return binaryName;
  } catch {
    return null;
  }
}

let cached = null;

/**
 * ffmpeg·ffprobe 경로를 찾는다. 못 찾으면 설치 방법과 함께 던진다.
 * 조용히 번들 빌드로 내려가지 않는다 — 그러면 mp4를 요청했는데 아무것도 안 나오는 실패가 된다.
 */
export async function resolveFfmpeg() {
  if (cached) return cached;

  const ffmpeg = onPath("ffmpeg") ?? (await findWingetFfmpeg("ffmpeg.exe"));
  const ffprobe = onPath("ffprobe") ?? (await findWingetFfmpeg("ffprobe.exe"));
  if (!ffmpeg || !ffprobe) {
    throw new Error(
      [
        "정식 ffmpeg를 찾지 못했습니다 (Phase 0).",
        "  설치: winget install Gyan.FFmpeg",
        "  설치한 셸에서는 PATH에 잡히지 않습니다. 새 터미널을 열어 다시 실행하세요.",
        `  (${bundledHint})`,
      ].join("\n"),
    );
  }

  const encoders = (await execFileAsync(ffmpeg, ["-hide_banner", "-encoders"])).stdout;
  const missing = ["libx264", "libwebp"].filter((codec) => !encoders.includes(codec));
  if (missing.length) {
    throw new Error(`찾은 ffmpeg에 ${missing.join(", ")} 인코더가 없습니다: ${ffmpeg}\n  ${bundledHint}`);
  }

  cached = { ffmpeg, ffprobe };
  return cached;
}

/**
 * 실제로 만들어진 영상의 크기·길이를 읽는다.
 *
 * manifest에는 프로필이 **의도한** 값이 아니라 이 값을 적는다. 백엔드가 뷰포트에 묶여 있어
 * 의도와 결과가 갈리는데, 거기서 의도한 값을 적으면 manifest가 거짓말을 하게 된다.
 */
export async function probeVideo(file) {
  const { ffprobe } = await resolveFfmpeg();
  const { stdout } = await execFileAsync(ffprobe, [
    "-v", "error",
    "-select_streams", "v:0",
    "-show_entries", "stream=width,height,r_frame_rate:format=duration",
    "-of", "json",
    file,
  ]);
  const parsed = JSON.parse(stdout);
  const stream = parsed.streams?.[0] ?? {};
  const [num, den] = String(stream.r_frame_rate ?? "0/1").split("/").map(Number);
  return {
    width: stream.width ?? 0,
    height: stream.height ?? 0,
    fps: den ? Math.round((num / den) * 100) / 100 : 0,
    durationSec: Math.round(Number(parsed.format?.duration ?? 0) * 100) / 100,
  };
}

/**
 * 배포용 mp4. 인스타·카톡·사파리가 공통으로 재생하는 조합으로 고정한다.
 *
 * **프레임 레이트를 바꾸지 않는다.** screencast는 25fps 근처로 나오는데 이를 30fps로 올리면
 * 없던 프레임을 고르지 않게 복제해 오히려 떨림이 생긴다. 목표 fps는 프레임 생성을 직접 제어하는
 * 백엔드(Phase B2의 screenshot 루프)에서 의미가 있고, 여기서는 원본을 그대로 옮긴다.
 */
export async function toMp4(source, target) {
  const { ffmpeg } = await resolveFfmpeg();
  await execFileAsync(ffmpeg, [
    "-y", "-v", "error",
    "-i", source,
    "-c:v", "libx264",
    "-preset", "slow",
    "-crf", "20",
    // 홀수 해상도가 들어오면 libx264가 거부한다. 짝수로 내림한다.
    "-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2",
    // yuv420p가 아니면 사파리·안드로이드 기본 플레이어가 재생하지 못한다.
    "-pix_fmt", "yuv420p",
    // moov atom을 앞으로 보내야 다 받기 전에 재생이 시작된다.
    "-movflags", "+faststart",
    "-an",
    target,
  ]);
  return target;
}

/**
 * 포스터 webp. `<video poster>`가 필수라 캡처마다 함께 만든다(Phase A1).
 *
 * 첫 프레임은 아직 아무것도 안 그려진 흰 화면인 경우가 많다. 기본값을 1초 뒤로 두는 이유다.
 */
export async function posterWebp(source, target, { atSec = 1 } = {}) {
  const { ffmpeg } = await resolveFfmpeg();
  await execFileAsync(ffmpeg, [
    "-y", "-v", "error",
    "-ss", String(atSec),
    "-i", source,
    "-frames:v", "1",
    "-c:v", "libwebp",
    "-quality", "82",
    target,
  ]);
  return target;
}
