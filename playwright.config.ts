import { defineConfig, devices } from "@playwright/test";

/**
 * E2E 실행 환경.
 *
 * 이 스위트는 **Supabase 설정을 비운 채로** 빌드·기동한다. 목적은 두 가지다.
 *
 * 1. 결정성. 시스템 템플릿 목록·계정·크레딧이 원격 DB 상태에 따라 달라지면 테스트가 환경을 검증하게 된다.
 * 2. 안전. 개발자의 `.env.local`은 운영 Supabase를 가리킨다. E2E가 실수로 그쪽에 쓰거나 크레딧을
 *    소모하는 경로를 만들지 않는다.
 *
 * 로그인이 필요한 화면(`/account` 등)은 클라이언트 컴포넌트가 `/api/*`만 읽으므로 네트워크 모킹으로
 * 계약을 검증한다. 서버 측 소유권·만료 판정은 이 스위트의 범위가 아니다(라우트 핸들러 테스트 영역).
 *
 * `@next/env`는 이미 값이 있는 키(빈 문자열 포함)를 `.env.local`로 덮어쓰지 않는다. 그래서 아래처럼
 * 빈 문자열을 넘기면 개발자의 실제 설정이 새어 들어오지 않는다.
 *
 * 주의: 이 빌드는 기본 `.next`를 덮는다. 별도 `distDir`로 분리해 봤지만 Next가 `next-env.d.ts`와
 * `tsconfig.json`을 그 경로로 다시 써서, 추적 대상 파일이 실행할 때마다 뒤집혔다. 산출물이 섞이는
 * 쪽이 낫다고 판단했다. **E2E 실행 뒤 `npm run start`를 하려면 `npm run build`를 다시 돌려야 한다.**
 */
const port = Number(process.env.E2E_PORT ?? 3210);
const baseURL = `http://127.0.0.1:${port}`;

const serverEnv: Record<string, string> = {
  NEXT_PUBLIC_SUPABASE_URL: "",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "",
  SUPABASE_SECRET_KEY: "",
  // 분석 스크립트가 붙으면 외부 요청과 동의 배너 변수가 늘어난다. E2E에서는 끈다.
  NEXT_PUBLIC_GA_MEASUREMENT_ID: "",
  NEXT_PUBLIC_SITE_URL: baseURL,
};

export default defineConfig({
  testDir: "./e2e",
  outputDir: "./test-results",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI
    ? [["github"], ["html", { open: "never" }]]
    : [["list"], ["html", { open: "never" }]],
  // 편집기 부트스트랩은 템플릿 에셋을 여러 개 읽는다. 기본 30초는 첫 진입에서 빠듯하다.
  timeout: 90_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL,
    // 실패 원인을 추적할 수 있는 아티팩트를 남긴다(TEST-002 완료 기준).
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    locale: "ko-KR",
    timezoneId: "Asia/Seoul",
  },
  projects: [
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"] },
      testIgnore: "**/mobile-editor.spec.ts",
    },
    {
      // 편집기는 모바일에서 완전히 다른 레이아웃(MobileEditActionBar + MobileEditSheet)을 쓴다.
      // 같은 스펙을 뷰포트만 바꿔 돌리면 선택자가 어긋나므로 전용 스펙만 이 프로젝트로 돌린다.
      name: "mobile",
      use: { ...devices["Pixel 7"] },
      testMatch: "**/mobile-editor.spec.ts",
    },
  ],
  webServer: {
    command: `npm run build && npx next start --port ${port} --hostname 127.0.0.1`,
    url: baseURL,
    // 기본값은 "재사용하지 않음"이다. 이미 떠 있는 서버를 재사용하면 소스를 고쳐도 이전 빌드를
    // 계속 검사하게 되고, 통과/실패 모두 신뢰할 수 없어진다(실제로 겪었다).
    // 스펙 선택자만 다듬는 동안에는 `E2E_REUSE_SERVER=1`로 빌드를 건너뛸 수 있다.
    reuseExistingServer: process.env.E2E_REUSE_SERVER === "1",
    // 빌드까지 포함한 시간이다.
    timeout: 420_000,
    env: serverEnv,
    stdout: "pipe",
    stderr: "pipe",
  },
});
