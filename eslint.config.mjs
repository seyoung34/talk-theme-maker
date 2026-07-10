import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { FlatCompat } from "@eslint/eslintrc";

const __dirname = dirname(fileURLToPath(import.meta.url));
const compat = new FlatCompat({ baseDirectory: __dirname });

const eslintConfig = [
  {
    ignores: [
      ".next/**",
      ".open-next/**",
      ".wrangler/**",
      "out/**",
      "dist/**",
      "coverage/**",
      "node_modules/**",
      "android-sample-theme/**",
      "next-env.d.ts",
      // Node 전용 빌드/검증 스크립트 — Next/React 린트 규칙 대상이 아님
      "scripts/**",
    ],
  },
  ...compat.config({
    extends: ["next/core-web-vitals", "next/typescript"],
  }),
];

export default eslintConfig;
