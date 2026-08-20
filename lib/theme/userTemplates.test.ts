import { beforeEach, describe, expect, it } from "vitest";
import { deleteUserTemplate, getUserTemplate, listUserTemplateRecords, saveUserTemplate } from "@/lib/theme/userTemplates";
import type { SlotUploads } from "@/lib/theme/project/state";

/**
 * 사용자 템플릿은 IndexedDB에 저장할 때 업로드 항목을 allowlist로 다시 만든다. 구조적 복제가
 * 실패하는 값을 걸러 내기 위해서다. 그래서 새 필드를 추가하면 여기서 조용히 사라진다 —
 * 화면에는 저장 성공으로 보이고, 다시 열었을 때 슬롯이 비어 있다.
 *
 * catalog 참조는 바이트 없이 그림을 가리키는 유일한 수단이라, 유실되면 복구할 방법이 없다.
 *
 * **fake-indexeddb는 `File`을 보존하지 않는다** — 다시 읽으면 plain object가 되어
 * `instanceof File`이 거짓이 된다. 실제 브라우저 IndexedDB는 보존하므로 제품 동작과 다르다.
 * 그래서 File이 걸린 단언은 저장 반환값(정규화를 한 번 거친 값)으로 확인하고, 읽기 왕복은
 * catalog 참조처럼 순수 데이터인 필드에만 쓴다.
 */

const catalogRef = {
  selection: { kind: "catalog" as const, assetId: "admin:a1b2", revision: 3, variantKey: "canonical" },
  fileName: "bg@3x.png",
  mimeType: "image/png",
  size: 2048,
  sourceScale: 3 as const,
  width: 1125,
  height: 2436,
  pngSignatureVerified: true,
  legacyStoragePath: "admin-assets/a1b2/bg@3x.png",
  previewUrl: "https://cdn.example.com/preview/v1/asset/ab/abc.webp",
};

function baseRecord(uploads: SlotUploads) {
  return {
    name: "테스트 템플릿",
    templateId: "basic" as const,
    platform: "android" as const,
    colors: {},
    uploads,
    candidateSelections: {},
    bubbleEdits: { geometry: {}, markers: {}, insets: {}, stretch: {}, flipX: {} },
  };
}

beforeEach(async () => {
  for (const record of await listUserTemplateRecords()) await deleteUserTemplate(record.id);
});

describe("saveUserTemplate 업로드 정규화", () => {
  it("catalog 참조만 있는 항목을 보존한다", async () => {
    const saved = await saveUserTemplate(baseRecord({ "slot-a": [{ id: "u1", catalog: catalogRef, source: "admin" }] }));

    const reloaded = await getUserTemplate(saved.id);
    const entry = reloaded?.uploads["slot-a"]?.[0];
    expect(entry?.catalog).toEqual({ ...catalogRef, previewUrl: undefined });
    expect(entry?.file).toBeUndefined();
    expect(entry?.source).toBe("admin");
  });

  /**
   * `previewUrl`은 10분짜리 Supabase 서명 URL이다. 저장하면 다음 세션에서 만료된 주소를
   * `<img>`에 넘겨 슬롯이 조용히 빈다. `legacyStoragePath`는 만료되지 않으므로 남긴다.
   */
  it("만료되는 previewUrl은 저장하지 않는다", async () => {
    const saved = await saveUserTemplate(baseRecord({ "slot-a": [{ id: "u1", catalog: catalogRef }] }));

    const entry = (await getUserTemplate(saved.id))?.uploads["slot-a"]?.[0];
    expect(entry?.catalog?.previewUrl).toBeUndefined();
    expect(entry?.catalog?.legacyStoragePath).toBe(catalogRef.legacyStoragePath);
  });

  it("File과 catalog 참조를 함께 가진 항목은 둘 다 보존한다", async () => {
    const file = new File([new Uint8Array([1, 2, 3])], "bg@3x.png", { type: "image/png" });
    const saved = await saveUserTemplate(baseRecord({ "slot-a": [{ id: "u1", file, catalog: catalogRef }] }));

    const entry = saved.uploads["slot-a"]?.[0];
    expect(entry?.file?.name).toBe("bg@3x.png");
    expect(entry?.catalog?.selection.revision).toBe(3);
  });

  it("File도 catalog도 없는 항목은 버린다", async () => {
    const saved = await saveUserTemplate(baseRecord({ "slot-a": [{ id: "u1" }] }));
    expect((await getUserTemplate(saved.id))?.uploads["slot-a"]).toBeUndefined();
  });

  /**
   * 깨진 참조를 그대로 살려 두면 내보내기가 해석하지 못하는 항목이 된다. 참조만 떨어뜨리고
   * File이 있으면 항목 자체는 남긴다 — 그림을 잃는 것보다 낫다.
   */
  it("selection이 깨진 catalog 참조는 떨어뜨리되 File은 남긴다", async () => {
    const file = new File([new Uint8Array([1])], "bg.png", { type: "image/png" });
    const broken = { ...catalogRef, selection: { kind: "catalog", assetId: "", revision: 3, variantKey: "canonical" } };
    const saved = await saveUserTemplate(baseRecord({ "slot-a": [{ id: "u1", file, catalog: broken as never }] }));

    const entry = saved.uploads["slot-a"]?.[0];
    expect(entry?.file?.name).toBe("bg.png");
    expect(entry?.catalog).toBeUndefined();
  });

  it("catalog 참조가 깨졌고 File도 없으면 항목을 버린다", async () => {
    const broken = { ...catalogRef, fileName: "" };
    const saved = await saveUserTemplate(baseRecord({ "slot-a": [{ id: "u1", catalog: broken as never }] }));
    expect((await getUserTemplate(saved.id))?.uploads["slot-a"]).toBeUndefined();
  });
});
