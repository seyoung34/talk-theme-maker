import { afterEach, describe, expect, it, vi } from "vitest";
import { hydrateCatalogPreviewUrls } from "@/lib/theme/project/catalogPreviewHydration";
import { getThemeAssetSignedUrls } from "@/lib/theme/remoteAssets";
import type { SlotUploads } from "@/lib/theme/project/state";

vi.mock("@/lib/theme/remoteAssets", () => ({ getThemeAssetSignedUrls: vi.fn() }));

const signMock = vi.mocked(getThemeAssetSignedUrls);

afterEach(() => vi.resetAllMocks());

function catalogEntry(overrides: Record<string, unknown> = {}) {
  return {
    id: "u1",
    catalog: {
      selection: { kind: "catalog" as const, assetId: "admin:a", revision: 1, variantKey: "canonical" },
      fileName: "bg.png",
      mimeType: "image/png",
      size: 10,
      sourceScale: 3 as const,
      width: 9,
      height: 9,
      pngSignatureVerified: true,
      legacyStoragePath: "admin-assets/a/bg.png",
      ...overrides,
    },
  };
}

describe("hydrateCatalogPreviewUrls", () => {
  it("legacyStoragePath를 다시 서명해 previewUrl을 채운다", async () => {
    signMock.mockResolvedValue({ "admin-assets/a/bg.png": "https://signed.example/bg?token=1" });

    const result = await hydrateCatalogPreviewUrls({ "slot-a": [catalogEntry()] });
    expect(result["slot-a"]?.[0]?.catalog?.previewUrl).toBe("https://signed.example/bg?token=1");
    expect(signMock).toHaveBeenCalledWith(["admin-assets/a/bg.png"]);
  });

  it("이미 그릴 수 있는 항목은 서명하지 않는다", async () => {
    const file = new File([new Uint8Array([1])], "a.png", { type: "image/png" });
    const uploads: SlotUploads = {
      "slot-a": [{ id: "u1", file }],
      "slot-b": [catalogEntry({ previewUrl: "https://cdn.example.com/p.webp" })],
    };

    expect(await hydrateCatalogPreviewUrls(uploads)).toBe(uploads);
    expect(signMock).not.toHaveBeenCalled();
  });

  /**
   * 서명은 만료된 세션이나 지워진 경로에서 실패한다. 미리보기를 못 그리는 것은 감당할 수 있지만
   * 여기서 던지면 템플릿을 아예 못 여는 일이 된다.
   */
  it("서명이 실패해도 원래 uploads를 돌려준다", async () => {
    signMock.mockRejectedValue(new Error("expired"));
    const uploads = { "slot-a": [catalogEntry()] };

    expect(await hydrateCatalogPreviewUrls(uploads)).toBe(uploads);
  });

  it("legacyStoragePath가 없으면 건너뛴다", async () => {
    const uploads = { "slot-a": [catalogEntry({ legacyStoragePath: undefined })] };

    expect(await hydrateCatalogPreviewUrls(uploads)).toBe(uploads);
    expect(signMock).not.toHaveBeenCalled();
  });

  it("서명 결과에 경로가 빠져 있으면 그 항목은 그대로 둔다", async () => {
    signMock.mockResolvedValue({});

    const result = await hydrateCatalogPreviewUrls({ "slot-a": [catalogEntry()] });
    expect(result["slot-a"]?.[0]?.catalog?.previewUrl).toBeUndefined();
  });
});
