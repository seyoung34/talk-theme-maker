import { describe, expect, it } from "vitest";
import { persistenceNotice } from "@/lib/theme/project/persistenceNotice";

describe("persistenceNotice", () => {
  it("계정 보관과 브라우저 보관, 서버 전송 범위를 구분한다", () => {
    expect(persistenceNotice.browserDetailed).toContain("현재 브라우저");
    expect(persistenceNotice.browserDetailed).toContain("자동 동기화되지 않습니다");
    expect(persistenceNotice.accountDetailed).toContain("크레딧과 내보내기 이력");
    expect(persistenceNotice.exportTemporary).toContain("서버로 일시 전송");
  });
});
