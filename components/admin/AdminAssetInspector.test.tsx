import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AdminAssetInspector } from "./AdminAssetInspector";
import { getAdminAssetCandidate, type AdminAssetCandidate } from "@/lib/theme/adminAssets";
vi.mock("@/lib/theme/adminAssets", async (original) => ({ ...await original<typeof import("@/lib/theme/adminAssets")>(), getAdminAssetCandidate: vi.fn() }));
const asset: AdminAssetCandidate = { id: "a", title: "Original", platform: "all", assetKind: "background", slotRole: "chat_background", enabled: true, fileName: "original.png", mimeType: "image/png", storagePath: "path", previewUrl: "https://example.com/original.png", createdAt: 1, updatedAt: 1, tags: [], analysis: { width: 80, height: 60 } };
afterEach(() => { cleanup(); vi.clearAllMocks(); });
const props = { usage: { byAssetId: {}, complete: true, unknownReferences: 0, checkedAt: "2026-10-02" }, error: null, onRetry: vi.fn(), onCreate: vi.fn(), onOpenTemplate: vi.fn() };
describe("admin asset inspector", () => {
  it("shows the original with dimensions and accessible name", () => {
    render(<AdminAssetInspector {...props} asset={asset} />);
    expect(screen.getByRole("img", { name: "Original · android 원본" })).toHaveAttribute("src", asset.previewUrl);
    expect(screen.getByText("80x60")).toBeInTheDocument();
  });
  it("does not substitute the common image for an unavailable dedicated variant", () => {
    render(<AdminAssetInspector {...props} asset={{ ...asset, variants: [{ platform: "ios", storagePath: "ios/path", fileName: "ios.png", mimeType: "image/png" }] }} />);
    fireEvent.click(screen.getByRole("button", { name: "iOS" }));
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.getByText("크기 미확인")).toBeInTheDocument();
  });
  it("refreshes expired preview metadata without editing the candidate", async () => {
    vi.mocked(getAdminAssetCandidate).mockResolvedValueOnce({ ...asset, previewUrl: "https://example.com/refreshed.png" });
    render(<AdminAssetInspector {...props} asset={asset} />);
    fireEvent.error(screen.getByRole("img"));
    fireEvent.click(screen.getByRole("button", { name: "원본 다시 조회" }));
    await waitFor(() => expect(screen.getByRole("img")).toHaveAttribute("src", "https://example.com/refreshed.png"));
    expect(getAdminAssetCandidate).toHaveBeenCalledWith("a");
    expect(props.onCreate).not.toHaveBeenCalled();
  });
  it("opens an image dialog and closes it with an explicit button", async () => {
    render(<AdminAssetInspector {...props} asset={asset} />);
    fireEvent.click(screen.getByRole("button", { name: "확대 보기" }));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "닫기" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });
});
