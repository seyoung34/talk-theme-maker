import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/inquiries/[id]/messages/route";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  getRequestUser: vi.fn(),
  rpc: vi.fn(),
  maybeSingle: vi.fn(),
  createInquiryUserReplyEvent: vi.fn(),
  scheduleOpsEvent: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: mocks.createClient,
}));

vi.mock("@/lib/supabase/auth", () => ({
  getRequestUser: mocks.getRequestUser,
}));

vi.mock("@/lib/ops/eventFactories", () => ({
  createInquiryUserReplyEvent: mocks.createInquiryUserReplyEvent,
}));

vi.mock("@/lib/ops/dispatcher", () => ({
  scheduleOpsEvent: mocks.scheduleOpsEvent,
}));

const inquiryId = "8c7202d6-8c50-44e4-936d-c12bfba9f1d8";
const messageId = "4bc5f1f7-3d7b-4e7f-9a5e-2e4b5fd31d7e";

function request(body: Record<string, unknown>) {
  return new Request(`https://talktheme.test/api/inquiries/${inquiryId}/messages`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getRequestUser.mockResolvedValue({ denied: null, user: { id: "user-1" } });
  mocks.rpc.mockResolvedValue({ data: messageId, error: null });
  mocks.maybeSingle.mockResolvedValue({
    data: { id: messageId, author: "user", body: "추가 정보입니다.", created_at: "2026-09-21T01:00:00.000Z" },
    error: null,
  });
  mocks.createInquiryUserReplyEvent.mockReturnValue({ eventId: "reply-event" });
  mocks.createClient.mockResolvedValue({
    rpc: mocks.rpc,
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: mocks.maybeSingle,
    }),
  });
});

describe("POST /api/inquiries/[id]/messages", () => {
  it("publishes an operator event after the reply RPC succeeds", async () => {
    const response = await POST(request({ body: "추가 정보입니다." }), { params: Promise.resolve({ id: inquiryId }) });

    expect(response.status).toBe(201);
    expect(mocks.createInquiryUserReplyEvent).toHaveBeenCalledWith({ inquiryId, messageId });
    expect(mocks.scheduleOpsEvent).toHaveBeenCalledWith({ eventId: "reply-event" });
  });

  it("does not publish an event when the reply RPC fails", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: "inquiry_closed" } });

    const response = await POST(request({ body: "종료된 문의에 답신" }), { params: Promise.resolve({ id: inquiryId }) });

    expect(response.status).toBe(400);
    expect(mocks.createInquiryUserReplyEvent).not.toHaveBeenCalled();
    expect(mocks.scheduleOpsEvent).not.toHaveBeenCalled();
  });
});
