import { afterEach, describe, expect, it, vi } from "vitest";
import { bubbleEditorHelpHint, hasSeenHint, markHintSeen } from "@/lib/shared/hintStorage";

afterEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe("hintStorage", () => {
  it("표시하기 전에는 아직 안 본 상태다", () => {
    expect(hasSeenHint(bubbleEditorHelpHint)).toBe(false);
  });

  it("한 번 표시하면 이후로는 본 상태가 된다", () => {
    markHintSeen(bubbleEditorHelpHint);
    expect(hasSeenHint(bubbleEditorHelpHint)).toBe(true);
  });

  it("안내마다 따로 기록한다", () => {
    markHintSeen(bubbleEditorHelpHint);
    expect(hasSeenHint("other-hint")).toBe(false);
  });

  it("버전이 붙은 네임스페이스 키를 쓴다", () => {
    markHintSeen(bubbleEditorHelpHint);
    expect(window.localStorage.getItem("talktheme:hint:bubble-editor-help:v1")).toBe("1");
  });

  // 프라이버시 확장이 localStorage를 막아도 편집기가 죽으면 안 된다.
  it("저장이 막히면 조용히 넘어가고 안 본 상태로 남는다", () => {
    vi.spyOn(window.localStorage, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(window.localStorage, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });

    expect(() => markHintSeen(bubbleEditorHelpHint)).not.toThrow();
    expect(hasSeenHint(bubbleEditorHelpHint)).toBe(false);
  });
});
