import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SlotUploads } from "@/lib/theme/project/state";
import type { RemoteSlotUploads } from "@/lib/theme/systemTemplates/types";

const { hydrateCatalog, hydrateRemote } = vi.hoisted(() => ({ hydrateCatalog: vi.fn(), hydrateRemote: vi.fn() }));
vi.mock("@/lib/theme/project/catalogPreviewHydration", () => ({ hydrateCatalogPreviewUrls: hydrateCatalog }));
vi.mock("@/lib/theme/systemTemplates", () => ({ systemTemplateRepository: { hydrateUploads: hydrateRemote } }));

import { preparePersonalPreviewUploads } from "@/components/template/personalPreviewUploads";

beforeEach(() => {
  hydrateCatalog.mockReset().mockImplementation(async (uploads) => uploads);
  hydrateRemote.mockReset();
});

describe("personal preview uploads", () => {
  it("restores catalog URLs before preparing a saved template", async () => {
    const saved = { a: [{ id: "one", catalog: { legacyStoragePath: "asset.png" } }] } as unknown as SlotUploads;
    const hydrated = { a: [{ id: "one", catalog: { legacyStoragePath: "asset.png", previewUrl: "https://example.com/a" } }] } as unknown as SlotUploads;
    hydrateCatalog.mockResolvedValue(hydrated);
    expect(await preparePersonalPreviewUploads(saved)).toBe(hydrated);
    expect(saved.a?.[0].catalog?.previewUrl).toBeUndefined();
    expect(hydrateRemote).not.toHaveBeenCalled();
  });

  it("restores missing recent-work references while preserving the user's local edit", async () => {
    const localFile = new File(["edit"], "edit.png");
    const saved = { a: [{ id: "local", file: localFile }] } as SlotUploads;
    const refs: RemoteSlotUploads = { a: [{ id: "remote", fileName: "original.png", mimeType: "image/png", size: 1 }] };
    const remoteFile = new File(["original"], "original.png");
    hydrateRemote.mockResolvedValue({ a: [{ id: "remote", file: remoteFile }] });
    const result = await preparePersonalPreviewUploads(saved, refs);
    expect(hydrateRemote).toHaveBeenCalledWith(refs, ["a"]);
    expect(result.a).toEqual([{ id: "local", file: localFile }, { id: "remote", file: remoteFile }]);
  });

  it("keeps the remaining preview usable when remote assets fail", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const saved = {};
    hydrateRemote.mockRejectedValue(new Error("offline"));
    expect(await preparePersonalPreviewUploads(saved, { a: [{ id: "remote", fileName: "original.png", mimeType: "image/png", size: 1 }] })).toEqual(saved);
    vi.restoreAllMocks();
  });
});
