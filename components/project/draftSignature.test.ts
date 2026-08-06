import { describe, expect, it } from "vitest";
import { createEditorSignature, createThemeDraftSignature } from "@/components/project/draftSignature";
import { autoMainPaletteCandidateId } from "@/lib/theme/autoColor";
import { createEmptyThemeDraft, type EditorSystemTemplateMetadata, type ThemeDraft } from "@/lib/theme/project/draft";

function createFile(name: string, size = 3) {
  return new File([new Uint8Array(size)], name, { type: "image/png", lastModified: 1_700_000_000_000 });
}

function withUpload(draft: ThemeDraft, slotId: string, uploadId: string): ThemeDraft {
  return { ...draft, uploads: { ...draft.uploads, [slotId]: [{ id: uploadId, file: createFile(`${uploadId}.png`), source: "user" }] } };
}

describe("createThemeDraftSignature", () => {
  it("같은 내용이면 같은 서명을 만든다", () => {
    const draft = withUpload(createEmptyThemeDraft(), "slot-a", "slot-a:upload:1");
    const same = withUpload(createEmptyThemeDraft(), "slot-a", "slot-a:upload:1");
    expect(createThemeDraftSignature(draft)).toBe(createThemeDraftSignature(same));
  });

  it("키 삽입 순서가 달라도 같은 서명을 유지한다", () => {
    // 초안은 스프레드와 delete로 갱신되므로 같은 내용이라도 키 순서가 흔들린다.
    const first = { ...createEmptyThemeDraft(), colors: { b: "#111111", a: "#000000" } };
    const second = { ...createEmptyThemeDraft(), colors: { a: "#000000", b: "#111111" } };
    expect(createThemeDraftSignature(first)).toBe(createThemeDraftSignature(second));
  });

  it("업로드 추가를 변경으로 잡는다", () => {
    const before = createEmptyThemeDraft();
    const after = withUpload(before, "slot-a", "slot-a:upload:1");
    expect(createThemeDraftSignature(after)).not.toBe(createThemeDraftSignature(before));
  });

  it("업로드 교체를 변경으로 잡는다", () => {
    const before = withUpload(createEmptyThemeDraft(), "slot-a", "slot-a:upload:1");
    const after = withUpload(createEmptyThemeDraft(), "slot-a", "slot-a:edited:2");
    expect(createThemeDraftSignature(after)).not.toBe(createThemeDraftSignature(before));
  });

  it("업로드 삭제를 변경으로 잡는다", () => {
    const before = withUpload(createEmptyThemeDraft(), "slot-a", "slot-a:upload:1");
    const after = createEmptyThemeDraft();
    expect(createThemeDraftSignature(after)).not.toBe(createThemeDraftSignature(before));
  });

  it("색상 변경을 잡는다", () => {
    const before = createEmptyThemeDraft();
    const after = { ...before, colors: { "slot-a": "#ff0000" } };
    expect(createThemeDraftSignature(after)).not.toBe(createThemeDraftSignature(before));
  });

  it("자동 색상 분석 결과는 사용자 변경으로 세지 않지만 수동값은 잡는다", () => {
    const before = {
      ...createEmptyThemeDraft(),
      candidateSelections: { "auto-slot": autoMainPaletteCandidateId },
      colors: { "auto-slot": "#111111" },
    };
    const automaticUpdate = { ...before, colors: { "auto-slot": "#FFFFFF" } };
    const manualUpdate = { ...automaticUpdate, candidateSelections: { "auto-slot": "auto-slot:base" } };

    expect(createThemeDraftSignature(automaticUpdate)).toBe(createThemeDraftSignature(before));
    expect(createThemeDraftSignature(manualUpdate)).not.toBe(createThemeDraftSignature(before));
  });

  it("후보 선택 변경을 잡는다", () => {
    const before = { ...createEmptyThemeDraft(), candidateSelections: { "slot-a": "candidate-1" } };
    const after = { ...before, candidateSelections: { "slot-a": "candidate-2" } };
    expect(createThemeDraftSignature(after)).not.toBe(createThemeDraftSignature(before));
  });

  it("말풍선 편집값 변경을 잡는다", () => {
    const before = createEmptyThemeDraft();
    expect(createThemeDraftSignature({ ...before, bubbleInsets: { "slot-a": { left: 1, right: 2, top: 3, bottom: 4 } } })).not.toBe(createThemeDraftSignature(before));
    expect(createThemeDraftSignature({ ...before, bubbleStretch: { "slot-a": { x: 5, y: 6 } } })).not.toBe(createThemeDraftSignature(before));
    const markers = { top: { start: 1, end: 2 }, left: { start: 3, end: 4 }, right: { start: 5, end: 6 }, bottom: { start: 7, end: 8 } };
    expect(createThemeDraftSignature({ ...before, bubbleMarkers: { "slot-a": markers } })).not.toBe(createThemeDraftSignature(before));
  });

  it("좌우반전 토글을 잡는다", () => {
    // 반전은 이제 새 업로드를 만들지 않으므로, 서명이 잡지 못하면 자동 저장도 이탈 경고도
    // 반전만 한 편집을 놓친다.
    const before = createEmptyThemeDraft();
    const after = { ...before, bubbleFlipX: { "slot-a": true } };
    expect(createThemeDraftSignature(after)).not.toBe(createThemeDraftSignature(before));
    // 껐다 켜면 원래 서명으로 돌아온다.
    expect(createThemeDraftSignature({ ...after, bubbleFlipX: {} })).toBe(createThemeDraftSignature(before));
  });

  it("중첩 값의 키 순서 차이는 변경으로 보지 않는다", () => {
    const base = createEmptyThemeDraft();
    const first = { ...base, bubbleInsets: { "slot-a": { left: 1, right: 2, top: 3, bottom: 4 } } };
    const second = { ...base, bubbleInsets: { "slot-a": { bottom: 4, top: 3, right: 2, left: 1 } } };
    expect(createThemeDraftSignature(first)).toBe(createThemeDraftSignature(second));
  });

  it("장식 원본 파일 교체를 잡는다", () => {
    const before = { ...createEmptyThemeDraft(), bubbleDecorationSources: { "layer-1": createFile("heart.png", 3) } };
    const after = { ...createEmptyThemeDraft(), bubbleDecorationSources: { "layer-1": createFile("heart.png", 9) } };
    expect(createThemeDraftSignature(after)).not.toBe(createThemeDraftSignature(before));
  });

  it("빈 초안은 안정적인 서명을 만든다", () => {
    expect(createThemeDraftSignature(createEmptyThemeDraft())).toBe(createThemeDraftSignature(createEmptyThemeDraft()));
  });
});

