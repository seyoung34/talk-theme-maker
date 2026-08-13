import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MobileSectionNav, mobileSectionLabels } from "@/components/project/MobileSectionNav";
import { sectionLabels, sectionOrder } from "@/components/project/projectModel";
import { androidThemeSlots } from "@/lib/theme/templates";

afterEach(cleanup);

describe("MobileSectionNav", () => {
  it("keeps full accessible names while showing compact mobile labels", () => {
    render(<MobileSectionNav activeSection="main" slots={androidThemeSlots} onSelectSection={vi.fn()} />);

    expect(screen.getByRole("navigation", { name: "화면 선택" })).toHaveClass("w-full", "min-w-0", "overflow-x-auto");

    for (const section of sectionOrder) {
      const button = screen.getByRole("button", { name: sectionLabels[section] });
      expect(button).toHaveAttribute("title", sectionLabels[section]);
      expect(button).toHaveClass("min-h-[52px]", "min-w-[47px]", "shrink-0");
      expect(button).toHaveTextContent(mobileSectionLabels[section]);
    }

    expect(screen.getByRole("button", { name: sectionLabels.main })).toHaveAttribute("aria-current", "page");
  });

  it("selects the requested section", () => {
    const onSelectSection = vi.fn();
    render(<MobileSectionNav activeSection="main" slots={androidThemeSlots} onSelectSection={onSelectSection} />);

    fireEvent.click(screen.getByRole("button", { name: sectionLabels.chatroom }));

    expect(onSelectSection).toHaveBeenCalledWith("chatroom");
  });
});
