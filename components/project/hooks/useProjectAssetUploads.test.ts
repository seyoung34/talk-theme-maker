import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useProjectAssetUploads } from "@/components/project/hooks/useProjectAssetUploads";
import { getThemeSlots } from "@/lib/theme/templates";
import type { AdminAssetCandidate, AdminAssetListOptions, AdminAssetPage } from "@/lib/theme/adminAssets";
import type { ThemeAssetSlot } from "@/lib/theme/templates";

type RecommendedListOptions = Required<Pick<AdminAssetListOptions, "platform" | "assetKind">> & AdminAssetListOptions;
const listRecommendedAssetCandidatePage = vi.fn<(options: RecommendedListOptions) => Promise<AdminAssetPage>>();

vi.mock("@/lib/theme/adminAssets", async () => {
  const actual = await vi.importActual<typeof import("@/lib/theme/adminAssets")>("@/lib/theme/adminAssets");
  return {
    ...actual,
    listRecommendedAssetCandidatePage: (options: RecommendedListOptions) => listRecommendedAssetCandidatePage(options),
  };
});

const slots = getThemeSlots("android");
const bubbleMe1 = slots.find((slot) => slot.role === "bubble_me_1")!;
const bubbleMe2 = slots.find((slot) => slot.role === "bubble_me_2")!;
const bubbleYou1 = slots.find((slot) => slot.role === "bubble_you_1")!;
const mainBackground = slots.find((slot) => slot.role === "main_background")!;
const chatBackground = slots.find((slot) => slot.role === "chat_background")!;
const themeIcon = slots.find((slot) => slot.role === "theme_icon")!;
const passcodeIndicator = slots.find((slot) => slot.role === "passcode_indicator_1")!;
const splash = slots.find((slot) => slot.role === "splash")!;

function renderWithSlot(selectedSlot: ThemeAssetSlot | undefined) {
  const setNotice = vi.fn();
  const view = renderHook(
    (props: { selectedSlot: ThemeAssetSlot | undefined }) =>
      useProjectAssetUploads({ platform: "android", selectedSlot: props.selectedSlot, setNotice }),
    { initialProps: { selectedSlot } },
  );
  return { ...view, setNotice };
}

function deferredPage() {
  let resolve!: (page: AdminAssetPage) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<AdminAssetPage>((resolvePage, rejectPage) => {
    resolve = resolvePage;
    reject = rejectPage;
  });
  return { promise, resolve, reject };
}

/**
 * bubble_me_1/me_2/you_1/you_2는 추천 API가 서로 호환으로 취급해 같은 후보 풀을 돌려준다
 * (`isCompatibleExactRole`). 슬롯만 바뀌었을 때 다시 요청하면 같은 이미지 집합을 새 signed URL로
 * 또 받아와 목록이 깜빡인다 — 이 테스트가 그 회귀를 잡는다.
 */
