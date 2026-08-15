import { expect, test } from "./fixtures/test";
import { expectAutosaveSaved } from "./fixtures/editor";
import { createSolidPng } from "./fixtures/image";

/**
 * 감사 보고서 시나리오 10 — 모바일 환경 편집.
 *
 * 모바일 편집기는 데스크톱과 다른 레이아웃(`MobileEditActionBar` + `MobileEditSheet`)을 쓴다.
 * 같은 스펙을 뷰포트만 바꿔 돌리면 선택자가 어긋나므로 별도 프로젝트로 분리했다.
 * 여기서는 좁은 화면에서 편집 진입과 시트 조작이 가능한지까지만 본다. 상세 편집 흐름은
 * 데스크톱 스펙이 담당한다.
 */
test.describe("모바일 편집기", () => {
  test("좁은 화면에서 편집기가 열리고 핵심 동작이 가려지지 않는다", async ({ page }) => {
    await page.goto("/edit");

    // 모바일 액션바 버튼은 보이는 글자("저장"·"다운로드")와 접근성 이름이 다르다.
    // 접근성 이름 쪽이 계약이므로 그것으로 찾는다.
    await expect(page.getByRole("button", { name: "편집 종료" })).toBeVisible();
    await expect(page.getByRole("button", { name: "템플릿 저장", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "테마 다운로드", exact: true })).toBeVisible();

    // 편집 시트는 섹션 선택 상태로 접혀 시작한다.
    await expect(page.getByRole("button", { name: "친구·메인", exact: true })).toBeVisible();
  });

  test("편집 시트를 펼쳐 슬롯 이미지를 올릴 수 있다", async ({ page }) => {
    await page.goto("/edit");
    await expect(page.getByRole("button", { name: "편집 종료" })).toBeVisible();

    await page.getByRole("button", { name: "편집 패널 펼치기" }).click();
    await expect(page.getByRole("button", { name: "배경", exact: true })).toBeVisible();

    // 모바일 패널은 색상/이미지를 탭으로 나눈다. 업로드 입력은 이미지 쪽에만 있다.
    await page.getByRole("button", { name: "이미지로 설정" }).click();
    await expect(page.locator('input[type="file"]')).toHaveCount(1);

    await page.locator('input[type="file"]').setInputFiles({
      name: "e2e-mobile.png",
      mimeType: "image/png",
      buffer: createSolidPng(16, 16, [90, 200, 140]),
    });

    // 모바일 패널은 파일명을 노출하지 않는다. 선택 상태와 삭제 동작이 나타난 뒤 자동 저장까지 확인한다.
    await expect(page.getByRole("button", { name: "업로드 이미지", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("button", { name: "업로드 이미지 삭제" })).toBeVisible();
    await expectAutosaveSaved(page);
  });

  test("랜딩이 320~412px에서 가로 스크롤 없이 CTA를 온전히 보여준다", async ({ page }) => {
    // UX-010: 기기별 최소 폭에서 문서 폭·CTA 경계를 함께 확인한다.
    for (const viewport of [320, 360, 390, 412]) {
      await page.setViewportSize({ width: viewport, height: 844 });
      await page.goto("/");
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

      const overflow = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1);

      const cta = page.getByRole("link", { name: "내 테마 만들기" }).first();
      const box = await cta.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(viewport);
    }
  });

  test("랜딩은 오프닝 뒤에 타이틀, 목업, CTA 순서로 보여 준다", async ({ page }) => {
    await page.goto("/");
    const opening = page.getByTestId("hero-opening");
    await expect(opening).toBeVisible();

    const title = page.getByRole("heading", { level: 1 });
    await expect(title).toBeVisible();
    await expect(opening).toHaveCount(0);

    const mockup = page.getByTestId("hero-mockup");
    const cta = page.getByRole("link", { name: "내 테마 만들기" }).first();
    await expect(cta).toBeVisible();
    await expect(mockup).toBeVisible();

    const [titleBox, mockupBox, ctaBox] = await Promise.all([
      title.boundingBox(),
      mockup.boundingBox(),
      cta.boundingBox(),
    ]);
    expect(titleBox).not.toBeNull();
    expect(mockupBox).not.toBeNull();
    expect(ctaBox).not.toBeNull();
    expect(mockupBox!.y).toBeGreaterThan(titleBox!.y);
    expect(ctaBox!.y).toBeGreaterThanOrEqual(mockupBox!.y + mockupBox!.height);
  });

  test("모션 감소 설정에서는 랜딩 최종 상태를 바로 보여 준다", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");

    await expect(page.getByTestId("hero-opening")).toHaveCount(0);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByTestId("hero-mockup")).toBeVisible();
    await expect(page.getByRole("link", { name: "내 테마 만들기" }).first()).toBeVisible();
  });
});
