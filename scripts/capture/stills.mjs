// 실기기 스크린샷을 이어 붙여 가이드 클립을 만든다.
//
// **찍을 수 없는 화면이 있다.** iOS 뒷부분은 Safari의 다운로드 메뉴와 카카오톡 앱에서 일어난다.
// 촬영은 페이지 안쪽만 보므로 브라우저 크롬도 다른 앱도 화면에 없다. Android 8번(알 수 없는 앱
// 설치 허용)이 영상 없이 순서 목록만 있는 것과 같은 한계다.
//
// 그래서 실기기에서 찍은 스크린샷을 쓰되, **정지 이미지 한 장이 아니라 영상으로 만든다.** 한 스텝
// 안에서 화면이 여러 번 바뀌는 흐름이라, 한 장으로는 어느 화면 다음에 어느 화면이 오는지 전달되지
// 않는다. 앞 스텝들이 전부 영상이라 형태가 이어지는 이점도 있다.
//
// **커서가 없으므로 박스가 그 일을 대신한다.** 색과 모양은 `overlays.mjs`의 것과 같게 맞춘다 —
// 같은 가이드 안에서 같은 뜻을 다른 모양으로 그리면 둘이 다른 것으로 보인다.
//
// 손끝 표시는 넣지 않는다. 촬영본에서는 커서가 **움직여서** 도착 지점을 알리므로 누르는 순간을
// 찍을 표시가 필요하지만, 정지 화면에는 그 순간이 없다. 표시를 하나 더 얹어 봐야 알려주는 것은
// 늘지 않고 대상 글자만 가린다 — 실제로 첫 시안에서 "다운로드" 글자를 덮었다.
import { execFile } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import path from "node:path";
import { framesToVideo, posterWebp, probeVideo, resolveFfmpeg } from "./encode.mjs";

const execFileAsync = promisify(execFile);

/** `overlays.mjs`의 강조 박스와 같은 앰버. 촬영본과 나란히 놓았을 때 같은 뜻으로 읽혀야 한다. */
const boxColor = "0xfbbf24";
/** 대상에 딱 붙이면 테두리가 내용과 겹친다. 촬영본과 같은 여백을 준다(스크린샷이 3배 해상도라 3배). */
const boxPad = 18;
const boxWidth = 9;

function highlightFilter(rect) {
  const x = Math.round(rect.x - boxPad);
  const y = Math.round(rect.y - boxPad);
  const w = Math.round(rect.w + boxPad * 2);
  const h = Math.round(rect.h + boxPad * 2);
  return [
    // 어두운 실선을 한 겹 깔아 밝은 화면에서도 어두운 화면에서도 묻히지 않게 한다.
    `drawbox=x=${x - 3}:y=${y - 3}:w=${w + 6}:h=${h + 6}:color=0x111111@0.5:t=${boxWidth + 6}`,
    `drawbox=x=${x}:y=${y}:w=${w}:h=${h}:color=${boxColor}@1:t=${boxWidth}`,
    `drawbox=x=${x + boxWidth}:y=${y + boxWidth}:w=${w - boxWidth * 2}:h=${h - boxWidth * 2}:color=0xfee500@0.12:t=fill`,
  ].join(",");
}

/**
 * 장면 하나를 합성해 한 장으로 굽는다.
 *
 * `-frames:v 1`이 필요하다. PNG 입력은 한 장짜리 스트림이지만 필터가 붙으면 ffmpeg가 계속 쓰려
 * 드는 경우가 있어, 명시적으로 한 장만 받는다.
 */
