import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDefaultBubbleAdjustment, type AdminAssetCandidate } from "@/lib/theme/adminAssets";
import { toAdminAssetListItem } from "@/lib/theme/adminAssetList";
import AdminAssetsClient from "./AdminAssetsClient";
import { AdminNavigationGuardProvider, useAdminNavigationGuardCheck } from "@/components/admin/shell/AdminNavigationGuard";
import { fetchAdminAssetUsageIndex } from "@/lib/theme/adminAssetUsage";
import { useImperativeHandle, type ComponentProps } from "react";
import type { MobileBubbleEditor } from "@/components/editor/MobileBubbleEditor";
import { bubbleGeometryToLegacyEdit, centeredBubbleGeometry } from "@/lib/theme/bubbleGeometry";
import { defaultImageEditState } from "@/lib/theme/imageEdit";
import type { BubbleBuilderEditor } from "@/components/editor/BubbleBuilderDialog";
import { createBubbleFamilyDesignSpec, type GeneratedBubbleDesign } from "@/lib/theme/bubbleBuilder";

const mocks = vi.hoisted(() => ({ get: vi.fn(), update: vi.fn(), save: vi.fn(), source: vi.fn(), generate: vi.fn(), bubbleProps: null as ComponentProps<typeof MobileBubbleEditor> | null, builderProps: null as ComponentProps<typeof BubbleBuilderEditor> | null, builderDirty: false, builderBusy: false, builderRequestClose: vi.fn() }));
vi.mock("@/lib/theme/bubbleBuilder", async (original) => ({ ...await original<typeof import("@/lib/theme/bubbleBuilder")>(), generateBubbleAsset: mocks.generate }));
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
vi.mock("@/lib/theme/adminAssetUsage", async (original) => ({ ...await original<typeof import("@/lib/theme/adminAssetUsage")>(), fetchAdminAssetUsageIndex: vi.fn(async () => ({ byAssetId: {}, complete: true, unknownReferences: 0, checkedAt: new Date().toISOString() })) }));
vi.mock("@/components/admin/hooks/useAdminAssetLibrary", () => ({
  useAdminAssetLibrary: () => ({
    assets: [toAdminAssetListItem(asset)], visibleAssets: [toAdminAssetListItem(asset)],
    setAssets: vi.fn(), truncated: false, isLoading: false,
    search: "", setSearch: vi.fn(), sort: "created", setSort: vi.fn(),
    sortDirection: "desc", setSortDirection: vi.fn(), refresh: vi.fn(),
  }),
}));
vi.mock("@/components/image-editor/ImageEditDialog", () => ({ ImageEditDialog: () => null }));
vi.mock("@/components/editor/MobileBubbleEditor", () => ({ MobileBubbleEditor: (props: ComponentProps<typeof MobileBubbleEditor>) => { mocks.bubbleProps = props; return null; } }));
vi.mock("@/components/editor/InlineBubbleAdjuster", () => ({ default: () => null }));
vi.mock("@/components/admin/AdminBubbleTextPreview", () => ({ default: () => null }));
vi.mock("@/components/editor/BubbleBuilderDialog", () => ({ BubbleBuilderEditor: (props: ComponentProps<typeof BubbleBuilderEditor>) => {
  mocks.builderProps = props;
  useImperativeHandle(props.ref, () => ({ requestClose: mocks.builderRequestClose, hasUnsavedChanges: () => mocks.builderDirty, isBusy: () => mocks.builderBusy }));
  return <div data-testid="bubble-builder" />;
} }));

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
  mocks.builderDirty = false; mocks.builderBusy = false;
  localStorage.clear();
  vi.mocked(fetchAdminAssetUsageIndex).mockReset().mockResolvedValue({ byAssetId: {}, complete: true, unknownReferences: 0, checkedAt: "2026-10-02" });
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
  it("shows the seeded library while usage loads through its separate API", () => {
    vi.mocked(fetchAdminAssetUsageIndex).mockImplementation(() => new Promise(() => {}));
    render(<AdminAssetsClient initialData={{ ok: true, value: { items: [toAdminAssetListItem(asset)], truncated: false } }} />);
    expect(screen.getByText("Existing bubble")).toBeTruthy();
    expect(fetchAdminAssetUsageIndex).toHaveBeenCalledTimes(1);
    expect(fetchAdminAssetUsageIndex).toHaveBeenCalledWith(expect.any(AbortSignal));
  });
  it.each(["select", "drop"] as const)("protects a new adjusted bubble before replacing it via %s", async (method) => {
    const { container } = render(<AdminAssetsClient />);
    fireEvent.change(screen.getByLabelText("에셋 분류"), { target: { value: "bubble" } });
    const input = container.querySelector('input[type="file"]')!;
    const first = image("first.png");
    const second = image("second.png");
    fireEvent.change(input, { target: { files: [first] } });
    fireEvent.click(screen.getByRole("button", { name: "중앙에서 조정" }));
    const geometry = centeredBubbleGeometry(80, 60);
    const adjusted = { ...geometry, contentInsets: { ...geometry.contentInsets, left: geometry.contentInsets.left + 2 } };
    act(() => mocks.bubbleProps!.onApply({ ...bubbleGeometryToLegacyEdit(adjusted, 80, 60), editedFile: undefined, sourceFile: first, imageState: defaultImageEditState }));
    const replace = () => method === "select"
      ? fireEvent.change(input, { target: { files: [second] } })
      : fireEvent.drop(screen.getByRole("button", { name: "이미지 파일 여러 개 선택 또는 끌어놓기" }), { dataTransfer: { files: [second] } });
    replace();
    expect(await screen.findByRole("dialog", { name: "저장하지 않은 변경이 있습니다" })).toBeInTheDocument();
    expect(mocks.bubbleProps!.sourceFile).toBe(first);
    expect(mocks.bubbleProps!.geometry).toEqual(adjusted);
    fireEvent.click(screen.getByRole("button", { name: "계속 편집" }));
    expect(mocks.bubbleProps!.sourceFile).toBe(first);
    expect(mocks.bubbleProps!.geometry).toEqual(adjusted);
    replace();
    fireEvent.click(await screen.findByRole("button", { name: "변경 폐기" }));
    expect(mocks.bubbleProps!.sourceFile).toBe(second);
    expect(mocks.bubbleProps!.geometry).not.toEqual(adjusted);
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it("defers central adjustment until the dirty builder close is confirmed", () => {
    render(<AdminAssetsClient />);
    fireEvent.change(screen.getByLabelText("에셋 분류"), { target: { value: "bubble" } });
    fireEvent.click(screen.getByRole("button", { name: "말풍선 빌더 열기" }));
    mocks.builderDirty = true;
    fireEvent.click(screen.getByRole("button", { name: "중앙에서 조정" }));
    expect(mocks.builderRequestClose).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("bubble-builder")).toBeInTheDocument();
    expect(screen.queryByText("이미지 크기 기준으로 말풍선 조정값을 다시 맞췄습니다.")).not.toBeInTheDocument();
    act(() => mocks.builderProps!.onCloseCancelled?.());
    expect(screen.getByTestId("bubble-builder")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "중앙에서 조정" }));
    act(() => mocks.builderProps!.onClose?.());
    expect(screen.queryByTestId("bubble-builder")).not.toBeInTheDocument();
    expect(screen.getByText("이미지 크기 기준으로 말풍선 조정값을 다시 맞췄습니다.")).toBeInTheDocument();
  });
  it("uses the newly applied builder dimensions for deferred central adjustment", async () => {
    const { container } = render(<AdminAssetsClient />);
    fireEvent.change(screen.getByLabelText("에셋 분류"), { target: { value: "bubble" } });
    fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [image("old.png")] } });
    await screen.findByText("자동 분석: 80x60");
    fireEvent.click(screen.getByRole("button", { name: "말풍선 빌더 열기" }));
    mocks.builderDirty = true;
    fireEvent.click(screen.getByRole("button", { name: "중앙에서 조정" }));
    expect(mocks.builderRequestClose).toHaveBeenCalledTimes(1);
    const adjustment = createDefaultBubbleAdjustment({ width: 240, height: 120 });
    const generated: GeneratedBubbleDesign = { spec: createBubbleFamilyDesignSpec("me"), asset: { platform: "android", role: "bubble_me_1", variant: "first", file: image("generated.png"), ...adjustment }, warnings: [] };
    mocks.generate.mockImplementation(async ({ platform }: { platform: "android" | "ios" }) => ({ ...generated, asset: { ...generated.asset, platform } }));
    vi.stubGlobal("Image", class {
      naturalWidth = 240; naturalHeight = 120; onload?: () => void;
      set src(_value: string) { queueMicrotask(() => this.onload?.()); }
    });
    await act(async () => { await mocks.builderProps!.onApply!(generated, {}); });
    await screen.findByText("자동 분석: 240x120");
    act(() => mocks.builderProps!.onClose?.());
    fireEvent.click(await screen.findByRole("button", { name: "변경 폐기" }));
    expect(mocks.bubbleProps!.markers).toEqual(adjustment.markers);
    expect(mocks.bubbleProps!.insets).toEqual(adjustment.insets);
    expect(mocks.bubbleProps!.stretch).toEqual(adjustment.stretch);
    expect(mocks.bubbleProps!.markers).not.toEqual(createDefaultBubbleAdjustment({ width: 80, height: 60 }).markers);
  });
  it("delegates paste to the decoration builder instead of replacing the candidate", () => {
    render(<AdminAssetsClient />);
    fireEvent.change(screen.getByLabelText("에셋 분류"), { target: { value: "bubble" } });
    fireEvent.click(screen.getByRole("button", { name: "말풍선 빌더 열기" }));
    paste([image("decoration.png")]);
    expect(screen.queryByRole("button", { name: "decoration.png 제거" })).not.toBeInTheDocument();
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it("does not revive an external transition after builder close was cancelled", () => {
    render(<AdminAssetsClient />);
    fireEvent.change(screen.getByLabelText("에셋 분류"), { target: { value: "bubble" } });
    fireEvent.click(screen.getByRole("button", { name: "말풍선 빌더 열기" }));
    mocks.builderDirty = true;
    fireEvent.change(screen.getByLabelText("에셋 분류"), { target: { value: "icon" } });
    expect(mocks.builderRequestClose).toHaveBeenCalledTimes(1);
    act(() => mocks.builderProps!.onCloseCancelled?.());
    act(() => mocks.builderProps!.onClose?.());
    expect(screen.getByLabelText("에셋 분류")).toHaveValue("bubble");
  });
  it("blocks source transitions and saving while builder work is pending", () => {
    render(<AdminAssetsClient />);
    fireEvent.change(screen.getByLabelText("에셋 분류"), { target: { value: "bubble" } });
    fireEvent.click(screen.getByRole("button", { name: "말풍선 빌더 열기" }));
    mocks.builderBusy = true;
    fireEvent.change(screen.getByLabelText("에셋 분류"), { target: { value: "icon" } });
    expect(screen.getByLabelText("에셋 분류")).toHaveValue("bubble");
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it("does not count passive preview initialization as dirty or rebase edits on remount", async () => {
    render(<AdminAssetsClient />);
    fireEvent.change(screen.getByLabelText("에셋 분류"), { target: { value: "bubble" } });
    fireEvent.click(screen.getByRole("button", { name: /에셋 상세 보기/ }));
    await waitFor(() => expect(screen.getByLabelText("후보 이름")).toBeEnabled());
    const geometry = centeredBubbleGeometry(80, 60);
    act(() => mocks.bubbleProps!.onPreviewChange?.({ ...bubbleGeometryToLegacyEdit(geometry, 80, 60), flipX: false, isInitial: true }));
    const clean = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(clean);
    expect(clean.defaultPrevented).toBe(false);
    expect(screen.getByRole("button", { name: "변경 저장" })).toBeDisabled();
    const changed = { ...geometry, contentInsets: { ...geometry.contentInsets, left: geometry.contentInsets.left + 1 } };
    act(() => mocks.bubbleProps!.onPreviewChange?.({ ...bubbleGeometryToLegacyEdit(changed, 80, 60), flipX: false, isInitial: false }));
    expect(screen.getByRole("button", { name: "변경 저장" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "말풍선 후보 라이브러리 보기" }));
    fireEvent.click(screen.getByRole("button", { name: "말풍선 편집 화면 보기" }));
    act(() => mocks.bubbleProps!.onPreviewChange?.({ ...bubbleGeometryToLegacyEdit(changed, 80, 60), flipX: false, isInitial: true }));
    fireEvent.click(screen.getAllByRole("button", { name: "새 후보" })[0]);
    expect(await screen.findByRole("button", { name: "계속 편집" })).toBeInTheDocument();
  });
  it("stores transformed artwork as a new candidate instead of losing its bytes in metadata update", async () => {
    render(<AdminAssetsClient />);
    fireEvent.change(screen.getByLabelText("에셋 분류"), { target: { value: "bubble" } });
    fireEvent.click(screen.getByRole("button", { name: /에셋 상세 보기/ }));
    await waitFor(() => expect(screen.getByLabelText("후보 이름")).toBeEnabled());
    const geometry = centeredBubbleGeometry(80, 60);
    act(() => mocks.bubbleProps!.onApply({ ...bubbleGeometryToLegacyEdit(geometry, 80, 60), editedFile: image("edited.png"), sourceFile: image("old.png"), imageState: defaultImageEditState }));
    expect(screen.queryByText("편집 중 · Existing bubble")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "관리 후보 저장" }));
    fireEvent.click(await screen.findByRole("button", { name: "저장하기" }));
    await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(1));
    expect(mocks.save.mock.calls[0][0].fileName).toBe("edited.png");
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it("activates change saving only while the title differs from the saved value", async () => {
    render(<AdminAssetsClient />);
    fireEvent.click(screen.getByRole("button", { name: /에셋 상세 보기/ }));
    await waitFor(() => expect(screen.getByLabelText("후보 이름")).toBeEnabled());
    expect(screen.getByRole("button", { name: "변경 저장" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("후보 이름"), { target: { value: "Changed" } });
    expect(screen.getByRole("button", { name: "변경 저장" })).toBeEnabled();
    fireEvent.change(screen.getByLabelText("후보 이름"), { target: { value: asset.title } });
    expect(screen.getByRole("button", { name: "변경 저장" })).toBeDisabled();
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it("opens linked information from the full card without extra actions", async () => {
    vi.mocked(fetchAdminAssetUsageIndex).mockResolvedValueOnce({ byAssetId: { [asset.id]: [{ id: "bundle", title: "Linked", status: "draft", visibility: "private", variants: [{ id: "variant", platform: "ios", slots: ["slot"], appliedSlots: [] }] }] }, complete: true, unknownReferences: 0, checkedAt: "2026-10-02" });
    render(<AdminAssetsClient />);
    fireEvent.click(screen.getByRole("button", { name: `${asset.title} 에셋 상세 보기` }));
    await waitFor(() => expect(screen.getByLabelText("후보 이름")).toBeEnabled());
    expect(screen.getByText("Linked")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: `${asset.title} 에셋 상세 보기` })).toHaveAccessibleDescription("연결 있음");
    expect(screen.queryByRole("button", { name: /템플릿 열기/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "이 이미지로 새 후보 만들기" })).not.toBeInTheDocument();
  });
  it("disables edits until the source baseline is ready, then protects changes", async () => {
    let resolveSource!: (value: File) => void;
    mocks.source.mockReturnValue(new Promise<File>((resolve) => { resolveSource = resolve; }));
    render(<AdminAssetsClient />);
    fireEvent.change(screen.getByLabelText("에셋 분류"), { target: { value: "bubble" } });
    fireEvent.click(screen.getByRole("button", { name: /에셋 상세 보기/ }));
    await screen.findByRole("button", { name: "원본 다시 조회" });
    expect(screen.getByLabelText("후보 이름")).toBeDisabled();
    expect(screen.getByRole("button", { name: "원본 다시 조회" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "변경 저장" })).toBeDisabled();
    resolveSource(image("old.png"));
    await waitFor(() => expect(screen.getByLabelText("후보 이름")).toBeEnabled());
    fireEvent.change(screen.getByLabelText("후보 이름"), { target: { value: "Unsaved title" } });
    fireEvent.click(screen.getAllByRole("button", { name: "새 후보" })[0]);
    expect(await screen.findByRole("button", { name: "계속 편집" })).toBeInTheDocument();
  });
  it("keeps unsaved edits when a pasted replacement is cancelled", async () => {
    render(<AdminAssetsClient />);
    fireEvent.click(screen.getAllByRole("button", { name: /에셋 상세 보기/ })[0]);
    await screen.findByRole("button", { name: "원본 다시 조회" });
    await waitFor(() => expect(screen.queryByText("원본 불러오는 중")).not.toBeInTheDocument());
    fireEvent.change(screen.getByLabelText("후보 이름"), { target: { value: "Changed title" } });
    paste([image("replacement.png")]);
    fireEvent.click(await screen.findByRole("button", { name: "계속 편집" }));
    expect(screen.getByLabelText("후보 이름")).toHaveValue("Changed title");
    expect(screen.queryByRole("button", { name: "replacement.png 제거" })).not.toBeInTheDocument();
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it("keeps the transition pending and edits intact if saving fails", async () => {
    render(<AdminAssetsClient />);
    fireEvent.click(screen.getAllByRole("button", { name: /에셋 상세 보기/ })[0]);
    await screen.findByRole("button", { name: "원본 다시 조회" });
    await waitFor(() => expect(screen.queryByText("원본 불러오는 중")).not.toBeInTheDocument());
    fireEvent.change(screen.getByLabelText("후보 이름"), { target: { value: "Changed title" } });
    mocks.update.mockRejectedValueOnce(new Error("offline"));
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    paste([image("replacement.png")]);
    fireEvent.click(await screen.findByRole("button", { name: "저장 후 이동" }));
    await waitFor(() => expect(mocks.update).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("button", { name: "계속 편집" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "계속 편집" }));
    expect(screen.getByLabelText("후보 이름")).toHaveValue("Changed title");
    log.mockRestore();
  });
  it("holds deletion while a stored system template reference exists", async () => {
    const usage = { byAssetId: { [asset.id]: [{ id: "bundle", title: "Linked", status: "draft", visibility: "private", variants: [] }] }, complete: true, unknownReferences: 0, checkedAt: "2026-10-02" };
    vi.mocked(fetchAdminAssetUsageIndex).mockResolvedValueOnce(usage).mockResolvedValueOnce(usage);
    render(<AdminAssetsClient />);
    await waitFor(() => expect(screen.getByLabelText("시스템 템플릿 연결 필터")).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: /에셋 상세 보기/ }));
    await waitFor(() => expect(screen.getByLabelText("후보 이름")).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "에셋 삭제" }));
    await screen.findByText(/미리보기와 내보내기에 필요한 원본/);
    expect(screen.getByRole("button", { name: "삭제" })).toBeDisabled();
  });
  it("keeps all candidates accessible when a linked-filter refresh fails", async () => {
    vi.mocked(fetchAdminAssetUsageIndex).mockResolvedValueOnce({ byAssetId: { [asset.id]: [{ id: "bundle", title: "Linked", status: "draft", visibility: "private", variants: [] }] }, complete: true, unknownReferences: 0, checkedAt: "2026-10-02" });
    render(<AdminAssetsClient />);
    fireEvent.click(screen.getAllByRole("button", { name: /에셋 상세 보기/ })[0]);
    await screen.findByRole("button", { name: "연결 다시 조회" });
    fireEvent.change(screen.getByLabelText("시스템 템플릿 연결 필터"), { target: { value: "linked" } });
    vi.mocked(fetchAdminAssetUsageIndex).mockRejectedValueOnce(new Error("offline"));
    fireEvent.click(screen.getByRole("button", { name: "연결 다시 조회" }));
    await screen.findByText("연결 조회 실패 · 전체 후보 표시 중");
    const filter = screen.getByLabelText("시스템 템플릿 연결 필터");
    expect(filter).not.toBeDisabled();
    fireEvent.change(filter, { target: { value: "all" } });
    expect(screen.getByRole("article", { name: "Existing bubble · 수정 중" })).toBeInTheDocument();
  });
  it("ignores an old detail response after accepting a pasted image", async () => {
    let resolveDetail!: (value: AdminAssetCandidate) => void;
    mocks.get.mockReturnValue(new Promise<AdminAssetCandidate>((resolve) => { resolveDetail = resolve; }));
    render(<AdminAssetsClient />);
    fireEvent.change(screen.getByLabelText("에셋 분류"), { target: { value: "bubble" } });
    fireEvent.click(screen.getAllByRole("button", { name: /에셋 상세 보기/ })[0]);
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
    fireEvent.click(screen.getAllByRole("button", { name: /에셋 상세 보기/ })[0]);
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
    fireEvent.click(screen.getAllByRole("button", { name: /에셋 상세 보기/ })[0]);
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
    fireEvent.click(await screen.findByRole("button", { name: "변경 폐기" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "pasted.png 제거" })).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: "first.png 제거" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "second.png 제거" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "ignored.png 제거" })).not.toBeInTheDocument();
  });
});

