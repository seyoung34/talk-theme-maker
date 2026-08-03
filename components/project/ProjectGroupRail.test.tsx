import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { ProjectGroupRail } from "@/components/project/ProjectGroupRail";
import { getInitialSlotCandidateSelections } from "@/lib/theme/project/state";
import { getThemeSlots, getThemeTemplate } from "@/lib/theme/templates";

/**
 * 레일은 **그릴 슬롯**과 **해석에 쓸 슬롯**을 따로 받는다.
 *
 * 원래는 하나만 받아 섹션·그룹으로 걸러진 배열을 그대로 해석에 넘겼다. 그래서 기준 슬롯이
 * 다른 그룹에 있으면 연동이 조용히 꺼졌다 — 읽지 않음 숫자(말풍선 그룹)는 채팅방
 * 배경색(배경 그룹)을 기준으로 삼는데, 말풍선 그룹을 보는 동안에는 배열에 배경색이 없었다.
 * 도메인 함수는 정상인데 화면만 기본값을 보여 주는 형태라 원인을 찾기 어려웠다.
 */
const slots = getThemeSlots("ios");
const template = getThemeTemplate("basic");
const selections = getInitialSlotCandidateSelections(slots, "basic", template);
const unread = slots.find((slot) => slot.role === "chat_unread_count_color")!;
const chatBackground = slots.find((slot) => slot.role === "chat_background_color")!;
const bubbleSlots = slots.filter((slot) => slot.section === "chatroom" && slot.group === "bubbles");

function renderRail(allSlots: typeof slots) {
  return render(
    <ProjectGroupRail
      groups={["bubbles"]}
      activeGroup="bubbles"
      onSelectGroup={vi.fn()}
      slots={bubbleSlots}
      allSlots={allSlots}
      uploads={{}}
      colors={{ [chatBackground.id]: "#111111" }}
      selections={selections}
      templateId="basic"
      template={template}
      onSelectSlot={vi.fn()}
    />,
  );
}

describe("ProjectGroupRail", () => {
  afterEach(cleanup);

  it("기준 슬롯이 다른 그룹에 있어도 연동 상태를 보여 준다", () => {
    // 읽지 않음 숫자는 고급 옵션이 아니라 기본 목록에 있다.
    expect(unread.optionLevel).not.toBe("advanced");
    renderRail(slots);
    expect(screen.getByText(/^연동 · /)).toBeTruthy();
  });

  it("그릴 목록을 해석에 그대로 쓰면 연동이 꺼진다", () => {
    // 회귀했을 때 위 테스트가 왜 깨지는지 남겨 두는 대조군이다.
    renderRail(bubbleSlots);
    expect(screen.queryByText(/^연동 · /)).toBeNull();
  });
});