describe("useProjectAssetUploads - 말풍선 슬롯 간 추천 에셋 공유", () => {
  beforeEach(() => {
    listRecommendedAssetCandidatePage.mockReset();
    listRecommendedAssetCandidatePage.mockResolvedValue({ items: [], nextCursor: undefined });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("bubble_me_1에서 bubble_me_2로 옮겨도 추천 에셋을 다시 요청하지 않는다", async () => {
    listRecommendedAssetCandidatePage.mockClear();
    const { rerender } = renderWithSlot(bubbleMe1);

    await vi.waitFor(() => expect(listRecommendedAssetCandidatePage).toHaveBeenCalledTimes(1));

    rerender({ selectedSlot: bubbleMe2 });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(listRecommendedAssetCandidatePage).toHaveBeenCalledTimes(1);

    rerender({ selectedSlot: bubbleYou1 });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(listRecommendedAssetCandidatePage).toHaveBeenCalledTimes(1);
  });

  it("말풍선이 아닌 kind로 옮기면 다시 요청한다", async () => {
    listRecommendedAssetCandidatePage.mockClear();
    const { rerender } = renderWithSlot(bubbleMe1);

    await vi.waitFor(() => expect(listRecommendedAssetCandidatePage).toHaveBeenCalledTimes(1));

    rerender({ selectedSlot: mainBackground });
    await vi.waitFor(() => expect(listRecommendedAssetCandidatePage).toHaveBeenCalledTimes(2));
  });

  it.each([
    ["배경", mainBackground, chatBackground],
    ["아이콘", themeIcon, passcodeIndicator],
  ])("같은 %s family의 슬롯은 후보와 요청을 공유한다", async (_label, firstSlot, secondSlot) => {
    const candidate = { id: "shared", title: "공유 후보" } as AdminAssetCandidate;
    listRecommendedAssetCandidatePage.mockResolvedValue({ items: [candidate], nextCursor: "next" });
    const { result, rerender } = renderWithSlot(firstSlot);

    await vi.waitFor(() => expect(result.current.adminAssetsWithPreview.map((item) => item.id)).toEqual(["shared"]));
    rerender({ selectedSlot: secondSlot });

    expect(result.current.adminAssetsWithPreview.map((item) => item.id)).toEqual(["shared"]);
    expect(result.current.adminAssetCursor).toBe("next");
    expect(listRecommendedAssetCandidatePage).toHaveBeenCalledTimes(1);
  });

  it("같은 kind라도 family 밖 슬롯은 별도 풀을 요청한다", async () => {
    const { rerender } = renderWithSlot(themeIcon);
    await vi.waitFor(() => expect(listRecommendedAssetCandidatePage).toHaveBeenCalledTimes(1));

    rerender({ selectedSlot: splash });
    await vi.waitFor(() => expect(listRecommendedAssetCandidatePage).toHaveBeenCalledTimes(2));
  });

  it("실행 스플래시는 background kind로 추천을 요청한다", async () => {
    listRecommendedAssetCandidatePage.mockClear();
    const { result } = renderWithSlot(splash);

    await vi.waitFor(() => expect(result.current.isLoadingAdminAssets).toBe(false));

    expect(listRecommendedAssetCandidatePage).toHaveBeenCalledWith(expect.objectContaining({
      platform: "android",
      assetKind: "background",
      slotRole: "splash",
    }));
  });

  /**
   * 같은 풀 안에서 슬롯만 옮긴 뒤 첫 요청이 실패하면, 예전에는 그 자리에서 곧바로 다시 요청했다.
   * 클라이언트가 `slotRole`을 풀 대표 역할로 정규화해 보내므로 그 재요청은 방금 실패한 것과 같은
   * URL이라 똑같이 실패하고 알림만 두 번 뜬다 — 이 테스트가 그 회귀를 잡는다.
  */
  it("같은 풀에서 슬롯을 옮긴 뒤 첫 요청이 실패해도 즉시 재요청하지 않고 알림도 한 번만 띄운다", async () => {
    listRecommendedAssetCandidatePage.mockClear();
    const pending = deferredPage();
    listRecommendedAssetCandidatePage.mockReturnValueOnce(pending.promise);
    const { rerender, setNotice } = renderWithSlot(bubbleMe1);

    await vi.waitFor(() => expect(listRecommendedAssetCandidatePage).toHaveBeenCalledTimes(1));
    rerender({ selectedSlot: bubbleMe2 });
    await act(async () => {
      pending.reject(new Error("temporary failure"));
      await pending.promise.catch(() => {});
    });

    expect(listRecommendedAssetCandidatePage).toHaveBeenCalledTimes(1);
    expect(setNotice).toHaveBeenCalledTimes(1);
    expect(setNotice).toHaveBeenCalledWith({ tone: "error", message: "추천 에셋을 불러오지 못했습니다." });
  });

  it("실패가 도착한 뒤 다른 말풍선 슬롯으로 옮기면 다시 요청한다", async () => {
    listRecommendedAssetCandidatePage.mockClear();
    const pending = deferredPage();
    listRecommendedAssetCandidatePage
      .mockReturnValueOnce(pending.promise)
      .mockResolvedValue({ items: [], nextCursor: undefined });
    const { rerender, setNotice } = renderWithSlot(bubbleMe1);

    await vi.waitFor(() => expect(listRecommendedAssetCandidatePage).toHaveBeenCalledTimes(1));
    await act(async () => {
      pending.reject(new Error("temporary failure"));
      await pending.promise.catch(() => {});
    });
    expect(setNotice).toHaveBeenCalledTimes(1);

    rerender({ selectedSlot: bubbleMe2 });
    await vi.waitFor(() => expect(listRecommendedAssetCandidatePage).toHaveBeenCalledTimes(2));
  });

  it("다른 풀로 옮긴 뒤 도착한 이전 풀의 실패는 알림을 띄우지 않는다", async () => {
    listRecommendedAssetCandidatePage.mockClear();
    const pending = deferredPage();
    listRecommendedAssetCandidatePage
      .mockReturnValueOnce(pending.promise)
      .mockResolvedValue({ items: [], nextCursor: undefined });
    const { rerender, setNotice } = renderWithSlot(bubbleMe1);

    await vi.waitFor(() => expect(listRecommendedAssetCandidatePage).toHaveBeenCalledTimes(1));
    rerender({ selectedSlot: splash });
    await vi.waitFor(() => expect(listRecommendedAssetCandidatePage).toHaveBeenCalledTimes(2));
    await act(async () => {
      pending.reject(new Error("temporary failure"));
      await pending.promise.catch(() => {});
    });

    expect(setNotice).not.toHaveBeenCalled();
  });

  it("더 보기에서는 기존 페이지 뒤에 새 후보를 이어 붙인다", async () => {
    listRecommendedAssetCandidatePage.mockClear();
    const first = { id: "first", title: "첫 후보" } as AdminAssetCandidate;
    const second = { id: "second", title: "두 번째 후보" } as AdminAssetCandidate;
    listRecommendedAssetCandidatePage
      .mockResolvedValueOnce({ items: [first], nextCursor: "next" })
      .mockResolvedValueOnce({ items: [second], nextCursor: undefined });
    const { result } = renderWithSlot(bubbleMe1);

    await vi.waitFor(() => expect(result.current.adminAssetsWithPreview.map((item) => item.id)).toEqual(["first"]));
    await act(async () => { await result.current.loadMoreAdminAssets(); });

    expect(result.current.adminAssetsWithPreview.map((item) => item.id)).toEqual(["first", "second"]);
  });

  it("다른 풀을 다녀와도 이미 불러온 페이지와 cursor를 복원한다", async () => {
    const first = { id: "first", title: "첫 후보" } as AdminAssetCandidate;
    const second = { id: "second", title: "두 번째 후보" } as AdminAssetCandidate;
    listRecommendedAssetCandidatePage
      .mockResolvedValueOnce({ items: [first], nextCursor: "page-2" })
      .mockResolvedValueOnce({ items: [second], nextCursor: "page-3" })
      .mockResolvedValueOnce({ items: [], nextCursor: undefined });
    const { result, rerender } = renderWithSlot(bubbleMe1);
    await vi.waitFor(() => expect(result.current.adminAssetsWithPreview.map((item) => item.id)).toEqual(["first"]));
    await act(async () => { await result.current.loadMoreAdminAssets(); });

    rerender({ selectedSlot: splash });
    await vi.waitFor(() => expect(listRecommendedAssetCandidatePage).toHaveBeenCalledTimes(3));
    rerender({ selectedSlot: bubbleYou1 });

    expect(result.current.adminAssetsWithPreview.map((item) => item.id)).toEqual(["first", "second"]);
    expect(result.current.adminAssetCursor).toBe("page-3");
    expect(listRecommendedAssetCandidatePage).toHaveBeenCalledTimes(3);
  });

  it("서로 다른 풀의 요청이 역순으로 끝나도 각 풀에만 저장한다", async () => {
    let resolveBubble!: (page: AdminAssetPage) => void;
    let resolveSplash!: (page: AdminAssetPage) => void;
    const bubblePage = new Promise<AdminAssetPage>((resolve) => { resolveBubble = resolve; });
    const splashPage = new Promise<AdminAssetPage>((resolve) => { resolveSplash = resolve; });
    listRecommendedAssetCandidatePage
      .mockReturnValueOnce(bubblePage)
      .mockReturnValueOnce(splashPage);
    const { result, rerender } = renderWithSlot(bubbleMe1);
    await vi.waitFor(() => expect(listRecommendedAssetCandidatePage).toHaveBeenCalledTimes(1));
    rerender({ selectedSlot: splash });
    await vi.waitFor(() => expect(listRecommendedAssetCandidatePage).toHaveBeenCalledTimes(2));

    await act(async () => resolveSplash({ items: [{ id: "splash", title: "스플래시" } as AdminAssetCandidate] }));
    expect(result.current.adminAssetsWithPreview.map((item) => item.id)).toEqual(["splash"]);
    await act(async () => resolveBubble({ items: [{ id: "bubble", title: "말풍선" } as AdminAssetCandidate] }));
    expect(result.current.adminAssetsWithPreview.map((item) => item.id)).toEqual(["splash"]);

    rerender({ selectedSlot: bubbleMe2 });
    expect(result.current.adminAssetsWithPreview.map((item) => item.id)).toEqual(["bubble"]);
    expect(listRecommendedAssetCandidatePage).toHaveBeenCalledTimes(2);
  });

  it("더 보기 도중 슬롯을 바꿔도 응답을 원래 풀에 병합한다", async () => {
    let resolveMore!: (page: AdminAssetPage) => void;
    const morePage = new Promise<AdminAssetPage>((resolve) => { resolveMore = resolve; });
    listRecommendedAssetCandidatePage
      .mockResolvedValueOnce({ items: [{ id: "first", title: "첫 후보" } as AdminAssetCandidate], nextCursor: "page-2" })
      .mockReturnValueOnce(morePage)
      .mockResolvedValueOnce({ items: [{ id: "splash", title: "스플래시" } as AdminAssetCandidate] });
    const { result, rerender } = renderWithSlot(bubbleMe1);
    await vi.waitFor(() => expect(result.current.adminAssetCursor).toBe("page-2"));

    let loadMorePromise!: Promise<void>;
    act(() => { loadMorePromise = result.current.loadMoreAdminAssets(); });
    rerender({ selectedSlot: splash });
    await vi.waitFor(() => expect(result.current.adminAssetsWithPreview.map((item) => item.id)).toEqual(["splash"]));
    await act(async () => {
      resolveMore({ items: [{ id: "second", title: "두 번째 후보" } as AdminAssetCandidate], nextCursor: "page-3" });
      await loadMorePromise;
    });
    expect(result.current.adminAssetsWithPreview.map((item) => item.id)).toEqual(["splash"]);

    rerender({ selectedSlot: bubbleMe2 });
    expect(result.current.adminAssetsWithPreview.map((item) => item.id)).toEqual(["first", "second"]);
    expect(result.current.adminAssetCursor).toBe("page-3");
  });

  it("hard expiry가 지난 풀은 같은 family로 돌아올 때 다시 요청한다", async () => {
    let now = 1_000;
    const nowSpy = vi.spyOn(Date, "now").mockImplementation(() => now);
    try {
      const { rerender } = renderWithSlot(bubbleMe1);
      await vi.waitFor(() => expect(listRecommendedAssetCandidatePage).toHaveBeenCalledTimes(1));

      now += 5 * 60 * 1000 + 1;
      rerender({ selectedSlot: bubbleMe2 });
      await vi.waitFor(() => expect(listRecommendedAssetCandidatePage).toHaveBeenCalledTimes(2));
    } finally {
      nowSpy.mockRestore();
    }
  });

  it("만료 직전 더 보기가 끝나도 첫 페이지의 5분 만료 시각을 연장하지 않는다", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
    const first = { id: "first", title: "첫 후보" } as AdminAssetCandidate;
    const second = { id: "second", title: "두 번째 후보" } as AdminAssetCandidate;
    listRecommendedAssetCandidatePage
      .mockResolvedValueOnce({ items: [first], nextCursor: "page-2" })
      .mockResolvedValueOnce({ items: [second], nextCursor: undefined })
      .mockResolvedValueOnce({ items: [], nextCursor: undefined });
    const { result } = renderWithSlot(bubbleMe1);

    await vi.waitFor(() => expect(result.current.adminAssetCursor).toBe("page-2"));
    const firstPageLoadedAt = Date.now();
    await vi.advanceTimersByTimeAsync(5 * 60 * 1000 - (firstPageLoadedAt - 1_000) - 1);
    await act(async () => { await result.current.loadMoreAdminAssets(); });
    expect(result.current.adminAssetsWithPreview.map((item) => item.id)).toEqual(["first", "second"]);

    await vi.advanceTimersByTimeAsync(1);
    await vi.waitFor(() => expect(listRecommendedAssetCandidatePage).toHaveBeenCalledTimes(3));
  });

  it("더 보기 중 첫 페이지 hard expiry가 오면 기존 후보를 숨기고 새 첫 페이지를 한 번만 요청한다", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
    const more = deferredPage();
    const refresh = deferredPage();
    listRecommendedAssetCandidatePage
      .mockResolvedValueOnce({ items: [{ id: "old", title: "이전 후보" } as AdminAssetCandidate], nextCursor: "page-2" })
      .mockReturnValueOnce(more.promise)
      .mockReturnValueOnce(refresh.promise);
    const { result } = renderWithSlot(bubbleMe1);

    await vi.waitFor(() => expect(result.current.adminAssetCursor).toBe("page-2"));
    let loadMorePromise!: Promise<void>;
    act(() => { loadMorePromise = result.current.loadMoreAdminAssets(); });

    await vi.advanceTimersByTimeAsync(5 * 60 * 1000);
    await vi.waitFor(() => expect(listRecommendedAssetCandidatePage).toHaveBeenCalledTimes(3));
    expect(listRecommendedAssetCandidatePage.mock.calls.filter(([options]) => !options.cursor)).toHaveLength(2);
    expect(result.current.adminAssetsWithPreview).toEqual([]);
    expect(result.current.isLoadingAdminAssets).toBe(true);

    await act(async () => {
      more.resolve({ items: [{ id: "late", title: "늦은 후보" } as AdminAssetCandidate], nextCursor: undefined });
      await loadMorePromise;
    });
    expect(listRecommendedAssetCandidatePage).toHaveBeenCalledTimes(3);
    expect(result.current.adminAssetsWithPreview).toEqual([]);

    await act(async () => {
      refresh.resolve({ items: [{ id: "fresh", title: "새 후보" } as AdminAssetCandidate], nextCursor: undefined });
      await refresh.promise;
    });
    expect(result.current.adminAssetsWithPreview.map((item) => item.id)).toEqual(["fresh"]);
  });

  it("한 슬롯에 그대로 있어도 hard expiry에서 첫 페이지를 정확히 한 번 새로 요청한다", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
    listRecommendedAssetCandidatePage
      .mockResolvedValueOnce({ items: [{ id: "old", title: "이전 후보" } as AdminAssetCandidate] })
      .mockResolvedValueOnce({ items: [{ id: "fresh", title: "새 후보" } as AdminAssetCandidate] });
    const { result } = renderWithSlot(bubbleMe1);

    await vi.waitFor(() => expect(result.current.adminAssetsWithPreview.map((item) => item.id)).toEqual(["old"]));
    await vi.advanceTimersByTimeAsync(5 * 60 * 1000);
    await vi.waitFor(() => expect(result.current.adminAssetsWithPreview.map((item) => item.id)).toEqual(["fresh"]));
    expect(listRecommendedAssetCandidatePage).toHaveBeenCalledTimes(2);
  });

  it("만료 새로고침을 기다리는 동안 만료된 후보를 노출하지 않는다", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
    const refresh = deferredPage();
    listRecommendedAssetCandidatePage
      .mockResolvedValueOnce({ items: [{ id: "old", title: "이전 후보" } as AdminAssetCandidate] })
      .mockReturnValueOnce(refresh.promise);
    const { result } = renderWithSlot(bubbleMe1);

    await vi.waitFor(() => expect(result.current.adminAssetsWithPreview.map((item) => item.id)).toEqual(["old"]));
    await vi.advanceTimersByTimeAsync(5 * 60 * 1000);
    await vi.waitFor(() => expect(listRecommendedAssetCandidatePage).toHaveBeenCalledTimes(2));
    expect(result.current.adminAssetsWithPreview).toEqual([]);
    expect(result.current.isLoadingAdminAssets).toBe(true);

    await act(async () => {
      refresh.resolve({ items: [{ id: "fresh", title: "새 후보" } as AdminAssetCandidate] });
      await refresh.promise;
    });
  });

  it("30초 넘게 끝나지 않은 요청은 같은 풀 재진입 시 교체한다", async () => {
    let now = 1_000;
    const nowSpy = vi.spyOn(Date, "now").mockImplementation(() => now);
    listRecommendedAssetCandidatePage.mockReturnValueOnce(new Promise<AdminAssetPage>(() => {}));
    try {
      const { rerender } = renderWithSlot(bubbleMe1);
      await vi.waitFor(() => expect(listRecommendedAssetCandidatePage).toHaveBeenCalledTimes(1));

      now += 30 * 1000 + 1;
      rerender({ selectedSlot: bubbleMe2 });
      await vi.waitFor(() => expect(listRecommendedAssetCandidatePage).toHaveBeenCalledTimes(2));
    } finally {
      nowSpy.mockRestore();
    }
  });

  it("LRU 한도를 넘으면 가장 오래 쓰지 않은 풀을 제거한다", async () => {
    const roles = [
      "passcode_background",
      "profile_image_1",
      "profile_image_2",
      "profile_image_3",
      "profile_image_full_1",
      "profile_image_full_2",
      "profile_image_full_3",
      "find_add_friend",
      "find_add_friend_pressed",
      "splash",
      "splash_landscape",
      "launcher_icon",
      "launcher_round",
    ];
    const isolatedSlots = roles.map((role) => slots.find((slot) => slot.role === role)!);
    const { rerender } = renderWithSlot(isolatedSlots[0]);
    await vi.waitFor(() => expect(listRecommendedAssetCandidatePage).toHaveBeenCalledTimes(1));

    for (let index = 1; index < isolatedSlots.length; index += 1) {
      rerender({ selectedSlot: isolatedSlots[index] });
      await vi.waitFor(() => expect(listRecommendedAssetCandidatePage).toHaveBeenCalledTimes(index + 1));
    }

    rerender({ selectedSlot: isolatedSlots[0] });
    await vi.waitFor(() => expect(listRecommendedAssetCandidatePage).toHaveBeenCalledTimes(isolatedSlots.length + 1));
  });
});
