/**
 * 말풍선 미리보기의 화면 배치 계산.
 *
 * 여기서 정하는 것은 "문서를 화면에 몇 배로 그리는가"뿐이고, 문서 자체의 크기(프레임)는
 * `lib/theme/bubbleBuilder/geometry`가 정한다. 예전에는 이 둘이 한 값으로 묶여 있어서
 * 프레임을 줄이면 화면 위 편집 영역도 같이 줄었다 — 종이를 작게 자르면 돋보기도 멀어지는 셈이라,
 * 정작 작은 프레임을 세밀하게 손볼 방법이 없었다. 이제 배율은 `fitScale × zoom`이고
 * `zoom`은 사용자가 쥔다.
 */

/** 프레임 손잡이가 프레임 바깥으로 내미는 길이(24px 버튼의 절반). 뷰포트 여백의 근거다. */
export const bubblePreviewHandleInset = 12;

/** 사용자 줌 배율의 허용 범위. 1이 "맞춤"이다. */
export const bubblePreviewZoomRange = { min: 0.5, max: 4 } as const;

/** 줌 버튼 한 번의 배율. 손가락 두 번이면 두 배 가까이 간다. */
export const bubblePreviewZoomStep = 1.25;

export type BubblePreviewSize = { width: number; height: number };
export type BubblePreviewPan = { x: number; y: number };

export function clampBubblePreviewZoom(zoom: number) {
  return clamp(zoom, bubblePreviewZoomRange.min, bubblePreviewZoomRange.max);
}

/**
 * 프레임 상한이 남는 자리에 통째로 들어가는 배율.
 *
 * 기준을 현재 프레임이 아니라 **상한**으로 잡는다. 현재 프레임에 맞추면 프레임을 키우거나
 * 줄일 때마다 화면 위 상자 크기가 그대로여서 손잡이를 끌어도 아무 일이 없는 것처럼 보인다.
 * 상한 기준이면 프레임 크기 변화가 화면에서 그대로 읽히고, 손잡이가 나갈 여백도 늘 남는다.
 */
export function getBubblePreviewFitScale(available: Partial<BubblePreviewSize>, maxCanvas: BubblePreviewSize) {
  const margin = bubblePreviewHandleInset * 2;
  const candidates: number[] = [];
  if (available.width && maxCanvas.width > 0) candidates.push((available.width - margin) / maxCanvas.width);
  if (available.height && maxCanvas.height > 0) candidates.push((available.height - margin) / maxCanvas.height);
  if (!candidates.length) return 1;
  return clamp(Math.min(...candidates), 0.2, 4);
}

export function getBubblePreviewLayout(
  canvas: BubblePreviewSize,
  maxCanvas: BubblePreviewSize,
  available: Partial<BubblePreviewSize>,
  zoom = 1,
) {
  const fitScale = getBubblePreviewFitScale(available, maxCanvas);
  const scale = fitScale * clampBubblePreviewZoom(zoom);
  return {
    fitScale,
    scale,
    stageWidth: canvas.width * scale,
    stageHeight: canvas.height * scale,
  };
}

/**
 * 이동 가능한 범위.
 *
 * 무대가 뷰포트 안에 다 들어오면 손잡이 여백만큼만 움직인다 — 다 보이는데 밀 수 있으면
 * 실수로 화면 밖으로 밀어 놓고 사라졌다고 여기게 된다. 확대해서 넘칠 때만 넘친 만큼 열어 준다.
 */
export function clampBubblePreviewPan(pan: BubblePreviewPan, stage: BubblePreviewSize, viewport: Partial<BubblePreviewSize>): BubblePreviewPan {
  const margin = bubblePreviewHandleInset * 2;
  const limitX = Math.max(0, (stage.width - (viewport.width ?? stage.width)) / 2) + margin;
  const limitY = Math.max(0, (stage.height - (viewport.height ?? stage.height)) / 2) + margin;
  return { x: clamp(pan.x, -limitX, limitX), y: clamp(pan.y, -limitY, limitY) };
}

/**
 * 한 점을 제자리에 두고 확대·축소했을 때의 새 이동값.
 *
 * `anchor`는 뷰포트 **중심 기준** 좌표다. 이걸 무시하고 배율만 바꾸면 늘 무대 한가운데가
 * 확대돼서, 손가락으로 집은 곳이나 마우스 커서 아래가 화면 밖으로 밀려난다.
 */
export function getBubblePreviewZoomPan(pan: BubblePreviewPan, anchor: BubblePreviewPan, scaleRatio: number): BubblePreviewPan {
  return {
    x: anchor.x - (anchor.x - pan.x) * scaleRatio,
    y: anchor.y - (anchor.y - pan.y) * scaleRatio,
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}
