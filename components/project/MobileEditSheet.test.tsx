import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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
    expect(document.getElementById(handle.getAttribute("aria-controls") ?? "")).toHaveClass("w-full", "min-w-0");

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

  it("settles a drag on the nearest snap instead of treating it as a tap", () => {
    const onSnapChange = vi.fn();
    render(<StatefulSheet onSnapChange={onSnapChange} />);

    // 접힌 상태에서의 탭은 "half"다. 드래그는 놓은 높이에서 가장 가까운 스냅으로 가야 한다.
    const handle = screen.getByRole("button", { name: "편집 패널 펼치기" });
    fireEvent.pointerDown(handle, { pointerId: 1, clientY: 600 });
    fireEvent.pointerMove(handle, { pointerId: 1, clientY: 400 });
    fireEvent.pointerUp(handle, { pointerId: 1, clientY: 400 });

    expect(onSnapChange).toHaveBeenCalledTimes(1);
    expect(onSnapChange).not.toHaveBeenCalledWith("half");
  });

  it("steps down when Escape is pressed", async () => {
    const user = userEvent.setup();
    render(<StatefulSheet />);

    await user.click(screen.getByRole("button", { name: "편집 패널 펼치기" }));
    await user.keyboard("{Escape}");

    expect(screen.getByRole("button", { name: "편집 패널 펼치기" })).toHaveAttribute("aria-expanded", "false");
  });
});
