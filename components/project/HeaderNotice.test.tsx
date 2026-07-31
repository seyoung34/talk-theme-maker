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

  it("닫기 버튼은 즉시 닫는다", () => {
    const onDismiss = vi.fn();
    const { getByLabelText } = render(<HeaderNotice notice={notice} onDismiss={onDismiss} />);

    act(() => getByLabelText("알림 닫기").dispatchEvent(new MouseEvent("click", { bubbles: true })));

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
