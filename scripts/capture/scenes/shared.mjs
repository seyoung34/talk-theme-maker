// 씬들이 공유하는 대기·이동 helper.
//
// **`e2e/fixtures/*.ts`와 같은 화면을 가리키는 코드가 두 벌 있다.** 스크립트는 .mjs라 그쪽
// TypeScript를 그대로 가져올 수 없어서다. 편집기 마크업을 바꾸면 두 곳을 함께 고쳐야 한다.
// 씬을 TypeScript로 옮기고 fixture를 직접 재사용하는 편이 낫지만, 그러려면 실행기(tsx 등)를
// 새로 들여야 해서 골격 단계에서는 미뤘다.

/** `e2e/fixtures/editor.ts`의 `waitForEditorReady`와 같은 조건이다. */
export async function waitForEditorReady(page) {
  await page.getByRole("button", { name: "편집 종료" }).waitFor({ state: "visible", timeout: 60_000 });
  await page.locator('input[type="file"]').first().waitFor({ state: "attached", timeout: 60_000 });
}

/**
 * 편집기 섹션 탭으로 이동한다.
 *
 * `exact: true`가 필요하다. "채팅방"은 섹션 이름이면서 다른 버튼 라벨의 부분 문자열이기도 해서
 * 느슨하게 찾으면 여러 개가 잡힌다.
 */
export async function openSection(page, name) {
  await page.getByRole("button", { name, exact: true }).first().click();
}

/**
 * 페이지가 조용해질 때까지 기다린다.
 *
 * `networkidle`은 스트리밍 응답이나 폴링이 있으면 영영 오지 않는다. 촬영이 거기서 멈추면
 * 원인을 찾기 어려우므로 실패해도 그냥 넘어간다 — 다음 대기가 실제 조건을 다시 확인한다.
 */
export async function settle(page, ms = 400) {
  await page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => {});
  await page.waitForTimeout(ms);
}
