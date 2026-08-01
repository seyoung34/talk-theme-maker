import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useEditorAutosave, type AutosaveArm } from "@/components/project/hooks/useEditorAutosave";
import type { EditorAutosaveInput } from "@/lib/theme/project/autosaveDraft";

const mocks = vi.hoisted(() => ({
  clearAutosaveDraft: vi.fn(),
  trackAnalyticsEvent: vi.fn(),
  writeAutosaveDraft: vi.fn(),
}));

vi.mock("@/lib/theme/project/autosaveDraft", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/theme/project/autosaveDraft")>();
  return {
    ...actual,
    clearAutosaveDraft: mocks.clearAutosaveDraft,
    writeAutosaveDraft: mocks.writeAutosaveDraft,
  };
});

vi.mock("@/lib/analytics/ga4", () => ({
  trackAnalyticsEvent: mocks.trackAnalyticsEvent,
}));

const armed: AutosaveArm = { state: "armed", expectedUpdatedAt: null };
const snapshot = { mode: "user" } as EditorAutosaveInput;

function renderAutosave(signature = "baseline") {
  return renderHook(
    ({ draftSignature }) =>
      useEditorAutosave({
        arm: armed,
        mode: "user",
        draftSignature,
        getSnapshot: () => snapshot,
      }),
    { initialProps: { draftSignature: signature } },
  );
}

beforeEach(() => {
  vi.useFakeTimers();
  mocks.clearAutosaveDraft.mockReset().mockResolvedValue(undefined);
  mocks.trackAnalyticsEvent.mockReset();
  mocks.writeAutosaveDraft.mockReset().mockResolvedValue({
    status: "saved",
    record: { updatedAt: 1234 },
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("useEditorAutosave.flushAutosave", () => {
  it("pending debounce를 취소하고 최신 snapshot을 즉시 저장한다", async () => {
    const { result, rerender } = renderAutosave();
    rerender({ draftSignature: "changed" });

    let outcome: Awaited<ReturnType<typeof result.current.flushAutosave>> | undefined;
    await act(async () => {
      outcome = await result.current.flushAutosave();
    });

    expect(outcome).toBe("saved");
    expect(mocks.writeAutosaveDraft).toHaveBeenCalledTimes(1);
    expect(mocks.writeAutosaveDraft).toHaveBeenCalledWith(snapshot, null);
    expect(result.current.status).toBe("saved");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("현재 signature가 이미 저장 기준선이면 쓰지 않는다", async () => {
    const { result } = renderAutosave();

    let outcome: Awaited<ReturnType<typeof result.current.flushAutosave>> | undefined;
    await act(async () => {
      outcome = await result.current.flushAutosave();
    });

    expect(outcome).toBe("unchanged");
    expect(mocks.writeAutosaveDraft).not.toHaveBeenCalled();
  });

  it("저장 실패를 호출자에게 반환해 이동을 보류할 수 있게 한다", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.writeAutosaveDraft.mockRejectedValueOnce(new Error("storage unavailable"));
    const { result, rerender } = renderAutosave();
    rerender({ draftSignature: "changed" });

    let outcome: Awaited<ReturnType<typeof result.current.flushAutosave>> | undefined;
    await act(async () => {
      outcome = await result.current.flushAutosave();
    });

    expect(outcome).toBe("failed");
    expect(result.current.status).toBe("error");
  });

  it("stale write 뒤에는 추가 쓰기를 멈추고 conflict를 반환한다", async () => {
    mocks.writeAutosaveDraft.mockResolvedValueOnce({ status: "stale" });
    const { result, rerender } = renderAutosave();
    rerender({ draftSignature: "changed" });

    let first: Awaited<ReturnType<typeof result.current.flushAutosave>> | undefined;
    await act(async () => {
      first = await result.current.flushAutosave();
    });
    const second = await result.current.flushAutosave();

    expect(first).toBe("conflict");
    expect(second).toBe("conflict");
    expect(mocks.writeAutosaveDraft).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe("conflict");
  });
});
