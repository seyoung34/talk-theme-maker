import { StrictMode } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AdminNoticesClient from "./AdminNoticesClient";
import AdminMarketingClient from "./AdminMarketingClient";
import AdminPromotionsClient from "./AdminPromotionsClient";
import { buildWeeklyReport } from "@/lib/marketing/weekly";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ notices: [], codes: [], report: buildWeeklyReport({ summaryRows: [], redirectRequestRows: [] }) })));
});

describe("server initial lists", () => {
  it("공지 초깃값 뒤 최초 API를 생략하고 명시적 새로고침은 유지한다", async () => {
    render(<StrictMode><AdminNoticesClient initialData={{ ok: true, value: [] }} /></StrictMode>);
    expect(fetch).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /새로고침/ }));
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
  });
  it("분석 초깃값 뒤 최초 API를 생략하고 명시적 새로고침은 유지한다", async () => {
    render(<AdminMarketingClient initialData={{ ok: true, value: buildWeeklyReport({ summaryRows: [], redirectRequestRows: [] }) }} />);
    expect(fetch).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /새로고침/ }));
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
  });
  it("코드·가입 혜택은 독립적인 서버 결과를 사용하고 가입 혜택 실패를 숨기지 않는다", async () => {
    render(<AdminPromotionsClient initialData={{ ok: true, value: [] }} initialCampaign={Promise.resolve({ ok: false, error: "가입 혜택 조회 실패" })} />);
    await screen.findByText("가입 혜택 조회 실패");
    expect(fetch).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "목록 새로고침" }));
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
  });
});
