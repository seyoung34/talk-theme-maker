import { describe, expect, it } from "vitest";
import { collectRemoteUploadPaths } from "@/lib/theme/systemTemplates/uploadRefPaths";
import type { RemoteSlotUploads } from "@/lib/theme/systemTemplates/types";

const entry = (id: string, storagePath: string, originalStoragePath?: string) => ({
  id,
  fileName: `${id}.png`,
  mimeType: "image/png",
  size: 1,
  storagePath,
  ...(originalStoragePath
    ? {
        imageEdit: {
          originalName: `${id}-original.png`,
          originalSize: 2,
          originalStoragePath,
          editedAt: 0,
          state: {},
        },
      }
    : {}),
});

/**
 * 예열 대상 경로 수집.
 *
 * 여기서 빠진 경로는 그대로 단건 서명으로 남는다 — 그러면 요청이 파일 수만큼 나가던
 * 예전 동작이 그 파일에 대해서만 되살아나므로, 무엇을 세는지가 이 함수의 전부다.
 */
describe("collectRemoteUploadPaths", () => {
  const uploadRefs = {
    alpha: [entry("a1", "system-templates/x/a1.png")],
    beta: [entry("b1", "system-templates/x/b1.png", "system-templates/x/b1-original.png")],
    gamma: [entry("g1", "system-templates/x/g1.png"), entry("g2", "system-templates/x/g2.png")],
  } as unknown as RemoteSlotUploads;

  it("모든 슬롯의 storagePath를 모은다", () => {
    expect(collectRemoteUploadPaths(uploadRefs)).toEqual(
      expect.arrayContaining([
        "system-templates/x/a1.png",
        "system-templates/x/b1.png",
        "system-templates/x/g1.png",
        "system-templates/x/g2.png",
      ]),
    );
  });

  it("편집 전 원본 경로도 함께 센다", () => {
    // 원본은 별도 객체다. 빠뜨리면 원본만 단건 서명으로 남는다.
    expect(collectRemoteUploadPaths(uploadRefs)).toContain("system-templates/x/b1-original.png");
  });

  it("slotIds를 주면 그 슬롯만 센다", () => {
    expect(collectRemoteUploadPaths(uploadRefs, ["beta"])).toEqual([
      "system-templates/x/b1.png",
      "system-templates/x/b1-original.png",
    ]);
  });

  it("slotIds가 비어 있으면 제한하지 않는다", () => {
    // hydrateUploads(uploadRefs) 처럼 슬롯을 지정하지 않는 호출과 같은 규칙이다.
    expect(collectRemoteUploadPaths(uploadRefs, [])).toHaveLength(5);
  });

  it("알 수 없는 슬롯만 지정하면 빈 배열", () => {
    expect(collectRemoteUploadPaths(uploadRefs, ["없는-슬롯"])).toEqual([]);
  });

  it("엔트리가 없는 슬롯을 건너뛴다", () => {
    expect(collectRemoteUploadPaths({ alpha: [] } as unknown as RemoteSlotUploads)).toEqual([]);
  });
});
