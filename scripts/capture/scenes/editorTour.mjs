import { openSection, settle, waitForEditorReady } from "./shared.mjs";

/**
 * 편집기를 둘러보는 씬. 골격이 실제로 도는지 확인하는 기준 씬이다.
 *
 * `/edit`으로 바로 들어간다. 갤러리를 거치지 않으므로 시스템 템플릿이 없는 mock 환경에서도
 * 돌아간다 — 갤러리 경로는 `templateGallery` 씬이 따로 맡는다.
 */
export const editorTour = {
  id: "editor-tour",
  title: "화면별로 바꿔보기",
  description: "친구 목록부터 채팅방 말풍선까지 한 화면에서 편집합니다",

  async run({ page, baseURL, hold, dismissNotices, offCamera }) {
    await offCamera(async () => {
      await page.goto(`${baseURL}/edit`, { waitUntil: "load" });
      await waitForEditorReady(page);
      // 진입 토스트가 상단 가운데를 덮는다. 걷어내고 시작한다.
      await dismissNotices();
      await settle(page);
    });
    await hold(0.8);

    for (const section of ["친구", "채팅방"]) {
      await openSection(page, section);
      await hold(1.1);
    }

    // 채팅방 안의 말풍선 그룹. 미리보기가 함께 바뀌는 구간이라 가이드에서 보여줄 값이 있다.
    await page.getByRole("button", { name: "말풍선", exact: true }).first().click();
    await hold(1.4);
  },
};
