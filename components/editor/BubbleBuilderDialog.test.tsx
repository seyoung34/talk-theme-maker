import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { BubbleBuilderDialog, getBubblePreviewScale } from "@/components/editor/BubbleBuilderDialog";
import type { BubbleFamilyDesignSpec } from "@/lib/theme/bubbleBuilder";

const spec: BubbleFamilyDesignSpec = {
  version: 1,
  familyId: "bubble-design-test",
  presetVersion: "bubble-builder-v1",
  side: "me",
  design: {
    side: "me",
    preset: "rounded",
    radius: 24,
    fill: "#FEE500",
    borderColor: "#D1D5DB",
    borderWidth: 0,
    textColor: "#111827",
    syncTextColorOnApply: false,
    decoration: { offsetX: 90, offsetY: -55, scale: 1, flipX: false },
  },
  createdAt: 1,
  updatedAt: 1,
};

beforeAll(() => {
  vi.stubGlobal("URL", {
    ...URL,
    createObjectURL: vi.fn(() => "blob:decoration-preview"),
    revokeObjectURL: vi.fn(),
  });
});

afterAll(() => vi.unstubAllGlobals());
afterEach(cleanup);

describe("BubbleBuilderDialog decoration input", () => {
  it("accepts an image pasted from the clipboard", () => {
    renderDialog();
    const file = new File(["image"], "clipboard-cat.png", { type: "image/png" });

    fireEvent.paste(window, { clipboardData: { files: [file] } });

    // 데스크톱/모바일 두 뷰가 동시에 DOM에 존재하므로 파일명이 여러 벌 나타날 수 있다.
    expect(screen.getAllByText("clipboard-cat.png").length).toBeGreaterThan(0);
  });

  it("accepts an image dropped onto the upload zone", () => {
    renderDialog();
    const file = new File(["image"], "dropped-dog.webp", { type: "image/webp" });

    fireEvent.drop(screen.getAllByTestId("bubble-decoration-dropzone")[0], { dataTransfer: { files: [file] } });

    expect(screen.getAllByText("dropped-dog.webp").length).toBeGreaterThan(0);
  });
});

describe("BubbleBuilderDialog preview scale", () => {
  it("keeps the desktop scale when the container is wide enough", () => {
    expect(getBubblePreviewScale(420, 274)).toBe(1.35);
  });

  it("scales the preview down to the available mobile width", () => {
    expect(getBubblePreviewScale(240, 274)).toBeCloseTo(240 / 274);
  });

  it("keeps a usable minimum scale for very narrow containers", () => {
    expect(getBubblePreviewScale(100, 274)).toBe(0.65);
  });
});

function renderDialog() {
  return render(
    <BubbleBuilderDialog
      open
      side="me"
      variant="first"
      slotLabel="내 말풍선 1"
      platform="android"
      initialSpec={spec}
      onOpenChange={vi.fn()}
      onApply={vi.fn()}
    />,
  );
}
