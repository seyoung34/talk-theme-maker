import { type MutableRefObject } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MobileQuickEditPanel } from "@/components/project/MobileQuickEditPanel";
import { getInitialSlotCandidateSelections } from "@/lib/theme/project/state";
import { getThemeSlots, getThemeTemplate } from "@/lib/theme/templates";

/**
 * 추천 에셋은 24개씩 커서로 끊어 온다. 모바일 패널에는 커서를 소비할 UI가 없어서
 * 첫 페이지 밖의 후보에 **도달할 방법이 아예 없었다** — 데스크탑에만 "더 보기"가 있었다.
 *
 * 그래서 "타일이 그려지는가"보다 **표시 모드 3개 전부에서 그려지는가**가 핵심이다.
 * 모드마다 렌더링 분기가 따로라 한 곳만 고치면 나머지에서 조용히 빠진다.
 */
const slots = getThemeSlots("android");
const template = getThemeTemplate("basic");
const selections = getInitialSlotCandidateSelections(slots, "basic", template);
const tabIconSlot = slots.find((slot) => slot.role === "tab_icon_friends")!;
const bubbleSlot = slots.find((slot) => slot.editableInBubbleEditor)!;

function renderPanel(overrides: {
  slot?: typeof tabIconSlot;
  hasMoreAdminAssets?: boolean;
  isLoadingAdminAssets?: boolean;
  candidateGridExpanded?: boolean;
  onLoadMoreAdminAssets?: () => void;
} = {}) {
  const onLoadMoreAdminAssets = overrides.onLoadMoreAdminAssets ?? vi.fn();
  render(
    <MobileQuickEditPanel
      slot={overrides.slot ?? tabIconSlot}
      slots={slots}
      uploads={{}}
      colors={{}}
      selections={selections}
      adminAssets={[]}
      hasMoreAdminAssets={overrides.hasMoreAdminAssets ?? true}
      isLoadingAdminAssets={overrides.isLoadingAdminAssets ?? false}
      onLoadMoreAdminAssets={onLoadMoreAdminAssets}
      allowTemplateAssetRemoval={false}
      templateId="basic"
      template={template}
      platform="android"
      selectedBubbleSlot={null}
      isAutoColor={false}
      canApplyAutoColor={false}
      canApplyAutoColorToAll={false}
      autoColorSummary={{ linked: 0, total: 0 }}
      fileInputRefs={{ current: {} } satisfies MutableRefObject<Record<string, HTMLInputElement | null>>}
      onUpload={vi.fn()}
      onEditedUpload={vi.fn()}
      onRemoveUpload={vi.fn()}
      onColorChange={vi.fn()}
      onUnlinkColor={vi.fn()}
      onSelectCandidate={vi.fn()}
      onSelectAdminAsset={vi.fn()}
      onApplyAutoColor={vi.fn()}
      onApplyAutoColorToAll={vi.fn()}
      onGeometryChange={vi.fn()}
      onMarkersChange={vi.fn()}
      onInsetsChange={vi.fn()}
      onStretchChange={vi.fn()}
      onFlipXChange={vi.fn()}
      onOpenBubbleBuilder={vi.fn()}
      onCopyBubbleToPair={vi.fn()}
      candidateGridExpanded={overrides.candidateGridExpanded ?? false}
      onToggleCandidateGrid={vi.fn()}
    />,
  );
  return { onLoadMoreAdminAssets };
}

const loadMoreTile = () => screen.queryByRole("button", { name: "추천 에셋 더 보기" });

describe("MobileQuickEditPanel 추천 에셋 더 보기", () => {
  afterEach(cleanup);

  it("다음 커서가 없으면 타일을 그리지 않는다", () => {
    renderPanel({ hasMoreAdminAssets: false });
    expect(loadMoreTile()).toBeNull();
  });

  it("축소 모드에서 타일을 누르면 다음 페이지를 요청한다", async () => {
    const user = userEvent.setup();
    const { onLoadMoreAdminAssets } = renderPanel({ candidateGridExpanded: false });

    await user.click(loadMoreTile()!);

    expect(onLoadMoreAdminAssets).toHaveBeenCalledTimes(1);
  });

  it("펼침 그리드 모드에서도 타일이 남아 있다", () => {
    renderPanel({ candidateGridExpanded: true });
    expect(loadMoreTile()).not.toBeNull();
  });

  it("말풍선 페이저 모드에서도 타일이 남아 있다", () => {
    // 말풍선만 가로 페이저를 쓴다. 페이저는 항목 배열을 페이지로 자르므로,
    // 타일을 배열에 넣지 않으면 여기서만 조용히 사라진다.
    expect(bubbleSlot.editableInBubbleEditor).toBe(true);
    renderPanel({ slot: bubbleSlot, candidateGridExpanded: true });
    expect(loadMoreTile()).not.toBeNull();
  });

  it("불러오는 중에는 중복 요청을 막는다", async () => {
    const user = userEvent.setup();
    const { onLoadMoreAdminAssets } = renderPanel({ isLoadingAdminAssets: true });

    const tile = loadMoreTile()!;
    expect(tile).toBeDisabled();
    await user.click(tile);

    expect(onLoadMoreAdminAssets).not.toHaveBeenCalled();
  });
});
