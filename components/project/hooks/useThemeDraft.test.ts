import { describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { themeDraftReducer, useThemeDraft } from "@/components/project/hooks/useThemeDraft";
import type { BubbleFamilyDesignSpec } from "@/lib/theme/bubbleBuilder";
import { createEmptyThemeDraft } from "@/lib/theme/project/draft";

describe("themeDraftReducer", () => {
  it("updates one draft field without changing the remaining fields", () => {
    const initial = {
      ...createEmptyThemeDraft(),
      colors: { color: "#ffffff" },
      candidateSelections: { candidate: "default" },
    };

    const result = themeDraftReducer(initial, { type: "set-colors", updater: (colors) => ({ ...colors, color: "#000000" }) });

    expect(result.colors).toEqual({ color: "#000000" });
    expect(result.candidateSelections).toBe(initial.candidateSelections);
    expect(result.uploads).toBe(initial.uploads);
  });

  it("supports functional updates for uploads and remote references", () => {
    const upload = { id: "upload", file: new File(["image"], "image.png"), source: "user" as const };
    const initial = createEmptyThemeDraft();
    const withUpload = themeDraftReducer(initial, { type: "set-uploads", updater: { slot: [upload] } });
    const withRemoteRefs = themeDraftReducer(withUpload, { type: "set-remote-upload-refs", updater: (refs) => ({ ...refs, slot: [] }) });

    expect(withRemoteRefs.uploads.slot).toEqual([upload]);
    expect(withRemoteRefs.remoteUploadRefs).toEqual({ slot: [] });
  });

  it("stores shared bubble geometry without changing legacy edit maps", () => {
    const initial = createEmptyThemeDraft();
    const geometry = {
      stretch: { x: 20, y: 12 },
      contentInsets: { top: 5, right: 6, bottom: 7, left: 8 },
    };

    const result = themeDraftReducer(initial, { type: "set-bubble-geometry", updater: { bubble: geometry } });

    expect(result.bubbleGeometry).toEqual({ bubble: geometry });
    expect(result.bubbleMarkers).toBe(initial.bubbleMarkers);
    expect(result.bubbleInsets).toBe(initial.bubbleInsets);
    expect(result.bubbleStretch).toBe(initial.bubbleStretch);
  });

  it("replaces the complete draft atomically for bootstrap and reset flows", () => {
    const initial = createEmptyThemeDraft();
    const range = { start: 1, end: 2 };
    const replacement = { ...createEmptyThemeDraft(), candidateSelections: { slot: "candidate" }, bubbleMarkers: { slot: { top: range, left: range, right: range, bottom: range } } };

    expect(themeDraftReducer(initial, { type: "replace", draft: replacement })).toBe(replacement);
  });

  it("선택된 upload 삭제와 fallback 전환에서 source 종속 bubble edits를 원자적으로 비운다", () => {
    const range = { start: 1, end: 2 };
    const markers = { top: range, left: range, right: range, bottom: range };
    const geometry = { stretch: { x: 4, y: 5 }, contentInsets: { top: 1, right: 2, bottom: 3, left: 4 } };
    const selected = { id: "selected", file: new File(["selected"], "selected.png"), source: "user" as const };
    const other = { id: "other", file: new File(["other"], "other.png"), source: "user" as const };
    const design = { version: 1, familyId: "family", presetVersion: "bubble-builder-v1", side: "me", design: { side: "me", preset: "rounded", radius: 8, fill: "#fff", borderColor: "#000", borderWidth: 1, textColor: "#000", syncTextColorOnApply: false, decorations: [] }, createdAt: 1, updatedAt: 1 } satisfies BubbleFamilyDesignSpec;
    const initial = {
      ...createEmptyThemeDraft(),
      uploads: { slot: [selected, other] },
      candidateSelections: { slot: "selected" },
      bubbleGeometry: { slot: geometry, untouched: geometry },
      bubbleMarkers: { slot: markers, untouched: markers },
      bubbleInsets: { slot: geometry.contentInsets, untouched: geometry.contentInsets },
      bubbleStretch: { slot: geometry.stretch, untouched: geometry.stretch },
      bubbleFlipX: { slot: true, untouched: true },
      bubbleDesigns: { bubble_me_1: design },
      bubbleDecorationSources: { decoration: new File(["decoration"], "decoration.png") },
    };

    const result = themeDraftReducer(initial, {
      type: "remove-upload-candidate",
      slotId: "slot",
      uploadId: "selected",
      fallbackCandidateId: "default",
    });

    expect(result.uploads.slot).toEqual([other]);
    expect(result.candidateSelections.slot).toBe("default");
    expect(result.bubbleGeometry.slot).toBeUndefined();
    expect(result.bubbleMarkers.slot).toBeUndefined();
    expect(result.bubbleInsets.slot).toBeUndefined();
    expect(result.bubbleStretch.slot).toBeUndefined();
    // 반전은 "지금 선택한 그림을 뒤집는다"는 뜻이다. 그림이 바뀌면 남겨 둘 근거가 없다.
    expect(result.bubbleFlipX.slot).toBeUndefined();
    expect(result.bubbleFlipX.untouched).toBe(true);
    expect(result.bubbleGeometry.untouched).toBe(geometry);
    // recipe는 다시 생성·편집할 수 있는 독립 source이므로 후보 전환과 함께 지우지 않는다.
    expect(result.bubbleDesigns).toBe(initial.bubbleDesigns);
    expect(result.bubbleDecorationSources).toBe(initial.bubbleDecorationSources);
  });

  it("선택되지 않은 upload 삭제는 현재 선택과 bubble edits를 보존한다", () => {
    const range = { start: 1, end: 2 };
    const markers = { top: range, left: range, right: range, bottom: range };
    const selected = { id: "selected", file: new File(["selected"], "selected.png"), source: "user" as const };
    const removed = { id: "removed", file: new File(["removed"], "removed.png"), source: "user" as const };
    const initial = {
      ...createEmptyThemeDraft(),
      uploads: { slot: [selected, removed] },
      candidateSelections: { slot: "selected" },
      bubbleMarkers: { slot: markers },
    };

    const result = themeDraftReducer(initial, {
      type: "remove-upload-candidate",
      slotId: "slot",
      uploadId: "removed",
      fallbackCandidateId: "default",
    });

    expect(result.uploads.slot).toEqual([selected]);
    expect(result.candidateSelections).toBe(initial.candidateSelections);
    expect(result.bubbleMarkers).toBe(initial.bubbleMarkers);
  });
});

describe("useThemeDraft.clearBubbleEdits", () => {
  const range = { start: 1, end: 2 };
  const markers = { top: range, left: range, right: range, bottom: range };
  const insets = { top: 5, right: 6, bottom: 7, left: 8 };
  const stretch = { x: 20, y: 12 };
  const geometry = { stretch, contentInsets: insets };

  function seededDraft() {
    return {
      ...createEmptyThemeDraft(),
      bubbleGeometry: { "slot-a": geometry, "slot-b": geometry },
      bubbleMarkers: { "slot-a": markers, "slot-b": markers },
      bubbleInsets: { "slot-a": insets, "slot-b": insets },
      bubbleStretch: { "slot-a": stretch, "slot-b": stretch },
      bubbleFlipX: { "slot-a": true, "slot-b": true },
    };
  }

  it("드롭한 슬롯의 편집값을 모두 비운다", () => {
    const { result } = renderHook(() => useThemeDraft());
    act(() => result.current.replaceDraft(seededDraft()));

    act(() => result.current.clearBubbleEdits("slot-a"));

    expect(result.current.draft.bubbleGeometry["slot-a"]).toBeUndefined();
    expect(result.current.draft.bubbleMarkers["slot-a"]).toBeUndefined();
    expect(result.current.draft.bubbleInsets["slot-a"]).toBeUndefined();
    expect(result.current.draft.bubbleStretch["slot-a"]).toBeUndefined();
    // 반전을 남기면 새로 올린 이미지가 이유 없이 뒤집혀 보인다.
    expect(result.current.draft.bubbleFlipX["slot-a"]).toBeUndefined();
  });

  it("다른 슬롯의 편집값은 건드리지 않는다", () => {
    const { result } = renderHook(() => useThemeDraft());
    act(() => result.current.replaceDraft(seededDraft()));

    act(() => result.current.clearBubbleEdits("slot-a"));

    expect(result.current.draft.bubbleGeometry["slot-b"]).toEqual(geometry);
    expect(result.current.draft.bubbleMarkers["slot-b"]).toEqual(markers);
    expect(result.current.draft.bubbleInsets["slot-b"]).toEqual(insets);
    expect(result.current.draft.bubbleStretch["slot-b"]).toEqual(stretch);
    expect(result.current.draft.bubbleFlipX["slot-b"]).toBe(true);
  });

  it("반전은 좌표 편집과 독립적으로 켜고 끌 수 있다", () => {
    const { result } = renderHook(() => useThemeDraft());

    act(() => result.current.setBubbleFlipX((current) => ({ ...current, "slot-a": true })));
    expect(result.current.draft.bubbleFlipX["slot-a"]).toBe(true);
    // 좌표 편집이 하나도 없어도 반전만으로 편집 상태가 될 수 있다.
    expect(result.current.draft.bubbleGeometry["slot-a"]).toBeUndefined();

    act(() => result.current.setBubbleFlipX(() => ({})));
    expect(result.current.draft.bubbleFlipX["slot-a"]).toBeUndefined();
  });

  it("편집값이 없는 슬롯에는 아무 일도 하지 않는다", () => {
    const { result } = renderHook(() => useThemeDraft());
    act(() => result.current.replaceDraft(seededDraft()));
    const before = result.current.draft;

    act(() => result.current.clearBubbleEdits("slot-c"));

    expect(result.current.draft.bubbleGeometry).toBe(before.bubbleGeometry);
    expect(result.current.draft.bubbleMarkers).toBe(before.bubbleMarkers);
  });
});
