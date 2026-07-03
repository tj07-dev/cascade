import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**.ytimg.com" },
      { protocol: "https", hostname: "**.cdninstagram.com" },
      { protocol: "https", hostname: "**.twimg.com" },
      { protocol: "https", hostname: "**.tiktokcdn.com" },
      { protocol: "https", hostname: "**.redd.it" },
      { protocol: "https", hostname: "i.vimeocdn.com" },
      { protocol: "https", hostname: "**.archive.org" },
    ],
  },
};

export default nextConfig;