describe("admin console sidebar navigation from the asset workspace", () => {
  function renderInShell() {
    const guard: { check: (href: string) => boolean } = { check: () => false };
    function Probe() {
      guard.check = useAdminNavigationGuardCheck();
      return null;
    }
    render(
      <AdminNavigationGuardProvider>
        <AdminAssetsClient />
        <Probe />
      </AdminNavigationGuardProvider>,
    );
    return guard;
  }

  it("lets the sidebar leave a clean workspace", () => {
    const guard = renderInShell();
    expect(guard.check("/admin")).toBe(false);
  });

  it("asks before the sidebar discards unsaved edits, like the header link", async () => {
    const guard = renderInShell();
    fireEvent.click(screen.getAllByRole("button", { name: /에셋 상세 보기/ })[0]);
    await waitFor(() => expect(screen.getByLabelText("후보 이름")).toBeEnabled());
    fireEvent.change(screen.getByLabelText("후보 이름"), { target: { value: "Changed title" } });

    let blocked = false;
    act(() => { blocked = guard.check("/admin/templates"); });
    expect(blocked).toBe(true);
    expect(await screen.findByRole("dialog", { name: "저장하지 않은 변경이 있습니다" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "계속 편집" }));
    expect(screen.getByLabelText("후보 이름")).toHaveValue("Changed title");
  });

  it("blocks the sidebar while builder work is pending", () => {
    const guard = renderInShell();
    fireEvent.change(screen.getByLabelText("에셋 분류"), { target: { value: "bubble" } });
    fireEvent.click(screen.getByRole("button", { name: "말풍선 빌더 열기" }));
    mocks.builderBusy = true;
    let blocked = false;
    act(() => { blocked = guard.check("/admin"); });
    expect(blocked).toBe(true);
    expect(screen.queryByRole("dialog", { name: "저장하지 않은 변경이 있습니다" })).not.toBeInTheDocument();
  });
});
