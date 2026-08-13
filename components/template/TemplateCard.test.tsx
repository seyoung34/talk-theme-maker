import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import TemplateCard from "@/components/template/TemplateCard";

describe("TemplateCard", () => {
  it("exposes one interactive surface and opens from it", () => {
    const onOpen = vi.fn();

    render(
      <TemplateCard
        title="멜론소다"
        openLabel="멜론소다 열기"
        onOpen={onOpen}
        mobileVisual={<span>모바일 미리보기</span>}
        desktopVisual={<span>데스크톱 미리보기</span>}
        desktopContent={<span>설명</span>}
        desktopFooter={<span>확인</span>}
      />,
    );

    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(1);
    expect(buttons[0]).toHaveAccessibleName("멜론소다 열기");

    fireEvent.click(buttons[0]);
    expect(onOpen).toHaveBeenCalledTimes(1);
  });
});
