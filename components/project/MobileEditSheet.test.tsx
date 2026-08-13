import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MobileEditSheet, type MobileSheetSnap } from "@/components/project/MobileEditSheet";

afterEach(cleanup);

function StatefulSheet({ onSnapChange = vi.fn() }: { onSnapChange?: (snap: MobileSheetSnap) => void }) {
  const [snap, setSnap] = useState<MobileSheetSnap>("collapsed");
  return (
    <MobileEditSheet
      snap={snap}
      onSnapChange={(nextSnap) => {
        setSnap(nextSnap);
        onSnapChange(nextSnap);
      }}
    >
      <div>편집 내용</div>
    </MobileEditSheet>
  );
}

describe("MobileEditSheet", () => {
  it("toggles from click and exposes its expanded state", async () => {
    const user = userEvent.setup();
    render(<StatefulSheet />);

    const handle = screen.getByRole("button", { name: "편집 패널 펼치기" });
    expect(handle).toHaveAttribute("aria-expanded", "false");
    expect(handle).toHaveAttribute("aria-controls");

    await user.click(handle);

    expect(screen.getByRole("button", { name: "편집 패널 접기" })).toHaveAttribute("aria-expanded", "true");
  });

  it.each(["{Enter}", " "])("toggles from keyboard input %s", async (key) => {
    const onSnapChange = vi.fn();
    const user = userEvent.setup();
    render(<StatefulSheet onSnapChange={onSnapChange} />);

    const handle = screen.getByRole("button", { name: "편집 패널 펼치기" });
    handle.focus();
    await user.keyboard(key);

    expect(onSnapChange).toHaveBeenCalledWith("half");
  });

  it("steps down when Escape is pressed", async () => {
    const user = userEvent.setup();
    render(<StatefulSheet />);

    await user.click(screen.getByRole("button", { name: "편집 패널 펼치기" }));
    await user.keyboard("{Escape}");

    expect(screen.getByRole("button", { name: "편집 패널 펼치기" })).toHaveAttribute("aria-expanded", "false");
  });
});
