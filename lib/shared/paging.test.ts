import { describe, expect, it } from "vitest";
import { chunkIntoPages } from "@/lib/shared/paging";

describe("chunkIntoPages", () => {
  it("앞에서부터 순서를 지키며 자른다", () => {
    expect(chunkIntoPages([1, 2, 3, 4, 5, 6, 7], 5)).toEqual([[1, 2, 3, 4, 5], [6, 7]]);
  });

  it("딱 나누어떨어지면 빈 장을 만들지 않는다", () => {
    expect(chunkIntoPages([1, 2, 3, 4], 2)).toEqual([[1, 2], [3, 4]]);
  });

  /** 0장이면 호출부가 빈 캐러셀을 만들거나 "0 / 0"을 그린다. */
  it("비어 있어도 한 장은 만든다", () => {
    expect(chunkIntoPages([], 5)).toEqual([[]]);
  });

  /** 0이나 음수가 들어오면 무한 루프가 된다. */
  it("장 크기가 1보다 작으면 1로 올린다", () => {
    expect(chunkIntoPages([1, 2], 0)).toEqual([[1], [2]]);
    expect(chunkIntoPages([1, 2], -3)).toEqual([[1], [2]]);
  });

  it("원본 배열을 바꾸지 않는다", () => {
    const source = [1, 2, 3];
    chunkIntoPages(source, 2);

    expect(source).toEqual([1, 2, 3]);
  });
});
