import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InAppBrowserExportGate } from "@/components/project/dialogs/InAppBrowserExportGate";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderGate(overrides: Partial<Parameters<typeof InAppBrowserExportGate>[0]> = {}) {
  const props = {
    browser: "instagram" as const,
    currentUrl: "https://talktheme.example/edit",
    onContinue: vi.fn(),
    onClose: vi.fn(),
    ...overrides,
  };
  render(<InAppBrowserExportGate {...props} />);
  return props;
}

/**
 * 내보내기는 크레딧을 쓰고, 인앱 브라우저는 파일을 받지 못한다. 이 게이트는 빌드가 시작되기 전에
 * 끼어드는 마지막 지점이라, 두 갈래가 모두 살아 있는지 고정한다.
 */
describe("InAppBrowserExportGate", () => {
  it("외부 브라우저로 여는 길과 그대로 진행하는 길을 모두 제공한다", () => {
    const props = renderGate();

    expect(screen.getByRole("link", { name: /외부 브라우저에서 열기/ })).toHaveAttribute("href", "https://talktheme.example/edit");
    fireEvent.click(screen.getByRole("button", { name: "그래도 여기서 계속" }));

    expect(props.onContinue).toHaveBeenCalledTimes(1);
  });

  // 감지는 UA 문자열 기반이라 오탐이 가능하다. 하드 블록이면 오탐 시 결제한 사용자가 파일을 못 받는다.
  it("계속하기를 막지 않는다", () => {
    renderGate();

    expect(screen.getByRole("button", { name: "그래도 여기서 계속" })).not.toBeDisabled();
  });

  it("크레딧이 먼저 빠져나간다는 것과 되받을 곳을 알린다", () => {
    renderGate();

    const warning = screen.getByText(/크레딧은 사용되고/);
    expect(warning).toHaveTextContent("마이페이지에서 다시 받을 수 있습니다");
  });

  it("브라우저를 옮기면 편집 내용이 따라가지 않는다고 알린다", () => {
    renderGate();

    expect(screen.getByText(/작업이 따라가지 않습니다/)).toBeInTheDocument();
  });

  it("Android에서는 외부 브라우저 intent로 연다", () => {
    // iOS는 intent 스킴이 없어 같은 URL을 새 탭으로 열고, 메뉴 안내를 대신 보여 준다.
    vi.stubGlobal("navigator", { userAgent: "Mozilla/5.0 (Linux; Android 14; Pixel) AppleWebKit/537.36 Instagram 300.0" });
    renderGate();

    expect(screen.getByRole("link", { name: /외부 브라우저에서 열기/ }).getAttribute("href")).toMatch(/^intent:\/\//);
  });
});
