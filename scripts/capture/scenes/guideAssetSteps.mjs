import { expandMobileSlotList, openSection, resetEditorSession, settle, waitForEditorReady, waitForMobileEditorReady } from "./shared.mjs";

/**
 * 에셋을 고르는 가이드 스텝들 — 배경·탭 아이콘·말풍선.
 *
 * 셋 다 **`--env=local`이 필요하다.** 추천 에셋 목록은 `admin_assets`를, 말풍선 이미지는 시스템
 * 템플릿의 `upload_refs`를 읽는다. Supabase를 비운 `mock` 환경에서는 목록이 비어 있어 고를 것이
 * 없다. 준비 명령은 `scripts/capture/README.md`에 있다.
 *
 * 그룹 라벨은 `components/project/projectModel.ts`의 `groupLabels`가 정본이다 —
 * `icons: "탭 아이콘"`, `bubbles: "말풍선"`. 매니페스트의 그룹 키(`icons`)와 화면에 보이는
 * 라벨이 다르므로 키를 그대로 선택자에 쓰면 0개를 잡는다.
 */

/** 데스크톱 편집기를 연다. 대기는 전부 카메라 밖에서 끝낸다. */
async function openEditor({ page, baseURL, dismissNotices, offCamera }) {
  await offCamera(async () => {
    await resetEditorSession(page, baseURL);
    await page.goto(`${baseURL}/edit`, { waitUntil: "load" });
    await waitForEditorReady(page);
    await dismissNotices();
    await settle(page);
  });
}

async function openMobileEditor({ page, baseURL, dismissNotices, offCamera }) {
  await offCamera(async () => {
    await resetEditorSession(page, baseURL);
    await page.goto(`${baseURL}/edit`, { waitUntil: "load" });
    await waitForMobileEditorReady(page);
    await dismissNotices();
    await settle(page);
  });
}

/**
 * 스텝 4 — 배경 고르기.
 *
 * 보여줄 것은 **추천 에셋이 어디 있는가**다. 사용자가 "내 사진을 올려야만 하나"라고 생각하고
 * 멈추는 지점이라, 고를 수 있는 목록이 이미 있다는 사실 자체가 내용이다.
 */
export const guidePickBackground = {
  id: "pick-background",
  title: "배경 고르기",
  description: "추천 에셋에서 배경을 고르면 미리보기가 바로 바뀝니다",
  // 미리보기 배경이 통째로 갈리는 씬이라 크게 잡는다. 실측 13%.
  expect: { minChange: 0.06, because: "고른 배경이 미리보기에 반영되는 것이 이 스텝의 전부입니다." },

  async run(ctx) {
    const { page, click, hold } = ctx;
    await openEditor(ctx);
    await hold(0.5);

    await click(page.getByRole("button", { name: "배경", exact: true }).first());
    await hold(0.6);

    // 배경 이미지 슬롯 카드. 누르면 가운데 패널에 추천 에셋 목록이 열린다.
    await click(page.getByRole("button", { name: /배경 이미지/ }).first());
    await hold(0.8);

    await pickFirstRecommendedAsset(ctx);
    await hold(1.6);
  },
};

/**
 * 스텝 5 — 탭 아이콘 바꾸기.
 *
 * 보여줄 것은 **탭 하나에 두 장이 짝을 이룬다**는 것이다. 평소 모습과 눌렸을 때 모습이 따로라,
 * 한쪽만 바꾸면 눌렀을 때 예전 아이콘이 튀어나온다. 슬롯이 14개인 이유이기도 하다.
 */
