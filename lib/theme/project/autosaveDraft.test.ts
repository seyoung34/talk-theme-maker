import { beforeEach, describe, expect, it } from "vitest";
import {
  autosaveDraftId,
  autosaveDraftTtlMs,
  clearAutosaveDraft,
  describeAutosaveDraft,
  isQuotaExceeded,
  isStaleWrite,
  readAutosaveDraft,
  writeAutosaveDraft,
  type EditorAutosaveDraft,
  type EditorAutosaveInput,
} from "@/lib/theme/project/autosaveDraft";
import { createEmptyThemeDraft } from "@/lib/theme/project/draft";
import { themeDatabaseStores, withThemeDatabaseStore } from "@/lib/theme/localDatabase";

function createInput(overrides: Partial<EditorAutosaveInput> = {}): EditorAutosaveInput {
  return {
    mode: "user",
    source: { templateId: "basic", platform: "android", templateName: "기본 테마" },
    editor: { activeSection: "main", activeGroup: "background" },
    draft: createEmptyThemeDraft(),
    ...overrides,
  };
}

function createDraftWithUpload(uploadId: string) {
  const draft = createEmptyThemeDraft();
  draft.uploads = { "slot-a": [{ id: uploadId, file: new File([new Uint8Array(4)], "bg.png", { type: "image/png" }), source: "user" }] };
  draft.colors = { "slot-b": "#ff0000" };
  return draft;
}

beforeEach(async () => {
  await clearAutosaveDraft("user");
  await clearAutosaveDraft("admin");
});

describe("writeAutosaveDraft / readAutosaveDraft", () => {
  it("저장한 초안의 구조와 업로드 항목을 되읽는다", async () => {
    const result = await writeAutosaveDraft(createInput({ draft: createDraftWithUpload("slot-a:upload:1") }), null);
    expect(result.status).toBe("saved");

    const record = await readAutosaveDraft("user");
    expect(record?.source.templateName).toBe("기본 테마");
    expect(record?.draft.colors["slot-b"]).toBe("#ff0000");
    expect(record?.draft.uploads["slot-a"]?.[0]?.id).toBe("slot-a:upload:1");
    expect(record?.draft.uploads["slot-a"]?.[0]?.file.name).toBe("bg.png");
    // 파일 바이트까지 그대로 살아 돌아오는지는 브라우저의 structured clone 보장이다.
    // fake-indexeddb는 File을 메타데이터만 가진 객체로 낮추므로 여기서는 검증할 수 없고, 실기기 QA로 남긴다.
  });

  it("저장한 적이 없으면 null을 돌려준다", async () => {
    expect(await readAutosaveDraft("user")).toBeNull();
  });

  it("user와 admin 모드를 격리한다", async () => {
    await writeAutosaveDraft(createInput({ source: { templateId: "basic", platform: "android", templateName: "사용자" } }), null);
    expect((await readAutosaveDraft("user"))?.source.templateName).toBe("사용자");
    expect(await readAutosaveDraft("admin")).toBeNull();
  });

  it("만료된 레코드는 읽을 때 정리하고 null을 돌려준다", async () => {
    const expired: EditorAutosaveDraft = {
      ...createInput(),
      id: autosaveDraftId("user"),
      version: 1,
      createdAt: Date.now() - autosaveDraftTtlMs * 2,
      updatedAt: Date.now() - autosaveDraftTtlMs * 2,
      expiresAt: Date.now() - 1000,
    };
    await withThemeDatabaseStore(themeDatabaseStores.editorAutosaveDrafts, "readwrite", (store) => store.put(expired));

    expect(await readAutosaveDraft("user")).toBeNull();
    // 정리까지 끝나야 다음 진입에서 다시 묻지 않는다.
    const raw = await withThemeDatabaseStore<EditorAutosaveDraft | undefined>(
      themeDatabaseStores.editorAutosaveDrafts,
      "readonly",
      (store) => store.get(autosaveDraftId("user")),
    );
    expect(raw).toBeUndefined();
  });

  it("clearAutosaveDraft 후에는 읽히지 않는다", async () => {
    await writeAutosaveDraft(createInput(), null);
    await clearAutosaveDraft("user");
    expect(await readAutosaveDraft("user")).toBeNull();
  });

  it("다시 저장하면 createdAt은 유지하고 updatedAt만 갱신한다", async () => {
    const first = await writeAutosaveDraft(createInput(), null);
    if (first.status !== "saved") throw new Error("첫 저장이 실패했다");
    const createdAt = first.record.createdAt;

    await new Promise((resolve) => setTimeout(resolve, 5));
    const second = await writeAutosaveDraft(createInput(), first.record.updatedAt);
    expect(second.status).toBe("saved");

    const record = await readAutosaveDraft("user");
    expect(record?.createdAt).toBe(createdAt);
    expect(record?.updatedAt).toBeGreaterThanOrEqual(createdAt);
  });
});

