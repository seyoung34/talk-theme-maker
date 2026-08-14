import { describe, expect, it, vi } from "vitest";
import { createAdminThemeAssetSignedUrls, type ThemeAssetSigningClient } from "@/lib/theme/systemTemplates/adminSignedUrls";
import { themeAssetSignedUrlTtlSeconds } from "@/lib/theme/themeAssetSigning";

type SignedUrlItem = { path?: string | null; signedUrl?: string | null };

function createClientStub(result: { data?: SignedUrlItem[] | null; error?: { message: string } | null }) {
  const createSignedUrls = vi.fn(async () => ({ data: result.data ?? null, error: result.error ?? null }));
  const from = vi.fn(() => ({ createSignedUrls }));
  return { client: { storage: { from } } as ThemeAssetSigningClient, from, createSignedUrls };
}

/**
 * 관리자 재생성 경로는 `/api/theme-assets/signed-urls`(Next.js Worker)를 거치지 않고
 * Supabase Storage로 직접 서명한다. 응답을 경로별로 정확히 매핑하는 것과, 반쪽짜리 응답을
 * 성공으로 넘기지 않는 것이 이 함수의 계약이다.
 */
describe("createAdminThemeAssetSignedUrls", () => {
  const paths = ["system-templates/a/bg.png", "system-templates/a/bubble.png"];

  it("path → signedUrl로 매핑한다", async () => {
    const { client, from, createSignedUrls } = createClientStub({
      data: paths.map((path) => ({ path, signedUrl: `https://signed/${path}` })),
    });

    const result = await createAdminThemeAssetSignedUrls(client, paths);

    expect(result).toEqual({
      "system-templates/a/bg.png": "https://signed/system-templates/a/bg.png",
      "system-templates/a/bubble.png": "https://signed/system-templates/a/bubble.png",
    });
    expect(from).toHaveBeenCalledWith("theme-assets");
    expect(createSignedUrls).toHaveBeenCalledWith(paths, themeAssetSignedUrlTtlSeconds);
  });

  it("응답 순서가 달라도 path 기준으로 맞춘다", async () => {
    // createSignedUrls는 입력 순서를 보장하지 않는다. 인덱스로 짝지으면 배경과 말풍선이 뒤바뀐다.
    const { client } = createClientStub({
      data: [
        { path: paths[1], signedUrl: "https://signed/bubble" },
        { path: paths[0], signedUrl: "https://signed/bg" },
      ],
    });

    await expect(createAdminThemeAssetSignedUrls(client, paths)).resolves.toEqual({
      [paths[0]]: "https://signed/bg",
      [paths[1]]: "https://signed/bubble",
    });
  });

  it("중복 경로는 한 번만 요청한다", async () => {
    const { client, createSignedUrls } = createClientStub({ data: [{ path: paths[0], signedUrl: "https://signed/bg" }] });

    await createAdminThemeAssetSignedUrls(client, [paths[0], paths[0], ""]);

    expect(createSignedUrls).toHaveBeenCalledWith([paths[0]], themeAssetSignedUrlTtlSeconds);
  });

  it("일부 URL이 비면 오류로 취급한다", async () => {
    // 조용히 빠지면 그 role만 빠진 반쪽 썸네일이 구워져 덮어써진다.
    const { client } = createClientStub({
      data: [
        { path: paths[0], signedUrl: "https://signed/bg" },
        { path: paths[1], signedUrl: null },
      ],
    });

    await expect(createAdminThemeAssetSignedUrls(client, paths)).rejects.toThrow(paths[1]);
  });

  it("Storage 오류를 그대로 던진다", async () => {
    const { client } = createClientStub({ error: { message: "permission denied" } });

    await expect(createAdminThemeAssetSignedUrls(client, paths)).rejects.toMatchObject({ message: "permission denied" });
  });

  it("경로가 없으면 요청하지 않는다", async () => {
    const { client, createSignedUrls } = createClientStub({ data: [] });

    await expect(createAdminThemeAssetSignedUrls(client, [])).resolves.toEqual({});
    expect(createSignedUrls).not.toHaveBeenCalled();
  });
});