export const guidePickIcons = {
  id: "pick-icons",
  title: "탭 아이콘 바꾸기",
  description: "탭마다 평소 모습과 눌렀을 때 모습, 두 장이 짝을 이룹니다",
  // 슬롯을 짚으면 가운데 패널이 그 슬롯 것으로 갈린다. 미리보기까지는 안 바뀌므로 낮게 잡는다.
  expect: { minChange: 0.03, because: "슬롯을 고르면 편집 패널이 그 슬롯 내용으로 바뀌어야 합니다." },

  async run(ctx) {
    const { page, click, hold } = ctx;
    await openEditor(ctx);
    await hold(0.4);

    await openSection(page, "채팅·탭바");
    await hold(0.6);

    // `projectModel.ts`의 `groupLabels.icons`가 "탭 아이콘"이다. 그룹 키가 아니라 이 라벨로 찾는다.
    await click(page.getByRole("button", { name: "탭 아이콘", exact: true }).first());
    await hold(0.7);

    /*
     * 선택 슬롯을 **먼저** 짚고 기본 슬롯으로 돌아온다. 순서가 뒤집힌 이유가 있다.
     *
     * 마지막에 고른 슬롯이 곧 갈아 끼울 슬롯인데, **선택(focused) 아이콘은 그 탭이 눌려 있을
     * 때만 그려진다.** 이 씬의 미리보기는 채팅 화면이라 친구 탭은 눌려 있지 않고, 그래서 선택
     * 아이콘을 바꾸면 패널만 바뀌고 아래 탭바는 그대로다. 실제로 그렇게 찍혀서 "아이콘을 바꿀
     * 수 있다"가 아니라 "슬롯이 여러 개다"까지만 전달됐다.
     *
     * 기본 아이콘은 눌려 있지 않은 탭에 그려지므로 교체가 바로 탭바에 나타난다.
     * 둘을 다 짚는 것은 그대로다 — 짝이라는 사실이 이 스텝의 내용이기 때문이다.
     */
    for (const slot of [/친구 탭 선택 아이콘/, /친구 탭 아이콘/]) {
      await click(page.getByRole("button", { name: slot }).first());
      await hold(1.0);
    }

    // 슬롯만 옮겨 다니면 미리보기가 그대로다. 실제로 갈아 끼워 탭바에 나타나는 것까지 담는다.
    await pickFirstRecommendedAsset(ctx);
    await hold(1.8);
  },
};

/**
 * 스텝 6 — 말풍선 바꾸기.
 *
 * 보여줄 것은 **네 종류가 있다**는 것이다. 내/상대 × 첫 말풍선/이어지는 말풍선이라
 * (`android.slots.json`의 note: "첫번째 내 말풍선", "첫번째 이후 내 말풍선"), 하나만 바꾸면
 * 연속으로 보낸 말풍선이 예전 모양으로 남는다.
 */
export const guideEditBubble = {
  id: "edit-bubble",
  title: "말풍선까지 내 취향으로",
  description: "첫 말풍선과 이어지는 말풍선이 따로라 모두 네 종류입니다",
  expect: { minChange: 0.03, because: "말풍선 슬롯을 옮겨 다니는 것이 보여야 합니다." },

  async run(ctx) {
    const { page, click, hold } = ctx;
    await openEditor(ctx);
    await hold(0.4);

    await openSection(page, "채팅방");
    await hold(0.6);

    await click(page.getByRole("button", { name: "말풍선", exact: true }).first());
    await hold(0.7);

    /*
     * 넷을 다 짚지 않고 둘만 짚는다. 12초를 넘겨 스텝 하나에 6~10초를 두는 기준에서 혼자 길었다.
     *
     * 네 종류가 있다는 사실은 **그룹을 연 순간 목록에 이미 다 나온다.** 옆의 순서 목록도 넷을
     * 그대로 적는다. 그래서 짚어 가며 세지 않아도 개수는 전달된다.
     *
     * 남길 둘로 내 말풍선 1·2를 고른다. 내 것과 상대 것이 다르다는 건 미리보기만 봐도 알지만,
     * **첫 말풍선과 이어지는 말풍선이 따로라는 것은 눌러 봐야 안다.** 모르고 하나만 바꾸면
     * 연속으로 보낸 말풍선이 예전 모양으로 남는, 이 스텝이 막으려는 바로 그 실수가 난다.
     * 모바일 판도 같은 이유로 둘만 짚는다.
     */
    for (const slot of [/내 말풍선 1/, /내 말풍선 2/]) {
      await click(page.getByRole("button", { name: slot }).first());
      await hold(1.1);
    }
  },
};

/** 모바일 판 — 편집 패널을 펼쳐야 그룹과 슬롯이 나온다. */
export const guidePickBackgroundMobile = {
  ...guidePickBackground,
  async run(ctx) {
    const { page, click, hold } = ctx;
    await openMobileEditor(ctx);
    await hold(0.4);

    await click(page.getByRole("button", { name: "편집 패널 펼치기" }));
    await page.getByRole("button", { name: "배경", exact: true }).first().waitFor({ state: "visible", timeout: 20_000 });
    await hold(0.6);

    await click(page.getByRole("button", { name: "배경", exact: true }).first());
    await hold(0.6);
    await click(page.getByRole("button", { name: "이미지로 설정" }).first());
    await hold(0.7);

    await pickFirstCandidateMobile(ctx);
    await hold(1.6);
  },
};

