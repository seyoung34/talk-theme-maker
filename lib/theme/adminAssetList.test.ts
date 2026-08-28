import { describe, expect, it } from "vitest";
import {
  adminAssetListTileUrl,
  filterAdminAssetListItems,
  isAdminAssetListSortKey,
  sortAdminAssetListItems,
  toAdminAssetListItem,
  type AdminAssetListItem,
} from "@/lib/theme/adminAssetList";
import type { AdminAssetCandidate } from "@/lib/theme/adminAssetDomain";

function candidate(overrides: Partial<AdminAssetCandidate> = {}): AdminAssetCandidate {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    slotRole: "main_background",
    platform: "all",
    assetKind: "background",
    title: "숲",
    tags: [],
    fileName: "forest.png",
    mimeType: "image/png",
    storagePath: "admin-assets/11111111-1111-4111-8111-111111111111/forest.png",
    createdAt: 1000,
    updatedAt: 2000,
    enabled: true,
    ...overrides,
  };
}

function listItem(overrides: Partial<AdminAssetListItem> = {}): AdminAssetListItem {
  return {
    id: "a",
    title: "가",
    slotRole: "main_background",
    platform: "all",
    enabled: true,
    createdAt: 0,
    updatedAt: 0,
    fileName: "a.png",
    mimeType: "image/png",
    hasBubbleAdjustment: false,
    targets: [],
    variantPlatforms: [],
    ...overrides,
  };
}

describe("toAdminAssetListItem", () => {
  /**
   * 목록이 Storage path나 원본 URL을 흘리면 서버 라우트로 옮긴 이유가 사라진다.
   * 카드 수십 장이 원본을 내려받게 되고, 경로 자체도 브라우저에 나갈 이유가 없다.
   */
  it("Storage path와 편집 전용 관계 데이터를 담지 않는다", () => {
    const item = toAdminAssetListItem(
      candidate({
        bubbleSpec: { androidMarkers: {} as never, iosInsets: {} as never, iosStretch: {} as never },
        bubbleDesign: { recipe: {} as never, geometryMode: "manual", decorations: [] },
      }),
    );

    expect(item).not.toHaveProperty("storagePath");
    expect(item).not.toHaveProperty("bubbleSpec");
    expect(item).not.toHaveProperty("bubbleDesign");
    expect(item).not.toHaveProperty("blob");
    expect(item).not.toHaveProperty("file");
  });

  it("말풍선 조정값은 내용 대신 보유 여부만 남긴다", () => {
    const withAdjustment = toAdminAssetListItem(candidate({ bubbleAdjustment: { markers: {} as never } }));
    const without = toAdminAssetListItem(candidate());

    expect(withAdjustment.hasBubbleAdjustment).toBe(true);
    expect(withAdjustment).not.toHaveProperty("bubbleAdjustment");
    expect(without.hasBubbleAdjustment).toBe(false);
  });

  it("target은 카드가 적용 범위를 그릴 세 값만 남긴다", () => {
    const item = toAdminAssetListItem(
      candidate({
        targets: [{ id: "t1", assetId: "a", platform: "all", targetKind: "asset_kind", priority: 7, enabled: true }],
      }),
    );

    expect(item.targets).toEqual([{ platform: "all", targetKind: "asset_kind" }]);
  });

  it("variant는 플랫폼 목록만 남긴다", () => {
    const item = toAdminAssetListItem(
      candidate({
        variants: [
          { assetId: "a", platform: "android", storagePath: "p/android.png", fileName: "android.png", mimeType: "image/png" },
          { assetId: "a", platform: "ios", storagePath: "p/ios.png", fileName: "ios.png", mimeType: "image/png" },
        ],
      }),
    );

    expect(item.variantPlatforms).toEqual(["android", "ios"]);
    expect(JSON.stringify(item)).not.toContain("p/android.png");
  });

  /** 둘 다 주면 카드가 원본을 받을 수 있어 절감이 사라진다. */
  it("썸네일이 있으면 원본 URL을 함께 주지 않는다", () => {
    const item = toAdminAssetListItem(candidate(), { thumbnailUrl: "https://r2/x.webp", previewUrl: "https://signed/original.png" });

    expect(item.thumbnailUrl).toBe("https://r2/x.webp");
    expect(item.previewUrl).toBeUndefined();
  });

  it("썸네일이 없을 때만 원본 URL로 폴백한다", () => {
    const item = toAdminAssetListItem(candidate(), { previewUrl: "https://signed/original.png" });

    expect(adminAssetListTileUrl(item)).toBe("https://signed/original.png");
  });
});

describe("sortAdminAssetListItems", () => {
  const older = listItem({ id: "b", title: "나중", createdAt: 10, updatedAt: 10 });
  const newer = listItem({ id: "c", title: "가장", createdAt: 30, updatedAt: 20 });
  const middle = listItem({ id: "a", title: "다음", createdAt: 20, updatedAt: 30 });

  it("수정순·등록순·이름순이 각각 다른 결과를 낸다", () => {
    expect(sortAdminAssetListItems([older, newer, middle], "updated").map((item) => item.id)).toEqual(["a", "c", "b"]);
    expect(sortAdminAssetListItems([older, newer, middle], "created").map((item) => item.id)).toEqual(["c", "a", "b"]);
    expect(sortAdminAssetListItems([older, newer, middle], "title").map((item) => item.id)).toEqual(["c", "b", "a"]);
  });

  /** 동률에서 순서가 흔들리면 리렌더마다 카드가 자리를 바꾼다. */
  it("동률은 id로 고정한다", () => {
    const tied = [listItem({ id: "z", title: "같음" }), listItem({ id: "a", title: "같음" })];

    expect(sortAdminAssetListItems(tied, "title").map((item) => item.id)).toEqual(["a", "z"]);
  });

  it("원본 배열을 바꾸지 않는다", () => {
    const items = [newer, older];
    sortAdminAssetListItems(items, "title");

    expect(items.map((item) => item.id)).toEqual(["c", "b"]);
  });

  it("정렬 키가 아닌 값은 받지 않는다", () => {
    expect(isAdminAssetListSortKey("title")).toBe(true);
    expect(isAdminAssetListSortKey("priority")).toBe(false);
  });
});

describe("filterAdminAssetListItems", () => {
  const items = [
    listItem({ id: "a", title: "숲 배경", fileName: "forest.png", slotRole: "main_background" }),
    listItem({ id: "b", title: "바다", fileName: "ocean.jpg", slotRole: "chat_background" }),
  ];

  it("이름·파일명·slotRole 어느 쪽이든 부분 일치로 찾는다", () => {
    expect(filterAdminAssetListItems(items, "숲").map((item) => item.id)).toEqual(["a"]);
    expect(filterAdminAssetListItems(items, "OCEAN").map((item) => item.id)).toEqual(["b"]);
    expect(filterAdminAssetListItems(items, "chat_").map((item) => item.id)).toEqual(["b"]);
  });

  it("빈 검색어는 전체를 돌려준다", () => {
    expect(filterAdminAssetListItems(items, "   ")).toHaveLength(2);
  });
});
