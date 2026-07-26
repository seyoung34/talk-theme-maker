import path from "node:path";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  // Next.js keeps JSX as "preserve" for its compiler; component tests need a Vite transform.
  plugins: [react()],
  test: {
    // 순수 함수는 node로 충분하지만, @testing-library/react 컴포넌트 테스트를 위해
    // 가벼운 happy-dom 환경을 기본값으로 둔다. (jsdom 대비 빠름)
    environment: "happy-dom",
    setupFiles: ["./vitest.setup.ts"],
    globals: false,
    include: ["**/*.{test,spec}.{ts,tsx}"],
    exclude: [
      "node_modules/**",
      ".next/**",
      ".open-next/**",
      ".wrangler/**",
      "android-sample-theme/**",
      // Playwright 스펙은 `*.spec.ts`라 include 패턴에 걸린다. 러너가 달라 vitest에서는 실행할 수 없다.
      "e2e/**",
    ],
  },
  resolve: {
    // tsconfig의 "@/*" → "./*" 별칭을 vitest에서도 해석한다.
    alias: {
      "@": path.resolve(import.meta.dirname),
    },
  },
});
