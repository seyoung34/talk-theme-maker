import { describe, expect, it } from "vitest";
import { getIosCssValues } from "@/lib/theme/ios/export";

describe("iOS bubble export defaults", () => {
  it("저장된 geometry가 없어도 가운데 기본값을 source scale에 맞춰 출력한다", () => {
    expect(
      getIosCssValues(
        undefined,
        { top: 10, right: 17, bottom: 7, left: 11 },
        { x: 17, y: 17 },
        3,
        { width: 360, height: 180 },
      ),
    ).toEqual({
      stretch: "60px 30px",
      insets: "15px 30px 15px 30px",
    });
  });
});
