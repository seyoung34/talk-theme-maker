import type { BubbleDecorationContentBox } from "@/lib/theme/bubbleBuilder/types";

/** 여백을 못 재는 자리에서 쓰는 값. 원본 전체를 그림으로 본다(예전 동작). */
export const fullBubbleDecorationContentBox: BubbleDecorationContentBox = { x: 0, y: 0, width: 1, height: 1 };

/**
 * 훑는 해상도의 상한. 원본이 커도 이 크기로 줄여서 본다.
 *
 * 여기서 얻는 값은 클릭 영역과 경고 판정에 쓰는 사각형이라 픽셀 단위 정밀도가 필요 없다.
 * 4000×4000 원본을 그대로 훑으면 1600만 픽셀을 읽어야 하는데, 256으로 줄이면 6만 5천이다.
 */
const scanMaxSize = 256;

/**
 * 이 값 이하의 알파는 없는 것으로 본다.
 *
 * 안티에일리어싱이나 JPEG 재압축으로 생긴 1~2 정도의 알파까지 그림으로 세면 여백이 통째로
 * 남아 애초에 이 계산을 하는 의미가 없어진다.
 */
const alphaThreshold = 8;

/**
 * 원본에서 **불투명한 부분**이 차지하는 비율 사각형(0~1).
 *
 * 장식 이미지는 보통 그림 둘레에 투명 여백을 두고 저장된다. 그 여백까지 그림으로 세면
 * 두 가지가 어긋난다 — 클릭 판정이 빈자리를 먹어 아래에 있는 말풍선 본체를 잡을 수 없고,
 * `글자 영역과 겹쳐요` 같은 경고가 실제로는 아무것도 닿지 않았는데 뜬다.
 *
 * 훑지 못하면(캔버스를 못 쓰거나 픽셀을 못 읽는 환경) 전체를 돌려준다. 판정이 느슨해질 뿐
 * 예전과 같은 동작이라 안전한 쪽이다.
 */
export function getOpaqueContentBox(source: CanvasImageSource, width: number, height: number): BubbleDecorationContentBox {
  if (!(width > 0) || !(height > 0)) return fullBubbleDecorationContentBox;
  const ratio = Math.min(1, scanMaxSize / Math.max(width, height));
  const scanWidth = Math.max(1, Math.round(width * ratio));
  const scanHeight = Math.max(1, Math.round(height * ratio));

  try {
    const canvas = document.createElement("canvas");
    canvas.width = scanWidth;
    canvas.height = scanHeight;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return fullBubbleDecorationContentBox;
    context.clearRect(0, 0, scanWidth, scanHeight);
    context.drawImage(source, 0, 0, scanWidth, scanHeight);
    const { data } = context.getImageData(0, 0, scanWidth, scanHeight);

    let minX = scanWidth;
    let minY = scanHeight;
    let maxX = -1;
    let maxY = -1;
    for (let y = 0; y < scanHeight; y += 1) {
      for (let x = 0; x < scanWidth; x += 1) {
        if (data[(y * scanWidth + x) * 4 + 3] <= alphaThreshold) continue;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
    // 전부 투명한 이미지. 잘라낼 것이 없으니 전체를 쓴다.
    if (maxX < 0) return fullBubbleDecorationContentBox;

    // 줄여서 훑었으므로 가장자리를 한 칸씩 넉넉히 잡는다. 그림을 조금 더 남기는 쪽이 안전하다.
    const left = Math.max(0, minX - 1) / scanWidth;
    const top = Math.max(0, minY - 1) / scanHeight;
    const right = Math.min(scanWidth, maxX + 2) / scanWidth;
    const bottom = Math.min(scanHeight, maxY + 2) / scanHeight;
    return { x: left, y: top, width: right - left, height: bottom - top };
  } catch {
    return fullBubbleDecorationContentBox;
  }
}
