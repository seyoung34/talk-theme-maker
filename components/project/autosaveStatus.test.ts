import { describe, expect, it } from "vitest";
import { formatRelativeSavedAt, getAutosaveStatusLabel } from "@/components/project/autosaveStatus";

const now = new Date("2026-07-26T12:00:00Z").getTime();
const minute = 60_000;

describe("formatRelativeSavedAt", () => {
  it("1분 미만은 방금으로 표기한다", () => {
    expect(formatRelativeSavedAt(now, now)).toBe("방금");
    expect(formatRelativeSavedAt(now - 59_000, now)).toBe("방금");
  });

  it("한 시간 미만은 분 단위로 표기한다", () => {
    expect(formatRelativeSavedAt(now - minute, now)).toBe("1분 전");
    expect(formatRelativeSavedAt(now - 59 * minute, now)).toBe("59분 전");
  });

  it("하루 미만은 시간 단위로 표기한다", () => {
    expect(formatRelativeSavedAt(now - 60 * minute, now)).toBe("1시간 전");
    expect(formatRelativeSavedAt(now - 23 * 60 * minute, now)).toBe("23시간 전");
  });

  it("하루 이상은 일 단위로 표기한다", () => {
    expect(formatRelativeSavedAt(now - 24 * 60 * minute, now)).toBe("1일 전");
    expect(formatRelativeSavedAt(now - 7 * 24 * 60 * minute, now)).toBe("7일 전");
  });

  it("시계가 어긋나 미래 시각이 들어와도 음수를 보여주지 않는다", () => {
    expect(formatRelativeSavedAt(now + 5 * minute, now)).toBe("방금");
  });
});

describe("getAutosaveStatusLabel", () => {
  it("상태별 문구를 돌려준다", () => {
    expect(getAutosaveStatusLabel("saving", null, now)).toBe("저장 중");
    expect(getAutosaveStatusLabel("saved", now - 2 * minute, now)).toBe("저장됨 · 2분 전");
    expect(getAutosaveStatusLabel("error", null, now)).toBe("자동 저장 실패");
    expect(getAutosaveStatusLabel("conflict", null, now)).toBe("다른 탭에서 편집 중");
  });

  it("아직 저장한 적 없으면 아무것도 표시하지 않는다", () => {
    expect(getAutosaveStatusLabel("idle", null, now)).toBeNull();
  });

  it("저장 시각을 모르면 시각 없이 표기한다", () => {
    expect(getAutosaveStatusLabel("saved", null, now)).toBe("저장됨");
  });
});
