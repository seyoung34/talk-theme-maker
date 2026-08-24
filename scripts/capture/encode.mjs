// ffmpeg 래퍼. 위치 탐색 · 실측 · 배포 형식 변환.
//
// **PATH를 가정하지 않는다.** winget이 설치한 ffmpeg는
// `%LOCALAPPDATA%\Microsoft\WinGet\Packages\...`에 들어가고, 설치한 그 셸에서는 PATH에 잡히지
// 않는다(새 셸을 열어야 보인다). 실제로 설치 직후 여기서 막혔다.
import { execFile, execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { readdir, writeFile } from "node:fs/promises";
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

/**
 * 캡처한 프레임들을 배포용 mp4로 굽는다. **시간축을 `slowdown`으로 나눠 정상 속도로 되돌린다.**
 *
 * 프레임 간격이 일정하지 않아서(스크린샷 한 장의 소요가 화면마다 다르다) 고정 프레임 레이트로
 * 이어 붙이면 움직임이 미세하게 밀린다. concat 디먹서에 **프레임마다 실제 표시 시간**을 적어
 * 넘기고, `fps` 필터가 목표 레이트로 다시 샘플링하게 한다.
 */
export async function framesToVideo(frames, target, { fps, slowdown, framesDir, repeatLast = true }) {
  const { ffmpeg } = await resolveFfmpeg();
  if (frames.length < 2) throw new Error(`프레임이 ${frames.length}장뿐이라 영상을 만들 수 없습니다.`);

  const lines = ["ffconcat version 1.0"];
  for (let i = 0; i < frames.length; i += 1) {
    // 마지막 프레임은 다음 시각이 없다. 직전 간격을 그대로 쓴다.
    const next = frames[i + 1]?.t ?? frames[i].t + (frames[i].t - frames[i - 1].t);
    // 0 이하의 길이는 ffmpeg가 파일 전체를 거부하는 사유가 된다("Invalid data found").
    // 시각이 뒤로 밀리는 원인은 백엔드에서 막았지만, 여기서도 한 프레임 시간으로 받쳐 둔다 —
    // 한 장 때문에 촬영분 전체를 잃는 실패는 값이 너무 비싸다.
    const seconds = Math.max((next - frames[i].t) / slowdown, 1 / (fps * 4));
    lines.push(`file '${path.basename(frames[i].file)}'`);
    lines.push(`duration ${seconds.toFixed(6)}`);
  }
  /*
   * concat 디먹서는 마지막 항목의 duration을 무시한다. 파일을 한 번 더 적어야 그 길이가 살아난다.
   *
   * **다만 그 한 번이 공짜가 아니다.** 되풀이된 항목도 화면에 머무는 시간을 갖는다. 촬영본은
   * 프레임이 수백 장이고 한 장이 30분의 1초라 티가 나지 않지만, 스크린샷을 몇 초씩 세워 두는
   * 클립에서는 마지막 장면만 갑절로 길어진다 — 9.8초로 의도한 클립이 12.4초가 됐다.
   * 그런 호출부는 `repeatLast: false`로 끄고 마지막 길이를 스스로 준비한다.
   */
  if (repeatLast) lines.push(`file '${path.basename(frames[frames.length - 1].file)}'`);

  const listPath = path.join(framesDir, "frames.txt");
  await writeFile(listPath, `${lines.join("\n")}\n`, "utf8");

  await execFileAsync(ffmpeg, [
    "-y", "-v", "error",
    "-f", "concat", "-safe", "0",
    "-i", listPath,
    "-vf", `fps=${fps},scale=trunc(iw/2)*2:trunc(ih/2)*2`,
    "-c:v", "libx264",
    "-preset", "slow",
    "-crf", "20",
    "-pix_fmt", "yuv420p",
    "-movflags", "+faststart",
    "-an",
    target,
  ]);
  return target;
}

/**
 * 영상에서 한 구간만 잘라 mp4로 낸다. 프레임을 갖고 있지 않은 백엔드(실시간 녹화)의 씬 분리용이다.
 *
 * `-ss`를 입력 **앞**에 두면 키프레임 단위로 건너뛰어 빠르지만 시작이 최대 몇 백 ms 어긋난다.
 * 씬 경계는 그만큼의 오차도 눈에 띄므로 다시 인코딩하면서 정확히 자른다.
 */
export async function trimVideo(source, target, { startSec, endSec }) {
  const { ffmpeg } = await resolveFfmpeg();
  await execFileAsync(ffmpeg, [
    "-y", "-v", "error",
    "-i", source,
    "-ss", String(startSec),
    "-to", String(endSec),
    "-c:v", "libx264",
    "-preset", "slow",
    "-crf", "20",
    "-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2",
    "-pix_fmt", "yuv420p",
    "-movflags", "+faststart",
    "-an",
    target,
  ]);
  return target;
}
