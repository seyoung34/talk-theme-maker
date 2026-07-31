import { describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { themeDraftReducer, useThemeDraft } from "@/components/project/hooks/useThemeDraft";
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
    };
  }

  it("드롭한 슬롯의 네 편집값을 모두 비운다", () => {
    const { result } = renderHook(() => useThemeDraft());
    act(() => result.current.replaceDraft(seededDraft()));

    act(() => result.current.clearBubbleEdits("slot-a"));

    expect(result.current.draft.bubbleGeometry["slot-a"]).toBeUndefined();
    expect(result.current.draft.bubbleMarkers["slot-a"]).toBeUndefined();
    expect(result.current.draft.bubbleInsets["slot-a"]).toBeUndefined();
    expect(result.current.draft.bubbleStretch["slot-a"]).toBeUndefined();
  });

  it("다른 슬롯의 편집값은 건드리지 않는다", () => {
    const { result } = renderHook(() => useThemeDraft());
    act(() => result.current.replaceDraft(seededDraft()));

    act(() => result.current.clearBubbleEdits("slot-a"));

    expect(result.current.draft.bubbleGeometry["slot-b"]).toEqual(geometry);
    expect(result.current.draft.bubbleMarkers["slot-b"]).toEqual(markers);
    expect(result.current.draft.bubbleInsets["slot-b"]).toEqual(insets);
    expect(result.current.draft.bubbleStretch["slot-b"]).toEqual(stretch);
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
