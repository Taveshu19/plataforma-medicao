import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      allowedOrigins: [
        '*.lhr.life',
        '*.trycloudflare.com',
        'localhost:3000',
        '127.0.0.1:3000',
      ],
    },
  },
};

export default nextConfig;
