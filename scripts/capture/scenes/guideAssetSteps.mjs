import { openSection, settle, waitForEditorReady, waitForMobileEditorReady } from "./shared.mjs";

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
    await page.goto(`${baseURL}/edit`, { waitUntil: "load" });
    await waitForEditorReady(page);
    await dismissNotices();
    await settle(page);
  });
}

async function openMobileEditor({ page, baseURL, dismissNotices, offCamera }) {
  await offCamera(async () => {
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

  async run(ctx) {
    const { page, click, hold } = ctx;
    await openEditor(ctx);
    await hold(0.4);

    await openSection(page, "채팅·탭바");
    await hold(0.6);

    // `projectModel.ts`의 `groupLabels.icons`가 "탭 아이콘"이다. 그룹 키가 아니라 이 라벨로 찾는다.
    await click(page.getByRole("button", { name: "탭 아이콘", exact: true }).first());
    await hold(0.7);

    // 같은 탭의 기본/선택 두 슬롯을 차례로 짚는다. 짝이라는 것이 이 스텝의 내용이다.
    for (const slot of [/친구 탭 아이콘/, /친구 탭 선택 아이콘/]) {
      await click(page.getByRole("button", { name: slot }).first());
      await hold(1.2);
    }
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

  async run(ctx) {
    const { page, click, hold } = ctx;
    await openEditor(ctx);
    await hold(0.4);

    await openSection(page, "채팅방");
    await hold(0.6);

    await click(page.getByRole("button", { name: "말풍선", exact: true }).first());
    await hold(0.7);

    // 네 종류를 차례로 짚어 "이만큼 있다"를 보여준다. 교체 자체보다 종류의 존재가 요점이다.
    for (const slot of [/내 말풍선 1/, /내 말풍선 2/, /상대 말풍선 1/, /상대 말풍선 2/]) {
      await click(page.getByRole("button", { name: slot }).first());
      await hold(0.9);
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

    await pickFirstRecommendedAsset(ctx);
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
    for (const slot of [/친구 탭 아이콘/, /친구 탭 선택 아이콘/]) {
      await click(page.getByRole("button", { name: slot }).first());
      await hold(1.2);
    }
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
    for (const slot of [/내 말풍선 1/, /내 말풍선 2/, /상대 말풍선 1/, /상대 말풍선 2/]) {
      await click(page.getByRole("button", { name: slot }).first());
      await hold(0.9);
    }
  },
};

/**
 * 추천 에셋 목록에서 첫 후보를 고른다.
 *
 * **목록이 비어 있으면 던진다.** `mock` 환경에서 조용히 지나가면 "슬롯만 눌렀다 마는" 영상이
 * 끝까지 만들어지고, 재생해 봐야 알게 된다(§2.6 1번과 같은 실패 방식).
 */
async function pickFirstRecommendedAsset({ page, click, hold }) {
  const panel = page.getByRole("button", { name: /추천 에셋|에셋 후보/ }).first();
  await panel.waitFor({ state: "visible", timeout: 20_000 }).catch(() => {});

  // 후보 카드는 슬롯 패널 안의 이미지 버튼이다. 정확한 이름은 에셋 제목이라 고정할 수 없다.
  const candidates = page.locator('[data-candidate], button:has(img)');
  const count = await candidates.count();
  if (count === 0) {
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
  await click(candidates.first());
}
