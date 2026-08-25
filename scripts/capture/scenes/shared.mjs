// 씬들이 공유하는 대기·이동 helper.
//
// **`e2e/fixtures/*.ts`와 같은 화면을 가리키는 코드가 두 벌 있다.** 스크립트는 .mjs라 그쪽
// TypeScript를 그대로 가져올 수 없어서다. 편집기 마크업을 바꾸면 두 곳을 함께 고쳐야 한다.
// 씬을 TypeScript로 옮기고 fixture를 직접 재사용하는 편이 낫지만, 그러려면 실행기(tsx 등)를
// 새로 들여야 해서 골격 단계에서는 미뤘다.

/**
 * 촬영이 쓰는 로컬 QA 계정. `scripts/seed-local-users.mjs`가 만드는 것과 같아야 한다.
 *
 * 여기와 seed가 갈리면 "seed는 돌았는데 촬영만 로그인이 안 되는" 상태가 되고, 증상은 내보내기
 * 창이 로그인 안내로 뜨는 것이라 원인에서 한참 떨어져 보인다.
 */
export const localCaptureAccount = { email: "user@local.test", password: "password123!" };

/**
 * 로컬 계정으로 로그인한다. 이미 되어 있으면 아무것도 하지 않는다.
 *
 * **내보내기 스텝 때문에 필요하다.** 비로그인 상태로 다운로드 창을 열면 "로그인해 주세요"가
 * 뜨고, 크레딧이 0이면 "크레딧 구매"가 뜬다. 어느 쪽도 그 스텝이 가르쳐야 할 화면이 아니다 —
 * 결제가 아니라 "이름을 확인하고 만들면 서버가 만들어 준다"를 보여줘야 한다.
 *
 * 세션은 브라우저 컨텍스트에 남으므로 촬영 시작에 한 번만 부르면 모든 씬이 로그인 상태가 된다.
 * 부수 효과로 헤더도 실제 사용자가 보는 모습이 된다.
 *
 * 선택자는 폼 구조가 아니라 입력 종류로 잡는다. `autocomplete`는 브라우저 자동완성을 위한
 * 값이라 문구를 다듬을 때 같이 바뀌지 않는다.
 */
export async function signInLocalUser(page, baseURL, account = localCaptureAccount) {
  await page.goto(`${baseURL}/login`, { waitUntil: "load" });

  /*
   * `isVisible()`이 아니라 `waitFor()`다. **`isVisible`은 기다리지 않는다** — `timeout`을 넘겨도
   * 그 순간의 상태를 즉시 돌려준다. 하이드레이션 전에 물으면 항상 false라, 로그인은 매번 조용히
   * 건너뛰어지고 촬영은 "비로그인 상태로 촬영합니다" 한 줄만 남긴 채 끝까지 돌았다.
   * 증상은 한참 뒤 내보내기 창이 "보유 0크레딧 / 로그인·가입 후 받기"로 찍힌 것이었다.
   */
  const email = page.locator('input[type="email"]').first();
  const appeared = await email
    .waitFor({ state: "visible", timeout: 15_000 })
    .then(() => true)
    .catch(() => false);
  // 이미 로그인돼 있으면 로그인 화면이 아예 뜨지 않고 되돌려 보낸다.
  if (!appeared) return false;

  await email.fill(account.email);
  await page.locator('input[autocomplete="current-password"]').first().fill(account.password);
  await page.locator('button[type="submit"]').first().click();

  // 로그인 성공은 로그인 폼이 사라지는 것으로 판정한다. 이동 경로는 `next` 파라미터에 따라 달라진다.
  const disappeared = await email
    .waitFor({ state: "detached", timeout: 30_000 })
    .then(() => true)
    .catch(() => false);
  if (!disappeared) {
    const alert = await page.locator('[role="alert"]').allTextContents().catch(() => []);
    const message = alert.map((text) => text.trim()).filter(Boolean).join(" ");
    throw new Error(message ? `로컬 로그인 실패: ${message}` : "로컬 로그인 실패: 로그인 폼이 닫히지 않았습니다.");
  }
  await settle(page);
  return true;
}

/**
 * 편집기가 지난 작업을 복원하는 데 쓰는 저장소 키. `lib/theme/project`의 상수와 같아야 한다.
 *
 * 스크립트가 .mjs라 그쪽 TypeScript를 그대로 가져올 수 없어 이름을 두 벌 적는다.
 * 키가 바뀌면 여기도 바꿔야 하는데, 어긋나면 씬이 앞 씬의 템플릿을 물려받는 것으로만 드러난다.
 */
const editorSessionKeys = [
  "kakaotalk-theme-maker:project-state:v1",
  "kakaotalk-theme-maker:template-start:v1",
  "kakaotalk-theme-maker:editor-session:user:v1",
  "kakaotalk-theme-maker:editor-lock:user:v1",
];

