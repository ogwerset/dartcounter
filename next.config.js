// PWA disabled temporarily due to next-pwa compatibility issues with Node 22
// const withPWA = require('next-pwa')({
//   dest: 'public',
//   disable: process.env.NODE_ENV === 'development',
//   register: true,
//   skipWaiting: true,
// });

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
  // basePath and assetPrefix removed - Vercel hosts at root
};

module.exports = nextConfig;
// module.exports = withPWA(nextConfig);  // Re-enable when PWA is fixed

