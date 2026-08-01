import { expect, test } from "./fixtures/test";
import {
  expectAutosaveSaved,
  readRenderedUploadImage,
  uploadSlotImage,
  waitForEditorReady,
} from "./fixtures/editor";

/**
 * UX-001 / SQ-20~25 — 저장하지 않은 편집 상태의 자동 저장과 복구.
 *
 * 이 스위트가 존재하는 이유는 단위 테스트가 닿지 못하는 지점이 있기 때문이다. 자동 저장은 업로드한
 * `File`을 IndexedDB에 structured clone으로 넣는데, `fake-indexeddb`는 `File`을 메타데이터만 남은
 * 객체로 낮춘다. 그래서 "레코드가 저장됐다"까지는 vitest로 확인할 수 있어도 **이미지의 바이트가
 * 실제로 돌아오는지**는 실제 브라우저에서만 확인할 수 있다. 자동 저장에서 가장 중요한 부분이 그것이다.
 */
test.describe("편집기 자동 저장", () => {
  test("업로드한 이미지가 새로고침 뒤 바이트까지 그대로 복원된다", async ({ page }) => {
    const uploaded = { name: "e2e-autosave.png", rgb: [220, 30, 90] as const, size: 24 };

    await page.goto("/edit");
    await waitForEditorReady(page);
    await uploadSlotImage(page, uploaded);
    await expectAutosaveSaved(page);

    const before = await readRenderedUploadImage(page);
    expect(before.rgb).toEqual([...uploaded.rgb]);

    await page.reload();

    // 자동으로 덮어쓰지 않고 반드시 묻는다. 이 확인 자체가 SQ-23의 계약이다.
    await expect(page.getByRole("heading", { name: "이어서 편집할까요?" })).toBeVisible();
    await expect(page.getByText("이미지 1")).toBeVisible();
    await page.getByRole("button", { name: "이어서 편집" }).click();

    await waitForEditorReady(page);

    const after = await readRenderedUploadImage(page);
    expect(after).toEqual(before);
  });

  test("debounce가 끝나기 전에 내부 종료해도 마지막 변경을 저장한다", async ({ page }) => {
    const uploaded = { name: "e2e-exit-flush.png", rgb: [240, 80, 30] as const, size: 24 };

    await page.goto("/edit");
    await waitForEditorReady(page);
    await uploadSlotImage(page, uploaded);

    // autosaveDebounceMs(2.5초)를 기다리지 않고 앱 내부 종료를 확정한다.
    await page.getByRole("button", { name: "편집 종료" }).click();
    await page.getByRole("button", { name: "편집 종료하기" }).click();
    await expect(page).toHaveURL(/\/template$/);

    const recentWorkCard = page.locator('article[role="button"]').filter({ hasText: "최근 작업" });
    await expect(recentWorkCard).toBeVisible();
    await recentWorkCard.click();
    await expect(page).toHaveURL(/\/edit$/);
    await waitForEditorReady(page);

    const restored = await readRenderedUploadImage(page);
    expect(restored.rgb).toEqual([...uploaded.rgb]);
  });

  test("새로 시작을 고르면 초안이 지워지고 프롬프트가 다시 뜨지 않는다", async ({ page }) => {
    await page.goto("/edit");
    await waitForEditorReady(page);
    await uploadSlotImage(page, { name: "e2e-discard.png", rgb: [30, 120, 240] });
    await expectAutosaveSaved(page);

    await page.reload();
    await page.getByRole("button", { name: "새로 시작" }).click();

    await waitForEditorReady(page);
    await expect(page.getByText("e2e-discard.png")).toHaveCount(0);

    await page.reload();
    await waitForEditorReady(page);
    await expect(page.getByRole("button", { name: "이어서 편집" })).toHaveCount(0);
  });

  test("아무것도 편집하지 않으면 이어하기 프롬프트를 만들지 않는다", async ({ page }) => {
    // 템플릿 로드와 배경 hydration을 사용자 변경으로 세면, 열어만 두고 나간 사용자에게도
    // 프롬프트가 떠서 신뢰를 잃는다. 코드리뷰에서 실제로 발견됐던 회귀다.
    await page.goto("/edit");
    await waitForEditorReady(page);
    await page.waitForTimeout(5_000);

    await page.reload();

    await waitForEditorReady(page);
    await expect(page.getByRole("button", { name: "이어서 편집" })).toHaveCount(0);
  });

  test("내 템플릿으로 저장하면 자동 저장 초안을 정리한다", async ({ page }) => {
    // SQ-25 정리 정책: 저장된 템플릿으로 되찾을 수 있게 된 시점에만 초안을 지운다.
    await page.goto("/edit");
    await waitForEditorReady(page);
    await uploadSlotImage(page, { name: "e2e-saved.png", rgb: [10, 40, 200] });
    await expectAutosaveSaved(page);

    await page.getByRole("button", { name: "내 템플릿으로 저장" }).click();
    await expect(page.getByRole("heading", { name: "내 템플릿 저장" })).toBeVisible();
    await page.getByRole("button", { name: "저장", exact: true }).click();

    await expect(page.getByRole("heading", { name: "내 템플릿 저장" })).toHaveCount(0);

    await page.reload();
    await waitForEditorReady(page);
    await expect(page.getByRole("button", { name: "이어서 편집" })).toHaveCount(0);
  });

  test("최근 작업은 내 템플릿 최상단에서 계속할 수 있다", async ({ page }) => {
    await page.goto("/edit");
    await waitForEditorReady(page);
    await uploadSlotImage(page, { name: "e2e-recent.png", rgb: [80, 110, 220] });
    await expectAutosaveSaved(page);

    await page.getByRole("button", { name: "편집 종료" }).click();
    await page.getByRole("button", { name: "편집 종료하기" }).click();
    await expect(page).toHaveURL(/\/template$/);

    const recentWorkCard = page.locator('article[role="button"]').filter({ hasText: "최근 작업" });
    await expect(recentWorkCard).toBeVisible();
    await expect(recentWorkCard.getByText("자동 저장", { exact: true })).toBeVisible();
    await recentWorkCard.click();

    await expect(page).toHaveURL(/\/edit$/);
    await waitForEditorReady(page);
    const restored = await readRenderedUploadImage(page);
    expect(restored.rgb).toEqual([80, 110, 220]);
  });

  test("새 템플릿을 열어도 첫 변경 전에는 기존 최근 작업을 유지한다", async ({ page }) => {
    await page.goto("/edit");
    await waitForEditorReady(page);
    await uploadSlotImage(page, { name: "e2e-before-replace.png", rgb: [180, 70, 90] });
    await expectAutosaveSaved(page);

    await page.getByRole("button", { name: "내 템플릿으로 저장" }).click();
    await page.getByPlaceholder("템플릿 이름").fill("교체 테스트");
    await page.getByRole("button", { name: "저장", exact: true }).click();
    await expect(page.getByRole("heading", { name: "내 템플릿 저장" })).toHaveCount(0);

    await uploadSlotImage(page, { name: "e2e-kept-recent.png", rgb: [40, 170, 120] });
    await expectAutosaveSaved(page);
    await page.getByRole("button", { name: "편집 종료" }).click();
    await page.getByRole("button", { name: "편집 종료하기" }).click();

    await page.locator('article[role="button"]').filter({ hasText: "저장본 미리보기" }).click();
    await page.getByRole("button", { name: "Android 편집 계속하기" }).click();
    await expect(page.getByRole("heading", { name: "최근 작업이 남아 있습니다" })).toBeVisible();
    await page.getByRole("button", { name: "선택한 템플릿으로 시작" }).click();
    await waitForEditorReady(page);

    // 아무것도 바꾸지 않고 나왔으므로 replace 의도는 아직 실행되지 않아야 한다.
    await page.getByRole("button", { name: "편집 종료" }).click();
    await page.getByRole("button", { name: "편집 종료하기" }).click();
    await expect(page.locator('article[role="button"]').filter({ hasText: "최근 작업" })).toBeVisible();
  });
});

