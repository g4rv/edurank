import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  allowedDevOrigins: ['*.ngrok-free.dev', '*.ngrok.io', '*.ngrok.app'],
  experimental: {
    serverActions: {
      allowedOrigins: ['*.ngrok-free.dev', '*.ngrok-free.app', '*.ngrok.io', '*.ngrok.app'],
    },
  },
};

export default nextConfig;