describe("원격 에셋 hydration", () => {
  function withTemplateUpload(draft: ThemeDraft, slotId: string, uploadId: string): ThemeDraft {
    return {
      ...draft,
      uploads: { ...draft.uploads, [slotId]: [{ id: uploadId, file: createFile(`${uploadId}.png`), source: "template" }] },
    };
  }

  it("배경에서 채워진 템플릿 에셋은 변경으로 세지 않는다", () => {
    // 시스템 템플릿은 미리보기용 몇 개만 먼저 받고 나머지를 나중에 채운다.
    // 이걸 변경으로 보면 사용자가 아무것도 안 했는데 이탈 경고가 뜨고 자동 저장이 돈다.
    const beforeHydration = createEmptyThemeDraft();
    const afterHydration = withTemplateUpload(beforeHydration, "slot-a", "remote:1");
    expect(createThemeDraftSignature(afterHydration)).toBe(createThemeDraftSignature(beforeHydration));
  });

  it("이미 채워진 슬롯에 에셋이 더 붙어도 변경이 아니다", () => {
    const first = withTemplateUpload(createEmptyThemeDraft(), "slot-a", "remote:1");
    const second = withTemplateUpload(first, "slot-b", "remote:2");
    expect(createThemeDraftSignature(second)).toBe(createThemeDraftSignature(first));
  });

  it("같은 슬롯에 사용자가 올린 이미지는 여전히 변경으로 잡는다", () => {
    const hydrated = withTemplateUpload(createEmptyThemeDraft(), "slot-a", "remote:1");
    const edited = {
      ...hydrated,
      uploads: { "slot-a": [...(hydrated.uploads["slot-a"] ?? []), { id: "slot-a:upload:1", file: createFile("mine.png"), source: "user" as const }] },
    };
    expect(createThemeDraftSignature(edited)).not.toBe(createThemeDraftSignature(hydrated));
  });

  it("관리 에셋 선택은 사용자 편집이므로 변경으로 잡는다", () => {
    const before = createEmptyThemeDraft();
    const after = { ...before, uploads: { "slot-a": [{ id: "admin-asset-1", file: createFile("admin.png"), source: "admin" as const }] } };
    expect(createThemeDraftSignature(after)).not.toBe(createThemeDraftSignature(before));
  });

  it("어떤 원격 에셋을 쓰는지 바뀌면 변경으로 잡는다", () => {
    const before = createEmptyThemeDraft();
    const after = { ...before, remoteUploadRefs: { "slot-a": [{ id: "remote:1", fileName: "a.png", mimeType: "image/png", size: 1, storagePath: "p/a.png" }] } };
    expect(createThemeDraftSignature(after)).not.toBe(createThemeDraftSignature(before));
  });
});

describe("createEditorSignature", () => {
  const metadata: EditorSystemTemplateMetadata = {
    title: "봄 테마",
    description: "",
    tags: "",
    status: "draft",
    visibility: "private",
    pricingType: "free",
    priceAmount: "",
    creditCost: "",
  };

  it("관리자 메타데이터만 바뀌어도 변경으로 잡는다", () => {
    const draft = createEmptyThemeDraft();
    expect(createEditorSignature(draft, { ...metadata, title: "여름 테마" })).not.toBe(createEditorSignature(draft, metadata));
    expect(createEditorSignature(draft, { ...metadata, pricingType: "credit", creditCost: "3" })).not.toBe(createEditorSignature(draft, metadata));
  });

  it("메타데이터가 없는 일반 사용자 화면에서는 초안만 반영한다", () => {
    const draft = createEmptyThemeDraft();
    expect(createEditorSignature(draft, null)).toBe(createEditorSignature(draft, null));
    expect(createEditorSignature(draft, null)).not.toBe(createEditorSignature(draft, metadata));
  });

  it("초안 변경도 그대로 반영한다", () => {
    const before = createEmptyThemeDraft();
    const after = { ...before, colors: { "slot-a": "#ff0000" } };
    expect(createEditorSignature(after, metadata)).not.toBe(createEditorSignature(before, metadata));
  });
});