export const guidePickIconsMobile = {
  ...guidePickIcons,
  async run(ctx) {
    const { page, click, hold } = ctx;
    await openMobileEditor(ctx);
    await hold(0.4);

    await click(page.getByRole("button", { name: "채팅·탭바", exact: true }).first());
    await hold(0.6);
    await click(page.getByRole("button", { name: "편집 패널 펼치기" }));
    await page.getByRole("button", { name: "탭 아이콘", exact: true }).first().waitFor({ state: "visible", timeout: 20_000 });
    await hold(0.6);

    await click(page.getByRole("button", { name: "탭 아이콘", exact: true }).first());
    await hold(0.7);
    // 데스크톱과 같은 순서다. 마지막에 고르는 기본 아이콘이 탭바에 바로 나타난다.
    for (const slot of [/친구 탭 선택 아이콘/, /친구 탭 아이콘/]) {
      await expandMobileSlotList(ctx);
      await click(page.getByRole("button", { name: slot }).first());
      await hold(1.0);
    }

    // 데스크톱과 같은 이유로 하나 갈아 끼운다. 슬롯만 옮겨 다니면 탭바가 그대로라
    // "바꿀 수 있다"가 전달되지 않는다.
    await pickFirstCandidateMobile(ctx);
    await hold(1.6);
  },
};

export const guideEditBubbleMobile = {
  ...guideEditBubble,
  async run(ctx) {
    const { page, click, hold } = ctx;
    await openMobileEditor(ctx);
    await hold(0.4);

    await click(page.getByRole("button", { name: "채팅방", exact: true }).first());
    await hold(0.6);
    await click(page.getByRole("button", { name: "편집 패널 펼치기" }));
    await page.getByRole("button", { name: "말풍선", exact: true }).first().waitFor({ state: "visible", timeout: 20_000 });
    await hold(0.6);

    await click(page.getByRole("button", { name: "말풍선", exact: true }).first());
    await hold(0.7);

    /*
     * 데스크톱은 넷을 짚지만 모바일은 둘만 짚는다.
     *
     * 모바일은 슬롯을 고를 때마다 목록이 접혀서 한 슬롯에 두 번 눌러야 한다. 넷을 짚으면 여덟 번이
     * 되고 클립이 20초를 넘겼다 — 스텝 하나에 6~10초를 두는 가이드에서 혼자 두 배다.
     *
     * 넷이 있다는 사실은 **목록을 편 순간 화면에 이미 다 나온다.** 네 이름이 한 프레임에 같이
     * 보이므로, 짚어 가며 세지 않아도 종류의 개수는 전달된다. 옆의 순서 목록도 넷을 그대로 적는다.
     *
     * 남길 둘로 내 말풍선 1·2를 고른다. 내 것과 상대 것이 다르다는 건 미리보기만 봐도 알지만,
     * **첫 말풍선과 이어지는 말풍선이 따로라는 것은 눌러 봐야 안다.** 모르고 하나만 바꾸면
     * 연속으로 보낸 말풍선이 예전 모양으로 남는, 이 스텝이 막으려는 바로 그 실수가 난다.
     */
    for (const slot of [/내 말풍선 1/, /내 말풍선 2/]) {
      await expandMobileSlotList(ctx);
      await click(page.getByRole("button", { name: slot }).first());
      await hold(1.1);
    }
  },
};

/**
 * 에셋을 고르는 스텝들이 우선으로 집을 후보.
 *
 * 이런 스텝은 "고르면 미리보기가 바로 바뀐다"를 보여주는 것이라 **바뀌는 것이 눈에 보여야**
 * 성립한다. 목록 첫 후보를 집었더니 파스텔 톤이라 기본 배경과 겹쳐, 첫 프레임과 끝 프레임의
 * 차이가 1%였다 — 끝까지 만들어 놓고 재생해 봐야 아는 종류의 실패다.
 *
 * 어느 에셋을 쓰느냐는 기술이 아니라 **캐스팅 문제**다. 그래서 목록 순서에 맡기지 않고 여기서
 * 이름으로 고른다. 없으면 첫 후보로 돌아가되, 그때는 대비를 보장할 수 없다.
 *
 * 배경뿐 아니라 탭 아이콘에도 같은 이름들이 있어 그대로 쓴다 — 대비가 필요한 이유가 같다.
 */
const preferredAssetTitles = ["메론소다", "딸기우유"];

/** 우선 후보가 보이면 그것을 누르고 true를 돌려준다. */
async function clickPreferredCandidate({ page, click, hold }, titles) {
  for (const title of titles) {
    const card = page.getByRole("button", { name: title, exact: true }).first();
    if (!(await card.count())) continue;
    await hold(0.5);
    await click(card);
    return true;
  }
  return false;
}

