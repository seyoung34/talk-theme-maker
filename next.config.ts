import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  experimental: {
    // Theme exports contain multiple image files and commonly exceed the
    // middleware's 10MB default. Keep a finite ceiling to bound per-request memory.
    middlewareClientMaxBodySize: "50mb",
  },
};

export default nextConfig;
