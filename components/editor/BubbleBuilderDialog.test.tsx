import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { BubbleBuilderDialog } from "@/components/editor/BubbleBuilderDialog";
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
    shadow: "none",
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

    expect(screen.getByText("clipboard-cat.png")).toBeInTheDocument();
  });

  it("accepts an image dropped onto the upload zone", () => {
    renderDialog();
    const file = new File(["image"], "dropped-dog.webp", { type: "image/webp" });

    fireEvent.drop(screen.getByTestId("bubble-decoration-dropzone"), { dataTransfer: { files: [file] } });

    expect(screen.getByText("dropped-dog.webp")).toBeInTheDocument();
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
