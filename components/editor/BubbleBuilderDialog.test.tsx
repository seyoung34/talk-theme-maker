import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
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

/**
 * 셸은 이제 CSS로 감추는 것이 아니라 하나만 마운트된다. 모바일 쪽을 보려면 미디어 쿼리가
 * 어긋나게 만들어야 한다.
 */
function useMobileShell() {
  const original = window.matchMedia;
  beforeEach(() => {
    window.matchMedia = ((media: string) => ({
      media,
      matches: false,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;
  });
  afterEach(() => {
    window.matchMedia = original;
  });
}

describe("BubbleBuilderDialog decoration input", () => {
  it("accepts an image pasted from the clipboard", () => {
    renderDialog();
    const file = new File(["image"], "clipboard-cat.png", { type: "image/png" });

    fireEvent.paste(window, { clipboardData: { files: [file] } });

    // 목록과 미리보기 라벨 양쪽에 나오므로 파일명이 여러 벌일 수 있다.
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

  /** 탭은 좁은 화면 전용이다. 데스크톱 셸은 두 묶음을 한 번에 보여 준다. */
  it("shows every section at once on the desktop shell", () => {
    renderDialog();

    expect(screen.queryByRole("tab", { name: "말풍선" })).toBeNull();
    expect(screen.getAllByText("꾸미기 이미지 추가").length).toBeGreaterThan(0);
    expect(screen.getAllByText("모서리 둥글기").length).toBeGreaterThan(0);
  });

  /**
   * 두 셸을 CSS로만 감추면 둘 다 마운트돼 미리보기가 두 벌 돈다 — 캔버스도, ResizeObserver도,
   * 줌·이동 상태도 두 개다. 감춰진 쪽은 크기가 0이라 배율이 엉뚱하게 잡히고, 화면 폭이 바뀌어
   * 셸이 교대하면 그 값이 그대로 나타난다.
   */
  it("mounts exactly one canvas", () => {
    renderDialog();

    expect(screen.getAllByRole("button", { name: "프레임 크기 조절 (왼쪽 위)" })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: "화면에 맞추기" })).toHaveLength(1);
  });

  /**
   * `말풍선 크기`는 보이는 말풍선 크기를 바꾸지 않고 프레임 여백만 반대 방향으로 밀었다.
   * 프레임 손잡이와 같은 결과를 두고 씨름하는 중복 컨트롤이라 없앴다.
   */
  it("no longer offers a body size control", () => {
    renderDialog();

    expect(screen.queryByText("말풍선 크기")).toBeNull();
    for (const option of ["작게", "기본", "크게"]) {
      expect(screen.queryByRole("button", { name: option })).toBeNull();
    }
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
  useMobileShell();

  it("keeps apply in the app bar, outside the scrolling control sheet", () => {
    renderDialog();

    const header = document.querySelector("header");
    expect(header).not.toBeNull();
    expect(header?.textContent).toContain("적용하기");
  });

  it("offers a control sheet that can be made taller", () => {
    renderDialog();

    const handle = screen.getByRole("button", { name: "설정 영역 넓히기" });
    expect(handle).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(handle);

    expect(screen.getByRole("button", { name: "설정 영역 줄이기" })).toHaveAttribute("aria-expanded", "true");
  });
});

/**
 * 닫는 길이 셋(✕, Esc, 바깥 클릭)인데 셋 다 아무 말 없이 편집을 버렸다. 올린 꾸미기 이미지까지
 * 함께 사라져서, 적용하기를 못 찾고 ✕를 누른 사람은 작업을 통째로 잃었다.
 */
describe("BubbleBuilderDialog close guard", () => {
  it("closes straight away when nothing was touched", () => {
    const onOpenChange = vi.fn();
    renderDialog({ onOpenChange });

    fireEvent.click(screen.getAllByRole("button", { name: "닫기" })[0]);

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(screen.queryByText("적용하지 않은 변경 사항이 있어요")).toBeNull();
  });

  it("asks before dropping an unapplied change", () => {
    const onOpenChange = vi.fn();
    renderDialog({ onOpenChange });
    fireEvent.paste(window, { clipboardData: { files: [new File(["image"], "cat.png", { type: "image/png" })] } });

    fireEvent.click(screen.getAllByRole("button", { name: "닫기" })[0]);

    expect(onOpenChange).not.toHaveBeenCalled();
    expect(screen.getByText("적용하지 않은 변경 사항이 있어요")).toBeInTheDocument();
  });

  it("keeps editing or discards from the confirm", () => {
    const onOpenChange = vi.fn();
    renderDialog({ onOpenChange });
    fireEvent.paste(window, { clipboardData: { files: [new File(["image"], "cat.png", { type: "image/png" })] } });
    fireEvent.click(screen.getAllByRole("button", { name: "닫기" })[0]);

    fireEvent.click(screen.getByRole("button", { name: "계속 편집하기" }));
    expect(onOpenChange).not.toHaveBeenCalled();

    fireEvent.click(screen.getAllByRole("button", { name: "닫기" })[0]);
    fireEvent.click(screen.getByRole("button", { name: "적용하지 않고 나가기" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  /**
   * 열 때 preset을 rounded로 강제하고 반지름을 상한으로 누르므로, `initialSpec`과 그대로 비교하면
   * 옛 spec은 아무것도 건드리지 않아도 열자마자 "바뀐 것"이 된다.
   */
  it("does not treat the normalisation done on open as a change", () => {
    const onOpenChange = vi.fn();
    renderDialog({
      onOpenChange,
      // radius 999는 상한으로 눌리고, 단일 decoration은 배열로 옮겨진다.
      spec: { ...spec, design: { ...spec.design, preset: "capsule", radius: 999 } },
    });

    fireEvent.click(screen.getAllByRole("button", { name: "닫기" })[0]);

    expect(onOpenChange).toHaveBeenCalledWith(false);
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

function renderDialog(overrides: { onOpenChange?: () => void; spec?: BubbleFamilyDesignSpec } = {}) {
  return render(
    <BubbleBuilderDialog
      open
      side="me"
      variant="first"
      slotLabel="내 말풍선 1"
      platform="android"
      initialSpec={overrides.spec ?? spec}
      onOpenChange={overrides.onOpenChange ?? vi.fn()}
      onApply={vi.fn()}
    />,
  );
}
