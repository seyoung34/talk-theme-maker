import { describe, expect, it } from "vitest";
import { AndroidExportRequestError, readAndroidBuildInputFiles } from "@/lib/theme/android/request";
import { readAndroidBundleUpload } from "@/lib/theme/android/requestShared";

const drawablePath = (density: string) => `src/main/theme/drawable-${density}/theme_background_image.png`;

function createFormData(manifest: unknown, files: Record<string, Uint8Array>) {
  const formData = new FormData();
  for (const [field, bytes] of Object.entries(files)) {
    formData.append(field, new File([bytes as BlobPart], `${field}.png`, { type: "image/png" }));
  }
  return { formData, manifestRaw: JSON.stringify(manifest) };
}

describe("readAndroidBuildInputFiles", () => {
  it("여러 경로가 같은 field를 공유하면 바이트를 한 번만 읽어 재사용한다", async () => {
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const { formData, manifestRaw } = createFormData(
      [
        { field: "file-0", path: drawablePath("xxhdpi") },
        { field: "file-0", path: drawablePath("sw600dp") },
      ],
      { "file-0": bytes },
    );

    const result = await readAndroidBuildInputFiles(formData, manifestRaw);

    expect(result.files.map((file) => file.path)).toEqual([drawablePath("xxhdpi"), drawablePath("sw600dp")]);
    expect(result.files[0].bytes).toBe(result.files[1].bytes);
    // 바이트는 재사용하지만 실제 출력 경로마다 확장되는 크기를 집계한다.
    expect(result.inputBytes).toBe(bytes.byteLength * 2);
  });

  it("중복된 내보내기 경로는 거부한다", async () => {
    const { formData, manifestRaw } = createFormData(
      [
        { field: "file-0", path: drawablePath("xxhdpi") },
        { field: "file-0", path: drawablePath("xxhdpi") },
      ],
      { "file-0": new Uint8Array([1]) },
    );

    await expect(readAndroidBuildInputFiles(formData, manifestRaw)).rejects.toBeInstanceOf(AndroidExportRequestError);
  });

  it("field 이름 형식이 다르면 거부한다", async () => {
    const { formData, manifestRaw } = createFormData([{ field: "payload", path: drawablePath("xxhdpi") }], { payload: new Uint8Array([1]) });

    await expect(readAndroidBuildInputFiles(formData, manifestRaw)).rejects.toBeInstanceOf(AndroidExportRequestError);
  });

  it("공유 field가 확장된 전체 크기 제한을 넘으면 거부한다", async () => {
    const bytes = new Uint8Array(20 * 1024 * 1024);
    const { formData, manifestRaw } = createFormData(
      [
        { field: "file-0", path: drawablePath("xhdpi") },
        { field: "file-0", path: drawablePath("xxhdpi") },
        { field: "file-0", path: drawablePath("xxxhdpi") },
      ],
      { "file-0": bytes },
    );

    await expect(readAndroidBuildInputFiles(formData, manifestRaw)).rejects.toMatchObject({
      code: "export_payload_too_large",
      status: 413,
    });
  });
});

describe("readAndroidBundleUpload", () => {
  it("공유 field는 한 번만 업로드 목록에 담는다", async () => {
    const { formData, manifestRaw } = createFormData(
      [
        { field: "file-0", path: drawablePath("xxhdpi") },
        { field: "file-0", path: drawablePath("sw600dp") },
        { field: "file-1", path: "src/main/theme/drawable-xxhdpi/theme_chatroom_background_image.png" },
      ],
      { "file-0": new Uint8Array([1, 2]), "file-1": new Uint8Array([3, 4, 5]) },
    );

    const result = await readAndroidBundleUpload(formData, manifestRaw);

    expect(result.files.map((file) => file.field)).toEqual(["file-0", "file-1"]);
    expect(result.manifest).toHaveLength(3);
    expect(result.inputBytes).toBe(7);
  });

  it("공유 field가 확장된 전체 크기 제한을 넘으면 거부한다", async () => {
    const bytes = new Uint8Array(20 * 1024 * 1024);
    const { formData, manifestRaw } = createFormData(
      [
        { field: "file-0", path: drawablePath("xhdpi") },
        { field: "file-0", path: drawablePath("xxhdpi") },
        { field: "file-0", path: drawablePath("xxxhdpi") },
      ],
      { "file-0": bytes },
    );

    await expect(readAndroidBundleUpload(formData, manifestRaw)).rejects.toMatchObject({
      code: "export_payload_too_large",
      status: 413,
    });
  });
});
