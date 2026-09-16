import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import SiteHeader from "@/components/layout/SiteHeader";
import { clearInternalTraffic, isInternalTraffic } from "@/lib/analytics/ga4";

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  refresh: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: mocks.replace, refresh: mocks.refresh }) }));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({ auth: { signOut: mocks.signOut } }) }));

describe("SiteHeader", () => {
  beforeEach(() => {
    clearInternalTraffic();
    mocks.replace.mockReset();
    mocks.refresh.mockReset();
    mocks.signOut.mockReset().mockResolvedValue({ error: null });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      user: { email: "admin@example.com", displayName: "Admin" },
      isAdmin: true,
    }), { headers: { "Content-Type": "application/json" } })));
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    clearInternalTraffic();
  });

  it("clears the internal marker before navigating after a successful logout", async () => {
    mocks.replace.mockImplementation(() => {
      expect(isInternalTraffic()).toBe(false);
    });
    render(<SiteHeader currentPath="/account" />);

    await waitFor(() => expect(isInternalTraffic()).toBe(true));
    fireEvent.click(screen.getByRole("button", { name: "계정 메뉴 열기" }));
    fireEvent.click(screen.getByRole("button", { name: /^로그아웃$/ }));
    fireEvent.click(within(screen.getByRole("dialog", { name: "로그아웃할까요?" })).getByRole("button", { name: /^로그아웃$/ }));

    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/login"));
    expect(isInternalTraffic()).toBe(false);
  });
});
