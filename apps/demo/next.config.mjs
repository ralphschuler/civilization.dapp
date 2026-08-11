const basePath = (process.env.PAGES_BASE_PATH || '/civilization.dapp').replace(/\/$/, '');

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  basePath,
  assetPrefix: basePath,
  images: { unoptimized: true },
  transpilePackages: [],
};

export default nextConfig;
