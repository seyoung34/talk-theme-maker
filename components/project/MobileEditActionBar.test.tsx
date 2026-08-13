import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MobileEditActionBar } from "@/components/project/MobileEditActionBar";

afterEach(cleanup);

describe("MobileEditActionBar", () => {
  it("keeps all global actions available in compact mode", () => {
    const onBack = vi.fn();
    const onSave = vi.fn();
    const onExport = vi.fn();

    render(
      <MobileEditActionBar
        compact
        isAdminMode={false}
        isSaving={false}
        isExporting={false}
        isPreparingExport={false}
        templateName="메론소다"
        autosaveStatus="saved"
        autosaveSavedAt={Date.now()}
        onBack={onBack}
        onSave={onSave}
        onExport={onExport}
      />,
    );

    const backButton = screen.getByRole("button", { name: "편집 종료" });
    const saveButton = screen.getByRole("button", { name: "템플릿 저장" });
    const exportButton = screen.getByRole("button", { name: "테마 다운로드" });

    fireEvent.click(backButton);
    fireEvent.click(saveButton);
    fireEvent.click(exportButton);

    expect(onBack).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onExport).toHaveBeenCalledTimes(1);
    expect(screen.getByText("메론소다").parentElement).toHaveClass("hidden");
    expect(screen.getByText("저장", { selector: "span" })).toHaveClass("sr-only");
    expect(screen.getByText("다운로드", { selector: "span" })).toHaveClass("sr-only");
  });
});
