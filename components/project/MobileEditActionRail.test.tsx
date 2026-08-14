import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MobileEditActionRail } from "@/components/project/MobileEditActionRail";

afterEach(cleanup);

function renderRail(overrides: Partial<Parameters<typeof MobileEditActionRail>[0]> = {}) {
  const props = {
    snap: "half" as const,
    isAdminMode: false,
    isSaving: false,
    isExporting: false,
    isPreparingExport: false,
    autosaveStatus: "saved" as const,
    autosaveSavedAt: Date.now(),
    onBack: vi.fn(),
    onSave: vi.fn(),
    onExport: vi.fn(),
    ...overrides,
  };
  render(<MobileEditActionRail {...props} />);
  return props;
}

describe("MobileEditActionRail", () => {
  it("keeps every global action reachable while the sheet is raised", () => {
    const props = renderRail();

    fireEvent.click(screen.getByRole("button", { name: "편집 종료" }));
    fireEvent.click(screen.getByRole("button", { name: "템플릿 저장" }));
    fireEvent.click(screen.getByRole("button", { name: "테마 다운로드" }));

    expect(props.onBack).toHaveBeenCalledTimes(1);
    expect(props.onSave).toHaveBeenCalledTimes(1);
    expect(props.onExport).toHaveBeenCalledTimes(1);
  });

  it("keeps 44px touch targets and lets pointer events through outside the buttons", () => {
    renderRail();

    for (const name of ["편집 종료", "템플릿 저장", "테마 다운로드"]) {
      expect(screen.getByRole("button", { name })).toHaveClass("size-11");
    }
    expect(screen.getByRole("button", { name: "편집 종료" }).parentElement).toHaveClass("pointer-events-auto");
    expect(screen.getByRole("button", { name: "편집 종료" }).parentElement?.parentElement).toHaveClass("pointer-events-none");
  });

  // 배지는 프리뷰를 가리지 않도록 화면에서만 감춘다. 지우면 시트가 올라온 동안 자동 저장 성공·실패가
  // 스크린리더에 전달되지 않는다 — 이 rail이 그때 화면에 남는 유일한 `aria-live` 영역이다.
  it("keeps announcing autosave state without showing the badge", () => {
    renderRail();

    const status = screen.getByRole("status");
    expect(status).toHaveAttribute("aria-live", "polite");
    expect(status).toHaveClass("sr-only");
  });

  it("stacks vertically at half snap and horizontally at full snap", () => {
    renderRail();
    expect(screen.getByRole("button", { name: "템플릿 저장" }).parentElement).toHaveClass("flex-col");

    cleanup();
    renderRail({ snap: "full" });
    expect(screen.getByRole("button", { name: "템플릿 저장" }).parentElement).not.toHaveClass("flex-col");
  });

  it("labels the admin save action separately", () => {
    renderRail({ isAdminMode: true });

    expect(screen.getByRole("button", { name: "시스템 템플릿 저장" })).toBeInTheDocument();
  });
});
