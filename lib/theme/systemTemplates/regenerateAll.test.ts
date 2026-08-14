import { describe, expect, it, vi } from "vitest";
import { regenerateSystemTemplatePreviews } from "@/lib/theme/systemTemplates/regenerateAll";

const targets = [
  { id: "a", title: "첫 번째 템플릿" },
  { id: "b", title: "두 번째 템플릿" },
  { id: "c", title: "세 번째 템플릿" },
];

/**
 * 일괄 재생성의 중단 규칙.
 *
 * 재생성 실패는 대부분 서버/스토리지 쪽 문제라 다음 템플릿에서도 그대로 재현된다. 계속 돌리면
 * 이미 CPU 한도를 넘긴 서버에 템플릿 수만큼 요청을 더 얹는다. 첫 실패에서 멈추는 것이 핵심이다.
 */
describe("regenerateSystemTemplatePreviews", () => {
  it("전부 성공하면 처리 개수를 돌려준다", async () => {
    const regenerate = vi.fn(async () => {});

    await expect(regenerateSystemTemplatePreviews(targets, regenerate)).resolves.toEqual({ total: 3, done: 3 });
    expect(regenerate).toHaveBeenCalledTimes(3);
  });

  it("서버 오류가 나면 그 뒤 템플릿은 호출하지 않는다", async () => {
    const failure = new Error("Worker exceeded CPU time limit");
    const regenerate = vi.fn(async (id: string) => {
      if (id === "b") throw failure;
    });

    const result = await regenerateSystemTemplatePreviews(targets, regenerate);

    expect(result).toEqual({ total: 3, done: 1, failed: targets[1], error: failure });
    expect(regenerate).toHaveBeenCalledTimes(2);
    expect(regenerate).not.toHaveBeenCalledWith("c");
  });

  it("첫 템플릿에서 실패해도 done은 0으로 보고한다", async () => {
    const regenerate = vi.fn(async () => {
      throw new Error("signed url failed");
    });

    const result = await regenerateSystemTemplatePreviews(targets, regenerate);

    expect(result.done).toBe(0);
    expect(result.failed).toEqual(targets[0]);
    expect(regenerate).toHaveBeenCalledTimes(1);
  });

  it("순차로 처리한다", async () => {
    const running: string[] = [];
    let maxConcurrent = 0;
    const regenerate = vi.fn(async (id: string) => {
      running.push(id);
      maxConcurrent = Math.max(maxConcurrent, running.length);
      await Promise.resolve();
      running.pop();
    });

    await regenerateSystemTemplatePreviews(targets, regenerate);

    expect(maxConcurrent).toBe(1);
  });

  it("대상이 없으면 아무것도 호출하지 않는다", async () => {
    const regenerate = vi.fn(async () => {});

    await expect(regenerateSystemTemplatePreviews([], regenerate)).resolves.toEqual({ total: 0, done: 0 });
    expect(regenerate).not.toHaveBeenCalled();
  });
});
