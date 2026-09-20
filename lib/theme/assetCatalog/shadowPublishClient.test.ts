import { afterEach, describe, expect, it, vi } from "vitest";

import { shadowPublishThemeAsset, whenShadowPublishesSettle } from "@/lib/theme/assetCatalog/shadowPublishClient";

function pngFile() {
  return new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], "asset.png", { type: "image/png" });
}

/**
 * 썸네일 굽기는 canvas·`Image.decode()`에 기대는데 happy-dom에는 없다. 그대로 두면 디코딩에서
 * 멈춰 이 파일의 주제(진행 중인 게시 추적)를 검증할 수 없다. 굽기가 빨리 실패하게 두면
 * `preview` 없이 요청이 나가고 나머지 흐름은 동일하다.
 */
function stubThumbnailBaking() {
  vi.stubGlobal("URL", { ...URL, createObjectURL: () => "blob:test", revokeObjectURL: () => {} });
  vi.stubGlobal("Image", class {
    src = "";
    async decode() { throw new Error("decode unsupported"); }
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

/**
 * 저장 경로는 게시를 `void`로 부르고 진행한다. 그래서 저장 직후 목록을 다시 읽으면 아직
 * 끝나지 않은 게시가 "미등록"으로 보였다가 바뀐다. 진행 중인 게시를 세어 두고 목록을 읽기
 * 직전에만 잠깐 기다리게 해서, 저장은 막지 않으면서 화면은 정답을 보게 한다.
 */
describe("whenShadowPublishesSettle", () => {
  it("진행 중인 게시가 없으면 곧바로 끝난다", async () => {
    await expect(whenShadowPublishesSettle()).resolves.toBeUndefined();
  });

  it("진행 중인 게시가 끝날 때까지 기다린다", async () => {
    stubThumbnailBaking();
    let release: (() => void) | undefined;
    vi.stubGlobal("fetch", vi.fn(() => new Promise((resolve) => {
      release = () => resolve({ ok: true, json: async () => ({ status: "published" }) } as Response);
    })));

    const publishing = shadowPublishThemeAsset({ kind: "admin", sourceId: "asset-1", canonical: pngFile() });
    let settled = false;
    const waiting = whenShadowPublishesSettle().then(() => { settled = true; });

    // 썸네일 굽기를 지나 요청까지 가는 데 몇 tick이 걸린다. 요청이 실제로 떴는지 확인한 뒤에
    // 판단해야 "아직 안 끝났다"가 의미를 갖는다.
    await vi.waitFor(() => expect(release).toBeDefined());
    expect(settled).toBe(false);

    release?.();
    await publishing;
    await waiting;
    expect(settled).toBe(true);
  });

  it("게시가 실패해도 기다림은 정상적으로 끝난다", async () => {
    stubThumbnailBaking();
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("network down"); }));

    const outcome = await shadowPublishThemeAsset({ kind: "admin", sourceId: "asset-2", canonical: pngFile() });

    expect(outcome.status).toBe("skipped");
    await expect(whenShadowPublishesSettle()).resolves.toBeUndefined();
  });

  /** 게시 요청이 네트워크에서 멈추면 목록 새로고침까지 함께 멈춰 화면이 굳는다. */
  it("게시가 끝나지 않아도 제한 시간이 지나면 기다림을 포기한다", async () => {
    stubThumbnailBaking();
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
    void shadowPublishThemeAsset({ kind: "admin", sourceId: "asset-3", canonical: pngFile() });

    await expect(whenShadowPublishesSettle(1)).resolves.toBeUndefined();
  });
});
