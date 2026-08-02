import { describe, expect, it } from "vitest";
import {
  findUploadReferenceSlots,
  getSelectedUpload,
  getSelectedUploadRef,
  getSelectedSharedSlotEntry,
  getSharedBubbleUploadPeers,
  getSharedSlotUploadEntries,
  planUploadRemoval,
  sharedBubbleUploadRoles,
} from "@/lib/theme/project/state";
import { getThemeSlots } from "@/lib/theme/templates";
import type { SlotUploadEntry } from "@/lib/theme/project/state";

/**
 * 말풍선 업로드 공유 풀 계약.
 *
 * 저장 구조(`SlotUploads`)는 슬롯별 bucket을 그대로 두고 **읽을 때만** 공유한다. 그래서
 * "어느 bucket에 실제로 있는가"(owner)를 잃지 않는 것이 이 계약의 핵심이다.
 */
const slots = getThemeSlots("android");
const me1 = slots.find((slot) => slot.role === "bubble_me_1")!;
const me2 = slots.find((slot) => slot.role === "bubble_me_2")!;
const you1 = slots.find((slot) => slot.role === "bubble_you_1")!;
const background = slots.find((slot) => slot.role === "main_background")!;

function upload(id: string, source: SlotUploadEntry["source"] = "user"): SlotUploadEntry {
  return { id, file: new File([id], `${id}.png`), source };
}

describe("getSharedBubbleUploadPeers", () => {
  it("같은 플랫폼의 나머지 말풍선 세 개를 고정 순서로 돌려준다", () => {
    expect(getSharedBubbleUploadPeers(me1, slots).map((slot) => slot.role)).toEqual([
      "bubble_me_2",
      "bubble_you_1",
      "bubble_you_2",
    ]);
  });

  it("자기 자신은 제외한다", () => {
    expect(getSharedBubbleUploadPeers(you1, slots).map((slot) => slot.id)).not.toContain(you1.id);
  });

  it("말풍선이 아닌 슬롯에는 peer가 없다", () => {
    expect(getSharedBubbleUploadPeers(background, slots)).toEqual([]);
  });

  it("iOS 선택 변형은 공유 풀에 들어가지 않는다", () => {
    // 이번 범위 밖이다(계획 문서 2-D). peer 집합이 플랫폼마다 달라지면 고정 순서 계약과
    // hydration 대상이 전부 플랫폼 분기를 갖게 된다.
    const iosSlots = getThemeSlots("ios");
    const selected = iosSlots.find((slot) => slot.role === "bubble_me_1_selected")!;
    const iosMe1 = iosSlots.find((slot) => slot.role === "bubble_me_1")!;

    expect(sharedBubbleUploadRoles).toHaveLength(4);
    expect(getSharedBubbleUploadPeers(selected, iosSlots)).toEqual([]);
    expect(getSharedBubbleUploadPeers(iosMe1, iosSlots).map((slot) => slot.role)).toEqual([
      "bubble_me_2",
      "bubble_you_1",
      "bubble_you_2",
    ]);
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
