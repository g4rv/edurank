import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Add your tunnel URL here when sharing locally via ngrok / Cloudflare Tunnel.
      // Example: 'https://abc123.ngrok-free.app'
      // Remove or update each time the tunnel URL changes.
      allowedOrigins: process.env.ALLOWED_ORIGINS
        ? process.env.ALLOWED_ORIGINS.split(',')
        : [],
    },
  },
};

export default nextConfig;
