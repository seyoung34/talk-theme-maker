import { describe, expect, it } from "vitest";
import { normalizePreviewMetadata } from "@/lib/theme/systemTemplates/supabaseRepository";

describe("system template preview metadata normalization", () => {
  it("R2 card·screen ref를 보존한다", () => {
    const sha256 = "a".repeat(64);
    expect(normalizePreviewMetadata({
      r2: {
        card: { objectKey: "preview/v1/card.webp", sha256 },
        screens: {
          friends: { objectKey: "preview/v1/friends.webp", sha256 },
        },
      },
    }).r2).toEqual({
      card: { objectKey: "preview/v1/card.webp", sha256 },
      screens: {
        friends: { objectKey: "preview/v1/friends.webp", sha256 },
      },
    });
  });

  it("잘못된 R2 ref는 제거하고 legacy metadata는 유지한다", () => {
    expect(normalizePreviewMetadata({
      cardPreviewPath: "legacy/card.webp",
      r2: {
        card: { objectKey: "", sha256: "not-a-hash" },
        screens: {
          friends: { objectKey: "preview/v1/friends.webp", sha256: "B".repeat(64) },
        },
      },
    })).toMatchObject({
      cardPreviewPath: "legacy/card.webp",
    });
    expect(normalizePreviewMetadata({ r2: { card: { objectKey: "", sha256: "not-a-hash" } } }).r2).toBeUndefined();
  });
});
