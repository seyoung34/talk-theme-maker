import { expect, test } from "./fixtures/test";
import { readRenderedUploadImage, uploadSlotImage, waitForEditorReady } from "./fixtures/editor";

test("로그인 이동 전에 저장한 편집 내용과 내보내기 옵션을 돌아와 복구한다", async ({ page }) => {
  await page.route("**/api/me", (route) => route.fulfill({ status: 401, contentType: "application/json", body: "{}" }));
  await page.route("**/api/credits/signup-bonus", (route) => route.fulfill({ status: 401, contentType: "application/json", body: "{}" }));
  let exportRequests = 0;
  await page.route("**/api/export/android", (route) => {
    exportRequests += 1;
    return route.fulfill({ status: 500, body: "unexpected export" });
  });

  await page.goto("/edit");
  await waitForEditorReady(page);
  await uploadSlotImage(page, { name: "recovery.png", rgb: [50, 130, 210] });
  const before = await readRenderedUploadImage(page);
  await page.getByRole("button", { name: "다운로드", exact: true }).click();
  await page.getByLabel("앱 이름").fill("복구 테스트 테마");
  await page.getByRole("button", { name: "로그인·가입 후 받기" }).click();
  await expect(page).toHaveURL(/\/login\?/);

  const returnTo = new URL(page.url()).searchParams.get("returnTo");
  expect(returnTo).toMatch(/^\/edit\?resume=/);
  await page.goto(returnTo!);
  await expect(page.getByText("이전 내보내기 준비 작업을 복원했어요. 내용을 확인한 뒤 내보내세요.")).toBeVisible();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByLabel("앱 이름")).toHaveValue("복구 테스트 테마");
  await expect(page.getByRole("button", { name: "로그인·가입 후 받기" })).toBeVisible();
  await page.getByRole("button", { name: "다운로드 창 닫기" }).click();
  await waitForEditorReady(page);
  expect(await readRenderedUploadImage(page)).toEqual(before);
  expect(exportRequests).toBe(0);
});