/**
 * 편집기를 **알려진 시작 상태**로 되돌린다.
 *
 * 씬들이 브라우저 컨텍스트를 공유해서, 앞 씬이 무엇을 했느냐가 뒤 씬의 시작 화면을 정한다.
 * 실제로 스텝 1(갤러리에서 템플릿 고르기)을 추가하자 뒤 씬 전부가 그 템플릿을 물려받았고,
 * 배경이 이미 그 템플릿 색이라 **"배경을 고르면 미리보기가 바뀐다"를 보여주는 스텝의 화면 변화가
 * 0%가 됐다.** 길이는 정상이라 촬영도 검사도 통과했고, 재생해 봐야 알 수 있었다.
 *
 * "새로 시작" 다이얼로그만으로는 부족하다. 그것은 자동 저장 초안을 버릴 뿐, 어느 템플릿에서
 * 시작할지는 세션이 따로 기억한다.
 */
export async function resetEditorSession(page, baseURL) {
  // 저장소는 출처에 묶여 있다. 앱 주소에 한 번 가야 지울 수 있다.
  if (!page.url().startsWith(baseURL)) await page.goto(`${baseURL}/`, { waitUntil: "domcontentloaded" });
  await page.evaluate((keys) => {
    for (const key of keys) {
      try { window.localStorage.removeItem(key); } catch { /* 저장소를 막아 둔 컨텍스트 */ }
    }
  }, editorSessionKeys);

  /*
   * **자동 저장 초안은 IndexedDB에 있다.** localStorage만 지우면 남는다.
   *
   * 남으면 갤러리에 "내 작업" 카드가 앞에 끼어들고, 씬이 집는 `cards.first()`가 그 카드가 된다.
   * 사용자 작업 카드의 모달에는 "iOS로 시작"이 아니라 "iOS 편집 계속하기"나 "iOS 사용 불가"가
   * 나오므로, 편집을 한 씬 뒤부터 iOS 진입이 통째로 실패했다. 앞 세 씬은 통과하고 네 번째부터
   * 죽는 모양이라 원인이 갤러리에 있는 것처럼 보였다.
   */
  await page.evaluate(async ({ dbName, stores }) => {
    await new Promise((resolve) => {
      let done = false;
      const finish = () => { if (!done) { done = true; resolve(); } };
      const open = indexedDB.open(dbName);
      open.onerror = finish;
      open.onsuccess = () => {
        const db = open.result;
        const present = stores.filter((name) => db.objectStoreNames.contains(name));
        if (!present.length) { db.close(); finish(); return; }
        const tx = db.transaction(present, "readwrite");
        for (const name of present) tx.objectStore(name).clear();
        tx.oncomplete = () => { db.close(); finish(); };
        tx.onerror = () => { db.close(); finish(); };
      };
      // 열지 못해도 촬영을 막지 않는다. 초안이 없으면 애초에 지울 것도 없다.
      setTimeout(finish, 3000);
    });
  }, { dbName: "kakaotalk-theme-maker", stores: ["editor-autosave-drafts", "editor-recovery-drafts"] });
}

/**
 * 지정한 플랫폼으로 편집기에 들어간다.
 *
 * **편집기에는 플랫폼 전환 UI가 없다.** 어느 플랫폼으로 편집하는지는 갤러리에서 "Android로 시작"
 * 또는 "iOS로 시작" 중 무엇을 눌렀느냐로 정해지고, 그 값이 편집기 세션에 남는다. 그래서 iOS
 * 화면을 찍으려면 `/edit`으로 바로 갈 수 없고 갤러리를 거쳐야 한다.
 *
 * **미리보기가 플랫폼마다 다르게 그려지기 때문에 필요하다.** 헤더 색이 Android는 별도 슬롯인데
 * iOS는 메인 배경색을 그대로 쓰고, 섹션 제목 색도 다른 역할을 본다(`ThemeScreensPreview`).
 * Android로 찍은 클립을 iOS 가이드에 쓰면 그 사람 화면에 없는 헤더를 가르치게 된다.
 *
 * 시스템 템플릿은 **그 플랫폼 variant가 있어야** 버튼이 나온다. 없으면 여기서 던진다 —
 * 조용히 Android로 들어가면 iOS 클립이라고 이름 붙은 Android 화면이 만들어진다.
 */
export async function enterEditorViaGallery(page, baseURL, platform) {
  await page.goto(`${baseURL}/template`, { waitUntil: "load" });
  await settle(page);

  const cards = page.locator("article");
  if ((await cards.count()) === 0) {
    throw new Error("템플릿 갤러리가 비어 있습니다. --env=local 로 실행하세요.");
  }
  await cards.first().click();

  const label = platform === "ios" ? "iOS로 시작" : "Android로 시작";
  const start = page.getByRole("button", { name: label });
  const ready = await start.waitFor({ state: "visible", timeout: 15_000 }).then(() => true).catch(() => false);
  if (!ready) {
    throw new Error(
      [
        `상세 모달에 '${label}' 버튼이 없습니다.`,
        "  시스템 템플릿에 그 플랫폼 variant가 없으면 버튼이 나오지 않습니다.",
        "  `system_template_variants`를 확인하세요.",
      ].join("\n"),
    );
  }
  await start.click();
  await page.waitForURL(/\/edit$/, { timeout: 60_000 });
}

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
