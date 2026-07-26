import { describe, expect, it } from "vitest";
import {
  exportFailureReasons,
  getExportFailureReasonFromStatus,
  isExportFailureReason,
  isNetworkError,
  toExportFailureReason,
} from "@/lib/theme/export/failureReason";

describe("isExportFailureReason", () => {
  it("허용 목록의 코드만 통과시킨다", () => {
    expect(isExportFailureReason("insufficient_credits")).toBe(true);
    expect(isExportFailureReason("android_build_failed")).toBe(true);
    expect(isExportFailureReason("made_up_code")).toBe(false);
  });

  it("문자열이 아닌 값을 거부한다", () => {
    expect(isExportFailureReason(undefined)).toBe(false);
    expect(isExportFailureReason(null)).toBe(false);
    expect(isExportFailureReason(402)).toBe(false);
    expect(isExportFailureReason({ reason: "insufficient_credits" })).toBe(false);
  });
});

describe("toExportFailureReason", () => {
  it("허용된 서버 reason은 그대로 유지한다", () => {
    expect(toExportFailureReason("enqueue_failed", "unknown")).toBe("enqueue_failed");
  });

  it("허용 목록에 없는 값은 fallback으로 접는다", () => {
    // Cloud Run 빌더는 error.name에서 코드를 만들어내므로 임의 문자열이 올라올 수 있다.
    expect(toExportFailureReason("TypeError", "android_build_failed")).toBe("android_build_failed");
    expect(toExportFailureReason("", "unknown")).toBe("unknown");
  });

  it("사용자 입력이나 원문 메시지가 분석 값으로 새지 않는다", () => {
    expect(toExportFailureReason("내보내기에 실패했습니다.", "unknown")).toBe("unknown");
    expect(toExportFailureReason("my-photo.png", "unknown")).toBe("unknown");
    expect(toExportFailureReason("user@example.com", "unknown")).toBe("unknown");
  });
});

describe("getExportFailureReasonFromStatus", () => {
  it("과금·인증 관련 상태를 구분한다", () => {
    expect(getExportFailureReasonFromStatus(401)).toBe("unauthenticated");
    expect(getExportFailureReasonFromStatus(402)).toBe("insufficient_credits");
    expect(getExportFailureReasonFromStatus(409)).toBe("export_already_in_progress");
    expect(getExportFailureReasonFromStatus(413)).toBe("payload_too_large");
  });

  it("나머지는 요청 오류와 서버 오류로 나눈다", () => {
    expect(getExportFailureReasonFromStatus(400)).toBe("invalid_request");
    expect(getExportFailureReasonFromStatus(404)).toBe("invalid_request");
    expect(getExportFailureReasonFromStatus(500)).toBe("server_error");
    expect(getExportFailureReasonFromStatus(502)).toBe("server_error");
  });

  it("실패가 아닌 상태에는 unknown을 쓴다", () => {
    expect(getExportFailureReasonFromStatus(200)).toBe("unknown");
  });
});

describe("isNetworkError", () => {
  it("fetch 자체 실패만 네트워크 오류로 본다", () => {
    expect(isNetworkError(new TypeError("Failed to fetch"))).toBe(true);
    expect(isNetworkError(new Error("내보내기에 실패했습니다."))).toBe(false);
    expect(isNetworkError("offline")).toBe(false);
  });
});

describe("exportFailureReasons", () => {
  it("중복 없는 고정 목록이다", () => {
    expect(new Set(exportFailureReasons).size).toBe(exportFailureReasons.length);
  });
});
