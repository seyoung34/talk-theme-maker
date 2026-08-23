// 촬영본이 **약속한 것을 실제로 보여주는지** 검사한다.
//
// 지금까지의 검사는 전부 "촬영이 끝까지 돌았는가"만 봤다. 씬이 던지지 않고, 화면에 장식이 남지
// 않고, 규격과 용량이 맞으면 통과였다. 그래서 **아무것도 바뀌지 않은 영상**이 통과했다:
// 스텝 1(갤러리에서 템플릿 고르기)을 추가하자 뒤 씬들이 그 템플릿을 물려받았고, 배경이 이미
// 그 템플릿 색이라 "배경을 고르면 미리보기가 바뀐다" 스텝의 화면 변화가 0%가 됐다. 길이도
// 해상도도 정상이라 배포까지 갔고, 재생해 봐야 알 수 있었다.
//
// **첫 프레임과 끝 프레임을 비교하지 않는다.** 왕복하는 씬(`choose-screen`은 친구·메인에서
// 채팅방을 거쳐 돌아온다)은 끝이 처음과 같은 것이 정상이다. 대신 클립 전체를 훑어 **첫 프레임과
// 가장 많이 달라진 순간**을 찾는다. 질문이 "끝이 달라졌는가"가 아니라 "도중에 무언가 일어났는가"이기
// 때문이다.
//
// **회색조가 아니라 색으로 잰다.** 회색조만 보면 밝기가 비슷한 색 교체를 통째로 놓친다.
// 파스텔 블루 → 메론 그린 배경 교체가 회색조로 2%, 색으로 13%였다. 그 2%를 근거로 "이 클립은
// 가르치는 게 없다"고 여러 번 잘못 판단했다.
import { execFileSync } from "node:child_process";
import { readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { resolveFfmpeg } from "./encode.mjs";

/** 비교 해상도. 원본 크기로 재면 느리고, JPEG 노이즈가 신호를 흐린다. */
const sampleWidth = 240;
const sampleHeight = 135;
/** 한 픽셀이 "달라졌다"고 볼 RGB 합 거리. 인코딩 노이즈보다 크고 실제 교체보다 작다. */
const pixelThreshold = 40;
/*
 * **임계값은 실측의 절반쯤으로 잡는다.** 이 검사의 목적은 "아무 일도 일어나지 않았다"를 잡는
 * 것이지 "지난번과 똑같이 생겼다"를 강요하는 것이 아니다. 바짝 붙여 두면 정상적인 편차
 * (에셋을 하나 더 등록했다거나 팔레트 순서가 바뀌었다거나)에도 촬영이 실패한다.
 */

/** 클립을 몇 지점에서 훑을지. 촘촘할수록 느려지고, 성기면 짧은 변화를 놓친다. */
const sampleCount = 10;

function frameAt(ffmpeg, file, seconds) {
  const out = path.join(tmpdir(), `capture-verify-${process.pid}-${Math.round(seconds * 1000)}.rgb`);
  execFileSync(ffmpeg, [
    "-hide_banner", "-loglevel", "error", "-y",
    ...(seconds > 0 ? ["-ss", seconds.toFixed(3)] : []),
    "-i", file, "-frames:v", "1",
    "-vf", `scale=${sampleWidth}:${sampleHeight}`,
    "-f", "rawvideo", "-pix_fmt", "rgb24", out,
  ]);
  const buffer = readFileSync(out);
  rmSync(out, { force: true });
  return buffer;
}

function changedRatio(a, b) {
  let changed = 0;
  for (let pixel = 0; pixel < sampleWidth * sampleHeight; pixel += 1) {
    const i = pixel * 3;
    const distance = Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]);
    if (distance > pixelThreshold) changed += 1;
  }
  return changed / (sampleWidth * sampleHeight);
}

/**
 * 클립 안에서 첫 프레임 대비 가장 큰 변화율을 돌려준다. 0~1.
 *
 * 마지막 0.1초는 건너뛴다. 끝에 바짝 붙여 뽑으면 디코더가 프레임을 못 내고 빈 버퍼를 준다.
 */
export async function measureMaxChange(file, durationSec) {
  // `resolveFfmpeg()`는 `{ ffmpeg, ffprobe }`를 준다. 객체째 넘기면 spawn이 인자 타입으로 던진다.
  const { ffmpeg } = await resolveFfmpeg();
  const first = frameAt(ffmpeg, file, 0);
  const usable = Math.max(0, durationSec - 0.1);
  let max = 0;
  for (let step = 1; step <= sampleCount; step += 1) {
    const at = (usable * step) / sampleCount;
    const ratio = changedRatio(first, frameAt(ffmpeg, file, at));
    if (ratio > max) max = ratio;
  }
  return max;
}

/**
 * 씬이 선언한 기대치를 확인한다. 미달이면 던진다.
 *
 * **던지는 것이 요점이다.** 경고로 두면 로그에 묻힌다 — 로그인이 조용히 건너뛰어져 결제 화면이
 * 찍혔을 때도 러너는 경고 한 줄을 남겼고, 그 한 줄은 아무도 보지 않았다.
 */
export async function assertSceneExpectation(expectation, sceneId, file, measured) {
  const minChange = expectation?.minChange;
  if (typeof minChange !== "number") return null;

  const observed = await measureMaxChange(file, measured.durationSec);
  if (observed < minChange) {
    throw new Error(
      [
        `'${sceneId}' 씬의 화면이 충분히 바뀌지 않았습니다: ${(observed * 100).toFixed(1)}% (최소 ${(minChange * 100).toFixed(0)}%)`,
        `  ${expectation.because ?? "이 씬은 화면이 바뀌는 것을 보여주기 위한 것입니다."}`,
        "  촬영은 정상이었지만 보여줄 것이 없는 영상입니다. 흔한 원인:",
        "    - 앞 씬이 남긴 상태에서 시작해 이미 그 결과가 적용돼 있음",
        "    - 고른 에셋이 지금 화면과 너무 비슷함(캐스팅 문제)",
        `  프레임을 직접 확인하세요: ${file}`,
      ].join("\n"),
    );
  }
  return observed;
}
