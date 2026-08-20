import type { NextConfig } from "next";

const authUrl = process.env.WALLET_AUTH_URL;
const allowedDevOrigins = authUrl ? [new URL(authUrl).host] : [];

const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  // Next.js requires inline bootstrap scripts. Eval is deliberately forbidden.
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://static.usernames.app-backend.toolsforhumanity.com",
  "font-src 'self' data:",
  // World App/MiniKit username lookup and the reviewed World Chain RPC are the
  // only cross-origin browser connections used by the application.
  "connect-src 'self' https://usernames.worldcoin.org https://developer.world.org https://world.org https://worldchain-mainnet.g.alchemy.com",
  "manifest-src 'self'",
  "worker-src 'self' blob:",
  "upgrade-insecure-requests",
  "report-uri /api/security/csp-report",
].join("; ");

function securityHeaders() {
  const production = process.env.CIVILIZATION_ENV === "production";
  const cspEnforced = process.env.CIVILIZATION_CSP_MODE === "enforce";
  const hstsEnabled =
    production && process.env.CIVILIZATION_HSTS_ENABLED === "true";
  const headers = [
    {
      key: cspEnforced
        ? "Content-Security-Policy"
        : "Content-Security-Policy-Report-Only",
      value: contentSecurityPolicy,
    },
    {
      key: "Referrer-Policy",
      value: "strict-origin-when-cross-origin",
    },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "X-Frame-Options", value: "DENY" },
    {
      key: "Permissions-Policy",
      value: "camera=(), geolocation=(), microphone=(), payment=(), usb=()",
    },
  ];

  if (hstsEnabled) {
    headers.push({
      key: "Strict-Transport-Security",
      value: "max-age=63072000; includeSubDomains",
    });
  }

  return headers;
}

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
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders(),
      },
    ];
  },
};

export default nextConfig;
