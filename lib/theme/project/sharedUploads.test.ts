import { describe, expect, it } from "vitest";
import {
  findUploadReferenceSlots,
  getSelectedUpload,
  getSelectedUploadRef,
  getSelectedSharedSlotEntry,
  getSharedUploadPeers,
  getSharedSlotUploadEntries,
  planUploadRemoval,
  sharedBubbleUploadRoles,
} from "@/lib/theme/project/state";
import { getThemeSlots } from "@/lib/theme/templates";
import type { SlotUploadEntry } from "@/lib/theme/project/state";

/**
 * 업로드 공유 풀 계약.
 *
 * 저장 구조(`SlotUploads`)는 슬롯별 bucket을 그대로 두고 **읽을 때만** 공유한다. 그래서
 * "어느 bucket에 실제로 있는가"(owner)를 잃지 않는 것이 이 계약의 핵심이다.
 *
 * 관리자/사용자 분류 어휘는 같지만 실제 공유는 전체 화면 배경·탭 아이콘·기본 말풍선으로 제한한다.
 */
const slots = getThemeSlots("android");
const me1 = slots.find((slot) => slot.role === "bubble_me_1")!;
const me2 = slots.find((slot) => slot.role === "bubble_me_2")!;
const you1 = slots.find((slot) => slot.role === "bubble_you_1")!;
const background = slots.find((slot) => slot.role === "main_background")!;

function upload(id: string, source: SlotUploadEntry["source"] = "user"): SlotUploadEntry {
  return { id, file: new File([id], `${id}.png`), source };
}

describe("getSharedUploadPeers", () => {
  it("말풍선은 같은 플랫폼의 나머지 세 개를 고정 순서로 돌려준다", () => {
    expect(getSharedUploadPeers(me1, slots).map((slot) => slot.role)).toEqual([
      "bubble_me_2",
      "bubble_you_1",
      "bubble_you_2",
    ]);
  });

  it("자기 자신은 제외한다", () => {
    expect(getSharedUploadPeers(you1, slots).map((slot) => slot.id)).not.toContain(you1.id);
  });

  it("전체 화면 배경 세 슬롯만 서로 공유한다", () => {
    expect(getSharedUploadPeers(background, slots).map((peer) => peer.role)).toEqual([
      "chat_background",
      "passcode_background",
    ]);
  });

  it("탭 아이콘끼리만 공유하고 같은 icon kind의 테마 아이콘·스플래시는 제외한다", () => {
    const tabIcon = slots.find((slot) => slot.role === "tab_icon_friends")!;
    const iconPeers = getSharedUploadPeers(tabIcon, slots);
    expect(iconPeers.length).toBeGreaterThan(0);
    expect(iconPeers.every((peer) => peer.role.startsWith("tab_icon_"))).toBe(true);
    expect(iconPeers.map((peer) => peer.role)).not.toContain("theme_icon");
    expect(iconPeers.map((peer) => peer.role)).not.toContain("splash");
  });

  it("같은 관리 kind여도 출력 규격이 다른 슬롯은 공유하지 않는다", () => {
    const tabBar = slots.find((slot) => slot.role === "tab_background_image")!;
    const themeIcon = slots.find((slot) => slot.role === "theme_icon")!;
    const splash = slots.find((slot) => slot.role === "splash")!;

    expect(getSharedUploadPeers(tabBar, slots)).toEqual([]);
    expect(getSharedUploadPeers(themeIcon, slots)).toEqual([]);
    expect(getSharedUploadPeers(splash, slots)).toEqual([]);
  });

  it("공유 그룹이 다르면 섞이지 않는다", () => {
    const tabIcon = slots.find((slot) => slot.role === "tab_icon_friends")!;
    const iconPeers = getSharedUploadPeers(tabIcon, slots);
    expect(iconPeers.map((peer) => peer.role)).not.toContain("main_background");
    expect(getSharedUploadPeers(background, slots).map((peer) => peer.role)).not.toContain("tab_icon_friends");
  });

  it("색상 슬롯에는 peer가 없다", () => {
    // 업로드를 받지 않는 슬롯이라 공유할 것이 없다.
    const color = slots.find((slot) => slot.kind === "color")!;
    expect(getSharedUploadPeers(color, slots)).toEqual([]);
  });

  it("플랫폼을 넘지 않는다", () => {
    const iosSlots = getThemeSlots("ios");
    const androidBackground = getSharedUploadPeers(background, [...slots, ...iosSlots]);
    expect(androidBackground.every((peer) => peer.platform === "android")).toBe(true);
  });

  it("iOS 선택 변형은 공유 풀에 들어가지 않는다", () => {
    // kind로만 묶으면 `bubble_*_selected` 4개가 딸려 들어와 peer가 Android 3개, iOS 7개로 갈린다.
    // 그 변형을 공유에 넣을지는 별도 판단이 필요하다.
    const iosSlots = getThemeSlots("ios");
    const selected = iosSlots.find((slot) => slot.role === "bubble_me_1_selected")!;
    const iosMe1 = iosSlots.find((slot) => slot.role === "bubble_me_1")!;

    expect(sharedBubbleUploadRoles).toHaveLength(4);
    expect(getSharedUploadPeers(selected, iosSlots)).toEqual([]);
    expect(getSharedUploadPeers(iosMe1, iosSlots).map((slot) => slot.role)).toEqual([
      "bubble_me_2",
      "bubble_you_1",
      "bubble_you_2",
    ]);
  });

  it("iOS 잠금 배경은 전체 화면 배경과 공유하지만 키패드 이미지는 제외한다", () => {
    const iosSlots = getThemeSlots("ios");
    const passcodeBackground = iosSlots.find((slot) => slot.role === "passcode_background")!;
    const keypadPressed = iosSlots.find((slot) => slot.role === "passcode_keypad_pressed_image")!;

    expect(getSharedUploadPeers(passcodeBackground, iosSlots).map((slot) => slot.role)).toEqual([
      "main_background",
      "chat_background",
    ]);
    expect(getSharedUploadPeers(keypadPressed, iosSlots)).toEqual([]);
  });
});

