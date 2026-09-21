import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/inquiries/route";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  getRequestUser: vi.fn(),
  rpc: vi.fn(),
  maybeSingle: vi.fn(),
  createInquiryCreatedEvent: vi.fn(),
  scheduleOpsEvent: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: mocks.createClient,
}));

vi.mock("@/lib/supabase/auth", () => ({
  getRequestUser: mocks.getRequestUser,
}));

vi.mock("@/lib/ops/eventFactories", () => ({
  createInquiryCreatedEvent: mocks.createInquiryCreatedEvent,
}));

vi.mock("@/lib/ops/dispatcher", () => ({
  scheduleOpsEvent: mocks.scheduleOpsEvent,
}));

const inquiryId = "8c7202d6-8c50-44e4-936d-c12bfba9f1d8";

function request(body: Record<string, unknown>) {
  return new Request("https://talktheme.test/api/inquiries", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getRequestUser.mockResolvedValue({ denied: null, user: { id: "user-1" } });
  mocks.rpc.mockResolvedValue({ data: inquiryId, error: null });
  mocks.maybeSingle.mockResolvedValue({
    data: {
      id: inquiryId,
      category: "payment",
      title: "결제 오류",
      status: "open",
      export_job_id: null,
      created_at: "2026-09-21T01:00:00.000Z",
      updated_at: "2026-09-21T01:00:00.000Z",
      answered_at: null,
      user_read_at: null,
    },
    error: null,
  });
  mocks.createInquiryCreatedEvent.mockReturnValue({ eventId: "inquiry-event" });
  mocks.createClient.mockResolvedValue({
    rpc: mocks.rpc,
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: mocks.maybeSingle,
    }),
  });
});

describe("POST /api/inquiries", () => {
  it("publishes an operator event after the inquiry RPC succeeds", async () => {
    const response = await POST(request({
      category: "payment",
      title: "결제 오류",
      body: "결제 후 크레딧이 보이지 않습니다.",
    }));

    expect(response.status).toBe(201);
    expect(mocks.createInquiryCreatedEvent).toHaveBeenCalledWith({
      inquiryId,
      category: "payment",
    });
    expect(mocks.scheduleOpsEvent).toHaveBeenCalledWith({ eventId: "inquiry-event" });
  });

  it("does not publish an event when the inquiry RPC fails", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: "rate_limited" } });

    const response = await POST(request({
      category: "payment",
      title: "결제 오류",
      body: "잠시 후 다시 시도합니다.",
    }));

    expect(response.status).toBe(429);
    expect(mocks.createInquiryCreatedEvent).not.toHaveBeenCalled();
    expect(mocks.scheduleOpsEvent).not.toHaveBeenCalled();
  });
});
