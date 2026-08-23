// 씬들이 공유하는 대기·이동 helper.
//
// **`e2e/fixtures/*.ts`와 같은 화면을 가리키는 코드가 두 벌 있다.** 스크립트는 .mjs라 그쪽
// TypeScript를 그대로 가져올 수 없어서다. 편집기 마크업을 바꾸면 두 곳을 함께 고쳐야 한다.
// 씬을 TypeScript로 옮기고 fixture를 직접 재사용하는 편이 낫지만, 그러려면 실행기(tsx 등)를
// 새로 들여야 해서 골격 단계에서는 미뤘다.

/**
 * 자동 저장 복구 다이얼로그를 걷어낸다.
 *
 * **씬들이 브라우저 컨텍스트를 공유한다.** 앞 씬이 실제로 편집을 하면(에셋 선택 등) 자동 저장이
 * 남고, 다음 씬이 `/edit`에 들어갈 때 "이어서 편집할까요?"가 편집기를 가로막는다. 실제로
 * `pick-background` 다음의 `pick-icons`가 여기서 60초를 기다리다 죽었다.
 *
 * **"새로 시작"을 고른다.** 촬영은 같은 명령이 같은 화면을 내야 하는데, "이어서 편집"은 앞 씬이
 * 무엇을 했느냐에 따라 시작 화면이 달라진다.
 */
async function startFreshIfResumeDialog(page) {
  const fresh = page.getByRole("button", { name: "새로 시작", exact: true }).first();
  const editor = page.getByRole("button", { name: "편집 종료" }).first();

  // 다이얼로그는 부트스트랩 **도중에** 뜬다("초기 준비 0%" 화면과 함께). 고정 시간으로 넘겨짚으면
  // 아직 없을 때 지나쳐 버리므로, 다이얼로그와 편집기 중 **먼저 나타나는 쪽**을 기다린다.
  await fresh.or(editor).waitFor({ state: "visible", timeout: 60_000 });
  if (await fresh.isVisible().catch(() => false)) {
    await fresh.click();
    await page.waitForTimeout(400);
  }
}

/** `e2e/fixtures/editor.ts`의 `waitForEditorReady`와 같은 조건이다. */
export async function waitForEditorReady(page) {
  await startFreshIfResumeDialog(page);
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

/**
 * 모바일 슬롯 목록을 편다. 이미 펴져 있으면 아무것도 하지 않는다.
 *
 * **모바일 패널의 슬롯 목록은 접힌다.** 슬롯을 고르면 목록이 닫히고 고른 슬롯 하나만 토글로
 * 남는다. 그래서 데스크톱 씬처럼 슬롯을 연달아 누르면 **세 번째부터 대상이 DOM에 없다** —
 * `edit-bubble` 모바일이 `상대 말풍선 1`에서 30초를 기다리다 죽은 것이 이것이었다.
 * `pick-icons` 모바일이 통과한 것은 슬롯을 둘만 짚어서다(첫 번째가 목록을 펴고 두 번째가 고른다).
 * 우연히 맞은 것이지 맞게 짠 것이 아니다.
 *
 * 토글은 `aria-expanded="false"`이면서 글자를 가진 버튼이다. `편집 패널 접기`와 `편집 도움말`도
 * `aria-expanded`를 갖지만 아이콘뿐이라 글자가 없다 — 실측으로 확인했다.
 */
export async function expandMobileSlotList({ page, click }) {
  const toggle = page.locator('button[aria-expanded="false"]').filter({ hasText: /\S/ }).first();
  if (!(await toggle.count())) return false;
  // **`ctx.click`으로 누른다.** 원시 클릭이면 손끝 표시가 앞 동작 자리에 남은 채 목록만 저절로
  // 열려, 보는 사람이 자기 화면에서 무엇을 눌러야 할지 알 수 없다. 목록을 여는 것도 따라 해야
  // 하는 동작이라 다른 탭과 똑같이 보여야 한다.
  await click(toggle);
  await page.waitForTimeout(250);
  return true;
}

/**
 * 모바일 편집기 준비 대기.
 *
 * 데스크톱용 `waitForEditorReady`를 그대로 쓰면 안 된다. 모바일 패널은 색상/이미지를 탭으로
 * 나눠서 **`input[type=file]`이 이미지 탭에서만 존재한다.** 진입 직후에는 없으므로 그 조건으로
 * 기다리면 영원히 멈춘다.
 */
export async function waitForMobileEditorReady(page) {
  await startFreshIfResumeDialog(page);
  await page.getByRole("button", { name: "편집 종료" }).waitFor({ state: "visible", timeout: 60_000 });
  await page.getByRole("button", { name: "편집 패널 펼치기" }).waitFor({ state: "visible", timeout: 60_000 });
}
