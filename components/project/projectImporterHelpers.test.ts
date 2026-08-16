import { describe, expect, it } from "vitest";
import { getDefaultSlotCandidateId, getMissingRemoteUploadSlotIds, getSlotPaletteError, keepCurrentRemoteUploads, mergeSlotUploads } from "@/components/project/projectImporterHelpers";
import { getInitialSlotCandidateSelections, type SlotUploads } from "@/components/project/projectModel";
import type { RemoteSlotUploads } from "@/lib/theme/systemTemplates";
import { getThemeSlots, getThemeTemplate } from "@/lib/theme/templates";

const entry = (id: string) => ({ id, file: new File([id], `${id}.png`), source: "template" as const });
const remoteEntry = (id: string) => ({ id, fileName: `${id}.png`, mimeType: "image/png", size: 1, storagePath: `${id}.png` });

describe("projectImporterHelpers", () => {
  it("finds only remote slots whose uploads are missing, respecting a requested subset", () => {
    const refs = { hydrated: [remoteEntry("a")], missing: [remoteEntry("b")], empty: [] } as RemoteSlotUploads;
    const uploads = { hydrated: [entry("a")] } as SlotUploads;

    expect(getMissingRemoteUploadSlotIds(refs, uploads)).toEqual(["missing"]);
    expect(getMissingRemoteUploadSlotIds(refs, uploads, ["hydrated", "empty"])).toEqual([]);
    expect(getMissingRemoteUploadSlotIds(refs, uploads, ["missing"])).toEqual(["missing"]);
  });

  it("keeps hydrated entries that still have a remote reference", () => {
    const uploads = { slot: [entry("keep"), entry("removed")], localOnly: [entry("local")] } as SlotUploads;
    const refs = { slot: [remoteEntry("keep")] } as RemoteSlotUploads;

    expect(keepCurrentRemoteUploads(uploads, refs)).toEqual({ slot: [uploads.slot![0]] });
  });

  it("merges uploads without duplicating existing IDs", () => {
    const current = { slot: [entry("first")], untouched: [entry("other")] } as SlotUploads;
    const incoming = { slot: [entry("first"), entry("second")], empty: [] } as SlotUploads;

    const result = mergeSlotUploads(current, incoming);
    expect(result.slot?.map((item) => item.id)).toEqual(["first", "second"]);
    expect(result.untouched).toBe(current.untouched);
    expect(result.empty).toBeUndefined();
  });

  it("uses the established initial selection for a single slot", () => {
    const template = getThemeTemplate("basic");
    const slot = getThemeSlots("android")[0];

    expect(getDefaultSlotCandidateId(slot, "basic", template)).toBe(getInitialSlotCandidateSelections([slot], "basic", template)[slot.id]);
  });
});

/**
 * 자동 색상 슬롯마다 seed 이미지가 다르다. 새 레시피를 추가하고 이 판정에 넣지 않으면 조용히
 * 메인 배경 오류로 넘어가서, 실패한 적 없는 이미지의 오류가 뜨거나 정작 실패한 이미지의 오류가
 * 안 뜬다. 입력바가 채팅방 배경을 따라가게 됐을 때 실제로 그렇게 빠졌다.
 */
describe("getSlotPaletteError", () => {
  const errors = { main: "메인 실패", chat: "채팅 실패", bubble: "말풍선 실패", passcode: "잠금화면 실패" };
  const slots = getThemeSlots("android");
  const byRole = (role: string) => slots.find((slot) => slot.role === role)!;

  it("채팅방 이미지를 쓰는 레시피는 채팅 오류를 본다", () => {
    expect(getSlotPaletteError(byRole("chat_background_color"), errors)).toBe(errors.chat);
    // 입력바는 같은 이미지의 하단색을 쓴다. 여기가 빠져 있던 것이 이번에 고친 부분이다.
    expect(getSlotPaletteError(byRole("chat_input_background_color"), errors)).toBe(errors.chat);
  });

  it("말풍선 글자색은 말풍선 오류를 본다", () => {
    expect(getSlotPaletteError(byRole("chat_bubble_me_color"), errors)).toBe(errors.bubble);
    expect(getSlotPaletteError(byRole("chat_bubble_you_color"), errors)).toBe(errors.bubble);
  });

  it("잠금화면 배경은 자기 이미지의 오류를 본다", () => {
    expect(getSlotPaletteError(byRole("passcode_background_color"), errors)).toBe(errors.passcode);
  });

  it("잠금화면 이미지가 없으면 메인 오류로 떨어진다", () => {
    // 이미지가 없을 때는 메인 배경을 따라가므로 실패도 그쪽 것이 맞다.
    expect(getSlotPaletteError(byRole("passcode_background_color"), { ...errors, passcode: null })).toBe(errors.main);
  });

  it("나머지와 슬롯이 없을 때는 메인 오류를 본다", () => {
    expect(getSlotPaletteError(byRole("main_background_color"), errors)).toBe(errors.main);
    expect(getSlotPaletteError(undefined, errors)).toBe(errors.main);
  });

  it("자기 이미지를 쓰는 레시피가 매니페스트 전수로 등록돼 있다", () => {
    // 새 recipe를 추가하고 판정에 넣는 것을 잊으면 조용히 메인 오류로 떨어진다. 여기서 걸린다.
    const expected: Record<string, string> = { chat: errors.chat, passcode: errors.passcode, bubble: errors.bubble };
    for (const platform of ["android", "ios"] as const) {
      for (const slot of getThemeSlots(platform)) {
        const prefix = slot.autoColorRecipe?.split("-")[0];
        if (!prefix || !expected[prefix]) continue;
        expect(getSlotPaletteError(slot, errors), `${platform} ${slot.role}`).toBe(expected[prefix]);
      }
    }
  });
});
