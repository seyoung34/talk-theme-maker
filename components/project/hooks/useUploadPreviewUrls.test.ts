import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useUploadPreviewUrls } from "@/components/project/hooks/useUploadPreviewUrls";
import type { SlotUploads } from "@/lib/theme/project/state";

const originalUrl = globalThis.URL;
let createObjectURL: ReturnType<typeof vi.fn>;
let revokeObjectURL: ReturnType<typeof vi.fn>;

const catalogUploads = (previewUrl: string): SlotUploads => ({
  "slot-a": [{
    id: "catalog-entry",
    catalog: {
      selection: { kind: "catalog", assetId: "admin:asset-a", revision: 1, variantKey: "canonical" },
      fileName: "asset.png",
      mimeType: "image/png",
      size: 1024,
      sourceScale: 3,
      width: 1125,
      height: 2436,
      pngSignatureVerified: true,
      previewUrl,
    },
  }],
});

beforeEach(() => {
  createObjectURL = vi.fn((file: File) => `blob:${file.name}`);
  revokeObjectURL = vi.fn();
  vi.stubGlobal("URL", {
    ...originalUrl,
    createObjectURL,
    revokeObjectURL,
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useUploadPreviewUrls", () => {
  it("catalog preview URL은 blob URL을 만들거나 revoke하지 않는다", () => {
    const { result, rerender, unmount } = renderHook(
      ({ uploads }) => useUploadPreviewUrls(uploads),
      { initialProps: { uploads: catalogUploads("https://cdn.example.com/asset.webp") } },
    );

    expect(result.current).toEqual({ "catalog-entry": "https://cdn.example.com/asset.webp" });
    expect(createObjectURL).not.toHaveBeenCalled();

    act(() => rerender({ uploads: {} }));
    unmount();

    expect(revokeObjectURL).not.toHaveBeenCalled();
  });

  it("File preview는 교체·삭제 시 소유한 blob URL만 revoke한다", () => {
    const first = new File([new Uint8Array([1])], "first.png", { type: "image/png" });
    const second = new File([new Uint8Array([2])], "second.png", { type: "image/png" });
    const { result, rerender, unmount } = renderHook(
      ({ uploads }) => useUploadPreviewUrls(uploads),
      { initialProps: { uploads: { "slot-a": [{ id: "upload", file: first }] } as SlotUploads } },
    );

    expect(result.current).toEqual({ upload: "blob:first.png" });
    expect(createObjectURL).toHaveBeenCalledWith(first);

    act(() => rerender({ uploads: { "slot-a": [{ id: "upload", file: second }] } }));
    expect(result.current).toEqual({ upload: "blob:second.png" });
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:first.png");

    act(() => rerender({ uploads: {} }));
    expect(result.current).toEqual({});
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:second.png");
    unmount();
    expect(revokeObjectURL).toHaveBeenCalledTimes(2);
  });

  it("catalog preview URL이 바뀌면 같은 id라도 새 URL을 반영한다", () => {
    const { result, rerender } = renderHook(
      ({ uploads }) => useUploadPreviewUrls(uploads),
      { initialProps: { uploads: catalogUploads("https://cdn.example.com/old.webp") } },
    );

    act(() => rerender({ uploads: catalogUploads("https://cdn.example.com/new.webp") }));

    expect(result.current).toEqual({ "catalog-entry": "https://cdn.example.com/new.webp" });
    expect(createObjectURL).not.toHaveBeenCalled();
    expect(revokeObjectURL).not.toHaveBeenCalled();
  });
});
