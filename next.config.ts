import type { NextConfig } from "next";

const authUrl = process.env.WALLET_AUTH_URL;
const allowedDevOrigins = authUrl ? [new URL(authUrl).host] : [];

const nextConfig: NextConfig = {
  output: "standalone",
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "static.usernames.app-backend.toolsforhumanity.com",
      },
    ],
  },
  allowedDevOrigins,
  reactStrictMode: true,
};

export default nextConfig;
