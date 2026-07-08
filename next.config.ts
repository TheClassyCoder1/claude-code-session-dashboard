import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Dev mode blocks its assets from foreign origins. To use the dashboard from
  // a phone via a tunnel, put your host(s) in .env.local (never committed):
  //   DEV_ORIGINS=my-tunnel.ngrok-free.app
  allowedDevOrigins: process.env.DEV_ORIGINS?.split(",").filter(Boolean) ?? [],
};

export default nextConfig;
