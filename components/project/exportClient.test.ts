import { describe, expect, it } from "vitest";
import { appendExportFilesToFormData, getExportPollIntervalMs } from "@/components/project/exportClient";

describe("appendExportFilesToFormData", () => {
  it("같은 blob을 쓰는 경로들은 하나의 field를 공유한다", () => {
    const shared = new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" });
    const other = new Blob([new Uint8Array([4])], { type: "image/png" });
    const formData = new FormData();

    const manifest = appendExportFilesToFormData(formData, [
      { path: "src/main/theme/drawable-xxhdpi/a.png", blob: shared },
      { path: "src/main/theme/drawable-sw600dp/a.png", blob: shared },
      { path: "src/main/theme/drawable-xxhdpi/b.png", blob: other },
    ]);

    expect(manifest).toEqual([
      { field: "file-0", path: "src/main/theme/drawable-xxhdpi/a.png" },
      { field: "file-0", path: "src/main/theme/drawable-sw600dp/a.png" },
      { field: "file-1", path: "src/main/theme/drawable-xxhdpi/b.png" },
    ]);
    expect(formData.getAll("file-0")).toHaveLength(1);
    expect(formData.getAll("file-1")).toHaveLength(1);
  });

  it("서버 에셋 참조는 업로드하지 않고 그대로 통과시킨다", () => {
    const formData = new FormData();

    const manifest = appendExportFilesToFormData(formData, [
      { path: "src/main/theme/drawable-xxhdpi/a.png", serverAsset: "/template-assets/basic/android/a.png" },
    ]);

    expect(manifest).toEqual([{ path: "src/main/theme/drawable-xxhdpi/a.png", serverAsset: "/template-assets/basic/android/a.png" }]);
    expect([...formData.keys()]).toEqual([]);
  });

  it("field 공유를 끄면 같은 blob도 경로마다 고유한 field로 추가한다", () => {
    const shared = new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" });
    const formData = new FormData();

    const manifest = appendExportFilesToFormData(
      formData,
      [
        { path: "Images/a@2x.png", blob: shared },
        { path: "Images/a@3x.png", blob: shared },
      ],
      { shareBlobFields: false },
    );

    expect(manifest).toEqual([
      { field: "file-0", path: "Images/a@2x.png" },
      { field: "file-1", path: "Images/a@3x.png" },
    ]);
    expect(formData.getAll("file-0")).toHaveLength(1);
    expect(formData.getAll("file-1")).toHaveLength(1);
  });
});

describe("getExportPollIntervalMs", () => {
  it("초반에는 촘촘히, 오래 걸릴수록 간격을 늘린다", () => {
    expect(getExportPollIntervalMs(0)).toBe(3_000);
    expect(getExportPollIntervalMs(29_000)).toBe(3_000);
    expect(getExportPollIntervalMs(30_000)).toBe(5_000);
    expect(getExportPollIntervalMs(119_000)).toBe(5_000);
    expect(getExportPollIntervalMs(120_000)).toBe(10_000);
    expect(getExportPollIntervalMs(600_000)).toBe(10_000);
  });
});
