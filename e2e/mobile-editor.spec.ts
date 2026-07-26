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

    await expect(page.getByRole("button", { name: "편집 종료" })).toBeVisible();
    await expect(page.getByRole("button", { name: "저장", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "다운로드" })).toBeVisible();

    // 편집 시트는 섹션 선택 상태로 접혀 시작한다.
    await expect(page.getByRole("button", { name: "친구/메인", exact: true })).toBeVisible();
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

    // 모바일 패널은 파일명을 접고 상태와 썸네일만 보여 준다. 자동 저장까지 이어지는지가 요점이다.
    await expect(page.getByText("이미지 우선 적용 중 · 메인 배경 이미지")).toBeVisible();
    await expect(page.getByRole("button", { name: "업로드 이미지", exact: true })).toBeVisible();
    await expectAutosaveSaved(page);
  });

  test("랜딩 첫 화면이 가로 스크롤을 만들지 않는다", async ({ page }) => {
    // UX-010: 320~412px에서 랜딩이 가로로 삐져나오면 첫인상에서 바로 신뢰를 잃는다.
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    const overflow = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1);
  });
});
