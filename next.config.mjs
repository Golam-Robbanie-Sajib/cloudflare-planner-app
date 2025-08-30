/** @type {import('next').NextConfig} */
const nextConfig = {
  // Enable static exports for better Cloudflare Pages compatibility
  output: 'export',
  trailingSlash: true,
  
  // Disable image optimization for static export
  images: {
    unoptimized: true,
  },
  
  // Optimize build for Cloudflare Pages
  experimental: {
    // Disable webpack cache to avoid file size issues
    webpackBuildWorker: false,
  },
  
  // Webpack configuration
  webpack: (config, { isServer }) => {
    // Disable webpack cache to prevent large cache files
    config.cache = false;
    
    return config;
  },
  
  // Environment variables
  env: {
    CUSTOM_KEY: process.env.CUSTOM_KEY,
  },
};

export default nextConfig;