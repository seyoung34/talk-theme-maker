import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MobileEditActionBar } from "@/components/project/MobileEditActionBar";

afterEach(cleanup);

describe("MobileEditActionBar", () => {
  it("shows the template context and every global action while the sheet is collapsed", () => {
    const onBack = vi.fn();
    const onSave = vi.fn();
    const onExport = vi.fn();

    render(
      <MobileEditActionBar
        visible
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

    fireEvent.click(screen.getByRole("button", { name: "편집 종료" }));
    fireEvent.click(screen.getByRole("button", { name: "템플릿 저장" }));
    fireEvent.click(screen.getByRole("button", { name: "테마 다운로드" }));

    expect(onBack).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onExport).toHaveBeenCalledTimes(1);
    expect(screen.getByText("메론소다")).toBeInTheDocument();
  });

  it("leaves the band out of the tab order once the sheet takes over", () => {
    render(
      <MobileEditActionBar
        visible={false}
        isAdminMode={false}
        isSaving={false}
        isExporting={false}
        isPreparingExport={false}
        templateName="메론소다"
        autosaveStatus="saved"
        autosaveSavedAt={Date.now()}
        onBack={vi.fn()}
        onSave={vi.fn()}
        onExport={vi.fn()}
      />,
    );

    for (const name of ["편집 종료", "템플릿 저장", "테마 다운로드"]) {
      expect(screen.getByRole("button", { name, hidden: true })).toHaveAttribute("tabindex", "-1");
    }
  });
});