describe("getSharedSlotUploadEntries", () => {
  it("자기 bucket을 먼저, 그다음 peer를 고정 순서로 돌려준다", () => {
    const uploads = { [me1.id]: [upload("a")], [you1.id]: [upload("c")], [me2.id]: [upload("b")] };

    expect(getSharedSlotUploadEntries(me1, uploads, slots)).toEqual([
      { ownerSlotId: me1.id, entry: uploads[me1.id][0] },
      { ownerSlotId: me2.id, entry: uploads[me2.id][0] },
      { ownerSlotId: you1.id, entry: uploads[you1.id][0] },
    ]);
  });

  it("owner를 보존한다", () => {
    const uploads = { [me2.id]: [upload("shared")] };
    expect(getSharedSlotUploadEntries(me1, uploads, slots)[0].ownerSlotId).toBe(me2.id);
  });

  it("peer의 admin entry는 공유하지 않는다", () => {
    // admin ID는 여러 bucket에 중복될 수 있어 owner가 모호하고 슬롯별 조정값도 다를 수 있다.
    const uploads = { [me2.id]: [upload("admin-asset", "admin"), upload("user-asset")] };

    expect(getSharedSlotUploadEntries(me1, uploads, slots).map((resolved) => resolved.entry.id)).toEqual(["user-asset"]);
    // 자기 bucket의 admin entry는 그대로 보인다.
    expect(getSharedSlotUploadEntries(me2, uploads, slots).map((resolved) => resolved.entry.id)).toEqual(["admin-asset", "user-asset"]);
  });

  it("같은 ID가 여러 bucket에 있으면 자기 bucket을 우선한다", () => {
    const own = upload("dup");
    const peer = upload("dup");
    const uploads = { [me1.id]: [own], [me2.id]: [peer] };

    const resolved = getSharedSlotUploadEntries(me1, uploads, slots);
    expect(resolved).toHaveLength(1);
    expect(resolved[0]).toEqual({ ownerSlotId: me1.id, entry: own });
  });

  it("말풍선이 아닌 슬롯은 자기 bucket만 본다", () => {
    const uploads = { [background.id]: [upload("bg")], [me1.id]: [upload("bubble")] };
    expect(getSharedSlotUploadEntries(background, uploads, slots).map((r) => r.entry.id)).toEqual(["bg"]);
  });
});

