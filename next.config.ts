import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  experimental: {
    // Theme exports contain multiple image files and commonly exceed the
    // middleware's 10MB default. Keep a finite ceiling to bound per-request memory.
    middlewareClientMaxBodySize: "50mb",
  },
  webpack: (config) => {
    // Some modules under `lib/theme` are compiled twice: by this bundler, and by
    // `services/android-builder/tsconfig.json` for the Cloud Run builder. That config uses
    // `moduleResolution: NodeNext`, which requires an explicit `.js` extension on relative
    // imports; webpack resolves `.ts` by default and fails on the same specifier. Mapping
    // the extension lets one source file satisfy both resolvers.
    //
    // Builder-only files (`catalogSource.ts`, `buildCore.ts`) already used `.js` specifiers
    // without trouble because webpack never reaches them. `catalogTransform.ts` is the one
    // shared module, so it is the one that needs this.
    config.resolve.extensionAlias = {
      ...config.resolve.extensionAlias,
      ".js": [".ts", ".tsx", ".js"],
    };
    return config;
  },
};

export default nextConfig;
