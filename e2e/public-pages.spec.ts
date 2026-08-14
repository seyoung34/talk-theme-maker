import { expect, test } from "./fixtures/test";
import { waitForEditorReady } from "./fixtures/editor";
import { templateCards } from "./fixtures/gallery";

/**
 * 비로그인 사용자가 랜딩에서 편집기까지 도달하는 경로. 감사 보고서 시나리오 1·2다.
 * 각 페이지의 `<h1>`을 기준으로 삼아 문서 구조 회귀(A11Y-003 계열)도 함께 잡는다.
 */
test.describe("공개 페이지", () => {
  test("랜딩에서 템플릿 갤러리로 이동한다", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    await page.getByRole("link", { name: "내 테마 만들기" }).first().click();

    await expect(page).toHaveURL(/\/template$/);
    await expect(page.getByRole("heading", { level: 1, name: /원하는 템플릿을 골라/ })).toBeVisible();
  });

  test("데스크톱 랜딩 CTA가 첫 화면의 메인 텍스트 아래에 보인다", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");

    const title = page.getByRole("heading", { level: 1 });
    const cta = page.getByRole("link", { name: "내 테마 만들기" }).first();
    await expect(title).toBeVisible();
    await expect(cta).toBeVisible();

    const [titleBox, ctaBox] = await Promise.all([title.boundingBox(), cta.boundingBox()]);
    expect(titleBox).not.toBeNull();
    expect(ctaBox).not.toBeNull();
    expect(ctaBox!.y).toBeGreaterThanOrEqual(titleBox!.y + titleBox!.height);
    expect(ctaBox!.y + ctaBox!.height).toBeLessThanOrEqual(900);
  });

  test("가이드와 정책 페이지가 열린다", async ({ page }) => {
    await page.goto("/guide");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    await page.goto("/terms");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    await page.goto("/privacy");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });

  test("없는 주소는 404 화면과 복귀 경로를 준다", async ({ page }) => {
    const response = await page.goto("/this-route-does-not-exist");

    expect(response?.status()).toBe(404);
    await expect(page.getByRole("heading", { level: 1, name: "찾으시는 페이지가 없어요" })).toBeVisible();
    await expect(page.getByRole("link", { name: "내 테마 만들기" })).toBeVisible();
  });
});

test.describe("템플릿 선택", () => {
  test("템플릿을 골라 Android 편집기로 들어간다", async ({ page }) => {
    await page.goto("/template");

    // E2E 서버는 Supabase를 비활성화하므로 공개 시스템 템플릿이 없을 수 있다.
    // 코드 base 템플릿을 갤러리 상품처럼 대신 노출하지 않는 것도 새 계약이다.
    const firstCard = templateCards(page).first();
    const emptyState = page.getByText("현재 공개된 시스템 템플릿이 없습니다.");
    await expect(firstCard.or(emptyState)).toBeVisible();
    if (await emptyState.isVisible()) return;

    await expect(firstCard).toBeVisible();
    const templateName = (await firstCard.locator("h3, strong, span").first().textContent())?.trim();
    expect(templateName).toBeTruthy();

    await firstCard.click();
    await page.getByRole("button", { name: "Android로 시작" }).click();

    await expect(page).toHaveURL(/\/edit$/);
    await waitForEditorReady(page);
    await expect(page.getByRole("heading", { level: 1, name: templateName! })).toBeVisible();
    await expect(page.getByText("Android", { exact: true }).first()).toBeVisible();
  });
});
