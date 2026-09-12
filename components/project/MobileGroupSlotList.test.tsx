import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MobileGroupSlotList } from "@/components/project/MobileGroupSlotList";
import { getInitialSlotCandidateSelections } from "@/lib/theme/project/state";
import { getThemeSlots, getThemeTemplate } from "@/lib/theme/templates";

const slots = getThemeSlots("ios");
const template = getThemeTemplate("basic");
const selections = getInitialSlotCandidateSelections(slots, "basic", template);
const bubbleSlots = slots.filter((slot) => slot.section === "chatroom" && slot.group === "bubbles");
const compatibilitySlot = { ...bubbleSlots[0], id: "mobile-compatibility-slot", label: "모바일 호환 테스트 에셋" };

function renderList(selectedSlotId = bubbleSlots[0].id) {
  return render(
    <MobileGroupSlotList
      groups={["bubbles"]}
      activeGroup="bubbles"
      onSelectGroup={vi.fn()}
      slots={bubbleSlots}
      compatibilitySlots={[compatibilitySlot]}
      allSlots={slots}
      selectedSlotId={selectedSlotId}
      uploads={{}}
      colors={{}}
      selections={selections}
      templateId="basic"
      template={template}
      onSelectSlot={vi.fn()}
    />,
  );
}

describe("MobileGroupSlotList", () => {
  afterEach(cleanup);

  it("호환 에셋을 기본 슬롯 선택 목록과 분리한다", () => {
    renderList();
    fireEvent.click(screen.getByRole("button", { name: bubbleSlots[0].label }));

    expect(screen.queryByText("모바일 호환 테스트 에셋")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /고급 호환 에셋/ }));
    expect(screen.getByText("모바일 호환 테스트 에셋")).toBeTruthy();
  });

  it("선택 중인 호환 에셋을 다시 열면 해당 고급 영역을 펼친다", () => {
    renderList(compatibilitySlot.id);
    fireEvent.click(screen.getByRole("button", { name: "모바일 호환 테스트 에셋" }));

    expect(screen.getAllByText("모바일 호환 테스트 에셋")).toHaveLength(2);
  });
});
