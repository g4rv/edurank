import type { NextConfig } from 'next';

// Tunnel hosts, so the app can be shown on a phone over ngrok. Both settings
// widen what Next accepts, and `serverActions.allowedOrigins` is the one that
// matters once this is deployed: it lists the origins allowed to POST a server
// action, so a wildcard for a public tunnel domain would let any page hosted
// there call ours. Development only — production keeps the default, which is
// the app's own origin and nothing else.
const TUNNEL_ORIGINS = ['*.ngrok-free.dev', '*.ngrok-free.app', '*.ngrok.io', '*.ngrok.app'];
const isDev = process.env.NODE_ENV !== 'production';

const nextConfig: NextConfig = {
  ...(isDev ? { allowedDevOrigins: TUNNEL_ORIGINS } : {}),
  experimental: {
    ...(isDev ? { serverActions: { allowedOrigins: TUNNEL_ORIGINS } } : {}),
    staleTimes: {
      dynamic: 30,
    },
  },
};

export default nextConfig;
