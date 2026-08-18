import { describe, expect, it } from "vitest";
import { createInputArchive, readInputArchive } from "@/lib/theme/export/inputArchive";

describe("input archive", () => {
  it("round-trips named binary inputs", () => {
    const archive = createInputArchive([
      { field: "file-0", bytes: new Uint8Array([0, 1, 255]) },
      { field: "file-1", bytes: new Uint8Array() },
    ]);

    expect([...readInputArchive(archive).entries()].map(([field, bytes]) => [field, [...bytes]])).toEqual([
      ["file-0", [0, 1, 255]],
      ["file-1", []],
    ]);
  });

  it("rejects a truncated archive", () => {
    const archive = createInputArchive([{ field: "file-0", bytes: new Uint8Array([1, 2, 3]) }]);
    expect(() => readInputArchive(archive.slice(0, -1))).toThrow("input_archive");
  });
});
