import { settle, waitForEditorReady, waitForMobileEditorReady } from "./shared.mjs";

/**
 * 스텝 7 — 테마 파일 만들기.
 *
 * **누르지 않는 버튼이 있는 씬이다.** 다운로드 창의 확인 버튼은 크레딧을 쓰고 실제 빌드를
 * 시작한다. 촬영이 그걸 누르면 매 실행마다 크레딧이 나가고 Cloud Run 작업이 쌓인다.
 * 창을 여는 것까지는 안전하다 — 제품이 그렇게 설계돼 있다:
 *
 *   "내보내기는 크레딧을 쓰는데 인앱 브라우저는 파일을 받지 못한다. 다이얼로그를 연 뒤나
 *    제출한 뒤에 알리면 크레딧이 이미 나간 상태가 되므로, 다이얼로그를 열기도 전에 끼어든다."
 *   — ProjectImporterClient.tsx `requestExport`
 *
 * 그래서 창을 열어 **무엇을 확인하고 무엇을 고르는지**까지 보여주고 취소로 닫는다. 그 다음
 * (파일이 만들어지고 받는 것)은 옆의 순서 목록이 글로 적는다.
 *
 * **로그인이 필요하다.** 비로그인이면 확인 버튼 자리에 "로그인"이, 크레딧이 없으면 "크레딧
 * 구매"가 뜬다. 어느 쪽도 이 스텝이 가르쳐야 할 화면이 아니다. 러너가 `--env=local`에서
 * 미리 로그인하고, `seed-local-users.mjs`가 크레딧을 얹어 둔다.
 */

/** 다운로드 창이 열렸는지. 출력 형식 선택이 이 창에만 있다. */
const exportFormatGroup = (page) => page.locator('[aria-label="출력 형식"]').first();

async function openExportDialog(ctx, { downloadName }) {
  const { page, click, hold } = ctx;

  const download = page.getByRole("button", { name: downloadName }).first();
  await download.waitFor({ state: "visible", timeout: 20_000 });
  await hold(0.6);
  await click(download);

  const formats = exportFormatGroup(page);
  if (!(await formats.isVisible({ timeout: 20_000 }).catch(() => false))) {
    throw new Error(
      [
        "다운로드 창이 열리지 않았습니다.",
        "  비로그인이거나 크레딧이 없으면 로그인·구매 안내가 대신 뜹니다.",
        "  --env=local 로 실행하고 계정을 먼저 준비하세요:",
        "    node scripts/seed-local-users.mjs",
      ].join("\n"),
    );
  }
  /*
   * 창이 열렸다는 것만으로는 부족하다. **비로그인·크레딧 없음에서도 창은 열린다** — 확인 버튼만
   * "로그인·가입 후 받기"나 구매 안내로 바뀐다. 그대로 찍으면 스텝 7이 결제 화면을 가르치게 되고,
   * 실제로 한 번 그 상태로 끝까지 찍혔다(러너의 로그인이 조용히 건너뛰어졌다).
   *
   * 확인 버튼 문구로 판정한다. 상태를 화면에 드러내는 것이 그 버튼이기 때문이다.
   */
  const cta = page.locator("button").filter({ hasText: /받기|다운로드|로그인|가입|크레딧/ }).last();
  const ctaLabel = ((await cta.textContent().catch(() => "")) ?? "").trim();
  if (/로그인|가입|크레딧 구매|충전/.test(ctaLabel)) {
    throw new Error(
      [
        `다운로드 창이 준비되지 않은 상태입니다: "${ctaLabel}"`,
        "  로그인되지 않았거나 크레딧이 0입니다. 그 화면은 이 스텝이 가르칠 내용이 아닙니다.",
        "  node scripts/seed-local-users.mjs 로 계정과 크레딧을 준비하고 --env=local 로 실행하세요.",
      ].join("\n"),
    );
  }
  await hold(1.0);

  // 출력 형식을 짚기만 한다. 고르는 것은 화면에 이미 보이고, 여기서 확인 버튼까지 가면
  // 다음 동작이 크레딧을 쓰는 쪽으로 이어져 보인다.
  await ctx.point(formats);
  await hold(1.4);
  await ctx.unpoint();
}

async function closeExportDialog({ page, click, hold }) {
  // 확인 버튼이 아니라 취소다. 라벨은 상태에 따라 "취소"와 "닫기"로 갈린다.
  const cancel = page.getByRole("button", { name: /^(취소|닫기)$/ }).first();
  await click(cancel);
  await hold(0.5);
}

export const guideExportDialog = {
  id: "export-dialog",
  title: "테마 파일 만들기",
  description: "다운로드를 누르면 형식과 크레딧을 확인하는 창이 열립니다",

  async run(ctx) {
    const { page, baseURL, hold, dismissNotices, offCamera } = ctx;
    await offCamera(async () => {
      await page.goto(`${baseURL}/edit`, { waitUntil: "load" });
      await waitForEditorReady(page);
      await dismissNotices();
      await settle(page);
    });
    await hold(0.5);

    await openExportDialog(ctx, { downloadName: "다운로드" });
    await closeExportDialog(ctx);
  },
};

/**
 * 모바일 판. 다운로드는 하단 액션바에 아이콘으로 있어 접근성 이름으로 찾는다.
 * (`MobileEditActionBar.tsx`의 `aria-label`)
 */
export const guideExportDialogMobile = {
  ...guideExportDialog,
  async run(ctx) {
    const { page, baseURL, hold, dismissNotices, offCamera } = ctx;
    await offCamera(async () => {
      await page.goto(`${baseURL}/edit`, { waitUntil: "load" });
      await waitForMobileEditorReady(page);
      await dismissNotices();
      await settle(page);
    });
    await hold(0.5);

    await openExportDialog(ctx, { downloadName: "테마 다운로드" });
    await closeExportDialog(ctx);
  },
};