describe("다중 탭 충돌", () => {
  it("다른 탭이 먼저 저장했으면 덮어쓰지 않고 stale을 돌려준다", async () => {
    const other = await writeAutosaveDraft(createInput({ source: { templateId: "basic", platform: "android", templateName: "다른 탭" } }), null);
    if (other.status !== "saved") throw new Error("사전 저장이 실패했다");

    // 이 탭은 레코드가 없던 시점의 기준선을 들고 있다.
    const mine = await writeAutosaveDraft(createInput({ source: { templateId: "basic", platform: "android", templateName: "내 탭" } }), null);
    expect(mine.status).toBe("stale");

    // 먼저 저장한 쪽이 살아남아야 한다.
    expect((await readAutosaveDraft("user"))?.source.templateName).toBe("다른 탭");
  });

  it("기준선이 어긋나면 stale로 막는다", async () => {
    const first = await writeAutosaveDraft(createInput({ source: { templateId: "basic", platform: "android", templateName: "최신" } }), null);
    if (first.status !== "saved") throw new Error("첫 저장이 실패했다");

    const stale = await writeAutosaveDraft(
      createInput({ source: { templateId: "basic", platform: "android", templateName: "오래된 탭" } }),
      first.record.updatedAt - 1,
    );
    expect(stale.status).toBe("stale");
    expect((await readAutosaveDraft("user"))?.source.templateName).toBe("최신");
  });
});

describe("describeAutosaveDraft", () => {
  function createRecord(draft: EditorAutosaveDraft["draft"]): EditorAutosaveDraft {
    return { ...createInput({ draft }), id: autosaveDraftId("user"), version: 1, createdAt: 0, updatedAt: 0, expiresAt: 0 };
  }

  it("업로드·색상·말풍선 편집 개수를 센다", () => {
    const draft = createEmptyThemeDraft();
    draft.uploads = {
      "slot-a": [
        { id: "u1", file: new File([], "a.png"), source: "user" },
        { id: "u2", file: new File([], "b.png"), source: "user" },
      ],
      "slot-b": [{ id: "u3", file: new File([], "c.png"), source: "user" }],
    };
    draft.colors = { "slot-c": "#fff", "slot-d": undefined };
    draft.bubbleInsets = { "slot-e": { top: 1, right: 1, bottom: 1, left: 1 } };
    draft.bubbleStretch = { "slot-e": { x: 1, y: 1 } };

    expect(describeAutosaveDraft(createRecord(draft))).toEqual({ uploadCount: 3, colorCount: 1, bubbleEditCount: 1 });
  });

  it("같은 슬롯의 여러 말풍선 편집값을 한 번만 센다", () => {
    const draft = createEmptyThemeDraft();
    draft.bubbleMarkers = { "slot-a": { top: { start: 0, end: 1 }, left: { start: 0, end: 1 }, right: { start: 0, end: 1 }, bottom: { start: 0, end: 1 } } };
    draft.bubbleInsets = { "slot-a": { top: 1, right: 1, bottom: 1, left: 1 }, "slot-b": { top: 2, right: 2, bottom: 2, left: 2 } };

    expect(describeAutosaveDraft(createRecord(draft)).bubbleEditCount).toBe(2);
  });

  it("빈 초안은 모두 0이다", () => {
    expect(describeAutosaveDraft(createRecord(createEmptyThemeDraft()))).toEqual({ uploadCount: 0, colorCount: 0, bubbleEditCount: 0 });
  });
});

describe("isStaleWrite", () => {
  const record = { updatedAt: 100 } as EditorAutosaveDraft;

  it("레코드가 없으면 언제나 쓸 수 있다", () => {
    expect(isStaleWrite(undefined, null)).toBe(false);
    expect(isStaleWrite(undefined, 100)).toBe(false);
  });

  it("없어야 할 레코드가 있으면 막는다", () => {
    expect(isStaleWrite(record, null)).toBe(true);
  });

  it("기준선이 같을 때만 통과시킨다", () => {
    expect(isStaleWrite(record, 100)).toBe(false);
    expect(isStaleWrite(record, 99)).toBe(true);
  });
});

describe("isQuotaExceeded", () => {
  it("QuotaExceededError만 용량 초과로 본다", () => {
    expect(isQuotaExceeded({ name: "QuotaExceededError" })).toBe(true);
    expect(isQuotaExceeded({ name: "AbortError" })).toBe(false);
    expect(isQuotaExceeded(new Error("boom"))).toBe(false);
    expect(isQuotaExceeded(null)).toBe(false);
  });
});
