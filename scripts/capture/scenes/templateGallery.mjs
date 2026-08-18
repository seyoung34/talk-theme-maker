import { settle, waitForEditorReady } from "./shared.mjs";

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

  async run({ page, baseURL, hold, dismissNotices, offCamera }) {
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

    const card = cards.first();
    await card.scrollIntoViewIfNeeded();
    await hold(0.7);
    await card.click();

    // 상세 모달. 여기서 한 번 더 눌러야 편집기로 간다.
    const start = page.getByRole("button", { name: "Android로 시작" });
    await start.waitFor({ state: "visible", timeout: 15_000 });
    await hold(0.9);
    await start.click();

    // 편집기 부트스트랩은 길다. 도착했다는 사실만 보여주고 대기는 카메라 밖에서 끝낸다.
    await offCamera(async () => {
      await page.waitForURL(/\/edit$/, { timeout: 60_000 });
      await waitForEditorReady(page);
      await dismissNotices();
    });
    await hold(0.8);
  },
};
