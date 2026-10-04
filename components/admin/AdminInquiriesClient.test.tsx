import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AdminInquiriesClient from "./AdminInquiriesClient";
import { StrictMode } from "react";
import type { Inquiry } from "@/lib/inquiries/types";

const refresh = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh, push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));

const inquiry = {
  id: "inq-1",
  category: "etc",
  title: "테마가 적용되지 않아요",
  status: "open",
  exportJobId: null,
  createdAt: "2026-10-02T00:00:00Z",
  updatedAt: "2026-10-02T00:00:00Z",
  answeredAt: null,
  userReadAt: null,
  messages: [],
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("AdminInquiriesClient shell badge refresh", () => {
  beforeEach(() => {
    refresh.mockClear();
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.startsWith("/api/admin/inquiries?") || url === "/api/admin/inquiries") return json({ inquiries: [inquiry] });
      if (url === "/api/admin/inquiries/inq-1" && (!init?.method || init.method === "GET")) return json({ inquiry });
      if (url === "/api/admin/inquiries/inq-1") return json({ ok: true });
      throw new Error(`unexpected fetch ${url}`);
    }));
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  async function openInquiry() {
    render(<AdminInquiriesClient />);
    fireEvent.click(await screen.findByText("테마가 적용되지 않아요"));
    await screen.findByPlaceholderText("답변 내용");
  }

  it("첫 진입에서는 layout을 다시 받지 않는다", async () => {
    render(<AdminInquiriesClient />);
    await screen.findByText("테마가 적용되지 않아요");
    expect(refresh).not.toHaveBeenCalled();
  });

  it("서버 목록은 다시 요청하지 않고 필터 왕복과 새로고침은 계속 조회한다", async () => {
    render(<StrictMode><AdminInquiriesClient initialData={{ ok: true, value: [inquiry as Inquiry] }} /></StrictMode>);
    expect(screen.getByText("테마가 적용되지 않아요")).toBeTruthy();
    expect(fetch).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "답변 완료" }));
    await waitFor(() => expect(fetch).toHaveBeenCalledWith("/api/admin/inquiries?status=answered", { cache: "no-store" }));
    fireEvent.click(screen.getByRole("button", { name: "답변 대기" }));
    await waitFor(() => expect(fetch).toHaveBeenCalledWith("/api/admin/inquiries?status=open", { cache: "no-store" }));
    vi.mocked(fetch).mockClear();
    fireEvent.click(screen.getByRole("button", { name: /새로고침/ }));
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("최초 조회 실패는 오류로 보여주고 사용자가 재시도할 수 있다", async () => {
    render(<AdminInquiriesClient initialData={{ ok: false, error: "최초 조회 실패" }} />);
    expect(screen.getByText("최초 조회 실패")).toBeTruthy();
    expect(fetch).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /새로고침/ }));
    await screen.findByText("테마가 적용되지 않아요");
    expect(screen.queryByText("최초 조회 실패")).toBeNull();
  });

  it("답변을 등록하면 사이드바 배지를 다시 센다", async () => {
    await openInquiry();
    fireEvent.change(screen.getByPlaceholderText("답변 내용"), { target: { value: "확인했습니다." } });
    fireEvent.click(screen.getByRole("button", { name: /답변 등록/ }));
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
  });

  it("상태를 바꾸면 사이드바 배지를 다시 센다", async () => {
    await openInquiry();
    fireEvent.click(screen.getByRole("button", { name: /종료으로/ }));
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
  });

  it("새로고침 버튼은 목록과 배지를 함께 다시 받는다", async () => {
    render(<AdminInquiriesClient />);
    await screen.findByText("테마가 적용되지 않아요");
    fireEvent.click(screen.getByRole("button", { name: /새로고침/ }));
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("변경이 실패하면 배지를 다시 받지 않는다", async () => {
    vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.startsWith("/api/admin/inquiries?")) return json({ inquiries: [inquiry] });
      if (!init?.method || init.method === "GET") return json({ inquiry });
      return json({ error: "실패" }, 500);
    });
    await openInquiry();
    fireEvent.click(screen.getByRole("button", { name: /종료으로/ }));
    await screen.findByText("실패");
    expect(refresh).not.toHaveBeenCalled();
  });
});
