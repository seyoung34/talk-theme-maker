import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminAssetCandidate } from "@/lib/theme/adminAssets";
import { toAdminAssetListItem } from "@/lib/theme/adminAssetList";
import AdminAssetsClient from "./AdminAssetsClient";

const mocks = vi.hoisted(() => ({ get: vi.fn(), update: vi.fn(), save: vi.fn(), source: vi.fn() }));
vi.mock("@/lib/theme/adminAssets", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/theme/adminAssets")>(),
  getAdminAssetCandidate: mocks.get,
  updateAdminAssetCandidate: mocks.update,
  saveAdminAssetCandidate: mocks.save,
  adminAssetToFile: mocks.source,
}));
vi.mock("@/lib/theme/assetCatalog/shadowPublishClient", () => ({
  shadowPublishThemeAsset: vi.fn(), whenShadowPublishesSettle: vi.fn(async () => undefined),
}));
vi.mock("@/components/admin/hooks/useAdminAssetLibrary", () => ({
  useAdminAssetLibrary: () => ({
    assets: [toAdminAssetListItem(asset)], visibleAssets: [toAdminAssetListItem(asset)],
    setAssets: vi.fn(), truncated: false, isLoading: false,
    search: "", setSearch: vi.fn(), sort: "created", setSort: vi.fn(),
    sortDirection: "desc", setSortDirection: vi.fn(), refresh: vi.fn(),
  }),
}));
vi.mock("@/components/image-editor/ImageEditDialog", () => ({ ImageEditDialog: () => null }));
vi.mock("@/components/editor/MobileBubbleEditor", () => ({ MobileBubbleEditor: () => null }));
vi.mock("@/components/editor/InlineBubbleAdjuster", () => ({ default: () => null }));
vi.mock("@/components/admin/AdminBubbleTextPreview", () => ({ default: () => null }));
vi.mock("@/components/editor/BubbleBuilderDialog", () => ({ BubbleBuilderEditor: () => null }));

const asset: AdminAssetCandidate = {
  id: "11111111-2222-4333-8444-555555555555", title: "Existing bubble",
  assetKind: "bubble", slotRole: "bubble_me_1", platform: "all", tags: [],
  fileName: "old.png", mimeType: "image/png", storagePath: "admin-assets/a/old.png",
  createdAt: 1, updatedAt: 1, enabled: true, analysis: { width: 80, height: 60 },
  bubbleAdjustment: { markers: { top: { start: 10, end: 20 }, left: { start: 10, end: 20 }, bottom: { start: 10, end: 30 }, right: { start: 10, end: 30 } } },
};

function paste(files: File[]) {
  fireEvent.paste(window, { clipboardData: { files } });
}
function image(name: string) { return new File(["image"], name, { type: "image/png" }); }

beforeEach(() => {
  vi.clearAllMocks();
  mocks.get.mockResolvedValue(asset);
  mocks.source.mockResolvedValue(image("old.png"));
  mocks.save.mockResolvedValue({ ...asset, id: "new-asset", title: "New bubble" });
  vi.stubGlobal("Image", class {
    naturalWidth = 80; naturalHeight = 60; onload?: () => void;
    set src(_value: string) { queueMicrotask(() => this.onload?.()); }
  });
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:test");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("admin asset paste", () => {
  it("ignores an old detail response after accepting a pasted image", async () => {
    let resolveDetail!: (value: AdminAssetCandidate) => void;
    mocks.get.mockReturnValue(new Promise<AdminAssetCandidate>((resolve) => { resolveDetail = resolve; }));
    render(<AdminAssetsClient />);
    fireEvent.change(screen.getByLabelText("에셋 분류"), { target: { value: "bubble" } });
    fireEvent.click(screen.getAllByRole("button", { name: "수정" })[0]);
    await waitFor(() => expect(mocks.get).toHaveBeenCalledTimes(1));
    paste([image("pasted.png")]);
    resolveDetail(asset);
    await waitFor(() => expect(screen.getByRole("button", { name: "pasted.png 제거" })).toBeInTheDocument());
    expect(screen.queryByText("편집 중 · Existing bubble")).not.toBeInTheDocument();
    expect(mocks.source).not.toHaveBeenCalled();
  });

  it("ignores old platform files that finish loading after paste", async () => {
    let resolveSource!: (value: File) => void;
    mocks.source.mockReturnValue(new Promise<File>((resolve) => { resolveSource = resolve; }));
    render(<AdminAssetsClient />);
    fireEvent.change(screen.getByLabelText("에셋 분류"), { target: { value: "bubble" } });
    fireEvent.click(screen.getAllByRole("button", { name: "수정" })[0]);
    await waitFor(() => expect(mocks.source).toHaveBeenCalledTimes(2));
    paste([image("pasted.png")]);
    resolveSource(image("old.png"));
    await waitFor(() => expect(screen.queryByText("편집 중 · Existing bubble")).not.toBeInTheDocument());
    expect(screen.getByRole("button", { name: "pasted.png 제거" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "변경 저장" })).not.toBeInTheDocument();
  });

  it("saves a pasted image as a new candidate rather than clearing the edited bubble", async () => {
    render(<AdminAssetsClient />);
    fireEvent.change(screen.getByLabelText("에셋 분류"), { target: { value: "bubble" } });
    fireEvent.click(screen.getAllByRole("button", { name: "수정" })[0]);
    await waitFor(() => expect(screen.getAllByText("편집 중 · Existing bubble").length).toBeGreaterThan(0));
    await waitFor(() => expect(mocks.source).toHaveBeenCalledTimes(2));
    paste([image("pasted.png")]);
    await waitFor(() => expect(screen.queryByText("편집 중 · Existing bubble")).not.toBeInTheDocument());
    await waitFor(() => expect(screen.getAllByRole("button", { name: "관리 후보 저장" })[0]).toBeEnabled());
    fireEvent.click(screen.getAllByRole("button", { name: "관리 후보 저장" })[0]);
    fireEvent.click(await screen.findByRole("button", { name: "저장하기" }));
    await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(1));
    expect(mocks.save.mock.calls[0][0].fileName).toBe("pasted.png");
    expect(mocks.save.mock.calls[0][0].id).toBeUndefined();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("replaces the new candidate queue with the first valid clipboard image", async () => {
    const { container } = render(<AdminAssetsClient />);
    const input = container.querySelector('input[type="file"]')!;
    fireEvent.change(input, { target: { files: [image("first.png")] } });
    fireEvent.change(input, { target: { files: [image("second.png")] } });
    expect(screen.getByRole("button", { name: "first.png 제거" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "second.png 제거" })).toBeInTheDocument();
    paste([image("pasted.png"), image("ignored.png")]);
    await waitFor(() => expect(screen.getByRole("button", { name: "pasted.png 제거" })).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: "first.png 제거" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "second.png 제거" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "ignored.png 제거" })).not.toBeInTheDocument();
  });
});