async function composeStill(ffmpeg, shot, target) {
  /*
   * **모든 장면을 같은 픽셀 포맷으로 굽는다.** 박스를 그린 장면과 안 그린 장면을 그냥 두면
   * 포맷이 갈린다 — 원본은 16비트 PNG인데 `drawbox`를 거치면 8비트로 나온다. concat 디먹서는
   * 중간에 규격이 바뀌면 거기서 멈추고, 증상은 "두 장짜리 클립이 첫 장 길이만큼만 나온다"였다.
   * 오류도 경고도 없어서 길이 계산을 세 번 다시 확인한 뒤에야 포맷을 의심했다.
   */
  const filters = [];
  if (shot.highlight) filters.push(highlightFilter(shot.highlight));
  filters.push("format=rgb24");
  await execFileAsync(ffmpeg, ["-y", "-v", "error", "-i", shot.file, "-vf", filters.join(","), "-frames:v", "1", target]);
}

/**
 * 스크린샷 묶음을 클립 하나로 만든다.
 *
 * `framesToVideo`를 그대로 쓴다. 인코더가 한 곳이어야 촬영본과 스크린샷 클립이 같은 규격으로
 * 나온다 — 두 벌이면 한쪽만 설정이 바뀌어 "같은 가이드인데 화질이 다른" 상태가 된다.
 *
 * `slowdown: 1`인 이유는 배속 촬영이 아니기 때문이다. 장면 길이를 그대로 쓴다.
 */
export async function buildStillsClip({ id, shots, outDir, fps = 30, defaultSeconds = 2 }) {
  if (!shots?.length) throw new Error(`'${id}'에 넣을 스크린샷이 없습니다.`);
  const { ffmpeg } = await resolveFfmpeg();
  const workDir = path.join(outDir, `.stills-${id}`);
  await mkdir(workDir, { recursive: true });

  try {
    const frames = [];
    let at = 0;
    for (const [index, shot] of shots.entries()) {
      const composed = path.join(workDir, `shot-${String(index).padStart(3, "0")}.png`);
      await composeStill(ffmpeg, shot, composed);
      frames.push({ file: composed, t: at });
      at += shot.seconds ?? defaultSeconds;
    }
    /*
     * 마지막 장면을 되풀이하지 않는다. 인코더의 `repeatLast`도 끈다.
     *
     * concat 목록은 **마지막 항목의 duration도 지킨다.** 촬영본 경로가 파일을 한 번 더 적는 것은
     * 프레임이 수백 장이라 한 장 더 나와도 30분의 1초이기 때문이고, 여기서는 마지막 장면이
     * 통째로 한 번 더 나온다. 되풀이를 넣었다 뺐다 하며 실측한 결과다:
     *
     *   되풀이 O + 중복 X → 12.4초    되풀이 X + 중복 O → 12.0초
     *   되풀이 X + 중복 X →  9.8초 ← 의도한 길이
     *
     * 대신 마지막 장면의 길이는 `framesToVideo`가 직전 간격을 물려준다. 장면 길이를 비슷하게
     * 두면 티가 나지 않으므로 그대로 받는다.
     */
    const target = path.join(outDir, `${id}.mp4`);
    await framesToVideo(frames, target, { fps, slowdown: 1, framesDir: workDir, repeatLast: false });
    const poster = await posterWebp(target, path.join(outDir, `${id}-poster.webp`), { atSec: 0.2 });
    return { path: target, poster, measured: await probeVideo(target) };
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

/** 확인용. 합성한 장면만 PNG로 남긴다. 좌표를 맞출 때 영상을 매번 만들지 않아도 된다. */
export async function previewStills({ id, shots, outDir }) {
  const { ffmpeg } = await resolveFfmpeg();
  const dir = path.join(outDir, `preview-${id}`);
  await mkdir(dir, { recursive: true });
  const made = [];
  for (const [index, shot] of shots.entries()) {
    const target = path.join(dir, `${String(index).padStart(2, "0")}-${path.basename(shot.file)}`);
    await composeStill(ffmpeg, shot, target);
    made.push(target);
  }
  await writeFile(path.join(dir, "shots.json"), `${JSON.stringify(shots, null, 2)}\n`, "utf8");
  return made;
}
