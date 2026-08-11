import type { NextConfig } from 'next';

const authUrl = process.env.AUTH_URL;
const allowedDevOrigins = authUrl ? [new URL(authUrl).host] : [];

const nextConfig: NextConfig = {
  output: 'standalone',
  images: {
    remotePatterns: [{ protocol: 'https', hostname: 'static.usernames.app-backend.toolsforhumanity.com' }],
  },
  allowedDevOrigins,
  reactStrictMode: false,
};

export default nextConfig;
