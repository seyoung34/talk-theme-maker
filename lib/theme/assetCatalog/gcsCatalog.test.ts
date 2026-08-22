import { afterEach, describe, expect, it, vi } from "vitest";
import {
  assertCatalogObjectKey,
  CatalogStorageError,
  headCatalogObject,
  putCatalogObject,
  readCatalogStorageConfig,
} from "@/lib/theme/assetCatalog/gcsCatalog";

const config = { bucket: "kt-theme-asset-catalog", publisherServiceAccount: "publisher@example.iam.gserviceaccount.com" };
const objectKey = "catalog/v1/ab/" + "ab".padEnd(64, "c") + ".png";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

async function sha256Hex(bytes: Uint8Array) {
  const digest = await crypto.subtle.digest("SHA-256", bytes as unknown as ArrayBufferView<ArrayBuffer>);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("readCatalogStorageConfig", () => {
  it("설정이 없으면 명시적으로 실패한다", () => {
    vi.stubEnv("GCP_THEME_ASSET_BUCKET", "");
    vi.stubEnv("GCP_THEME_CATALOG_PUBLISHER_SA_EMAIL", "");
    expect(() => readCatalogStorageConfig()).toThrow(CatalogStorageError);
  });

  it("두 값이 모두 있어야 한다", () => {
    vi.stubEnv("GCP_THEME_ASSET_BUCKET", "kt-theme-asset-catalog");
    vi.stubEnv("GCP_THEME_CATALOG_PUBLISHER_SA_EMAIL", "");
    expect(() => readCatalogStorageConfig()).toThrow(CatalogStorageError);

    vi.stubEnv("GCP_THEME_CATALOG_PUBLISHER_SA_EMAIL", "publisher@example.iam.gserviceaccount.com");
    expect(readCatalogStorageConfig()).toEqual(config);
  });
});

describe("assertCatalogObjectKey", () => {
  it("catalog/v1 밖과 경로 탈출을 거부한다", () => {
    expect(assertCatalogObjectKey(objectKey)).toBe(objectKey);
    expect(() => assertCatalogObjectKey("other/v1/a.png")).toThrow(CatalogStorageError);
    expect(() => assertCatalogObjectKey("catalog/v1/../secret.png")).toThrow(CatalogStorageError);
    expect(() => assertCatalogObjectKey("catalog/v1//a.png")).toThrow(CatalogStorageError);
    expect(() => assertCatalogObjectKey("catalog/v1/a\\b.png")).toThrow(CatalogStorageError);
  });
});

describe("putCatalogObject", () => {
  it("없을 때만 생성하도록 ifGenerationMatch=0으로 올린다", async () => {
    const requestedUrls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      requestedUrls.push(String(url));
      return jsonResponse({ generation: "17", size: "24" });
    }));

    const result = await putCatalogObject({
      config, accessToken: "token", objectKey, bytes: new Uint8Array(24), contentType: "image/png", expectedSizeBytes: 24,
    });

    expect(result).toEqual({ objectKey, generation: "17", sizeBytes: 24, created: true });
    expect(requestedUrls[0]).toContain("ifGenerationMatch=0");
    expect(requestedUrls[0]).toContain("uploadType=media");
    expect(requestedUrls[0]).toContain(encodeURIComponent(config.bucket));
  });

  /**
   * content-addressed 키라 412는 오류가 아니다. 다른 publish가 같은 바이트를 이미 올렸다는 뜻이고,
   * 재시도가 몇 번 돌아도 같은 결과여야 한다.
   */
  it("이미 존재하면 기존 metadata를 재사용한다", async () => {
    const bytes = new Uint8Array(24);
    const sha256 = await sha256Hex(bytes);
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response("", { status: 412 }))
      .mockResolvedValueOnce(jsonResponse({ generation: "9", size: "24" }))
      .mockResolvedValueOnce(new Response(bytes, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await putCatalogObject({
      config, accessToken: "token", objectKey, sha256, bytes, contentType: "image/png", expectedSizeBytes: 24,
    });

    expect(result).toEqual({ objectKey, generation: "9", sizeBytes: 24, created: false });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(String(fetchMock.mock.calls[2]?.[0])).toContain("alt=media");
  });

  it("이미 존재하는 키의 바이트 해시가 다르면 실패한다", async () => {
    const sourceBytes = new Uint8Array(24);
    const objectBytes = new Uint8Array(24).fill(7);
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response("", { status: 412 }))
      .mockResolvedValueOnce(jsonResponse({ generation: "9", size: "24" }))
      .mockResolvedValueOnce(new Response(objectBytes, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(putCatalogObject({
      config,
      accessToken: "token",
      objectKey,
      sha256: await sha256Hex(sourceBytes),
      bytes: sourceBytes,
      contentType: "image/png",
      expectedSizeBytes: 24,
    })).rejects.toThrow(CatalogStorageError);
  });

  // 크기가 어긋나면 registry가 잘못된 size_bytes를 갖게 되고, export가 그 값을 믿는다.
  it("응답 크기가 기대와 다르면 실패한다", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ generation: "17", size: "99" })));
    await expect(putCatalogObject({
      config, accessToken: "token", objectKey, bytes: new Uint8Array(24), contentType: "image/png", expectedSizeBytes: 24,
    })).rejects.toThrow(CatalogStorageError);
  });

  it("412 뒤 객체가 없으면 조용히 넘어가지 않는다", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(new Response("", { status: 412 }))
      .mockResolvedValueOnce(new Response("", { status: 404 })));
    await expect(putCatalogObject({
      config, accessToken: "token", objectKey, bytes: new Uint8Array(24), contentType: "image/png", expectedSizeBytes: 24,
    })).rejects.toThrow(CatalogStorageError);
  });

  it("generation 없는 응답을 거부한다", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ size: "24" })));
    await expect(putCatalogObject({
      config, accessToken: "token", objectKey, bytes: new Uint8Array(24), contentType: "image/png", expectedSizeBytes: 24,
    })).rejects.toThrow(CatalogStorageError);
  });

  it("허용 prefix 밖 키는 네트워크 호출 전에 막는다", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(putCatalogObject({
      config, accessToken: "token", objectKey: "../evil.png", bytes: new Uint8Array(1), contentType: "image/png", expectedSizeBytes: 1,
    })).rejects.toThrow(CatalogStorageError);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("headCatalogObject", () => {
  it("없으면 null을 준다", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 404 })));
    expect(await headCatalogObject({ config, accessToken: "token", objectKey })).toBeNull();
  });

  it("있으면 generation과 크기를 준다", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ generation: "42", size: "1024" })));
    expect(await headCatalogObject({ config, accessToken: "token", objectKey })).toEqual({
      objectKey, generation: "42", sizeBytes: 1024,
    });
  });

  it("5xx는 없음으로 취급하지 않는다", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 503 })));
    await expect(headCatalogObject({ config, accessToken: "token", objectKey })).rejects.toThrow(CatalogStorageError);
  });

  it("네트워크 실패를 저장소 오류로 감싼다", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("network down"); }));
    await expect(headCatalogObject({ config, accessToken: "token", objectKey })).rejects.toThrow(CatalogStorageError);
  });
});
