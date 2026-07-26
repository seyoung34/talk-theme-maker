import type { Page } from "@playwright/test";
import type { AccountExportDto, AccountMeResponse } from "@/lib/billing/apiTypes";
import { androidExportOutputRetentionMs } from "@/lib/theme/android/outputRetention";

/**
 * `/account`는 순수 클라이언트 컴포넌트이고 `/api/me`와 `/api/export/android/download`만 읽는다.
 * 그래서 로그인 계정·실제 export job·GCS 객체 없이 네트워크 계층만 갈아끼우면 화면 계약을 검증할 수 있다.
 *
 * 이 모킹이 덮는 것: 상태별 행 표시, 버튼 노출 조건, 재발급 요청, 만료 응답 처리.
 * 덮지 못하는 것: 서버의 소유권 검사(404)와 객체 존재 확인(410). 라우트 핸들러 쪽 검증이 따로 필요하다.
 */
export const day = 24 * 60 * 60 * 1000;

export function isoAgo(ms: number) {
  return new Date(Date.now() - ms).toISOString();
}

export function createExportJob(overrides: Partial<AccountExportDto> & Pick<AccountExportDto, "id">): AccountExportDto {
  return {
    platform: "android",
    export_mode: "apk",
    status: "succeeded",
    credit_cost: 1,
    created_at: isoAgo(day),
    completed_at: isoAgo(day),
    ...overrides,
  };
}

/** 보관 기간이 확실히 지난 완료 작업. 경계값에 붙지 않도록 하루 더 밀어 둔다. */
export function expiredExportJob(overrides: Partial<AccountExportDto> & Pick<AccountExportDto, "id">): AccountExportDto {
  const completedAt = isoAgo(androidExportOutputRetentionMs + day);
  return createExportJob({ created_at: completedAt, completed_at: completedAt, ...overrides });
}

export function createMeResponse(exports: AccountExportDto[], credits = 3): AccountMeResponse {
  return {
    user: { id: "e2e-user", email: "e2e@example.com" },
    profile: { email: "e2e@example.com", display_name: "E2E 사용자", provider: "email" },
    credits,
    isAdmin: false,
    exports,
  };
}

/**
 * `/api/me`를 고정 응답으로 바꾼다. 호출 횟수를 셀 수 있게 카운터를 돌려준다
 * (`다시 받기` 실패 후 목록을 다시 읽는지 확인하는 데 쓴다).
 */
export async function mockAccountMe(page: Page, getResponse: () => AccountMeResponse) {
  const state = { calls: 0 };
  await page.route("**/api/me", async (route) => {
    state.calls += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(getResponse()),
    });
  });
  return state;
}
