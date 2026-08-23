import { settle, waitForEditorReady, waitForMobileEditorReady } from "./shared.mjs";

/**
 * 템플릿 갤러리에서 카드를 골라 편집기로 들어가는 씬. §2.6의 1·2번 함정이 사는 곳이다.
 *
 * **1번 — 선택자.** 예전 스펙이 쓰던 `article[role="button"]`은 이제 0개를 잡는다. 0개를 잡으면
 * 클릭이 조용히 건너뛰어지고 촬영은 계속 돌아, 편집기에 들어가지 못한 영상이 끝까지 만들어진다.
 * 카드를 찾는 방법은 `e2e/fixtures/gallery.ts`가 한 곳에서 관리한다.
 *
 * **2번 — 클릭 한 번으로는 편집기에 못 간다.** 카드를 누르면 상세 모달이 열리고, 거기서
 * "Android로 시작"을 한 번 더 눌러야 `/edit`으로 간다.
 */
export const templateGallery = {
  id: "template-gallery",
  title: "템플릿 고르기",
  description: "마음에 드는 분위기를 고르면 바로 편집기로 들어갑니다",
  // 갤러리 → 상세 모달 → 편집기까지 화면이 통째로 두 번 갈린다.
  expect: { minChange: 0.3, because: "카드를 고르면 편집기로 들어가는 것이 이 스텝입니다." },

  async run(ctx) {
    const { page, baseURL, hold, click, dismissNotices, offCamera } = ctx;
    await offCamera(async () => {
      await page.goto(`${baseURL}/template`, { waitUntil: "load" });
      await settle(page);
    });

    // `e2e/fixtures/gallery.ts`의 `templateCards`와 같은 선택자다.
    const cards = page.locator("article");
    const count = await cards.count();
    if (count === 0) {
      throw new Error(
        [
          "템플릿 갤러리가 비어 있어 이 씬을 찍을 수 없습니다.",
          "  Supabase를 비운 촬영 환경(mock)에는 공개 시스템 템플릿이 없습니다.",
          "  로컬 스택 + 촬영용 seed가 필요합니다 (계획서 §2.8, Phase B4).",
          "  지금 찍을 수 있는 것: --scenes=editor-tour (편집기로 바로 들어갑니다)",
        ].join("\n"),
      );
    }

    // **`ctx.click`으로 누른다.** 이 씬은 커서를 들이기 전에 쓰여서 원시 클릭을 쓰고 있었다.
    // 그러면 카드가 저절로 열리는 것처럼 보여, 어디를 눌러야 하는지 알려주지 못한다.
    await hold(0.7);
    await click(cards.first());

    // 상세 모달. 여기서 한 번 더 눌러야 편집기로 간다.
    const start = page.getByRole("button", { name: "Android로 시작" });
    await start.waitFor({ state: "visible", timeout: 15_000 });
    await hold(0.6);
    await click(start);

    // 편집기 부트스트랩은 길다. 도착했다는 사실만 보여주고 대기는 카메라 밖에서 끝낸다.
    await offCamera(async () => {
      await page.waitForURL(/\/edit$/, { timeout: 60_000 });
      await waitForEditorReady(page);
      await dismissNotices();
    });
    await hold(0.8);
  },
};

/**
 * 모바일 판. 흐름은 같고 카드가 한 줄에 하나씩 온다.
 *
 * 갤러리는 편집기와 달리 접히는 패널이 없어 데스크톱 씬을 그대로 쓸 수 있다. 그래도 따로 두는
 * 이유는 `hold` 길이다 — 좁은 화면은 카드 하나가 화면을 채워 훑어볼 시간이 덜 필요하다.
 */
export const templateGalleryMobile = {
  ...templateGallery,
  async run(ctx) {
    const { page, baseURL, hold, click, dismissNotices, offCamera } = ctx;
    await offCamera(async () => {
      await page.goto(`${baseURL}/template`, { waitUntil: "load" });
      await settle(page);
    });

    const cards = page.locator("article");
    if ((await cards.count()) === 0) {
      throw new Error("템플릿 갤러리가 비어 있어 이 씬을 찍을 수 없습니다. --env=local 로 실행하세요.");
    }

    await hold(0.5);
    await click(cards.first());

    const start = page.getByRole("button", { name: "Android로 시작" });
    await start.waitFor({ state: "visible", timeout: 15_000 });
    await hold(0.6);
    await click(start);

    await offCamera(async () => {
      await page.waitForURL(/\/edit$/, { timeout: 60_000 });
      await waitForMobileEditorReady(page);
      await dismissNotices();
    });
    await hold(0.8);
  },
};
