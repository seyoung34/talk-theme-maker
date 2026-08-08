import { describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useProjectAssetUploads } from "@/components/project/hooks/useProjectAssetUploads";
import { getThemeSlots } from "@/lib/theme/templates";
import type { AdminAssetCandidate } from "@/lib/theme/adminAssets";

const listRecommendedAssetCandidatePage = vi.fn(async () => ({ items: [] as AdminAssetCandidate[], nextCursor: undefined }));

vi.mock("@/lib/theme/adminAssets", async () => {
  const actual = await vi.importActual<typeof import("@/lib/theme/adminAssets")>("@/lib/theme/adminAssets");
  return {
    ...actual,
    listRecommendedAssetCandidatePage: () => listRecommendedAssetCandidatePage(),
  };
});

const slots = getThemeSlots("android");
const bubbleMe1 = slots.find((slot) => slot.role === "bubble_me_1")!;
const bubbleMe2 = slots.find((slot) => slot.role === "bubble_me_2")!;
const bubbleYou1 = slots.find((slot) => slot.role === "bubble_you_1")!;
const mainBackground = slots.find((slot) => slot.role === "main_background")!;

function renderWithSlot(selectedSlot: typeof bubbleMe1 | undefined) {
  return renderHook(
    (props: { selectedSlot: typeof bubbleMe1 | undefined }) =>
      useProjectAssetUploads({ platform: "android", selectedSlot: props.selectedSlot, setNotice: vi.fn() }),
    { initialProps: { selectedSlot } },
  );
}

/**
 * bubble_me_1/me_2/you_1/you_2는 추천 API가 서로 호환으로 취급해 같은 후보 풀을 돌려준다
 * (`isCompatibleExactRole`). 슬롯만 바뀌었을 때 다시 요청하면 같은 이미지 집합을 새 signed URL로
 * 또 받아와 목록이 깜빡인다 — 이 테스트가 그 회귀를 잡는다.
 */
describe("useProjectAssetUploads - 말풍선 슬롯 간 추천 에셋 공유", () => {
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
});
