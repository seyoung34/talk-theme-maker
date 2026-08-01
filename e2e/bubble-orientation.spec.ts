import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures/test";
import { readRenderedUploadHalves, uploadAsymmetricSlotImage, waitForEditorReady } from "./fixtures/editor";

/**
 * 말풍선 좌우 방향 계약.
 *
 * 이 스위트가 존재하는 이유는 단위 테스트가 픽셀 방향에 닿지 못하기 때문이다. 반전·나인패치
 * 인코딩·배율 리사이즈가 모두 2D 캔버스를 거치는데, Vitest가 쓰는 happy-dom은
 * `canvas.getContext("2d")`에 `null`을 돌려준다. marker 수식과 CSS 값 같은 순수 계산은 계속
 * Vitest가 담당하고(`lib/theme/android/export.test.ts`, `lib/theme/ios/export.test.ts`),
 * **실제로 어느 쪽이 어느 쪽으로 그려졌는지**만 여기서 확인한다.
 *
 * 지금은 반전 기능을 넣기 전의 기준선만 고정한다. 좌우반전을 프로젝트 데이터로 옮긴 뒤
 * "반전 토글 → 좌우가 바뀌고 다시 토글하면 되돌아온다"를 여기에 추가한다.
 */
const asymmetric = {
  name: "e2e-orientation.png",
  left: [220, 40, 40] as const,
  right: [40, 60, 220] as const,
  size: 32,
};

test.describe("업로드 이미지의 좌우 방향", () => {
  test("올린 그대로의 좌우로 화면에 그려진다", async ({ page }) => {
    await page.goto("/edit");
    await waitForEditorReady(page);
    await uploadAsymmetricSlotImage(page, asymmetric);

    const halves = await readRenderedUploadHalves(page);

    expect(halves.width).toBe(asymmetric.size);
    expect(halves.height).toBe(asymmetric.size);
    expect(halves.left).toEqual([...asymmetric.left]);
    expect(halves.right).toEqual([...asymmetric.right]);
  });

  test("판별 helper가 좌우를 실제로 구분한다", async ({ page }) => {
    // helper 자체의 자기 점검이다. 좌우를 같은 값으로 읽어 오면 위 테스트는 반전이 일어나도
    // 통과해 버린다. 두 절반이 서로 다르다는 것을 먼저 확인해 둔다.
    await page.goto("/edit");
    await waitForEditorReady(page);
    await uploadAsymmetricSlotImage(page, asymmetric);

    const halves = await readRenderedUploadHalves(page);

    expect(halves.left).not.toEqual(halves.right);
  });
});

/**
 * 좌우반전이 파일이 아니라 슬롯 상태가 됐는지 확인한다.
 *
 * 예전에는 토글할 때마다 `renderEditedImageFile()`이 새 File을 구워 업로드 목록에 추가했다.
 * 이 스위트의 핵심은 **토글해도 업로드가 늘지 않는다**는 것이고, 이는 브라우저에서만 확인할 수
 * 있다(파일 생성이 캔버스를 거친다).
 */
test.describe("말풍선 좌우반전", () => {
  async function openBubbleEditor(page: Page) {
    await page.goto("/edit");
    await waitForEditorReady(page);
    await page.getByRole("button", { name: "채팅방", exact: true }).first().click();
    await page.getByRole("button", { name: "말풍선", exact: true }).first().click();
    await expect(page.getByRole("heading", { name: "말풍선 편집" })).toBeVisible();
  }

  test("반전을 여러 번 토글해도 업로드 후보가 늘지 않는다", async ({ page }) => {
    await openBubbleEditor(page);
    await uploadAsymmetricSlotImage(page, { ...asymmetric, name: "e2e-flip-upload.png" });

    const uploadCards = page.getByRole("button", { name: /^내 업로드/ });
    const before = await uploadCards.count();

    const flip = page.getByRole("button", { name: "좌우 반전" });
    for (let index = 0; index < 3; index += 1) await flip.click();

    await expect(uploadCards).toHaveCount(before);
  });

  test("반전 상태가 버튼에 남고 다시 누르면 풀린다", async ({ page }) => {
    await openBubbleEditor(page);
    await uploadAsymmetricSlotImage(page, { ...asymmetric, name: "e2e-flip-toggle.png" });

    const flip = page.getByRole("button", { name: "좌우 반전" });
    await expect(flip).toHaveAttribute("aria-pressed", "false");

    await flip.click();
    await expect(flip).toHaveAttribute("aria-pressed", "true");

    await flip.click();
    await expect(flip).toHaveAttribute("aria-pressed", "false");
  });

  test("반전은 업로드한 원본 바이트를 바꾸지 않는다", async ({ page }) => {
    // 비파괴가 핵심이다. 반전 뒤에도 저장된 파일의 좌우는 올린 그대로여야 한다.
    await openBubbleEditor(page);
    await uploadAsymmetricSlotImage(page, { ...asymmetric, name: "e2e-flip-bytes.png" });

    const before = await readRenderedUploadHalves(page);
    await page.getByRole("button", { name: "좌우 반전" }).click();
    const after = await readRenderedUploadHalves(page);

    expect(after).toEqual(before);
  });
});
