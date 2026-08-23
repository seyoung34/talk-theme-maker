import { resetEditorSession, settle, waitForEditorReady, waitForMobileEditorReady } from "./shared.mjs";

/**
 * `/guide` 쉬운 모드의 스텝에 꽂을 짧은 클립들.
 *
 * 씬 하나가 스텝 하나이고 파일도 따로 나간다(`splitScenes`). `EasyStep.media.src`가 파일 하나를
 * 가리키기 때문이다. 그래서 편집 UI가 바뀌어도 **바뀐 스텝만 다시 찍으면 된다.**
 *
 * 모든 동작을 `ctx.click`으로 한다. 커서가 목표까지 움직이고 누르는 순간 파문이 퍼진다 —
 * 가이드에서 이게 없으면 화면만 바뀌고 "무엇을 눌렀는지"는 보는 사람이 추측해야 한다.
 *
 * 길이는 스텝당 6~10초를 목표로 한다. 카드 안에서 반복 재생되므로 길면 지루하다.
 */

/** 각 씬이 같은 자리에서 시작하도록 편집기를 연다. 대기는 전부 카메라 밖에서 끝낸다. */
async function openEditor({ page, baseURL, dismissNotices, offCamera }) {
  await offCamera(async () => {
    await resetEditorSession(page, baseURL);
    await page.goto(`${baseURL}/edit`, { waitUntil: "load" });
    await waitForEditorReady(page);
    await dismissNotices();
    await settle(page);
  });
}

/**
 * 스텝: 바꿀 화면 고르기.
 *
 * 왼쪽에서 화면을 고르면 오른쪽 미리보기가 그 화면으로 바뀐다. 편집기에서 제일 먼저 이해해야
 * 하는 구조라 첫 스텝에 둔다.
 */
export const guideChooseScreen = {
  id: "choose-screen",
  title: "바꿀 화면 고르기",
  description: "왼쪽에서 화면을 고르면 오른쪽 미리보기가 따라 바뀝니다",
  // 채팅방으로 갔다가 돌아오는 왕복이라 **끝은 처음과 같다.** 도중에 미리보기가 통째로 갈리는
  // 것을 봐야 하므로, 첫 프레임 대비 최대 변화로 재는 검사가 여기서 특히 필요하다.
  expect: { minChange: 0.05, because: "화면을 고르면 미리보기가 그 화면으로 바뀌어야 합니다." },

  async run(ctx) {
    const { page, click, hold } = ctx;

    await openEditor(ctx);
    await hold(0.5);

    for (const section of ["채팅방", "친구·메인"]) {
      await click(page.getByRole("button", { name: section, exact: true }).first());
      await hold(1.2);
    }
  },
};

/**
 * 스텝: 색 바꾸기.
 *
 * 팔레트에서 색을 고르면 미리보기 전체가 한 번에 다시 칠해진다. 가이드에서 보여줄 값이 가장 큰
 * 장면이고, 손으로 찍으면 색 선택기를 여닫는 과정이 지저분하게 남는 구간이기도 하다.
 */
export const guideChangeColor = {
  id: "change-color",
  title: "색 바꾸기",
  description: "팔레트에서 고르면 미리보기가 바로 다시 칠해집니다",
  expect: { minChange: 0.05, because: "고른 색이 미리보기에 칠해지는 것이 이 스텝의 전부입니다." },

  async run(ctx) {
    const { page, click, hold } = ctx;

    await openEditor(ctx);
    await hold(0.4);

    // 배경 그룹 안의 색상 슬롯. 카드를 눌러야 가운데 패널에 팔레트가 열린다.
    await click(page.getByRole("button", { name: "배경", exact: true }).first());
    await hold(0.5);
    await click(page.getByRole("button", { name: /배경 색상/ }).first());
    await hold(0.7);

    // 팔레트 스와치는 색상 코드가 그대로 접근성 이름이다. 직접 고르는 편이 색상 코드를
    // 타이핑하는 것보다 실제 사용에 가깝고, 누르는 순간이 화면에 남는다.
    const palette = page.getByRole("button", { name: "#1F2937" }).first();
    await palette.waitFor({ state: "visible", timeout: 20_000 });
    await click(palette);
    await hold(1.6);
  },
};

/**
 * 같은 스텝의 모바일 판.
 *
 * 씬 id가 데스크톱과 같다(`choose-screen`, `change-color`). 프로필이 다르므로 파일명이
 * `guide-mobile-*`로 갈리고, `content.ts`에서 같은 스텝의 `media`와 `mobileMedia`로 짝이 된다.
 *
 * 화살표 커서는 그리지 않는다 — 손가락으로 누르는 화면이다. `ctx.click`이 모바일 프로필에서는
 * 파문만 남긴다.
 */
async function openMobileEditor({ page, baseURL, dismissNotices, offCamera }) {
  await offCamera(async () => {
    await resetEditorSession(page, baseURL);
    await page.goto(`${baseURL}/edit`, { waitUntil: "load" });
    await waitForMobileEditorReady(page);
    await dismissNotices();
    await settle(page);
  });
}

export const guideMobileChooseScreen = {
  id: "choose-screen",
  title: "바꿀 화면 고르기",
  description: "화면을 고르면 미리보기가 따라 바뀝니다",
  // 데스크톱 씬과 별개 객체라 `expect`를 물려받지 못한다. 폰은 미리보기가 화면 전체라 변화가 크다.
  expect: { minChange: 0.1, because: "화면을 고르면 미리보기가 그 화면으로 바뀌어야 합니다." },

  async run(ctx) {
    const { page, click, hold } = ctx;

    await openMobileEditor(ctx);
    await hold(0.5);

    // 시트가 접힌 상태에서도 섹션 칩은 보인다. 그래서 펼치지 않고 바로 고를 수 있다.
    for (const section of ["채팅방", "친구·메인"]) {
      await click(page.getByRole("button", { name: section, exact: true }).first());
      await hold(1.2);
    }
  },
};

export const guideMobileChangeColor = {
  id: "change-color",
  title: "색 바꾸기",
  description: "팔레트에서 고르면 미리보기가 바로 다시 칠해집니다",
  expect: { minChange: 0.1, because: "고른 색이 미리보기에 칠해지는 것이 이 스텝의 전부입니다." },

  async run(ctx) {
    const { page, click, hold } = ctx;

    await openMobileEditor(ctx);
    await hold(0.4);

    // 모바일은 편집 패널이 접혀 시작한다. 펼쳐야 그룹과 색상 탭이 나온다.
    await click(page.getByRole("button", { name: "편집 패널 펼치기" }));
    await page.getByRole("button", { name: "배경", exact: true }).first().waitFor({ state: "visible", timeout: 20_000 });
    await hold(0.6);

    await click(page.getByRole("button", { name: "배경", exact: true }).first());
    await hold(0.6);

    // 모바일 패널은 색상과 이미지를 탭으로 나눈다. 색상 쪽에만 팔레트가 있다.
    await click(page.getByRole("button", { name: "색상으로 설정" }).first());
    await hold(0.7);

    const palette = page.getByRole("button", { name: "#1F2937" }).first();
    await palette.waitFor({ state: "visible", timeout: 20_000 });
    await click(palette);
    await hold(1.6);
  },
};