/**
 * 추천 에셋 목록에서 첫 후보를 고른다.
 *
 * 후보 카드의 접근성 이름은 **에셋 제목**이라(실측: "파스텔 글라스") 고정 문자열로 못 찾는다.
 * 대신 패널에 함께 있는 고정 버튼들("추천 에셋" 머리말, "이미지 사용 안 함", "이미지 편집")을
 * 빼고 남는 것을 후보로 본다.
 *
 * **남는 것이 없으면 던진다.** `mock` 환경에서 조용히 지나가면 "슬롯만 눌렀다 마는" 영상이
 * 끝까지 만들어지고, 재생해 봐야 알게 된다(§2.6 1번과 같은 실패 방식).
 */
async function pickFirstRecommendedAsset(ctx) {
  const { page, click, hold } = ctx;
  await page.getByRole("button", { name: "추천 에셋" }).first().waitFor({ state: "visible", timeout: 20_000 });

  if (await clickPreferredCandidate(ctx, preferredAssetTitles)) return;

  const fixedLabels = ["추천 에셋", "이미지 사용 안 함", "이미지 편집", "전체 보기"];
  const candidate = page
    .getByRole("button")
    .filter({ hasNotText: new RegExp(fixedLabels.join("|")) })
    .locator("visible=true")
    .filter({ has: page.locator("img, [style*='background-image']") })
    .first();

  if ((await candidate.count()) === 0) {
    throw new Error(
      [
        "추천 에셋 후보가 없어 이 씬을 찍을 수 없습니다.",
        "  --env=local 로 실행하고, 로컬 스택에 fixture가 심어져 있어야 합니다:",
        "    npx supabase start",
        "    node scripts/seed-local-users.mjs",
        "    node scripts/capture-fixtures.mjs seed",
      ].join("\n"),
    );
  }
  await hold(0.5);
  await click(candidate);
}

/**
 * 모바일 판 후보 선택.
 *
 * **데스크톱 함수를 쓸 수 없다.** 그쪽은 "추천 에셋" 머리말을 기다리는데 그 라벨은
 * `ProjectQuickEditPanel`에만 있다. 모바일 패널은 후보를 한 그리드에 바로 그리므로 머리말이
 * 없고, 그대로 재사용한 씬이 20초를 기다리다 죽었다.
 *
 * 대신 후보 카드가 스스로 밝히는 것을 쓴다 — **`aria-pressed`와 에셋 제목 `aria-label`을 함께
 * 가진 버튼은 후보뿐이다.** 카드가 88~96px라 제목을 화면에 적을 자리가 없어 접근성 이름에
 * 넣어 둔 덕이다(`getCandidateAccessibleName`). 실측한 이웃들은 이렇게 갈린다:
 *
 *   업로드           aria-pressed 없음
 *   후보 펼쳐 보기    aria-pressed 있음, 라벨이 고정 문구
 *   이미지로 설정     aria-pressed 있음, aria-label 없음
 *   파스텔 글라스     aria-pressed 있음, aria-label이 에셋 제목   ← 후보
 *
 * 색상 탭의 견본은 `#RRGGBB`가 라벨이라 함께 걸러낸다.
 */
async function pickFirstCandidateMobile({ page, click, hold }) {
  const fixed = /^(후보 펼쳐 보기|기본값|업로드|이미지 편집|이미지 사용 안 함)$/;
  const titles = await page
    .locator("button[aria-pressed][aria-label]")
    .evaluateAll((nodes) =>
      nodes
        .filter((node) => node.getBoundingClientRect().width > 0)
        .map((node) => node.getAttribute("aria-label") ?? ""),
    )
    .then((labels) => labels.filter((label) => label && !fixed.test(label) && !label.startsWith("#")));

  if (!titles.length) {
    throw new Error(
      [
        "모바일 후보가 없어 이 씬을 찍을 수 없습니다.",
        "  --env=local 로 실행하고, 로컬 스택에 fixture가 심어져 있어야 합니다:",
        "    npx supabase start",
        "    node scripts/seed-local-users.mjs",
        "    node scripts/capture-fixtures.mjs seed",
      ].join("\n"),
    );
  }

  const preferred = preferredAssetTitles.find((title) => titles.includes(title));
  await hold(0.5);
  await click(page.getByRole("button", { name: preferred ?? titles[0], exact: true }).first());
}
