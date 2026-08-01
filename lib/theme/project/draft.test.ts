import { describe, expect, it } from "vitest";
import { createEmptyThemeDraft, normalizeThemeDraft, type PersistedThemeDraft } from "@/lib/theme/project/draft";

/**
 * 저장 레코드 → 런타임 초안 승격 계약.
 *
 * 나중에 추가된 필드는 예전 레코드에 없다. optional로 읽기 때문에 승격을 빠뜨려도 타입은
 * 통과하고, 화면에서만 `undefined` 참조로 터진다. 승격을 한 함수에 모아 두고 여기서 잠근다.
 */
describe("normalizeThemeDraft", () => {
  function legacyRecord(): PersistedThemeDraft {
    const { bubbleGeometry, bubbleFlipX, bubbleDesigns, bubbleDecorationSources, ...rest } = createEmptyThemeDraft();
    void bubbleGeometry;
    void bubbleFlipX;
    void bubbleDesigns;
    void bubbleDecorationSources;
    return rest;
  }

  it("나중에 추가된 필드가 없는 레코드를 빈 객체로 채운다", () => {
    const normalized = normalizeThemeDraft(legacyRecord());

    expect(normalized.bubbleGeometry).toEqual({});
    expect(normalized.bubbleFlipX).toEqual({});
    expect(normalized.bubbleDesigns).toEqual({});
    expect(normalized.bubbleDecorationSources).toEqual({});
  });

  it("이미 있는 값은 덮어쓰지 않는다", () => {
    const flipX = { "slot-a": true };
    expect(normalizeThemeDraft({ ...legacyRecord(), bubbleFlipX: flipX }).bubbleFlipX).toBe(flipX);
  });

  it("나머지 필드는 그대로 통과시킨다", () => {
    const record = { ...legacyRecord(), colors: { "slot-a": "#ffffff" }, candidateSelections: { "slot-a": "candidate" } };
    const normalized = normalizeThemeDraft(record);

    expect(normalized.colors).toBe(record.colors);
    expect(normalized.candidateSelections).toBe(record.candidateSelections);
    expect(normalized.uploads).toBe(record.uploads);
  });

  it("빈 초안에는 반전 맵이 항상 존재한다", () => {
    // 런타임 계약이다. 컴포넌트가 `draft.bubbleFlipX[slotId]`를 조건 없이 읽을 수 있어야 한다.
    expect(createEmptyThemeDraft().bubbleFlipX).toEqual({});
  });
});
