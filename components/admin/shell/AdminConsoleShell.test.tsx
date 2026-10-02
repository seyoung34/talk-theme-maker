import { createEvent, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AdminConsoleShell from "./AdminConsoleShell";
import { useAdminNavigationGuard } from "./AdminNavigationGuard";

const pathname = vi.hoisted(() => ({ current: "/admin/assets" }));

vi.mock("next/navigation", () => ({
  usePathname: () => pathname.current,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));

function BlockingScreen({ block }: { block: boolean }) {
  useAdminNavigationGuard(() => block);
  return <p>workspace</p>;
}

function clickAndReport(anchor: HTMLElement) {
  const event = createEvent.click(anchor, { button: 0, bubbles: true, cancelable: true });
  fireEvent(anchor, event);
  return event.defaultPrevented;
}

describe("AdminConsoleShell navigation guard", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it.each(["/admin/assets", "/admin"])("화면이 이동을 막으면 %s 셸의 모든 링크가 이동하지 않는다", (path) => {
    pathname.current = path;
    render(
      <AdminConsoleShell badges={{}}>
        <BlockingScreen block />
      </AdminConsoleShell>,
    );

    const links = screen.getAllByRole("link", { hidden: true });
    // 로고·메뉴 7개·계정·사이트 이동. 링크가 새로 생겨도 이 검사에 자동으로 포함된다.
    expect(links.length).toBeGreaterThanOrEqual(10);
    for (const link of links) {
      expect({ href: link.getAttribute("href"), blocked: clickAndReport(link) }).toEqual({ href: link.getAttribute("href"), blocked: true });
    }
  });
});
