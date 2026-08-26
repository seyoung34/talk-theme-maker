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

describe("BubbleBuilderDialog decoration warnings", () => {
  it("warns when a decoration sits across the stretch line", () => {
    renderDialog();
    // 미리 들어 있는 장식은 오른쪽 위에 몰려 있어 늘어나는 선을 지나가지 않는다.
    expect(screen.queryByText(/늘어나는 선/)).toBeNull();

    // 새로 추가한 장식은 캔버스 가운데에서 시작하므로 선을 지나간다.
    fireEvent.paste(window, { clipboardData: { files: [new File(["image"], "centered.png", { type: "image/png" })] } });

    expect(screen.getAllByText(/늘어나는 선/).length).toBeGreaterThan(0);
    expect(screen.getAllByText("늘어남").length).toBeGreaterThan(0);
  });

  it("no longer offers a one-click reposition", () => {
    renderDialog();

    expect(screen.queryByRole("button", { name: "안전하게 이동" })).toBeNull();
  });

  /**
   * 겹침 판정이 보는 것은 이미지의 사각형이라 실제로 걸친 것이 투명한 여백뿐일 수 있고,
   * 글자 위에 무늬를 얹는 것처럼 일부러 겹치는 디자인도 있다. 그래서 막지 않는다.
   */
  it("keeps apply available while warnings are showing", () => {
    renderDialog();
    fireEvent.paste(window, { clipboardData: { files: [new File(["image"], "centered.png", { type: "image/png" })] } });

    expect(screen.getAllByText(/늘어나는 선/).length).toBeGreaterThan(0);
    for (const button of screen.getAllByRole("button", { name: "적용하기" })) {
      expect(button).toBeEnabled();
    }
  });
});

/**
 * 위저드였을 때는 `적용하기`가 마지막 단계에만 있어서, 색만 바꾸려는 사람도 `다음`을 눌러야 했다.
 */
describe("BubbleBuilderDialog tabs", () => {
  it("shows apply without walking through steps", () => {
    renderDialog();

    expect(screen.getAllByRole("button", { name: "적용하기" }).length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: "다음" })).toBeNull();
    expect(screen.queryByRole("button", { name: "이전" })).toBeNull();
  });

  it("opens on the bubble tab and keeps both tabs reachable", () => {
    renderDialog();

    expect(screen.getByRole("tab", { name: "말풍선" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "꾸미기" })).toHaveAttribute("aria-selected", "false");
  });

  it("offers body size as a few choices instead of a slider", () => {
    renderDialog();

    for (const option of ["작게", "기본", "크게"]) {
      expect(screen.getAllByRole("button", { name: option }).length).toBeGreaterThan(0);
    }
    expect(screen.getAllByRole("button", { name: "기본", pressed: true }).length).toBeGreaterThan(0);
  });
});

describe("BubbleBuilderDialog frame handles", () => {
  it("exposes a labelled handle on each corner and each edge of the frame", () => {
    renderDialog();

    // 변 가운데 손잡이가 있어야 한 축만 늘려 직사각형 프레임을 만들 수 있다.
    for (const handle of ["왼쪽 위", "오른쪽 위", "왼쪽 아래", "오른쪽 아래", "위", "아래", "왼쪽", "오른쪽"]) {
      expect(screen.getAllByRole("button", { name: `프레임 크기 조절 (${handle})` }).length).toBeGreaterThan(0);
    }
  });
});

/**
 * 모바일에서는 `적용하기`가 스크롤 맨 아래에 있어 열자마자 화면 밖이었다(390px 화면에서 모달
 * 하단보다 117px 아래). 앱바로 올려 스크롤과 무관하게 만든 것이 이 셸의 존재 이유다.
 */
describe("BubbleBuilderDialog mobile shell", () => {
  it("keeps apply in the app bar, outside the scrolling control sheet", () => {
    renderDialog();

    const mobileShell = document.querySelector("section.lg\\:hidden");
    expect(mobileShell).not.toBeNull();
    expect(mobileShell?.querySelector("header")?.textContent).toContain("적용하기");
  });

  it("offers a control sheet that can be made taller", () => {
    renderDialog();

    const handle = screen.getByRole("button", { name: "설정 영역 넓히기" });
    expect(handle).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(handle);

    expect(screen.getByRole("button", { name: "설정 영역 줄이기" })).toHaveAttribute("aria-expanded", "true");
  });
});

describe("BubbleBuilderDialog zoom controls", () => {
  it("offers a way to zoom without a pinch gesture", () => {
    renderDialog();

    expect(screen.getAllByRole("button", { name: "확대" }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: "축소" }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: "화면에 맞추기" }).length).toBeGreaterThan(0);
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
