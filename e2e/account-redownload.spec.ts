import { expect, test } from "./fixtures/test";
import { createExportJob, createMeResponse, expiredExportJob, mockAccountMe } from "./fixtures/account";

/**
 * SQ-29 / UX-003 — 폴링하던 탭이 닫힌 뒤 마이페이지에서 결과를 다시 받거나 정산 상태를 확인한다.
 *
 * 유료 Android 내보내기는 최대 12분 폴링인데 그 사이 탭이 닫히면 크레딧만 나가고 결과를 받을 길이
 * 없었다. 여기서 검증하는 것은 그 복구 경로의 **화면 계약**이다. 서버의 소유권·객체 존재 판정은
 * 라우트 핸들러의 몫이라 이 스위트가 대신하지 않는다.
 */
test.describe("마이페이지 내보내기 결과 복구", () => {
  test("완료된 Android 작업을 다시 받으면 매번 새 서명 URL을 발급받는다", async ({ page }) => {
    await mockAccountMe(page, () =>
      createMeResponse([createExportJob({ id: "job-done", export_name: "봄날 테마", file_name: "spring.apk", export_number: 7 })]),
    );

    // 서명 URL은 저장하지 않고 요청할 때마다 새로 발급한다는 계약을 호출별 URL로 확인한다.
    const issuedUrls: string[] = [];
    await page.route("**/api/export/android/download**", async (route) => {
      const downloadUrl = `${new URL(route.request().url()).origin}/e2e/signed/${issuedUrls.length}`;
      issuedUrls.push(downloadUrl);
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ downloadUrl, fileName: "spring.apk" }),
      });
    });
    await page.route("**/e2e/signed/**", async (route) => {
      await route.fulfill({
        status: 200,
        headers: { "content-disposition": 'attachment; filename="spring.apk"' },
        contentType: "application/vnd.android.package-archive",
        body: "e2e-apk-bytes",
      });
    });

    await page.goto("/account");

    const row = page.locator("div", { hasText: "봄날 테마" }).last();
    await expect(row.getByText("완료")).toBeVisible();

    const redownload = page.getByRole("button", { name: "다시 받기" });
    const firstDownload = page.waitForEvent("download");
    await redownload.click();
    await firstDownload;

    const secondDownload = page.waitForEvent("download");
    await redownload.click();
    await secondDownload;

    expect(issuedUrls).toHaveLength(2);
    expect(issuedUrls[0]).not.toBe(issuedUrls[1]);
  });

  test("보관 기간이 지난 작업은 다시 받기 버튼 대신 만료 안내를 보여 준다", async ({ page }) => {
    await mockAccountMe(page, () => createMeResponse([expiredExportJob({ id: "job-expired", export_name: "지난 테마" })]));

    await page.goto("/account");

    await expect(page.getByText("보관 기간이 지나 결과 파일이 삭제됐습니다. 편집 화면에서 다시 내보내 주세요.")).toBeVisible();
    await expect(page.getByRole("button", { name: "다시 받기" })).toHaveCount(0);
  });

  test("발급 시점에 결과가 사라졌으면 오류를 알리고 목록을 다시 읽는다", async ({ page }) => {
    // 표시용 만료 계산은 `completed_at + 7일`이라 낙관적이다. lifecycle 삭제가 먼저 일어난 경우
    // 버튼은 보이지만 발급이 410으로 막힌다. 그 상태를 성공처럼 보이게 두지 않는지 확인한다.
    const me = mockAccountMe(page, () =>
      createMeResponse([createExportJob({ id: "job-gone", export_name: "사라진 테마" })]),
    );
    await page.route("**/api/export/android/download**", async (route) => {
      await route.fulfill({
        status: 410,
        contentType: "application/json",
        body: JSON.stringify({ error: "보관 기간이 지나 결과 파일이 삭제됐습니다.", reason: "expired" }),
      });
    });

    await page.goto("/account");
    const callsBeforeClick = (await me).calls;

    await page.getByRole("button", { name: "다시 받기" }).click();

    // Next의 라우트 알림도 role="alert"이라 텍스트로 좁힌다.
    await expect(page.getByRole("alert").filter({ hasText: "보관 기간이 지나 결과 파일이 삭제됐습니다." })).toBeVisible();
    // reason: "expired"는 목록 재조회를 유발한다. 표시가 실제 상태를 따라가게 하는 장치다.
    await expect.poll(async () => (await me).calls).toBeGreaterThan(callsBeforeClick);
  });

  test("진행 중인 Android 작업은 상태 확인으로 정산을 직접 트리거할 수 있다", async ({ page }) => {
    // 워치독은 status 조회가 들어와야 돈다. 폴링 탭이 닫히면 아무도 조회하지 않아 예약이 남는다(SQ-04).
    let settled = false;
    await mockAccountMe(page, () =>
      createMeResponse([
        settled
          ? createExportJob({ id: "job-stuck", export_name: "멈춘 테마", status: "failed", error_code: "build_watchdog_timeout" })
          : createExportJob({ id: "job-stuck", export_name: "멈춘 테마", status: "pending", stage: "building", completed_at: null }),
      ]),
    );

    const statusCalls: string[] = [];
    await page.route("**/api/export/android/status**", async (route) => {
      statusCalls.push(route.request().url());
      settled = true;
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ status: "failed" }) });
    });

    await page.goto("/account");
    await expect(page.getByText("APK 빌드")).toBeVisible();

    await page.getByRole("button", { name: "상태 확인" }).click();

    await expect(page.getByText("실패")).toBeVisible();
    await expect(page.getByText("차감 없음")).toBeVisible();
    expect(statusCalls).toHaveLength(1);
    expect(statusCalls[0]).toContain("jobId=job-stuck");
  });

  test("iOS 결과에는 재다운로드 버튼 대신 서버 미보관 안내가 붙는다", async ({ page }) => {
    await mockAccountMe(page, () =>
      createMeResponse([createExportJob({ id: "job-ios", platform: "ios", export_mode: "ktheme", export_name: "아이폰 테마" })]),
    );

    await page.goto("/account");

    await expect(page.getByText("iOS 결과 파일은 서버에 보관하지 않습니다. 내려받은 파일을 기기에 보관해 주세요.")).toBeVisible();
    await expect(page.getByRole("button", { name: "다시 받기" })).toHaveCount(0);
  });

  test("이력이 없으면 빈 상태를 보여 준다", async ({ page }) => {
    await mockAccountMe(page, () => createMeResponse([]));

    await page.goto("/account");

    await expect(page.getByRole("heading", { level: 1, name: "마이페이지" })).toBeVisible();
    await expect(page.getByText("아직 내보내기 이력이 없습니다.")).toBeVisible();
  });
});
