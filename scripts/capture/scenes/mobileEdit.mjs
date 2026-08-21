import { settle, waitForMobileEditorReady } from "./shared.mjs";

/**
 * 릴스용 모바일 편집 씬(계획서 §5의 E2).
 *
 * 대표 컷은 **색이 바뀌는 순간**이다(§5.3 1번). 색상 코드를 코드로 바꿔 넣으면 편집 패널과
 * 미리보기가 한 번에 리컬러되는데, 손으로 찍으면 색 선택기를 여닫는 과정이 지저분하게 남는다.
 * 자동화라서 가능한 컷이라 릴스의 값어치가 여기서 나온다.
 *
 * 움직임은 `beat`(시간)이 아니라 `hold`/`scrollTo`(프레임 수)로 센다. 스크린샷 루프가 렌더러를
 * 점유해 시간 기반 연출이 어긋나기 때문이다(§2.6 5번).
 */
export const mobileEdit = {
  id: "mobile-edit",
  title: "폰에서 바로",
  description: "카톡 테마를 손에서 만들어요",

  async run({ page, baseURL, hold, caption, scrollTo, dismissNotices, offCamera }) {
    // 진입과 부트스트랩은 보여줄 것이 없다. 그대로 찍으면 앞머리 몇 초가 로딩 화면이 된다.
    await offCamera(async () => {
      await page.goto(`${baseURL}/edit`, { waitUntil: "load" });
      await waitForMobileEditorReady(page);
      await dismissNotices();
      await settle(page);
    });

    await caption("내 사진으로 카톡을 바꿔요");
    await hold(1.6);

    await page.getByRole("button", { name: "편집 패널 펼치기" }).click();
    await page.getByRole("button", { name: "배경", exact: true }).first().waitFor({ state: "visible", timeout: 20_000 });
    await hold(0.8);

    await caption("화면마다 배경과 색을 고르고");
    await page.getByRole("button", { name: "배경", exact: true }).first().click();
    await hold(1);

    await page.getByRole("button", { name: "색상으로 설정" }).first().click();
    await hold(0.7);

    // 색상 코드 입력은 sr-only 라벨을 가진다. 스와치보다 안정적인 선택자다.
    const hexInput = page.getByLabel("색상 코드").first();
    await hexInput.waitFor({ state: "visible", timeout: 20_000 });

    await caption("색을 바꾸면 미리보기가 바로 따라와요");
    for (const hex of ["#FFD400", "#7BC6FF", "#1B1C19"]) {
      await hexInput.fill(hex);
      await hold(0.9);
    }

    await caption("마음에 들면 그대로 내려받기");
    await scrollTo("bottom", { seconds: 1.2 });
    await hold(1.2);
  },
};
