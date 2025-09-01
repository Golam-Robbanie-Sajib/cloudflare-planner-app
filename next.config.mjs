/** @type {import('next').NextConfig} */
const nextConfig = {
  // Don't use static export for Cloudflare Pages with Functions
  // output: 'export', // <- REMOVE THIS LINE
  //trailingSlash: true,
  
  // Keep image optimization disabled for Cloudflare
  images: {
    unoptimized: true,
  },
  
  // Optimize for Cloudflare Pages
  experimental: {
    webpackBuildWorker: false,
  },
  
  webpack: (config, { isServer }) => {
    config.cache = false;
    return config;
  },
  
  // async rewrites() {
  //   return [
  //     {
  //       source: '/api/:path*',
  //       destination: 'https://cloudflare-planner-app.pages.dev/api/:path*'
  //     }
  //   ];
  // },
  
  env: {
    NEXT_PUBLIC_API_URL: process.env.NODE_ENV === 'production' 
      ? 'https://cloudflare-planner-app.pages.dev/api'
      : 'http://localhost:3000/api',
  },
};

export default nextConfig;