describe("getSelectedUploadRef", () => {
  it("peer bucket에 있는 선택도 찾아낸다", () => {
    const uploads = { [me2.id]: [upload("shared")] };
    const selections = { [me1.id]: "shared" };

    expect(getSelectedUploadRef(me1, uploads, selections, slots)).toEqual({
      ownerSlotId: me2.id,
      entry: uploads[me2.id][0],
    });
    expect(getSelectedUpload(me1, uploads, selections, slots)?.id).toBe("shared");
  });

  it("네 슬롯이 같은 업로드를 각자 고를 수 있다", () => {
    const uploads = { [me1.id]: [upload("one")] };
    const selections = Object.fromEntries(
      sharedBubbleUploadRoles.map((role) => [slots.find((slot) => slot.role === role)!.id, "one"]),
    );

    for (const role of sharedBubbleUploadRoles) {
      const slot = slots.find((candidate) => candidate.role === role)!;
      expect(getSelectedUpload(slot, uploads, selections, slots)?.id).toBe("one");
    }
  });

  it("선택이 없으면 undefined다", () => {
    expect(getSelectedUploadRef(me1, { [me1.id]: [upload("a")] }, {}, slots)).toBeUndefined();
  });
});

describe("getSelectedSharedSlotEntry", () => {
  it("hydrate 전 원격 ref도 peer owner bucket에서 찾는다", () => {
    const refs = { [me2.id]: [{ id: "shared", storagePath: "system-templates/shared.png" }] };
    const resolved = getSelectedSharedSlotEntry(me1, refs, { [me1.id]: "shared" }, slots);

    expect(resolved).toEqual({ ownerSlotId: me2.id, entry: refs[me2.id][0] });
  });
});

describe("planUploadRemoval", () => {
  it("다른 슬롯이 참조 중이면 삭제를 막고 그 슬롯을 알려 준다", () => {
    const selections = { [me1.id]: "shared", [you1.id]: "shared" };
    const plan = planUploadRemoval("shared", me1.id, me1.id, selections, slots);

    expect(plan.kind).toBe("blocked");
    expect(plan.kind === "blocked" && plan.blockingSlots.map((slot) => slot.id)).toEqual([you1.id]);
  });

  it("요청한 슬롯만 쓰고 있으면 owner bucket에서 지운다", () => {
    // owner가 다른 슬롯이어도 지우는 대상은 owner bucket이다.
    const plan = planUploadRemoval("shared", me2.id, me1.id, { [me1.id]: "shared" }, slots);
    expect(plan).toEqual({ kind: "remove", ownerSlotId: me2.id });
  });

  it("아무도 쓰고 있지 않으면 그냥 지운다", () => {
    expect(planUploadRemoval("orphan", me1.id, me1.id, {}, slots)).toEqual({ kind: "remove", ownerSlotId: me1.id });
  });

  it("owner가 요청 슬롯이 아니고 owner도 쓰고 있으면 막는다", () => {
    const plan = planUploadRemoval("shared", me2.id, me1.id, { [me1.id]: "shared", [me2.id]: "shared" }, slots);
    expect(plan.kind).toBe("blocked");
    expect(plan.kind === "blocked" && plan.blockingSlots.map((slot) => slot.id)).toEqual([me2.id]);
  });
});

describe("findUploadReferenceSlots", () => {
  it("공유 풀 안에서만 참조를 센다", () => {
    const selections = { [me1.id]: "shared", [background.id]: "shared" };
    expect(findUploadReferenceSlots("shared", me1.id, selections, slots).map((slot) => slot.id)).toEqual([me1.id]);
  });
});
