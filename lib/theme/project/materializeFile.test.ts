import { describe, expect, it } from "vitest";
import { createLatestRequestTracker, materializeFile } from "@/lib/theme/project/materializeFile";

describe("materializeFile", () => {
  it("reads the source bytes into an independent File while preserving metadata", async () => {
    const source = new File([new Uint8Array([0, 1, 2, 255])], "wallpaper.png", {
      type: "image/png",
      lastModified: 1_700_000_000_000,
    });

    const materialized = await materializeFile(source);

    expect(materialized).not.toBe(source);
    expect(materialized.name).toBe(source.name);
    expect(materialized.type).toBe(source.type);
    expect(materialized.lastModified).toBe(source.lastModified);
    expect(new Uint8Array(await materialized.arrayBuffer())).toEqual(new Uint8Array([0, 1, 2, 255]));
  });

  it("keeps only the newest request for the same key current", () => {
    const tracker = createLatestRequestTracker();
    const first = tracker.begin("chat-background");
    const replacement = tracker.begin("chat-background");
    const otherSlot = tracker.begin("profile-image");

    expect(tracker.isCurrent("chat-background", first)).toBe(false);
    expect(tracker.isCurrent("chat-background", replacement)).toBe(true);
    expect(tracker.isCurrent("profile-image", otherSlot)).toBe(true);
  });

  it("invalidates an in-flight request when a later selection replaces it", () => {
    const tracker = createLatestRequestTracker();
    const upload = tracker.begin("chat-background");

    tracker.invalidate("chat-background");

    expect(tracker.isCurrent("chat-background", upload)).toBe(false);
  });
});
