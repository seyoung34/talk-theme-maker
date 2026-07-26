import { test as base } from "@playwright/test";

/**
 * 모든 스펙이 공유하는 기본 네트워크 상태.
 *
 * E2E 서버에는 Supabase 설정이 없어서 세션·추천 에셋 조회가 500으로 떨어진다. 그대로 두면
 * 서버 로그가 오류로 가득 차 진짜 실패를 가린다. 두 엔드포인트를 **비로그인 사용자의 정상 응답**으로
 * 고정해, 테스트가 검증하려는 상태(로그아웃, 추천 에셋 없음)를 오류가 아닌 값으로 표현한다.
 *
 * 로그인 상태가 필요한 스펙은 `page.route`로 다시 덮어쓰면 된다. 나중에 등록한 라우트가 우선한다.
 *
 * fixture의 두 번째 인자는 관례상 `use`라고 쓰지만, 그 이름이면 `react-hooks/rules-of-hooks`가
 * React Hook 호출로 오인한다. 이름만 바꿔서 규칙을 끄지 않고 피한다.
 */
export const test = base.extend({
  page: async ({ page }, runTest) => {
    await page.route("**/api/session", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ user: null, isAdmin: false }),
      });
    });
    await page.route("**/api/theme-assets/recommended**", async (route) => {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ items: [] }) });
    });
    await runTest(page);
  },
});

export { expect } from "@playwright/test";
