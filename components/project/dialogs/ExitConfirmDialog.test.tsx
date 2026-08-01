import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ExitConfirmDialog } from "@/components/project/dialogs/ExitConfirmDialog";

describe("ExitConfirmDialog", () => {
  it("변경이 있으면 자동 저장 후 종료한다고 안내한다", () => {
    render(
      <ExitConfirmDialog
        hasUnsavedChanges
        isExporting={false}
        isSaving={false}
        saveFailed={false}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
        onDiscard={vi.fn()}
      />,
    );

    expect(screen.getByText("최근 변경 사항을 자동 저장한 뒤 종료합니다.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "편집 종료하기" })).toBeEnabled();
  });

  it("자동 저장 실패 후에는 저장하지 않고 종료를 명시적으로 선택하게 한다", () => {
    const onDiscard = vi.fn();
    render(
      <ExitConfirmDialog
        hasUnsavedChanges
        isExporting={false}
        isSaving={false}
        saveFailed
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
        onDiscard={onDiscard}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "저장하지 않고 종료" }));
    expect(onDiscard).toHaveBeenCalledTimes(1);
  });
});
