/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    // Ignore ESLint warnings/errors during production build to avoid blocking deploys
    ignoreDuringBuilds: true,
  },
};
module.exports = nextConfig;
