import type { NextConfig } from "next";

const androidSampleTraceFiles = [
  "./android-sample-theme/apeach-26.1.0-source/build.gradle.kts",
  "./android-sample-theme/apeach-26.1.0-source/gradle.properties",
  "./android-sample-theme/apeach-26.1.0-source/gradlew*",
  "./android-sample-theme/apeach-26.1.0-source/gradle/**/*",
  "./android-sample-theme/apeach-26.1.0-source/src/**/*",
];
const androidSampleTraceExcludes = [
  "./android-sample-theme/apeach-26.1.0-source/.gradle/**/*",
  "./android-sample-theme/apeach-26.1.0-source/build/**/*",
  "./android-sample-theme/apeach-26.1.0-source/local.properties",
  "./android-sample-theme/apeach-26.1.0-source/**/*.apk",
  "./android-sample-theme/apeach-26.1.0-source/**/*.aab",
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  outputFileTracingIncludes: {
    "/api/export/android": androidSampleTraceFiles,
    "/api/export/android-apk": androidSampleTraceFiles,
    "/api/export/android-project": androidSampleTraceFiles,
  },
  outputFileTracingExcludes: {
    "/api/export/android": androidSampleTraceExcludes,
    "/api/export/android-apk": androidSampleTraceExcludes,
    "/api/export/android-project": androidSampleTraceExcludes,
  },
  experimental: {
    // Theme exports contain multiple image files and commonly exceed the
    // proxy's 10MB default. Keep a finite ceiling to bound per-request memory.
    proxyClientMaxBodySize: "50mb",
  },
};

export default nextConfig;
