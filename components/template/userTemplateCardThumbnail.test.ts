import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { UserTemplateRecord } from "@/lib/theme/userTemplates";

const generateSystemTemplateThumbnail = vi.fn();
vi.mock("@/lib/theme/systemTemplates/thumbnail", () => ({
  generateSystemTemplateThumbnail: (...args: unknown[]) => generateSystemTemplateThumbnail(...args),
}));

const { clearUserTemplateCardThumbnailCache, getUserTemplateCardThumbnailBlob } = await import(
  "@/components/template/userTemplateCardThumbnail"
);

function makeRecord(overrides: Partial<UserTemplateRecord> = {}): UserTemplateRecord {
  return {
    id: "template-1",
    name: "내 템플릿",
    templateId: "base",
    platform: "android",
    createdAt: 1,
    updatedAt: 100,
    colors: {},
    uploads: {},
    candidateSelections: {},
    bubbleEdits: {},
    ...overrides,
  } as UserTemplateRecord;
}

beforeEach(() => {
  clearUserTemplateCardThumbnailCache();
  generateSystemTemplateThumbnail.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

/**
 * 갤러리는 진입할 때마다 로컬 템플릿 전부를 렌더→canvas→인코딩에 태운다. 저장하지 않은 템플릿까지
 * 다시 굽는 비용이 모바일에서 그대로 드러나므로, `updatedAt`이 그대로면 다시 굽지 않는 것을 고정한다.
 */
describe("getUserTemplateCardThumbnailBlob", () => {
  it("같은 updatedAt이면 다시 굽지 않는다", async () => {
    const blob = new Blob(["a"]);
    generateSystemTemplateThumbnail.mockResolvedValue(blob);

    await expect(getUserTemplateCardThumbnailBlob(makeRecord())).resolves.toBe(blob);
    await expect(getUserTemplateCardThumbnailBlob(makeRecord())).resolves.toBe(blob);

    expect(generateSystemTemplateThumbnail).toHaveBeenCalledTimes(1);
  });

  it("저장으로 updatedAt이 바뀌면 다시 굽는다", async () => {
    const stale = new Blob(["stale"]);
    const fresh = new Blob(["fresh"]);
    generateSystemTemplateThumbnail.mockResolvedValueOnce(stale).mockResolvedValueOnce(fresh);

    await expect(getUserTemplateCardThumbnailBlob(makeRecord())).resolves.toBe(stale);
    await expect(getUserTemplateCardThumbnailBlob(makeRecord({ updatedAt: 200 }))).resolves.toBe(fresh);

    expect(generateSystemTemplateThumbnail).toHaveBeenCalledTimes(2);
  });

  it("동시에 요청해도 한 번만 굽는다", async () => {
    // 최근 작업 카드와 목록 카드가 같은 레코드를 동시에 요구할 수 있다.
    const blob = new Blob(["a"]);
    generateSystemTemplateThumbnail.mockResolvedValue(blob);

    const [first, second] = await Promise.all([
      getUserTemplateCardThumbnailBlob(makeRecord()),
      getUserTemplateCardThumbnailBlob(makeRecord()),
    ]);

    expect(first).toBe(blob);
    expect(second).toBe(blob);
    expect(generateSystemTemplateThumbnail).toHaveBeenCalledTimes(1);
  });

  it("실패는 캐시하지 않아 다음 진입에서 다시 시도한다", async () => {
    const blob = new Blob(["a"]);
    vi.spyOn(console, "error").mockImplementation(() => {});
    generateSystemTemplateThumbnail.mockRejectedValueOnce(new Error("decode failed")).mockResolvedValueOnce(blob);

    await expect(getUserTemplateCardThumbnailBlob(makeRecord())).resolves.toBeNull();
    await expect(getUserTemplateCardThumbnailBlob(makeRecord())).resolves.toBe(blob);

    expect(generateSystemTemplateThumbnail).toHaveBeenCalledTimes(2);
  });
});
