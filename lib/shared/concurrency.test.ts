import { describe, expect, it } from "vitest";
import { mapWithConcurrency } from "@/lib/shared/concurrency";

describe("mapWithConcurrency", () => {
  it("입력 순서대로 결과를 반환한다", async () => {
    const results = await mapWithConcurrency([1, 2, 3, 4, 5], 2, async (value) => value * 2);
    expect(results).toEqual([2, 4, 6, 8, 10]);
  });

  it("동시 실행 개수가 제한을 넘지 않는다", async () => {
    let running = 0;
    let peak = 0;
    await mapWithConcurrency(Array.from({ length: 12 }, (_, index) => index), 3, async () => {
      running += 1;
      peak = Math.max(peak, running);
      await Promise.resolve();
      await Promise.resolve();
      running -= 1;
    });
    expect(peak).toBeLessThanOrEqual(3);
    expect(peak).toBeGreaterThan(1);
  });

  it("빈 배열은 작업을 실행하지 않는다", async () => {
    let calls = 0;
    const results = await mapWithConcurrency([], 4, async () => {
      calls += 1;
      return calls;
    });
    expect(results).toEqual([]);
    expect(calls).toBe(0);
  });

  it("작업이 실패하면 예외를 전파한다", async () => {
    await expect(
      mapWithConcurrency([1, 2, 3], 2, async (value) => {
        if (value === 2) throw new Error("boom");
        return value;
      }),
    ).rejects.toThrow("boom");
  });
});