test.describe("단일 편집 탭", () => {
  test("두 번째 편집 탭을 차단하고 갤러리 복귀만 제공한다", async ({ page, context }) => {
    await page.goto("/edit");
    await waitForEditorReady(page);

    const secondPage = await context.newPage();
    await secondPage.goto("/edit");
    await expect(secondPage.getByRole("heading", { name: "다른 탭에서 편집 중입니다." })).toBeVisible();
    await secondPage.getByRole("button", { name: "템플릿 갤러리로 돌아가기" }).click();
    await expect(secondPage).toHaveURL(/\/template$/);
  });
});

/**
 * UX-002 / SQ-11 — 이탈 경고는 자동 저장이 있어도 유지한다. debounce 구간과 저장 실패가
 * 남아 있어 대체 관계가 아니다. 다만 **변경이 있을 때만** 등록돼야 한다.
 */
test.describe("이탈 경고", () => {
  test("빈 편집기를 떠날 때는 경고하지 않는다", async ({ page }) => {
    const dialogs: string[] = [];
    page.on("dialog", (dialog) => {
      dialogs.push(dialog.type());
      void dialog.accept();
    });

    await page.goto("/edit");
    await waitForEditorReady(page);
    // 화면 전환은 편집이 아니다. 사용자 제스처를 만들어 브라우저가 경고를 띄울 수 있는 상태로 둔다.
    await page.getByRole("button", { name: "채팅방", exact: true }).first().click();
    await page.waitForTimeout(4_000);

    await page.close({ runBeforeUnload: true });
    await new Promise((resolve) => setTimeout(resolve, 2_000));

    expect(dialogs).toEqual([]);
  });

  test("편집한 내용이 있으면 떠나기 전에 경고한다", async ({ page }) => {
    const dialogs: string[] = [];
    page.on("dialog", (dialog) => {
      dialogs.push(dialog.type());
      void dialog.accept();
    });

    await page.goto("/edit");
    await waitForEditorReady(page);
    await uploadSlotImage(page, { name: "e2e-dirty.png", rgb: [10, 200, 40] });
    await expectAutosaveSaved(page);

    await page.close({ runBeforeUnload: true });
    await new Promise((resolve) => setTimeout(resolve, 2_000));

    expect(dialogs).toEqual(["beforeunload"]);
  });
});
