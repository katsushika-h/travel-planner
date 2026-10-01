import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: {
    position: "bottom-left",
  },
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;
