import { describe, expect, it } from "vitest";
import { themeDraftReducer } from "@/components/project/hooks/useThemeDraft";
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
