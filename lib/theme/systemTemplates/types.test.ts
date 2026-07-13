import { describe, expect, it } from "vitest";
import { normalizeSystemTemplateVisibility } from "@/lib/theme/systemTemplates/types";

describe("normalizeSystemTemplateVisibility", () => {
  it("keeps public visibility", () => {
    expect(normalizeSystemTemplateVisibility("public")).toBe("public");
  });

  it.each(["private", "unlisted", undefined, null])("normalizes %s to private", (value) => {
    expect(normalizeSystemTemplateVisibility(value)).toBe("private");
  });
});
