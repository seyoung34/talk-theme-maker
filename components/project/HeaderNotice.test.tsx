import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import { HeaderNotice, noticeAutoDismissMs } from "@/components/project/HeaderNotice";
import type { ProjectNotice } from "@/components/project/editorTypes";

const notice: ProjectNotice = { tone: "success", message: "저장하지 않았던 편집 내용을 복원했어요." };

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  // vitest.config.ts가 globals: false라 Testing Library의 자동 cleanup이 걸리지 않는다.
  cleanup();
  vi.useRealTimers();
});

describe("HeaderNotice", () => {
  it("잠시 뒤 스스로 닫는다", () => {
    const onDismiss = vi.fn();
    render(<HeaderNotice notice={notice} onDismiss={onDismiss} />);

    expect(onDismiss).not.toHaveBeenCalled();
    act(() => void vi.advanceTimersByTime(noticeAutoDismissMs));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  // 회귀 방지: onDismiss가 의존성에 있으면 부모가 인라인 콜백을 넘길 때마다 타이머가
  // 다시 걸려서 알림이 영영 사라지지 않았다. 편집기는 2.5초 안에 수시로 리렌더된다.
  it("부모가 매번 새 콜백을 넘겨도 타이머가 초기화되지 않는다", () => {
    const onDismiss = vi.fn();
    const { rerender } = render(<HeaderNotice notice={notice} onDismiss={() => onDismiss()} />);

    for (let elapsed = 0; elapsed < noticeAutoDismissMs; elapsed += 500) {
      act(() => void vi.advanceTimersByTime(500));
      rerender(<HeaderNotice notice={notice} onDismiss={() => onDismiss()} />);
    }

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("새 알림이 오면 타이머를 다시 건다", () => {
    const onDismiss = vi.fn();
    const { rerender } = render(<HeaderNotice notice={notice} onDismiss={onDismiss} />);

    act(() => void vi.advanceTimersByTime(noticeAutoDismissMs - 500));
    rerender(<HeaderNotice notice={{ tone: "error", message: "내보내기 실패" }} onDismiss={onDismiss} />);
    act(() => void vi.advanceTimersByTime(noticeAutoDismissMs - 500));
    expect(onDismiss).not.toHaveBeenCalled();

    act(() => void vi.advanceTimersByTime(500));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  // 자동 저장 실패는 놓치면 편집 내용을 잃는다. 자리를 비운 사이 사라지면 안 된다.
  it("persistent 알림은 스스로 사라지지 않는다", () => {
    const onDismiss = vi.fn();
    render(<HeaderNotice notice={{ tone: "error", message: "자동 저장에 실패했습니다.", persistent: true }} onDismiss={onDismiss} />);

    act(() => void vi.advanceTimersByTime(noticeAutoDismissMs * 20));

    expect(onDismiss).not.toHaveBeenCalled();
  });

  it("persistent 알림도 닫기 버튼으로는 닫힌다", () => {
    const onDismiss = vi.fn();
    const { getByLabelText } = render(<HeaderNotice notice={{ tone: "error", message: "자동 저장에 실패했습니다.", persistent: true }} onDismiss={onDismiss} />);

    act(() => getByLabelText("알림 닫기").dispatchEvent(new MouseEvent("click", { bubbles: true })));

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("닫기 버튼은 즉시 닫는다", () => {
    const onDismiss = vi.fn();
    const { getByLabelText } = render(<HeaderNotice notice={notice} onDismiss={onDismiss} />);

    act(() => getByLabelText("알림 닫기").dispatchEvent(new MouseEvent("click", { bubbles: true })));

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
  /**
   * 행동이 붙은 알림.
   *
   * "왜 안 되는지"만 알려 주고 사라지면 사용자가 갈 곳을 스스로 찾아야 한다. 그래서 행동이 있는
   * 알림은 남아 있어야 하고, 누르면 그 행동과 닫기가 함께 일어나야 한다.
   */
  it("행동이 있는 알림은 스스로 사라지지 않는다", () => {
    const onDismiss = vi.fn();
    const onAct = vi.fn();
    render(<HeaderNotice notice={{ tone: "warning", message: "채팅방 배경에서 사용 중입니다.", action: { label: "바꾸러 가기", onAct } }} onDismiss={onDismiss} />);

    act(() => { vi.advanceTimersByTime(noticeAutoDismissMs * 4); });

    expect(onDismiss).not.toHaveBeenCalled();
  });

  it("행동을 누르면 실행하고 알림을 닫는다", () => {
    const onDismiss = vi.fn();
    const onAct = vi.fn();
    const { getByRole } = render(<HeaderNotice notice={{ tone: "warning", message: "채팅방 배경에서 사용 중입니다.", action: { label: "바꾸러 가기", onAct } }} onDismiss={onDismiss} />);

    act(() => { getByRole("button", { name: "바꾸러 가기" }).click(); });

    expect(onAct).toHaveBeenCalledTimes(1);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("행동이 없으면 버튼도 없다", () => {
    const { queryByRole } = render(<HeaderNotice notice={notice} onDismiss={vi.fn()} />);

    expect(queryByRole("button", { name: "바꾸러 가기" })).toBeNull();
  });
});
