import { describe, expect, it } from "vitest";
import {
  androidExportOutputRetentionMs,
  getExportDownloadExpiresAt,
  getExportDownloadState,
} from "@/lib/theme/android/outputRetention";

const completedAt = "2026-07-20T00:00:00.000Z";
const completedMs = Date.parse(completedAt);
const day = 24 * 60 * 60 * 1000;

function androidJob(overrides: Partial<Parameters<typeof getExportDownloadState>[0]> = {}) {
  return { platform: "android", status: "succeeded", completedAt, createdAt: completedAt, ...overrides };
}

describe("getExportDownloadState", () => {
  it("보관 기간 안이면 다시 받을 수 있다", () => {
    expect(getExportDownloadState(androidJob(), completedMs + day)).toBe("available");
    expect(getExportDownloadState(androidJob(), completedMs + androidExportOutputRetentionMs - 1)).toBe("available");
  });

  it("보관 기간이 지나면 만료로 본다", () => {
    expect(getExportDownloadState(androidJob(), completedMs + androidExportOutputRetentionMs)).toBe("expired");
    expect(getExportDownloadState(androidJob(), completedMs + 8 * day)).toBe("expired");
  });

  it("완료되지 않았거나 실패한 작업은 대상이 아니다", () => {
    expect(getExportDownloadState(androidJob({ status: "pending" }), completedMs)).toBe("unavailable");
    expect(getExportDownloadState(androidJob({ status: "failed" }), completedMs)).toBe("unavailable");
  });

  it("iOS는 서버에 보관본이 없어 다시 받기를 약속하지 않는다", () => {
    expect(getExportDownloadState(androidJob({ platform: "ios" }), completedMs + day)).toBe("unsupported");
  });

  it("completed_at이 없으면 created_at으로 보수적으로 판단한다", () => {
    const createdAt = new Date(completedMs - 2 * day).toISOString();
    const job = { platform: "android", status: "succeeded", completedAt: null, createdAt };
    // 만료 시각은 created_at + 7일 = completedMs + 5일이라, 완료 시각 기준보다 2일 일찍 닫힌다.
    expect(getExportDownloadState(job, completedMs + 5 * day - 1)).toBe("available");
    expect(getExportDownloadState(job, completedMs + 5 * day)).toBe("expired");
  });

  it("시각을 해석할 수 없으면 다시 받기를 제안하지 않는다", () => {
    expect(getExportDownloadState(androidJob({ completedAt: "not-a-date", createdAt: "not-a-date" }), completedMs)).toBe("unavailable");
  });
});

describe("getExportDownloadExpiresAt", () => {
  it("완료 시각에 보관 기간을 더한다", () => {
    expect(getExportDownloadExpiresAt(androidJob())).toBe(completedMs + androidExportOutputRetentionMs);
  });

  it("해석할 수 없는 시각은 null이다", () => {
    expect(getExportDownloadExpiresAt(androidJob({ completedAt: "", createdAt: "" }))).toBeNull();
  });
});
