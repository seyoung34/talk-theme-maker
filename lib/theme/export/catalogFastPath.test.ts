import { describe, expect, it } from "vitest";
import { isAndroidCatalogFastPathEligible, isIosCatalogFastPathEligible } from "@/lib/theme/export/catalogFastPath";
import { isAndroidNinePatchSourceName } from "@/lib/theme/sourceImage";

/**
 * `catalogFastPath.ts`는 Next(Webpack)와 NodeNext(Builder) 양쪽에서 컴파일돼야 해서
 * `isAndroidNinePatchSourceName`을 안에 복사해 두었다. 복사본은 언젠가 원본과 갈라진다.
 *
 * 갈라지면 결과가 조용히 나빠진다 — 9-patch 원본이 fast path를 통과해 marker 테두리가 남은
 * 채로 결과물에 들어간다. `e2e/catalog-transform-parity.spec.ts`는 변환 **출력**을 비교하므로
 * 이 게이트 자체는 보지 않는다. 그래서 여기서 두 판정이 같은 답을 내는지 직접 잠근다.
 */

const ninePatchNames = [
  "bubble.9.png",
  "BUBBLE.9.PNG",
  "path/to/bubble.9.png",
  "bubble.9.png?token=abc",
  "bubble.9.png#fragment",
  "bubble%2E9.png",
];

const plainNames = [
  "bubble.png",
  "bubble@3x.png",
  "bubble.9.webp",
  "nine.png",
  "bubble.9.png.bak",
  "",
];

function source(fileName: string) {
  return { fileName, sourceScale: 3 as const, mimeType: "image/png" };
}

describe("catalogFastPath의 9-patch 판정이 sourceImage와 일치한다", () => {
  it.each([...ninePatchNames, ...plainNames])("%s", (fileName) => {
    const expected = isAndroidNinePatchSourceName(fileName);

    // Android: 출력 경로는 평범한 PNG로 두고, 원본 이름만으로 갈리는지 본다.
    const android = isAndroidCatalogFastPathEligible({
      path: "src/main/theme/drawable-xxhdpi/bubble.png",
      source: source(fileName),
    });
    expect(android.eligible).toBe(!expected);
    if (!android.eligible) expect(android.reason).toBe("nine_patch_source");

    // iOS: 배율을 맞춰 두어 9-patch 여부만 남긴다.
    const ios = isIosCatalogFastPathEligible({
      path: "Images/bubble@3x.png",
      source: source(fileName),
    });
    expect(ios.eligible).toBe(!expected);
    if (!ios.eligible) expect(ios.reason).toBe("nine_patch_source");
  });
});
