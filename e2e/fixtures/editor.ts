import { expect, type Page } from "@playwright/test";
import { createHalfSplitPng, createSolidPng, type Rgb } from "./image";

/** `useEditorAutosave`의 debounce(2.5초)보다 넉넉히 기다린다. */
export const autosaveSettleTimeoutMs = 20_000;

/** 편집기가 부트스트랩을 마치고 슬롯 편집 패널을 띄울 때까지 기다린다. */
export async function waitForEditorReady(page: Page) {
  await expect(page.getByRole("button", { name: "편집 종료" })).toBeVisible();
  await expect(page.locator('input[type="file"]')).toHaveCount(1);
}

export async function uploadSlotImage(page: Page, options: { name: string; rgb: Rgb; size?: number }) {
  const size = options.size ?? 24;
  await page.locator('input[type="file"]').setInputFiles({
    name: options.name,
    mimeType: "image/png",
    buffer: createSolidPng(size, size, options.rgb),
  });
  // 파일명은 현재 편집 UI가 노출하지 않는다. "내 업로드"는 업로드 후보가 생겼을 때만 나타나므로
  // 업로드 상태 전환 신호로 쓴다. 각 시나리오가 미리보기 blob 바이트와 IndexedDB 복원 결과를 검증한다.
  await expect(page.getByText("내 업로드").first()).toBeVisible();
}

/**
 * 좌우 절반의 색이 다른 이미지를 올린다. 좌우반전 검증용이다.
 *
 * 단색 이미지로는 반전을 확인할 수 없다 — 뒤집어도 바이트가 같다.
 */
export async function uploadAsymmetricSlotImage(
  page: Page,
  options: { name: string; left: Rgb; right: Rgb; size?: number },
) {
  const size = options.size ?? 24;
  await page.locator('input[type="file"]').setInputFiles({
    name: options.name,
    mimeType: "image/png",
    buffer: createHalfSplitPng(size, size, options.left, options.right),
  });
  await expect(page.getByText("내 업로드").first()).toBeVisible();
}

/**
 * 자동 저장이 "저장됨"까지 갔는지 기다린다.
 *
 * 배지(`AutosaveStatusBadge`)는 레이아웃마다 따로 렌더된다. 모바일에서는 액션바(보이는 것)와
 * 액션레일(`sr-only`)이 함께 떠서, 텍스트로만 찾으면 두 개가 잡혀 strict mode 위반이 난다.
 * 배지는 `role="status"`를 달고 있으므로 그 역할로 좁히고 첫 번째만 기다린다.
 */
export async function expectAutosaveSaved(page: Page) {
  await expect(page.getByRole("status").filter({ hasText: /저장됨/ }).first()).toBeVisible({ timeout: autosaveSettleTimeoutMs });
}

async function findRenderedUploadBlobUrl(page: Page) {
  const blobUrl = await page.evaluate(() => {
    for (const element of Array.from(document.querySelectorAll<HTMLElement>("*"))) {
      const backgroundImage = getComputedStyle(element).backgroundImage;
      if (!backgroundImage.includes("blob:")) continue;
      const match = /blob:[^"')]+/.exec(backgroundImage);
      if (match) return match[0];
    }
    return null;
  });
  if (!blobUrl) throw new Error("업로드 이미지를 표시하는 blob URL을 찾지 못했습니다.");
  return blobUrl;
}

/**
 * 화면에 그려지고 있는 업로드 이미지의 좌우 절반 색을 읽는다.
 *
 * 좌우반전이 실제 픽셀에 적용됐는지 판별하는 유일한 방법이다. 반전은 캔버스를 거치는데
 * happy-dom에는 2D 컨텍스트가 없어 단위 테스트에서는 확인할 수 없다.
 * 표본은 각 절반의 가운데(1/4, 3/4 지점)에서 뽑아 경계 픽셀의 보간을 피한다.
 */
export async function readRenderedUploadHalves(page: Page) {
  const blobUrl = await findRenderedUploadBlobUrl(page);

  return page.evaluate(async (url) => {
    const blob = await (await fetch(url)).blob();
    const bitmap = await createImageBitmap(blob);
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("2d context를 얻지 못했습니다.");
    context.drawImage(bitmap, 0, 0);

    const y = Math.floor(bitmap.height / 2);
    const sample = (x: number) => {
      const { data } = context.getImageData(x, y, 1, 1);
      return [data[0], data[1], data[2]] as [number, number, number];
    };

    return {
      width: bitmap.width,
      height: bitmap.height,
      left: sample(Math.floor(bitmap.width / 4)),
      right: sample(Math.floor((bitmap.width * 3) / 4)),
    };
  }, blobUrl);
}

/**
 * 화면에 실제로 그려지고 있는 업로드 이미지를 디코딩해 중앙 픽셀을 읽는다.
 *
 * "복원됐다"를 파일명 표시로만 확인하면 메타데이터만 남고 바이트가 사라진 경우를 놓친다.
 * 미리보기가 쓰는 blob URL을 그대로 다시 읽어 크기·색·바이트 수까지 비교한다.
 */
export async function readRenderedUploadImage(page: Page) {
  const blobUrl = await findRenderedUploadBlobUrl(page);

  return page.evaluate(async (url) => {
    const blob = await (await fetch(url)).blob();
    const bitmap = await createImageBitmap(blob);
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("2d context를 얻지 못했습니다.");
    context.drawImage(bitmap, 0, 0);
    const { data } = context.getImageData(Math.floor(bitmap.width / 2), Math.floor(bitmap.height / 2), 1, 1);
    return {
      width: bitmap.width,
      height: bitmap.height,
      rgb: [data[0], data[1], data[2]] as [number, number, number],
      byteLength: blob.size,
      type: blob.type,
    };
  }, blobUrl);
}
